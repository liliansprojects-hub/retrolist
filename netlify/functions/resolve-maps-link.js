// Resolves a Google Maps link (short maps.app.goo.gl links especially) to
// coordinates, running server-side on Netlify.
//
// WHY SERVER-SIDE: a browser can't resolve these. Google serves anything
// that looks like a browser a JavaScript cookie-consent page with no
// redirect information, and a browser's fetch() always identifies itself as
// one; the free CORS proxies that used to work around that now block
// production sites. From here we control the request: a plain request with
// no browser identity gets a normal HTTP redirect we can simply follow.
//
// Everything happens in this one round trip, under one hard deadline, so the
// app gets a fast answer instead of chaining several slow ones:
//   1. follow the redirect chain (stopping as soon as coordinates appear)
//   2. read coordinates from the final URL, or from the page itself
//   3. last resort: search the place NAME on OpenStreetMap (flagged approx)
//
// Deployed automatically: any file in netlify/functions/ becomes
// /.netlify/functions/<name>. ESM, because package.json says "type": "module".

const BUDGET_MS = 2800;
const UA = 'retrolist-maps-resolver/1.0';
const NUM = '-?\\d{1,3}\\.\\d+';

const hostAllowed = (h) =>
  h === 'maps.app.goo.gl' || h === 'goo.gl' || /^(www\.|maps\.)?google\.[a-z.]{2,6}$/.test(h);

export const handler = async (event) => {
  const raw = event.queryStringParameters && event.queryStringParameters.url;
  let target;
  try { target = new URL(raw); } catch { return json(400, { error: 'invalid url' }); }
  if (target.protocol !== 'https:' || !hostAllowed(target.hostname)) {
    return json(400, { error: 'unsupported url' });
  }
  try {
    return json(200, await resolve(target.href, Date.now() + BUDGET_MS));
  } catch (err) {
    return json(200, { found: false, error: String((err && err.message) || err) });
  }
};

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

const remaining = (deadline) => deadline - Date.now();

async function timedFetch(url, deadline, opts = {}) {
  const ms = Math.max(250, remaining(deadline));
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function resolve(startUrl, deadline) {
  let current = startUrl;

  for (let hop = 0; hop < 6 && remaining(deadline) > 0; hop++) {
    // stop following the moment the URL itself carries coordinates
    const direct = extractCoords(current);
    if (direct) return found(direct, current, false);

    let res;
    try { res = await timedFetch(current, deadline, { redirect: 'manual', headers: { Accept: 'text/html' } }); }
    catch { break; }

    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      let next = new URL(location, current);
      // Google's EU consent redirect wraps the real destination in ?continue=
      if (/(^|\.)consent\.google\.com$/.test(next.hostname)) {
        const cont = next.searchParams.get('continue');
        if (cont) { try { next = new URL(cont); } catch { /* keep wrapper */ } }
      }
      current = next.href;
      continue;
    }

    // a real page: coordinates are often embedded (og:image static-map
    // center=, @lat,lng, etc.) even when the URL itself has none
    let text = '';
    try { text = await res.text(); } catch { /* ignore */ }
    const fromPage = extractCoords(text);
    if (fromPage) return found(fromPage, current, false);
    break;
  }

  const direct = extractCoords(current);
  if (direct) return found(direct, current, false);

  // no coordinates anywhere — search by the place name in the URL instead
  const name = placeNameFrom(current);
  if (name && remaining(deadline) > 300) {
    const g = await nominatim(name, deadline);
    if (g) return found(g, current, true);
  }
  return { found: false, finalUrl: current };
}

const found = (c, finalUrl, approx) => ({ found: true, lat: c.lat, lng: c.lng, approx, finalUrl });

async function nominatim(query, deadline) {
  try {
    const res = await timedFetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
      deadline,
      { headers: { 'User-Agent': UA, Accept: 'application/json' } },
    );
    const data = await res.json();
    if (data && data[0]) return pair(data[0].lat, data[0].lon);
  } catch { /* not found / timed out */ }
  return null;
}

function placeNameFrom(u) {
  const dec = (s) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')).trim(); } catch { return s; } };
  const place = u.match(/maps\/(?:place|search)\/([^/@?#]+)/);
  if (place) return dec(place[1]) || null;
  const q = u.match(/[?&](?:q|query)=([^&#]+)/);
  return q ? dec(q[1]) || null : null;
}

function pair(a, b) {
  const lat = parseFloat(a);
  const lng = parseFloat(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// same rules as src/lib/mapsResolve.js (kept self-contained so this function
// has no dependency on the app bundle). !3d/!4d is the pin itself; @lat,lng
// is only the map camera position, so it is checked last.
function extractCoords(text) {
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
