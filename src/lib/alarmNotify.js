// Alarm notifications on the phone side: permission, push subscription,
// syncing alarms to the server so they can ring while the app is closed, and
// showing the notification itself.
//
// Key facts this is built around:
//  - Android Chrome (and so the installed app) does NOT allow `new
//    Notification()` — it throws. Notifications must go through the service
//    worker's registration.showNotification(). The old code used the
//    constructor inside a silent try/catch, which is why no alarm
//    notification ever appeared on Android.
//  - Nothing in a web page runs when the app is closed or the phone is
//    locked. The only thing that can wake it is a Web Push message, so alarms
//    are mirrored to a small server function that sends one at the right
//    minute (netlify/functions/alarm-push.js + alarm-tick.js).
//  - iPhone/iPad only allow push for web apps that were added to the Home
//    Screen (iOS 16.4+), and iOS has no Vibration API.
import { getAlarms } from '@/lib/store';
import { VIBRATIONS } from '@/lib/alarmAudio';

const API = '/.netlify/functions/alarm-push';
const DEVICE_KEY = 'retrolist_device_id';
export const ICON = '/android/launchericon-192x192.png';
export const BADGE = '/android/launchericon-96x96.png';

// ── device + platform ──
export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = 'd' + (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : (Math.random().toString(36).slice(2) + Date.now().toString(36)).padEnd(20, '0'));
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'dtransient' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
}

export function platform() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const standalone = !!(
    (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    (typeof navigator !== 'undefined' && navigator.standalone === true) ||
    (typeof document !== 'undefined' && (document.referrer || '').indexOf('android-app://') === 0)
  );
  return { ios, android, standalone };
}

export const pushCapable = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// 'unsupported' | 'needs-install' | 'denied' | 'default' | 'granted'
export function notificationState() {
  const p = platform();
  if (p.ios && !p.standalone) return 'needs-install'; // iOS only delivers push to Home Screen web apps
  if (!pushCapable()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'default';
}

// ── helpers ──
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label || 'timeout')), ms))]);

function b64ToU8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
const u8ToB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const swReady = () => withTimeout(navigator.serviceWorker.ready, 8000, 'no-service-worker');

export const patternFor = (id) => (VIBRATIONS.find((v) => v.id === id) || VIBRATIONS[0]).pattern;

// what the server (and the notification) need to know about an alarm
export function toServerAlarm(a) {
  return {
    id: a.id,
    name: a.name || 'alarm',
    time: a.time,
    days: a.days || [],
    date: a.date || '',
    enabled: a.enabled !== false,
    snooze: Number(a.snooze) || 5,
    vibrate: patternFor(a.vibration),
    // a web notification can't be "vibrate only" — silent suppresses both,
    // so it's only used when the person turned sound AND vibration off
    silent: a.sound === 'none' && a.vibration === 'none',
    sound: a.sound || 'classic',
  };
}

// ── notification content (the service worker builds the same shape for pushes) ──
export function notificationOptions(alarm, extra = {}) {
  const a = alarm && alarm.vibrate ? alarm : toServerAlarm(alarm || {});
  return {
    title: 'retrolist · alarm',
    options: {
      body: `${a.name || 'alarm'} — ${a.time || ''}`.trim(),
      icon: ICON,
      badge: BADGE,
      tag: 'alarm-' + a.id,
      renotify: true,
      requireInteraction: true, // stays on screen until dealt with, like an alarm should
      silent: !!a.silent,
      vibrate: a.vibrate && a.vibrate.length ? a.vibrate : undefined,
      data: { alarm: { id: a.id, name: a.name, time: a.time, snooze: a.snooze, vibrate: a.vibrate, silent: a.silent, sound: a.sound }, deviceId: getDeviceId(), firedAt: Date.now(), ...extra },
      actions: [{ action: 'snooze', title: `snooze ${a.snooze || 5}m` }, { action: 'dismiss', title: 'dismiss' }],
    },
  };
}

