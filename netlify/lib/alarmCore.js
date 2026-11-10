// Scheduling + request handling for background alarms (Web Push).
//
// WHY THIS EXISTS: a web page can't run code once the app is closed or the
// phone is locked, so nothing in the browser can ring an alarm on its own at
// that point. Web Push is the one mechanism that CAN wake the app: the phone
// registers a push subscription, we keep a copy of its alarms here, and a
// scheduled function sends a push at the right minute — the service worker
// wakes up and shows the notification even if retrolist is closed.
//
// Pure logic with injected dependencies (storage, web-push, clock) so it can
// be tested without a network. The real wiring is in
// netlify/functions/alarm-push.js and alarm-tick.js.

export const MAX_ALARMS = 100;
const MAX_ONE_SHOTS = 20;

// Only ever POST encrypted payloads to the real browser push services. Without
// this, anyone could register an arbitrary URL and make the server fetch it.
const PUSH_HOST = /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|([a-z0-9-]+\.)+push\.apple\.com|([a-z0-9-]+\.)+notify\.windows\.com)\//;

const isStr = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;

export function validSubscription(sub) {
  return !!sub && isStr(sub.endpoint, 700) && PUSH_HOST.test(sub.endpoint)
    && !!sub.keys && isStr(sub.keys.p256dh, 200) && isStr(sub.keys.auth, 100);
}

export function validTimeZone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

// keep only what the server needs, with strict bounds — everything here comes
// from the network
export function sanitizeAlarm(a) {
  if (!a || typeof a !== 'object') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(a.time || ''));
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  const id = String(a.id || '').slice(0, 64);
  if (!id) return null;
  return {
    id,
    name: String(a.name || 'alarm').slice(0, 80),
    time: String(+m[1]).padStart(2, '0') + ':' + m[2],
    days: Array.isArray(a.days) ? [...new Set(a.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))] : [],
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(a.date || '')) ? String(a.date) : '',
    enabled: a.enabled !== false,
    snooze: Math.min(60, Math.max(1, parseInt(a.snooze, 10) || 5)),
    vibrate: Array.isArray(a.vibrate) ? a.vibrate.slice(0, 12).map((n) => Math.min(2000, Math.max(0, parseInt(n, 10) || 0))) : [],
    silent: !!a.silent,
    sound: String(a.sound || '').slice(0, 40),
  };
}

const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const fmtCache = {};

// wall-clock parts of an instant in a given time zone (handles DST for free)
export function localParts(ms, tz) {
  const key = tz || 'UTC';
  if (!fmtCache[key]) {
    fmtCache[key] = new Intl.DateTimeFormat('en-US', {
      timeZone: key, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short',
    });
  }
  const p = {};
  fmtCache[key].formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
  return {
    hhmm: `${p.hour === '24' ? '00' : p.hour}:${p.minute}`,
    ymd: `${p.year}-${p.month}-${p.day}`,
    weekday: WEEKDAY[p.weekday],
  };
}

// same rules the app uses locally: weekday list, or one specific date, or every day
export function alarmMatches(alarm, parts) {
  if (!alarm.enabled || alarm.time !== parts.hhmm) return false;
  if (alarm.days.length) return alarm.days.includes(parts.weekday);
  if (alarm.date) return alarm.date === parts.ymd;
  return true;
}

// everything on this device due in epoch-minutes [fromMin, toMin] inclusive
export function dueForDevice(rec, fromMin, toMin) {
  const due = [];
  for (let k = fromMin; k <= toMin; k++) {
    const parts = localParts(k * 60000, rec.tz);
    for (const a of rec.alarms || []) if (alarmMatches(a, parts)) due.push({ alarm: a, minute: k });
  }
  const keep = [];
  for (const o of rec.oneShots || []) {
    if (o.at >= fromMin * 60000 && o.at < (toMin + 1) * 60000) due.push({ alarm: o.alarm, minute: Math.floor(o.at / 60000), snoozed: true });
    else if (o.at >= (toMin + 1) * 60000) keep.push(o); // still in the future; past-due ones are dropped
  }
  return { due, oneShots: keep };
}

export function buildPayload(deviceId, alarm, minute, extra = {}) {
  return JSON.stringify({
    type: 'alarm',
    deviceId,
    firedAt: minute * 60000,
    title: 'retrolist · alarm',
    body: `${alarm.name || 'alarm'} — ${alarm.time}`,
    alarm: { id: alarm.id, name: alarm.name, time: alarm.time, snooze: alarm.snooze, vibrate: alarm.vibrate, silent: alarm.silent, sound: alarm.sound },
    ...extra,
  });
}

export const blobsToStore = (s) => ({
  get: (k) => s.get(k, { type: 'json' }),
  set: (k, v) => s.setJSON(k, v),
  delete: (k) => s.delete(k),
  list: async () => ((await s.list()).blobs || []).map((b) => b.key),
});

// VAPID keys are created on first use and kept server-side, so there is no
// secret to set up by hand and the private key never leaves the server.
export async function ensureVapid(meta, webpush) {
  let v = await meta.get('vapid');
  if (!v || !v.publicKey || !v.privateKey) {
    v = webpush.generateVAPIDKeys();
    await meta.set('vapid', { publicKey: v.publicKey, privateKey: v.privateKey, createdAt: Date.now() });
  }
  return v;
}

