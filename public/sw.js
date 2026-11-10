// Retrolist service worker — offline copy of pages with a backup offline page.
//
// Pages (navigations) are NETWORK-FIRST: whenever you're online you always
// get the latest deploy straight away, instead of last visit's cached copy
// (the previous stale-while-revalidate setup meant a new deploy could take a
// visit or two to show up). If the network is unreachable or slow, the last
// good copy of the app shell is served so the app still opens offline, and
// the backup offline page is the final fallback.
//
// Static same-origin files (hashed JS/CSS bundles, icons) are served from
// cache and refreshed in the background — safe because their filenames
// change whenever their content does.
//
// Never intercepted: serverless function calls (a cached "not found" would
// be replayed forever) and any third-party request (map tiles, geocoding).
// No external scripts are loaded, so install can't fail on a CDN outage.

const CACHE = 'retrolist-v4';
const offlineFallbackPage = 'offline.html';
const SHELL = '/index.html'; // every route of this single-page app serves the same shell

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.add(offlineFallbackPage);
    try {
      const res = await fetch('/', { cache: 'reload' });
      if (res.ok) await cache.put(SHELL, res);
    } catch (e) { /* offline during install: the shell is cached on the first online visit */ }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // drop caches from older versions of this worker
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // third-party: leave alone
  if (url.pathname.startsWith('/.netlify/')) return; // functions: never cached

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await Promise.race([fetch(req), timeout(4000)]);
        if (res && res.ok) cache.put(SHELL, res.clone());
        return res;
      } catch (e) {
        return (await cache.match(SHELL)) || (await cache.match(offlineFallbackPage)) || Response.error();
      }
    })());
    return;
  }

  // static files: cached copy now, refreshed in the background
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const refresh = fetch(req)
      .then((res) => { if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()); return res; })
      .catch(() => null);
    if (cached) { event.waitUntil(refresh); return cached; }
    return (await refresh) || Response.error();
  })());
});

// ───────────────────────── alarm notifications (Web Push) ─────────────────────────
// The server (netlify/functions/alarm-tick.js) sends a push at the minute an
// alarm is due. This wakes the service worker even when retrolist is closed
// or the phone is locked, which nothing in the page itself can do.

const ICON = '/android/launchericon-192x192.png';
const BADGE = '/android/launchericon-96x96.png';

function alarmNotificationOptions(data) {
  const a = data.alarm || {};
  return {
    body: data.body || `${a.name || 'alarm'} — ${a.time || ''}`,
    icon: ICON,
    badge: BADGE,
    tag: 'alarm-' + (a.id || 'x'),
    renotify: true,
    requireInteraction: true, // stays until dealt with, like an alarm should
    silent: !!a.silent,
    vibrate: a.vibrate && a.vibrate.length ? a.vibrate : undefined,
    data: { alarm: a, deviceId: data.deviceId, firedAt: data.firedAt || Date.now(), test: !!data.test },
    actions: [{ action: 'snooze', title: `snooze ${a.snooze || 5}m` }, { action: 'dismiss', title: 'dismiss' }],
  };
}

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // app is open and in front: let it ring in-app (full alarm screen, sound,
    // vibration) instead of also posting a notification on top of it
    const inFront = wins.some((c) => c.visibilityState === 'visible');
    if (inFront) {
      wins.forEach((c) => c.postMessage({ type: 'ALARM_PUSH', alarm: data.alarm, firedAt: data.firedAt, test: !!data.test }));
      // Android lets a push be handled without a banner when the app is in front.
      // iOS does not: a push that shows nothing counts against the subscription
      // and after a few of them iOS silently cancels it (alarms then stop arriving).
      if (/Android/i.test(self.navigator.userAgent)) return;
    }
    const opts = alarmNotificationOptions(data);
    if (inFront) { opts.silent = true; opts.requireInteraction = false; } // the in-app screen is already ringing
    await self.registration.showNotification(data.title || 'retrolist · alarm', opts);
    if (inFront) {
      await new Promise((r) => setTimeout(r, 6000));
      (await self.registration.getNotifications({ tag: opts.tag })).forEach((n) => n.close());
    }
  })());
});

// snooze from the notification itself: ask the server for another push later
async function snoozeFromNotification(d) {
  const minutes = (d.alarm && d.alarm.snooze) || 5;
  let ok = false;
  try {
    const res = await fetch('/.netlify/functions/alarm-push', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'snooze', deviceId: d.deviceId, alarm: d.alarm, minutes }),
    });
    ok = res.ok;
  } catch (e) { /* offline */ }
  // brief confirmation, then it clears itself
  const tag = 'alarm-' + (d.alarm && d.alarm.id);
  await self.registration.showNotification('retrolist · alarm', {
    body: ok ? `snoozed — ringing again in ${minutes} min` : "couldn't snooze (offline?)",
    icon: ICON, badge: BADGE, tag, silent: true, requireInteraction: false,
  });
  await new Promise((r) => setTimeout(r, 4000));
  (await self.registration.getNotifications({ tag })).forEach((n) => n.close());
}

// tapping the notification brings the app forward and rings in-app (custom
// sound + vibration + the snooze/stop screen)
async function openRinging(d) {
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const msg = { type: 'ALARM_RING', alarm: d.alarm, firedAt: d.firedAt, test: !!d.test };
  for (const c of wins) {
    if ('focus' in c) { await c.focus(); c.postMessage(msg); return; }
  }
  const id = d.alarm && d.alarm.id;
  const url = id && id !== 'test' ? `/?ring=${encodeURIComponent(id)}&at=${d.firedAt || Date.now()}` : '/';
  if (self.clients.openWindow) await self.clients.openWindow(url);
}

self.addEventListener('notificationclick', (event) => {
  const n = event.notification;
  const d = n.data || {};
  n.close();
  if (event.action === 'dismiss') return;
  if (event.action === 'snooze') { event.waitUntil(snoozeFromNotification(d)); return; }
  event.waitUntil(openRinging(d));
});
