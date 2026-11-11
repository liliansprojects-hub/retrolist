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

import { getUserBias } from '@/lib/userBias';

const FUNCTION_PATH = '/.netlify/functions/resolve-maps-link';
const NUM = '-?\\d{1,3}\\.\\d+';

// a link that names its place by Google's own id identifies it exactly, wherever the request comes from
const hasPlaceId = (u) => /!1s0x[0-9a-f]+:0x[0-9a-f]+|[?&;](?:ftid|cid)=/i.test(String(u || ''));

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

// (coordinate extraction lives below, after the default-spot helpers it depends on)

// Google's own "no real answer" spots — the centre of the US, the Googleplex and
// the like show up as placeholder map centres in pages served to scripts. A
// result sitting on one of them (and not backed by the exact !3d!4d pin) is
// treated as "not found" rather than plotted in the wrong country.
const DEFAULT_SPOTS = [[39.8097, -98.5556], [37.0902, -95.7129], [39.8283, -98.5795], [37.4220, -122.0841], [37.4219, -122.0840], [37.3861, -122.0839], [37.7749, -122.4194], [0, 0]];
function isDefaultSpot(c) {
  return !!c && DEFAULT_SPOTS.some(([la, ln]) => Math.abs(c.lat - la) < 0.06 && Math.abs(c.lng - ln) < 0.06);
}
export { isDefaultSpot };

// Says HOW trustworthy a match is, so a redirect chain can keep following until it finds the pin
// itself instead of settling on the first camera position it sees:
//   3 = the pin (!3d..!4d..)                       — the place itself, always wins
//   2 = the link's target (q= ll= center= destination= /place/lat,lng)
//   1 = the map CAMERA (@lat,lng)                  — where the viewer was looking, NOT the place
// A share link made while looking at the whole country carries @39.8097,-98.5556 (the US centre)
// as its camera even though the place is elsewhere, and is the usual cause of "pinned in the US".
// Camera positions and targets that sit on one of Google's default spots are therefore ignored.
const safeDecodeAll = (str) => { try { return decodeURIComponent(str); } catch { return str; } };
function rankedFrom(s) {
  let m = s.match(new RegExp(`!3d(${NUM})!4d(${NUM})`));
  if (m) { const c = pair(m[1], m[2]); if (c) return { ...c, rank: 3 }; }
  m = s.match(new RegExp(`[?&;](?:center|ll|q|query|destination|daddr)=(?:loc:)?(${NUM})(?:%2C|%2c|,)\\s*(${NUM})`));
  if (m) { const c = pair(m[1], m[2]); if (c && !isDefaultSpot(c)) return { ...c, rank: 2 }; }
  m = s.match(new RegExp(`/maps/(?:place|search|dir)/(?:[^/@?#]*/)?(${NUM}),\\s*(${NUM})(?:[/?#@]|$)`));
  if (m) { const c = pair(m[1], m[2]); if (c) return { ...c, rank: 2 }; }
  m = s.match(new RegExp(`@(${NUM}),(${NUM})`));
  if (m) { const c = pair(m[1], m[2]); if (c && !isDefaultSpot(c)) return { ...c, rank: 1 }; }
  return null;
}
export function extractCoordsRanked(text) {
  if (!text) return null;
  const raw = String(text);
  const variants = [raw];
  if (/%[0-9a-f]{2}/i.test(raw)) { const d = safeDecodeAll(raw); if (d !== raw) variants.push(d); } // e.g. consent wrappers: ...%40lat%2Clng
  let best = null;
  for (const v of variants) { const r = rankedFrom(v); if (r && (!best || r.rank > best.rank)) best = r; }
  return best;
}

// Plain "give me coordinates" form of the above (no rank), plus the JSON lat/lng shape.
export function extractCoords(text) {
  if (!text) return null;
  const r = extractCoordsRanked(text);
  if (r) return { lat: r.lat, lng: r.lng };
  const m = String(text).match(new RegExp(`"lat['"]?\\s*:\\s*(${NUM})[^}]{0,200}?"lng['"]?\\s*:\\s*(${NUM})`));
  return m ? pair(m[1], m[2]) : null;
}

