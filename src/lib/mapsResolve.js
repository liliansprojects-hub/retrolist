// Turns a Google Maps link / address / place name into coordinates.
//
// Design rules (each exists because the previous version broke on it):
//  1. If the link already contains coordinates, answer instantly with NO
//     network at all.
//  2. Everything else runs IN PARALLEL under one hard time budget, so the
//     total wait is the budget (3s), not the sum of every step's own
//     timeout. The old version ran strategies one after another under a
//     30s ceiling, which is why it could sit "locating" for ages.
//  3. Exact pin positions beat name-based guesses. Name-based results are
//     flagged `approx: true` so the UI can say so instead of silently
//     dropping a pin in the wrong place.
//  4. Short links (maps.app.goo.gl) can ONLY be resolved server-side:
//     Google serves browsers a cookie-consent wall with no redirect info,
//     and the free CORS proxies that used to get around it now block
//     production sites. So our own Netlify function is tried first.

const FUNCTION_PATH = '/.netlify/functions/resolve-maps-link';
const NUM = '-?\\d{1,3}\\.\\d+';

const defaultFetch = (...args) => globalThis.fetch(...args);

function pair(a, b) {
  const lat = parseFloat(a);
  const lng = parseFloat(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// a plain "lat, lng" pair typed/pasted straight from Google Maps
// (tap-and-hold a spot, copy the coordinates shown). needs no link parsing,
// proxy or geocoder at all.
export function parseManualCoords(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  return m ? pair(m[1], m[2]) : null;
}

// Pull coordinates out of a URL or a block of page text. ORDER MATTERS:
//   !3d..!4d      the pin itself (exact)
//   center= ll= q= destination=   the target the link points at
//   @lat,lng      the map CAMERA position — often a little off the pin, so last
export function extractCoords(text) {
  if (!text) return null;
  const s = String(text);
  let m = s.match(new RegExp(`!3d(${NUM})!4d(${NUM})`));
  if (m) return pair(m[1], m[2]);
  m = s.match(new RegExp(`[?&;](?:center|ll|q|query|destination|daddr)=(${NUM})(?:%2C|%2c|,)\\s*(${NUM})`));
  if (m) return pair(m[1], m[2]);
  m = s.match(new RegExp(`@(${NUM}),(${NUM})`));
  if (m) return pair(m[1], m[2]);
  m = s.match(new RegExp(`"lat['"]?\\s*:\\s*(${NUM})[^}]{0,200}?"lng['"]?\\s*:\\s*(${NUM})`));
  if (m) return pair(m[1], m[2]);
  return null;
}

const safeDecode = (str) => {
  try { return decodeURIComponent(str); } catch { return str; }
};

// returns { lat, lng } if coordinates are in the link, { placeName } if only a
// name is extractable, else null
export function parseMapsUrl(url) {
  if (!url) return null;
  const u = String(url).trim();
  const direct = extractCoords(u);
  if (direct) return direct;

  let name = null;
  const place = u.match(/maps\/(?:place|search)\/([^/@?#]+)/);
  if (place) name = safeDecode(place[1].replace(/\+/g, ' ')).trim();
  if (!name) {
    const q = u.match(/[?&](?:q|query)=([^&#]+)/);
    if (q) name = safeDecode(q[1].replace(/\+/g, ' ')).trim();
  }
  if (name) {
    // a dropped pin shares as /maps/place/51.5007,-0.1246 — that "name" is coordinates
    const asCoords = parseManualCoords(name);
    if (asCoords) return asCoords;
    return { placeName: name };
  }

  // loose "lat,lng" anywhere (geo: links and the like) — last resort only,
  // because it can match unrelated numbers
  const loose = u.match(new RegExp(`(${NUM}),(${NUM})`));
  return loose ? pair(loose[1], loose[2]) : null;
}

async function fetchWithTimeout(fetchFn, url, opts = {}, ms = 3000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetchFn(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// resolve to `value` if the promise hasn't settled within ms (never rejects)
function deadline(promise, ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(t); resolve(v ?? null); },
      () => { clearTimeout(t); resolve(null); },
    );
  });
}

// first promise to resolve with a non-null value wins; null if none do
function firstNonNull(promises) {
  return new Promise((resolve) => {
    let pending = promises.length;
    if (!pending) return resolve(null);
    promises.forEach((p) => Promise.resolve(p).then(
      (v) => { if (v) resolve(v); else if (--pending === 0) resolve(null); },
      () => { if (--pending === 0) resolve(null); },
    ));
  });
}

export async function geocode(query, { fetch: fetchFn = defaultFetch, ms = 2500 } = {}) {
  if (!query || !String(query).trim()) return null;
  try {
    const res = await fetchWithTimeout(
      fetchFn,
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(String(query).trim())}`,
      {},
      ms,
    );
    const data = await res.json();
    if (data && data[0]) return pair(data[0].lat, data[0].lon);
  } catch { /* offline, blocked or timed out — treated as "not found" */ }
  return null;
}

// our own server-side function — the one approach that can actually follow a
// Google short link (see header comment)
async function serverResolve(link, fetchFn, ms) {
  try {
    const res = await fetchWithTimeout(fetchFn, `${FUNCTION_PATH}?url=${encodeURIComponent(link)}`, {}, ms);
    if (!res.ok) return null;
    const json = await res.json(); // throws on the SPA's index.html fallback => caught => null
    if (json && json.found) {
      const c = pair(json.lat, json.lng);
      if (c) return { ...c, source: 'server', approx: !!json.approx };
    }
  } catch { /* function not deployed / errored */ }
  return null;
}

// client-side fallbacks for when the function isn't available (e.g. hosted
// somewhere without Netlify functions). best effort only.
async function proxyResolve(link, fetchFn, ms) {
  const enc = encodeURIComponent(link);
  const viaAllOrigins = (async () => {
    const res = await fetchWithTimeout(fetchFn, `https://api.allorigins.win/get?url=${enc}`, {}, ms);
    const json = await res.json();
    return extractCoords(json?.status?.url) || extractCoords(json?.contents);
  })();
  const viaJina = (async () => {
    const res = await fetchWithTimeout(fetchFn, `https://r.jina.ai/${link}`, {}, ms);
    return extractCoords(await res.text());
  })();
  const c = await firstNonNull([viaAllOrigins, viaJina]);
  return c ? { ...c, source: 'proxy', approx: false } : null;
}

export async function resolveCoords({ url, address, name } = {}, { budgetMs = 3000, fetch: fetchFn = defaultFetch } = {}) {
  const link = (url || '').trim();
  const parsed = link ? parseMapsUrl(link) : null;

  // 1. already in the link: instant, no network
  if (parsed && parsed.lat != null) return { lat: parsed.lat, lng: parsed.lng, source: 'link', approx: false };

  // 2. everything else starts at the same moment
  const isGoogleLink = /goo\.gl|google\.[a-z.]+\/maps|maps\.google/i.test(link);
  const server = link ? deadline(serverResolve(link, fetchFn, budgetMs), budgetMs) : Promise.resolve(null);
  const proxies = isGoogleLink ? deadline(proxyResolve(link, fetchFn, budgetMs), budgetMs) : Promise.resolve(null);

  const queries = [];
  for (const q of [parsed && parsed.placeName, address, name]) {
    const t = (q || '').trim();
    if (t && !queries.includes(t)) queries.push(t);
  }
  const geocodes = queries.map((q) => deadline(geocode(q, { fetch: fetchFn, ms: budgetMs }), budgetMs));

  // exact pin (server, then proxies) beats a name-based guess
  const exact = (await server) || (await proxies);
  if (exact) return exact;
  for (const g of geocodes) {
    const c = await g;
    if (c) return { ...c, source: 'name', approx: true };
  }
  return null;
}
