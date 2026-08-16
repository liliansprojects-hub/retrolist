import React, { useState, useEffect, useRef } from 'react';
import { Bell, X } from 'lucide-react';
import { getEvents, getFolders } from '@/lib/store';
import { parseTime } from '@/lib/alarms';

// reminder popups for calendar events (with a time) and list-item reminders.
// shows a small banner — NOT full-screen (alarms handle the full-screen overlay).
export default function ReminderWatcher() {
  const [active, setActive] = useState([]);
  const lastFired = useRef({});

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const ds = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      const key = (id) => id + ':' + ds + ':' + now.getHours() + ':' + now.getMinutes();
      const due = [];

      getEvents().forEach((e) => {
        if (!e.time) return;
        const pt = parseTime(e.time);
        if (!pt) return;
        if (now.getHours() !== pt.h || now.getMinutes() !== pt.m) return;
        let matches = false;
        if (e.date === ds) matches = true;
        else if (e.recurrence && e.recurrence !== 'none') {
          const start = new Date(e.date + 'T00:00:00');
          if (now < start) return;
          if (e.recurrence === 'daily') matches = true;
          else if (e.recurrence === 'weekly') matches = start.getDay() === now.getDay();
          else if (e.recurrence === 'monthly') matches = start.getDate() === now.getDate();
          else if (e.recurrence === 'yearly') matches = start.getMonth() === now.getMonth() && start.getDate() === now.getDate();
        }
        if (!matches) return;
        const k = key(e.id);
        if (lastFired.current[k]) return;
        lastFired.current[k] = true;
        due.push({ id: e.id, name: e.name, time: e.time, place: e.place });
      });

      getFolders().forEach((f) => {
        (f.items || []).forEach((it) => {
          if (!it.remindAt) return;
          const pt = parseTime(it.remindAt);
          if (!pt) return;
          if (now.getHours() !== pt.h || now.getMinutes() !== pt.m) return;
          const k = key('item:' + it.id);
          if (lastFired.current[k]) return;
          lastFired.current[k] = true;
          due.push({ id: 'item:' + it.id, name: it.text || 'reminder', time: it.remindAt, place: '' });
        });
      });

      if (due.length) setActive((a) => [...a, ...due.filter((d) => !a.find((x) => x.id === d.id))]);
    };
    const id = setInterval(tick, 10000);
    tick();
    return () => clearInterval(id);
  }, []);

  const dismiss = (id) => setActive((a) => a.filter((x) => x.id !== id));

  // auto-dismiss all after 25s
  useEffect(() => {
    if (!active.length) return;
    const t = setTimeout(() => setActive([]), 25000);
    return () => clearTimeout(t);
  }, [active]);

  if (!active.length) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[70] flex flex-col items-center gap-2 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] px-4 pointer-events-none">
      {active.map((r) => (
        <div key={r.id} className="pointer-events-auto w-full max-w-sm rounded-2xl bg-card border border-border shadow-lg p-3 flex items-center gap-3 animate-slide-up">
          <div className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold lowercase truncate">{r.name}</p>
            <p className="text-xs text-muted-foreground lowercase">{r.time}{r.place ? ' · ' + r.place : ''}</p>
          </div>
          <button onClick={() => dismiss(r.id)} className="touch-44 p-1 rounded-full text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}