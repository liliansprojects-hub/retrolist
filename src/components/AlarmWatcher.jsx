import React, { useState, useEffect, useRef } from 'react';
import { Bell, VolumeX } from 'lucide-react';
import { getAlarms, updateAlarm, getSettings } from '@/lib/store';
import { parseTime, formatTime } from '@/lib/alarms';
import { startSound, startVibrate, stopAll, vibrationSupported, isSoundBlocked, VIBRATIONS } from '@/lib/alarmAudio';
import { showAlarmNotification, serverSnooze, serverStop } from '@/lib/alarmNotify';

// Rings alarms while the app is open (full-screen screen + sound + vibration),
// and hands off to the OS when it isn't:
//  - app in front:        rings in-app
//  - app backgrounded:    rings, plus a real notification via the service worker
//  - app closed / locked: the push server sends a notification (see
//                         netlify/functions/alarm-tick.js); tapping it opens
//                         the app and rings here (ALARM_RING / ?ring=<id>)
export default function AlarmWatcher() {
  const [fired, setFired] = useState(null);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const snoozeTimers = useRef([]);
  const lastFiredAt = useRef({}); // alarm id -> ms, so a local timer and a push for the same ring don't ring twice
  const timers = useRef({});

  // `alarm` is a stored alarm, or (from a push / notification tap) the server's
  // copy of it. opts.force: the person asked for it (tapped the notification)
  const fire = (alarm, opts = {}) => {
    const now = Date.now();
    if (!opts.force && now - (lastFiredAt.current[alarm.id] || 0) < 90000) return; // already rung this minute
    lastFiredAt.current[alarm.id] = now;
    serverStop(alarm); // the app is answering this ring, so the phone needn't be rung again

    let settings = {};
    try { settings = getSettings(); } catch { /* ignore */ }
    const sound = alarm.sound || settings.defaultSound || 'classic';
    const vibId = alarm.vibration || settings.defaultVibration || 'default';
    const vib = alarm._vib || (VIBRATIONS.find((v) => v.id === vibId) || VIBRATIONS[0]).pattern;
    setSoundBlocked(false);
    setFired({ ...alarm, _sound: sound, _vib: vib });
    startSound(sound).then(() => setSoundBlocked(isSoundBlocked()));
    startVibrate(vib);

    // not in front: also raise a real notification (the alarm screen can't be seen)
    if (document.visibilityState !== 'visible') showAlarmNotification(alarm).catch(() => {});

    // auto-disable one-shot date alarms after firing
    if (alarm.date && !(alarm.days && alarm.days.length)) {
      try { updateAlarm(alarm.id, { enabled: false }); } catch { /* ignore */ }
    }
  };

  // a push / notification tap carries the server's copy; prefer the stored
  // alarm (it has the person's real sound + vibration ids)
  const ringFromPayload = (payload, opts) => {
    if (!payload || !payload.alarm) return;
    let local = null;
    try { local = getAlarms().find((a) => a.id === payload.alarm.id); } catch { /* ignore */ }
    const a = payload.alarm;
    fire(local || { id: a.id, name: a.name, time: a.time, snooze: a.snooze, sound: a.sound, _vib: a.vibrate }, opts);
  };

  // ---- scheduling ----
  // One precise timer per alarm for its exact next time (a once-a-minute poll
  // can land just outside the right minute once the tab is throttled), re-made
  // whenever alarms change, the app comes back to the front, or every minute
  // as a backstop. This only covers the app being open or backgrounded —
  // closed-app alarms come from the push server.
  const nextOccurrence = (a) => {
    const pt = parseTime(a.time);
    if (!pt) return null;
    const now = new Date();
    if (a.days && a.days.length) {
      for (let add = 0; add < 8; add++) {
        const d = new Date(now);
        d.setDate(d.getDate() + add);
        d.setHours(pt.h, pt.m, 0, 0);
        if (a.days.includes(d.getDay()) && d.getTime() > now.getTime() - 1000) return d;
      }
      return null;
    }
    if (a.date) {
      const [y, mo, da] = a.date.split('-').map(Number);
      const d = new Date(y, mo - 1, da, pt.h, pt.m, 0, 0);
      return d.getTime() > now.getTime() - 1000 ? d : null;
    }
    const d = new Date(now);
    d.setHours(pt.h, pt.m, 0, 0);
    if (d.getTime() <= now.getTime() - 1000) d.setDate(d.getDate() + 1);
    return d;
  };

  const scheduleAll = () => {
    Object.values(timers.current).forEach(clearTimeout);
    timers.current = {};
    let alarms = [];
    try { alarms = getAlarms(); } catch { return; }
    alarms.forEach((a) => {
      if (!a.enabled) return;
      const next = nextOccurrence(a);
      if (!next) return;
      const delay = Math.max(0, next.getTime() - Date.now());
      const capped = Math.min(delay, 24 * 60 * 60 * 1000); // re-evaluate at least daily
      timers.current[a.id] = setTimeout(() => {
        if (delay > capped) { scheduleAll(); return; }
        fire(a);
        scheduleAll();
      }, capped);
    });
  };

  useEffect(() => {
    scheduleAll();
    const recheck = () => { if (document.visibilityState === 'visible') scheduleAll(); };
    const onBlocked = () => setSoundBlocked(true);
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    // creating / editing / toggling / deleting an alarm reschedules at once
    // (it used to be noticed only on the next poll — an alarm made for "in a
    // minute" could be missed entirely)
    window.addEventListener('retrolist:alarms', scheduleAll);
    window.addEventListener('retrolist:sound-blocked', onBlocked);
    const poll = setInterval(scheduleAll, 60000);

    // messages from the service worker: a push that arrived while the app is
    // open, or the person tapping the notification
    const onMessage = (e) => {
      const m = e.data;
      if (!m || !m.type) return;
      if (m.type === 'ALARM_PUSH') {
        if (m.test) window.dispatchEvent(new CustomEvent('retrolist:push-test'));
        else ringFromPayload(m, {});
      } else if (m.type === 'ALARM_RING') {
        if (m.test) window.dispatchEvent(new CustomEvent('retrolist:push-test'));
        else ringFromPayload(m, { force: true });
      }
    };
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', onMessage);

    // opened from a notification while the app was closed: /?ring=<id>&at=<ms>
    try {
      const q = new URLSearchParams(window.location.search);
      const id = q.get('ring');
      if (id) {
        const at = Number(q.get('at')) || 0;
        window.history.replaceState({}, '', window.location.pathname + window.location.hash);
        const a = getAlarms().find((x) => x.id === id);
        // ignore stale links (an old bookmarked/restored URL shouldn't ring)
        if (a && Date.now() - at < 30 * 60000) fire(a, { force: true });
      }
    } catch { /* ignore */ }

    return () => {
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
      window.removeEventListener('retrolist:alarms', scheduleAll);
      window.removeEventListener('retrolist:sound-blocked', onBlocked);
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', onMessage);
      clearInterval(poll);
      Object.values(timers.current).forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the screen on while an alarm is ringing (where the browser supports it)
  useEffect(() => {
    if (!fired || !('wakeLock' in navigator)) return undefined;
    let lock = null;
    let cancelled = false;
    const grab = () => navigator.wakeLock.request('screen').then((l) => { if (cancelled) l.release().catch(() => {}); else lock = l; }).catch(() => {});
    grab();
    const again = () => { if (document.visibilityState === 'visible' && (!lock || lock.released)) grab(); };
    document.addEventListener('visibilitychange', again);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', again); if (lock) lock.release().catch(() => {}); };
  }, [fired]);

  const dismiss = () => { stopAll(); if (fired) serverStop(fired); setSoundBlocked(false); setFired(null); };

  const snooze = () => {
    stopAll();
    const mins = (fired && fired.snooze) || 5;
    const a = fired;
    setSoundBlocked(false);
    setFired(null);
    // also ask the server to ring again, so it still happens if the app is closed first
    if (a) serverSnooze(a, mins);
    const t = setTimeout(() => {
      if (!a) return;
      lastFiredAt.current[a.id] = Date.now();
      setFired(a);
      startSound(a._sound).then(() => setSoundBlocked(isSoundBlocked()));
      startVibrate(a._vib);
      if (document.visibilityState !== 'visible') showAlarmNotification(a).catch(() => {});
    }, mins * 60000);
    snoozeTimers.current.push(t);
  };

  useEffect(() => () => { snoozeTimers.current.forEach(clearTimeout); }, []);

  if (!fired) return null;

  const wantsVibration = !!(fired._vib && fired._vib.length);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-background/95 backdrop-blur-xl animate-fade-in">
      <div className="w-full max-w-sm px-6 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-full bg-foreground text-background flex items-center justify-center mb-6 animate-pulse">
          <Bell className="w-8 h-8" />
        </div>
        <p className="text-sm text-muted-foreground lowercase mb-2">{fired.name || 'alarm'}</p>
        <p className="text-6xl font-extrabold lowercase tracking-tight mb-6">{formatTime(fired.time, getSettings().clockFormat || '24h')}</p>
        {soundBlocked && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground lowercase mb-3">
            <VolumeX className="w-3.5 h-3.5" /> your phone is holding back the sound — tap anywhere to turn it on
          </p>
        )}
        {wantsVibration && !vibrationSupported() && (
          <p className="text-[11px] text-muted-foreground lowercase mb-3">this device doesn't allow vibration from an app (iphone) — sound and the notification still work</p>
        )}
        <div className="flex gap-3 w-full mt-2">
          <button onClick={snooze} className="touch-44 flex-1 py-3.5 rounded-2xl bg-muted text-foreground text-sm font-medium lowercase">
            snooze {fired.snooze || 5}m
          </button>
          <button onClick={dismiss} className="touch-44 flex-1 py-3.5 rounded-2xl bg-foreground text-background text-sm font-medium lowercase">
            dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
