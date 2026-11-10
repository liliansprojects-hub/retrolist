import React, { useEffect, useState } from 'react';
import AlarmNotifCard from '@/components/AlarmNotifCard';
import { notificationState } from '@/lib/alarmNotify';
import { getAlarms } from '@/lib/store';

// Pops up right after someone saves an alarm (the moment the permission
// actually matters) and asks — explicitly for alarms — before the system
// prompt appears. Asks at most once per session so it never nags.
const KEY = 'retrolist_alarm_perm_dismissed';

export default function AlarmPermissionDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const ask = () => {
      const s = notificationState();
      if (s === 'granted' || s === 'unsupported') return;
      try { if (sessionStorage.getItem(KEY)) return; } catch { /* private mode */ }
      setOpen(true);
    };
    window.addEventListener('retrolist:ask-alarm-permission', ask);
    // also when the app opens and alarms already exist but notifications were never allowed
    // (e.g. alarms made before this prompt existed, or a freshly installed copy of the app)
    let t = null;
    try { if (getAlarms().some((a) => a.enabled !== false)) t = setTimeout(ask, 2500); } catch { /* ignore */ }
    return () => { clearTimeout(t); window.removeEventListener('retrolist:ask-alarm-permission', ask); };
  }, []);

  const close = () => {
    try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    setOpen(false);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" onClick={close}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-sm mx-3 mb-3 sm:mb-0 bg-card rounded-3xl border border-border p-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="allow notifications for alarms"
      >
        <AlarmNotifCard variant="full" onEnabled={(r) => { if (r && r.background) setTimeout(close, 1600); }} />
        <button type="button" onClick={close} className="touch-44 w-full mt-3 py-2.5 rounded-xl text-xs font-medium lowercase text-muted-foreground">
          not now
        </button>
      </div>
    </div>
  );
}
