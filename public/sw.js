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

const CACHE = 'retrolist-v3';
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