const J = (status, json) => ({ status, json });
const deviceKey = (id) => 'd_' + id;
const validDeviceId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(id);

export async function handleRequest({ method, action, body }, { devices, meta, webpush, subject, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  try {
    if (method === 'GET') {
      if (action === 'key') {
        const v = await ensureVapid(meta, webpush);
        return J(200, { publicKey: v.publicKey });
      }
      return J(400, { error: 'unknown action' });
    }
    if (method !== 'POST' || !body || typeof body !== 'object') return J(400, { error: 'bad request' });
    const { deviceId } = body;
    if (!validDeviceId(deviceId)) return J(400, { error: 'bad device id' });
    const key = deviceKey(deviceId);

    if (body.action === 'register') {
      if (!validSubscription(body.subscription)) return J(400, { error: 'bad subscription' });
      const tz = validTimeZone(body.tz) ? body.tz : 'UTC';
      const alarms = (Array.isArray(body.alarms) ? body.alarms : []).slice(0, MAX_ALARMS).map(sanitizeAlarm).filter(Boolean);
      const prev = (await devices.get(key)) || {};
      await devices.set(key, {
        deviceId, subscription: body.subscription, tz, alarms,
        oneShots: prev.oneShots || [], createdAt: prev.createdAt || now(), updatedAt: now(),
      });
      return J(200, { ok: true, alarms: alarms.length });
    }

    if (body.action === 'unregister') {
      await devices.delete(key);
      return J(200, { ok: true });
    }

    const rec = await devices.get(key);
    if (!rec) return J(404, { error: 'unknown device' });

    if (body.action === 'snooze') {
      const a = sanitizeAlarm(body.alarm);
      if (!a) return J(400, { error: 'bad alarm' });
      const minutes = Math.min(60, Math.max(1, parseInt(body.minutes, 10) || a.snooze));
      const shots = [...(rec.oneShots || []).filter((o) => o.at > now()), { at: now() + minutes * 60000, alarm: a }].slice(-MAX_ONE_SHOTS);
      await devices.set(key, { ...rec, oneShots: shots, updatedAt: now() });
      return J(200, { ok: true, at: now() + minutes * 60000 });
    }

    if (body.action === 'test') {
      const v = await ensureVapid(meta, webpush);
      webpush.setVapidDetails(subject, v.publicKey, v.privateKey);
      const delay = Math.min(8, Math.max(0, Number(body.delaySec) || 0));
      if (delay) await sleep(delay * 1000);
      const t = now();
      const test = { id: 'test', name: 'test alarm', time: localParts(t, rec.tz).hhmm, snooze: 5, vibrate: [200, 100, 200, 100, 200, 300], silent: false, sound: 'classic' };
      try {
        await webpush.sendNotification(rec.subscription, buildPayload(deviceId, test, Math.floor(t / 60000), { test: true }), { TTL: 120, urgency: 'high' });
        return J(200, { ok: true });
      } catch (e) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) { await devices.delete(key); return J(410, { error: 'subscription expired' }); }
        return J(502, { error: 'push service rejected the message', status: e && e.statusCode });
      }
    }
    return J(400, { error: 'unknown action' });
  } catch (e) {
    return J(500, { error: 'server error' });
  }
}

// one pass of the every-minute scheduler
export async function runTick({ devices, meta, webpush, subject, nowMs = Date.now() }) {
  const v = await meta.get('vapid');
  if (!v) return { sent: 0, removed: 0, devices: 0 }; // nobody has ever registered
  webpush.setVapidDetails(subject, v.publicKey, v.privateKey);

  const N = Math.floor(nowMs / 60000);
  const last = await meta.get('lastTick');
  // catch up on up to 3 missed minutes (scheduler hiccups), never replay older
  const from = last && Number.isFinite(last.minute) ? Math.max(last.minute + 1, N - 3) : N;
  if (from > N) return { sent: 0, removed: 0, devices: 0, skipped: true };

  const keys = await devices.list();
  let sent = 0, removed = 0;
  for (let i = 0; i < keys.length; i += 10) {
    await Promise.all(keys.slice(i, i + 10).map(async (key) => {
      const rec = await devices.get(key);
      if (!rec || !validSubscription(rec.subscription)) return;
      const { due, oneShots } = dueForDevice(rec, from, N);
      if ((rec.oneShots || []).length !== oneShots.length) await devices.set(key, { ...rec, oneShots });
      for (const d of due) {
        try {
          await webpush.sendNotification(rec.subscription, buildPayload(rec.deviceId, d.alarm, d.minute, d.snoozed ? { snoozed: true } : {}), { TTL: 300, urgency: 'high' });
          sent++;
        } catch (e) {
          if (e && (e.statusCode === 404 || e.statusCode === 410)) { await devices.delete(key); removed++; break; }
        }
      }
    }));
  }
  // recorded AFTER sending: if a run dies midway the next one retries the
  // minute (a duplicate is harmless — same notification tag — a missed alarm isn't)
  await meta.set('lastTick', { minute: N });
  return { sent, removed, devices: keys.length };
}