// Show the alarm notification. Always via the service worker registration
// (the constructor throws on Android); the constructor is only a last resort.
export async function showAlarmNotification(alarm, extra = {}) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const { title, options } = notificationOptions(alarm, extra);
  try {
    if ('serviceWorker' in navigator) {
      const reg = await withTimeout(navigator.serviceWorker.ready, 3000, 'no-service-worker');
      await reg.showNotification(title, options);
      return true;
    }
  } catch { /* fall through */ }
  try { new Notification(title, options); return true; } catch { return false; }
}

// ── server calls ──
async function post(body, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceId: getDeviceId(), ...body }), signal: ctrl.signal });
    let json = null;
    try { json = await res.json(); } catch { /* not json */ }
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    return { ok: false, status: 0, json: null, error: String(e && e.message || e) };
  } finally {
    clearTimeout(t);
  }
}

async function fetchPublicKey() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${API}?action=key`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const j = await res.json();
    return j && j.publicKey ? j.publicKey : null;
  } catch { return null; } finally { clearTimeout(t); }
}

// ── subscribing ──
export async function getSubscription() {
  if (!pushCapable()) return null;
  try { return await (await swReady()).pushManager.getSubscription(); } catch { return null; }
}

async function subscribePush() {
  let reg;
  try { reg = await swReady(); } catch { return { ok: false, reason: 'no-service-worker' }; }
  const key = await fetchPublicKey();
  if (!key) return { ok: false, reason: 'server' };
  try {
    let sub = await reg.pushManager.getSubscription();
    // a subscription made for a different server key can never receive our pushes
    if (sub && sub.options && sub.options.applicationServerKey && u8ToB64(sub.options.applicationServerKey) !== key) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
    return { ok: !!sub };
  } catch (e) {
    return { ok: false, reason: 'subscribe', error: String(e && e.message || e) };
  }
}

export async function syncAlarms() {
  if (notificationState() !== 'granted') return false;
  const sub = await getSubscription();
  if (!sub) return false;
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
  const r = await post({ action: 'register', subscription: sub.toJSON(), tz, alarms: getAlarms().map(toServerAlarm) });
  return r.ok;
}

// Called from a tap. Shows the system permission prompt (must be reached
// synchronously from the tap, so requestPermission() is the first await),
// then subscribes to push and uploads the alarms.
export async function enableAlarmNotifications() {
  const state = notificationState();
  if (state === 'needs-install' || state === 'unsupported') return { ok: false, state };
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, state: perm === 'denied' ? 'denied' : 'default' };
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch {}
  const sub = await subscribePush();
  let synced = false;
  if (sub.ok) synced = await syncAlarms();
  return { ok: true, state: 'granted', background: sub.ok && synced, reason: sub.ok ? (synced ? null : 'sync') : sub.reason };
}

export async function disableBackgroundAlarms() {
  try { const sub = await getSubscription(); if (sub) await sub.unsubscribe(); } catch {}
  await post({ action: 'unregister' });
}

// the server schedules a push 8 seconds out so there's time to close the app
export async function sendTestPush() {
  if (!(await syncAlarms())) return { ok: false, reason: 'not-subscribed' };
  const r = await post({ action: 'test', delaySec: 8 }, 20000);
  return { ok: r.ok, status: r.status };
}

// keep the server's copy of the alarms current: on any change, when the
// connection comes back, and when the app is reopened
export function startAlarmSync() {
  if (typeof window === 'undefined') return () => {};
  let timer = null;
  const soon = () => { clearTimeout(timer); timer = setTimeout(() => { syncAlarms().catch(() => {}); }, 800); };
  const onVisible = () => { if (document.visibilityState === 'visible') soon(); };
  window.addEventListener('retrolist:alarms', soon);
  window.addEventListener('online', soon);
  document.addEventListener('visibilitychange', onVisible);
  soon();
  return () => {
    clearTimeout(timer);
    window.removeEventListener('retrolist:alarms', soon);
    window.removeEventListener('online', soon);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

// snoozing in the app also schedules the repeat on the server, so it still
// rings if the app is closed before the snooze ends
export function serverSnooze(alarm, minutes) {
  if (notificationState() !== 'granted') return;
  post({ action: 'snooze', alarm: toServerAlarm(alarm), minutes }).catch(() => {});
}