// The ONLY place coordinates are read out of a web PAGE (as opposed to a URL):
// the og:image static-map tag, whose center= is the place itself. Mining the
// rest of Google's page text is what made unrelated links all land on the same
// default spot — its scripts are full of default/sample coordinates.
export function ogImageCenter(html) {
  if (!html) return null;
  const tag = String(html).match(/<meta[^>]+(?:property|itemprop|name)=["'](?:og:image|image)["'][^>]*>/i);
  if (!tag) return null;
  const content = tag[0].match(/content=["']([^"']+)["']/i);
  if (!content) return null;
  const r = extractCoordsRanked(content[1].replace(/&amp;/g, '&'));
  return r ? { lat: r.lat, lng: r.lng } : null;
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
  const lc = loose ? pair(loose[1], loose[2]) : null;
  return lc && !isDefaultSpot(lc) ? lc : null;
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

// A free-text search with no checks will happily answer ANY string with SOMETHING — a vague or
// placeholder query comes back as whatever obscure road happens to match (that is how pins ended
// up on "Township Highway 202" in Ohio). So a result is only accepted when it actually
// resembles what was asked for: at least half of the query's meaningful words must appear in the
// result's own name/address. Anything else is "not found", and the app asks the person to tap the
// exact spot instead of dropping a wrong pin.
const norm = (str) => String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const words = (str) => (norm(str).match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length >= 3 || /\d/.test(w));
const GENERIC = new Set(['the', 'and', 'for', 'near', 'unnamed', 'place', 'new', 'untitled', 'unknown']);

// `strict` (used for searches with no local bias) demands EVERY meaningful word, not just half:
// "high street" must not be satisfied by any "High Street" on Earth, and "cafe nero high street"
// must not be satisfied by one of the three words.
export function resultMatchesQuery(query, result, { strict = false } = {}) {
  const q = words(query).filter((w) => !GENERIC.has(w));
  if (!q.length) return false;
  const hay = norm(`${result?.display_name || ''} ${result?.name || ''}`);
  const hits = q.filter((w) => hay.includes(w)).length;
  return strict ? hits === q.length : hits >= Math.ceil(q.length / 2);
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=en';

async function nominatimSearch(fetchFn, q, extra, ms, strict) {
  try {
    const res = await fetchWithTimeout(fetchFn, `${NOMINATIM}&q=${encodeURIComponent(q)}${extra}`, {}, ms);
    const data = await res.json();
    if (Array.isArray(data)) {
      // first result that genuinely matches the query (Nominatim's own ranking is kept)
      const hit = data.find((r) => resultMatchesQuery(q, r, { strict }));
      if (hit) return pair(hit.lat, hit.lon);
    }
  } catch { /* offline, blocked or timed out — treated as "not found" */ }
  return null;
}

// Searched near the person FIRST: restricted to their country (when known) and ranked by a box
// around where they are. Only when that finds nothing does the worldwide search count — and that
// one has to match every word, so a vague address can't be answered by a random place abroad
// (the old behaviour: pins in Ohio). Both searches start together; the local answer wins.
export async function geocode(query, { fetch: fetchFn = defaultFetch, ms = 2500, country = '' } = {}) {
  if (!query || !String(query).trim()) return null;
  const q = String(query).trim();
  // the person picked a country for this address: search ONLY there, never anywhere else
  if (country) return nominatimSearch(fetchFn, q, `&countrycodes=${String(country).toLowerCase()}`, ms, false);
  const bias = getUserBias();
  let local = Promise.resolve(null);
  if (bias) {
    const d = 1.5; // degrees — roughly 100-150 km each way
    const box = `&viewbox=${(bias.lng - d).toFixed(4)},${(bias.lat + d).toFixed(4)},${(bias.lng + d).toFixed(4)},${(bias.lat - d).toFixed(4)}`;
    const cc = bias.cc ? `&countrycodes=${bias.cc}` : '';
    local = nominatimSearch(fetchFn, q, `${box}${cc}`, ms, false);
  }
  const world = nominatimSearch(fetchFn, q, '', ms, true);
  return (await local) || (await world);
}

// a place name the resolver found in an unresolvable link — only ever offered as a search SUGGESTION, never plotted
let lastHint = null;
export const getLastHint = () => lastHint;

// our own server-side function — the one approach that can actually follow a
// Google short link (see header comment)
async function serverResolve(link, fetchFn, ms) {
  try {
    const res = await fetchWithTimeout(fetchFn, `${FUNCTION_PATH}?url=${encodeURIComponent(link)}`, {}, ms);
    if (!res.ok) return null;
    const json = await res.json(); // throws on the SPA's index.html fallback => caught => null
    if (json && json.found && !json.approx) {
      const c = pair(json.lat, json.lng);
      if (c && !isDefaultSpot(c)) return { ...c, source: 'server', approx: false };
    }
    if (json && json.hint) lastHint = json.hint;
    if (json && !json.found && json.finalUrl) console.warn('maps link not resolved; final url:', json.finalUrl);
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
    const finalUrl = json?.status?.url || '';
    const fromUrl = extractCoordsRanked(finalUrl);
    // The proxy is a server in the US: for a link that doesn't pin its place by id, Google fills
    // in the page / camera from the PROXY's location (that is how pins ended up in Ohio). So only
    // the exact pin, coordinates written in the link, or a link that carries Google's place id count.
    const pinned = hasPlaceId(finalUrl);
    if (fromUrl && (fromUrl.rank >= 3 || (fromUrl.rank === 2 && !/\/maps\/place\//.test(finalUrl)))) return { lat: fromUrl.lat, lng: fromUrl.lng };
    if (!pinned || /consent\.google/.test(finalUrl)) return null;
    const og = ogImageCenter(json?.contents);
    if (og && !isDefaultSpot(og)) return og;
    return fromUrl ? { lat: fromUrl.lat, lng: fromUrl.lng } : null;
  })();
  const c = await firstNonNull([viaAllOrigins]);
  return c ? { ...c, source: 'proxy', approx: false } : null;
}

export async function resolveCoords({ url, address, country } = {}, { budgetMs = 3000, fetch: fetchFn = defaultFetch } = {}) {
  lastHint = null;
  const link = (url || '').trim();
  const parsed = link ? parseMapsUrl(link) : null;

  // 1. already in the link: instant, no network. A link that only carries a map-camera position
  // (@lat,lng, no pin) is flagged approximate so the app asks the person to confirm the spot.
  if (parsed && parsed.lat != null) {
    const ranked = extractCoordsRanked(link);
    return { lat: parsed.lat, lng: parsed.lng, source: 'link', approx: !!ranked && ranked.rank < 2 && !/\/maps\/place\//.test(link) };
  }

  // 2. everything else starts at the same moment
  const isGoogleLink = /goo\.gl|google\.[a-z.]+\/maps|maps\.google/i.test(link);
  const server = link ? deadline(serverResolve(link, fetchFn, budgetMs), budgetMs) : Promise.resolve(null);
  const proxies = isGoogleLink ? deadline(proxyResolve(link, fetchFn, budgetMs), budgetMs) : Promise.resolve(null);

  // Only the ADDRESS field is ever searched. A place's name on its own ("home", "cafe", "unnamed
  // place") is not an address — searching it worldwide is what dropped pins on random roads — so
  // names are never geocoded. An unresolved link/address goes to "tap the map to place it".
  const queries = [];
  if (parsed && parsed.placeName) lastHint = parsed.placeName;
  // A link is only ever read for ITS OWN coordinates. Searching the address/name is a fallback
  // for entries that have no link at all.
  for (const q of (link ? [] : [address])) {
    const t = (q || '').trim();
    if (t && !queries.includes(t)) queries.push(t);
  }
  const geocodes = queries.map((q) => deadline(geocode(q, { fetch: fetchFn, ms: budgetMs, country }), budgetMs));

  // exact pin (server, then proxies) beats a name-based guess
  const exact = (await server) || (await proxies);
  if (exact) return exact;
  for (const g of geocodes) {
    const c = await g;
    if (c) return { ...c, source: 'name', approx: true };
  }
  return null;
}
