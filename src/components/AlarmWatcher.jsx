import React, { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { getAlarms, updateAlarm, getSettings, getProfile } from '@/lib/store';
import { parseTime, formatTime } from '@/lib/alarms';
import { startSound, startVibrate, stopAll, VIBRATIONS } from '@/lib/alarmAudio';
import { getAccentIcon } from '@/lib/notifIcon';

export default function AlarmWatcher() {
  const [fired, setFired] = useState(null);
  const lastFired = useRef({});
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

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const minuteKey = (a) => a.id + ':' + now.toDateString() + ':' + a.time;
      let alarms = [];
      try { alarms = getAlarms(); } catch { return; }
      alarms.forEach((a) => {
        if (!a.enabled) return;
        const pt = parseTime(a.time);
        if (!pt) return;
        if (now.getHours() !== pt.h || now.getMinutes() !== pt.m) return;
        if (a.days && a.days.length) {
          if (!a.days.includes(now.getDay())) return;
        } else if (a.date) {
          const ds = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
          if (a.date !== ds) return;
        }
        const k = minuteKey(a);
        if (lastFired.current[k]) return;
        lastFired.current[k] = true;
        fire(a);
      });
    };
    const id = setInterval(tick, 5000);
    tick();
    return () => clearInterval(id);
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