import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  notificationState, platform, enableAlarmNotifications, getSubscription, syncAlarms, sendTestPush,
} from '@/lib/alarmNotify';

// Explains — in plain words, and specifically for alarms — what permission is
// being asked for, asks for it from a real tap, and then tells the truth about
// whether alarms will really ring when the app is closed.
//
//   variant 'full'   always shown (Alarms page, Settings)
//   variant 'prompt' only shown while something still needs doing (alarm editor)
export default function AlarmNotifCard({ variant = 'full', onEnabled }) {
  const [state, setState] = useState(notificationState());
  const [background, setBackground] = useState(null); // null = checking, true/false once known
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [test, setTest] = useState('idle'); // idle | waiting | received | failed
  const p = platform();

  const refresh = async () => {
    const s = notificationState();
    setState(s);
    if (s === 'granted') setBackground(!!(await getSubscription()));
  };

  useEffect(() => {
    refresh();
    const got = () => setTest('received'); // a test push arrived while the app was open
    window.addEventListener('retrolist:push-test', got);
    return () => window.removeEventListener('retrolist:push-test', got);
  }, []);

  const enable = async () => {
    setBusy(true);
    setNote('');
    const r = await enableAlarmNotifications();
    setBusy(false);
    setState(notificationState());
    setBackground(!!r.background);
    if (r.ok && !r.background) {
      setNote(
        r.reason === 'server' ? "couldn't reach the alarm service — check your connection and try again"
          : r.reason === 'subscribe' ? "your phone's notification service said no — try again in a moment"
            : r.reason === 'no-service-worker' ? 'the app is still starting up — wait a few seconds and try again'
              : "alarms will ring while retrolist is open, but background alarms aren't set up yet — try again",
      );
    }
    if (r.ok && onEnabled) onEnabled(r);
  };

  const retry = async () => {
    setBusy(true);
    setNote('');
    const r = await enableAlarmNotifications();
    await syncAlarms();
    setBusy(false);
    setBackground(!!r.background);
    if (!r.background) setNote("still couldn't set up background alarms — check your connection and try again");
  };

  const runTest = async () => {
    setTest('waiting');
    const r = await sendTestPush();
    if (!r.ok) setTest('failed');
    // success: a notification arrives in ~8s (or the app shows it if it's still open)
    else setTimeout(() => setTest((t) => (t === 'waiting' ? 'idle' : t)), 25000);
  };

  const ready = state === 'granted' && background === true;
  if (variant === 'prompt' && ready) return null;
  if (variant === 'prompt' && state === 'unsupported') return null;

  const wrap = 'rounded-2xl border border-border p-3.5 text-left';
  const title = 'flex items-center gap-2 text-sm font-semibold lowercase';
  const body = 'text-xs text-muted-foreground lowercase mt-1.5 leading-relaxed';
  const btn = 'touch-44 mt-3 px-4 h-10 rounded-full bg-foreground text-background text-xs font-medium lowercase disabled:opacity-50 flex items-center gap-1.5';

  if (state === 'needs-install') {
    return (
      <div className={wrap} data-state="needs-install">
        <p className={title}><Bell className="w-4 h-4" /> install retrolist for alarm notifications</p>
        <p className={body}>
          on iphone and ipad, alarms can only notify you when retrolist is on your home screen. tap the share button in safari,
          choose <b>add to home screen</b>, then open retrolist from there and come back to this page. until then, alarms still ring while the app is open.
        </p>
      </div>
    );
  }

  if (state === 'unsupported') {
    return (
      <div className={wrap} data-state="unsupported">
        <p className={title}><BellOff className="w-4 h-4" /> notifications aren't available here</p>
        <p className={body}>this browser can't show alarm notifications. alarms will still ring, with sound, while retrolist is open.</p>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className={wrap} data-state="denied">
        <p className={title}><BellOff className="w-4 h-4" /> alarm notifications are blocked</p>
        <p className={body}>
          {p.ios
            ? 'open settings → notifications → retrolist and turn on allow notifications.'
            : 'press and hold the retrolist icon → app info → notifications, and turn them on.'}
          {' '}then come back and tap check again.
        </p>
        <button type="button" onClick={refresh} className={btn}>check again</button>
      </div>
    );
  }

  if (state === 'default') {
    return (
      <div className={wrap} data-state="default">
        <p className={title}><Bell className="w-4 h-4" /> allow notifications for your alarms</p>
        <p className={body}>
          retrolist needs your permission to send notifications <b>for your alarms</b>, so they can wake you up even when the app is
          closed or your phone is locked. we only use it for alarms you set.
        </p>
        <button type="button" onClick={enable} disabled={busy} className={btn}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />} allow alarm notifications
        </button>
        {note && <p className="text-xs text-destructive lowercase mt-2">{note}</p>}
      </div>
    );
  }

  // granted
  return (
    <div className={cn(wrap, ready && 'bg-muted/30')} data-state={ready ? 'ready' : 'granted-no-background'}>
      <p className={title}>
        {ready ? <Check className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
        {ready ? 'alarm notifications are on' : background === null ? 'checking alarm notifications…' : 'one more step for alarms when the app is closed'}
      </p>
      {ready ? (
        <>
          <p className={body}>
            your alarms will notify you even when retrolist is closed or your phone is locked.
            {p.ios
              ? ' on iphone the notification uses your phone\'s own sound; your chosen sound and vibration play when you open the alarm.'
              : ' if an alarm ever arrives late, set retrolist\'s battery use to unrestricted in your phone\'s app settings.'}
          </p>
          <button type="button" onClick={runTest} disabled={test === 'waiting'} className={btn}>
            {test === 'waiting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
            {test === 'waiting' ? 'close or lock the app now…' : 'send a test alarm'}
          </button>
          {test === 'waiting' && <p className={body}>a test notification arrives in about 10 seconds — close or lock the app so you can see it.</p>}
          {test === 'received' && <p className="text-xs lowercase mt-2 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> test alarm received — it works</p>}
          {test === 'failed' && <p className="text-xs text-destructive lowercase mt-2">the test couldn't be sent — check your connection and try again</p>}
        </>
      ) : background === false ? (
        <>
          <p className={body}>
            notifications are allowed, but this phone isn't registered for background alarms yet. alarms ring while retrolist is open;
            tap below to make them work when it's closed too.
          </p>
          <button type="button" onClick={retry} disabled={busy} className={btn}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />} set up background alarms
          </button>
          {note && <p className="text-xs text-destructive lowercase mt-2">{note}</p>}
        </>
      ) : null}
    </div>
  );
}
