import React, { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { getAlarms, updateAlarm, getSettings, getProfile } from '@/lib/store';
import { parseTime, formatTime } from '@/lib/alarms';
import { startSound, startVibrate, stopAll, VIBRATIONS } from '@/lib/alarmAudio';
import { getAccentIcon } from '@/lib/notifIcon';

export default function AlarmWatcher() {
  const [fired, setFired] = useState(null);
  const snoozeTimers = useRef([]);

  const fire = (alarm) => {
    let settings = {};
    try { settings = getSettings(); } catch {}
    const sound = alarm.sound || settings.defaultSound || 'classic';
    const vibId = alarm.vibration || settings.defaultVibration || 'default';
    const vib = VIBRATIONS.find((v) => v.id === vibId) || VIBRATIONS[0];
    setFired({ ...alarm, _sound: sound, _vib: vib.pattern });
    startSound(sound);
    startVibrate(vib.pattern);
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const n = new Notification(alarm.name || 'alarm', { body: alarm.time || '', tag: 'alarm-' + alarm.id, icon: getAccentIcon(getProfile().accent) });
        n.onclick = () => { window.focus(); n.close(); };
      } catch {}
    }
    // auto-disable one-shot date alarms after firing
    if (alarm.date && !(alarm.days && alarm.days.length)) {
      try { updateAlarm(alarm.id, { enabled: false }); } catch {}
    }
  };

  // ---- scheduling ----
  // the previous version polled every 5s and only fired on an EXACT
  // current-minute match. once a tab is backgrounded, Chrome throttles
  // setInterval heavily (often to ~once/minute or less) — so the poll could
  // easily land just outside the matching minute and silently skip the
  // alarm entirely for that day. scheduling one precise setTimeout per
  // alarm's exact next-fire time avoids that "did we happen to poll during
  // the right 60-second window" problem: even if a backgrounded tab delays
  // the timeout, it still eventually fires, rather than being skippable.
  // this is still best-effort — if the browser/OS fully suspends or kills
  // the tab's process while backgrounded, no web-based timer can survive
  // that; there is no way around that with web technology alone.
  const timers = useRef({});

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
      // cap at ~24h so very-far-out alarms still get re-evaluated daily
      // rather than relying on a single multi-day setTimeout to survive.
      const capped = Math.min(delay, 24 * 60 * 60 * 1000);
      timers.current[a.id] = setTimeout(() => {
        if (delay > capped) { scheduleAll(); return; }
        fire(a);
        scheduleAll();
      }, capped);
    });
  };

  useEffect(() => {
    scheduleAll();
    // safety net: recheck the moment the app becomes visible/focused again —
    // catches anything that should have fired while backgrounded/suspended.
    const recheck = () => { if (document.visibilityState === 'visible') scheduleAll(); };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    // lighter periodic backup poll (belt-and-suspenders alongside the
    // precise per-alarm timers above)
    const poll = setInterval(scheduleAll, 60000);
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
      clearInterval(poll);
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);

  const dismiss = () => { stopAll(); setFired(null); };

  const snooze = () => {
    stopAll();
    const mins = (fired && fired.snooze) || 5;
    const a = fired;
    setFired(null);
    const t = setTimeout(() => {
      setFired(a);
      if (a) { startSound(a._sound); startVibrate(a._vib); }
    }, mins * 60000);
    snoozeTimers.current.push(t);
  };

  useEffect(() => () => { snoozeTimers.current.forEach(clearTimeout); }, []);

  if (!fired) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-background/95 backdrop-blur-xl animate-fade-in">
      <div className="w-full max-w-sm px-6 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-full bg-foreground text-background flex items-center justify-center mb-6 animate-pulse">
          <Bell className="w-8 h-8" />
        </div>
        <p className="text-sm text-muted-foreground lowercase mb-2">{fired.name || 'alarm'}</p>
        <p className="text-6xl font-extrabold lowercase tracking-tight mb-8">{formatTime(fired.time, getSettings().clockFormat || '24h')}</p>
        <div className="flex gap-3 w-full">
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