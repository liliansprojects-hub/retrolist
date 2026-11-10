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
  let best = null; // the most trustworthy coordinates seen anywhere along the chain
  const note = (c, from) => { if (c && (!best || c.rank > best.rank)) best = { ...c, finalUrl: from }; };

  for (let hop = 0; hop < 8 && remaining(deadline) > 0; hop++) {
    note(extractCoordsRanked(current), current);
    if (best && best.rank === 3) break; // the pin itself — can't do better

    let res;
    try { res = await timedFetch(current, deadline, { redirect: 'manual', headers: { Accept: 'text/html', 'Accept-Language': 'en', Cookie: 'CONSENT=YES+cb; SOCS=CAI' } }); }
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

    // a real page: only the og:image static-map centre is trusted (see ogImageCenter)
    let text = '';
    try { text = await res.text(); } catch { /* ignore */ }
    const og = /\/maps\/place\//.test(current) && !/consent\.google/.test(current) ? ogImageCenter(text) : null;
    if (og && !isDefaultSpot(og)) note({ ...og, rank: best && best.rank >= 2 ? best.rank - 0.5 : 2 }, current);
    break;
  }

  if (best) return found(best, best.finalUrl || current, false);

  // No exact coordinates anywhere. Do NOT guess by searching the name here: a name
  // search has no idea which country is meant and was dropping pins in the US.
  // Return the name only as a hint; the app lets the person tap the exact spot.
  let hint = null;
  try { if (/(^|\.)google\.[a-z.]+$/.test(new URL(current).hostname) && /\/maps\/(place|search)\//.test(current)) hint = placeNameFrom(current); } catch { /* ignore */ }
  return { found: false, finalUrl: current, hint };
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



// Google's own "no real answer" spots — the centre of the US, the Googleplex and
// the like show up as placeholder map centres in pages served to scripts. A
// result sitting on one of them (and not backed by the exact !3d!4d pin) is
// treated as "not found" rather than plotted in the wrong country.
const DEFAULT_SPOTS = [[37.0902, -95.7129], [39.8283, -98.5795], [37.4220, -122.0841], [37.4219, -122.0840], [37.3861, -122.0839], [37.7749, -122.4194], [0, 0]];
function isDefaultSpot(c) {
  return !!c && DEFAULT_SPOTS.some(([la, ln]) => Math.abs(c.lat - la) < 0.06 && Math.abs(c.lng - ln) < 0.06);
}

// Like extractCoords but also says HOW trustworthy the match is, so a redirect
// chain can keep following until it finds the pin itself instead of settling on
// the first camera position it sees:  3 = the pin (!3d!4d), 2 = the link's
// target (q= ll= center= destination=), 1 = the map camera (@lat,lng)
function extractCoordsRanked(text) {
  if (!text) return null;
  const s = String(text);
  let m = s.match(new RegExp(`!3d(${NUM})!4d(${NUM})`));
  if (m) { const c = pair(m[1], m[2]); if (c) return { ...c, rank: 3 }; }
  m = s.match(new RegExp(`[?&;](?:center|ll|q|query|destination|daddr)=(${NUM})(?:%2C|%2c|,)\\s*(${NUM})`));
  if (m) { const c = pair(m[1], m[2]); if (c && !isDefaultSpot(c)) return { ...c, rank: 2 }; }
  m = s.match(new RegExp(`@(${NUM}),(${NUM})`));
  if (m) { const c = pair(m[1], m[2]); if (c && !isDefaultSpot(c)) return { ...c, rank: 1 }; }
  return null;
}

// The ONLY place coordinates are read out of a web PAGE (as opposed to a URL):
// the og:image static-map tag, whose center= is the place itself. Mining the
// rest of Google's page text is what made unrelated links all land on the same
// default spot — its scripts are full of default/sample coordinates.
function ogImageCenter(html) {
  if (!html) return null;
  const tag = String(html).match(/<meta[^>]+(?:property|itemprop|name)=["'](?:og:image|image)["'][^>]*>/i);
  if (!tag) return null;
  const content = tag[0].match(/content=["']([^"']+)["']/i);
  if (!content) return null;
  const r = extractCoordsRanked(content[1].replace(/&amp;/g, '&'));
  return r ? { lat: r.lat, lng: r.lng } : null;
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
