// Locating a place on the map. Links are NOT read any more: the google maps link box on a place is
// plain text. A pin comes from (in order) coordinates typed in by hand, the address the person
// picked from the address search, or - as a last resort - a search of the address text.

import { getUserBias } from '@/lib/userBias';

const defaultFetch = (...args) => globalThis.fetch(...args);

function pair(a, b) {
  const lat = parseFloat(a);
  const lng = parseFloat(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// a plain "lat, lng" pair typed/pasted straight from Google Maps
// (tap-and-hold a spot, copy the coordinates shown).
export function parseManualCoords(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  return m ? pair(m[1], m[2]) : null;
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

// resolve to null if the promise hasn't settled within ms (never rejects)
function deadline(promise, ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(t); resolve(v ?? null); },
      () => { clearTimeout(t); resolve(null); },
    );
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

// Finds coordinates for an ADDRESS (never a link, never a bare place name).
export async function resolveCoords({ address, country } = {}, { budgetMs = 3000, fetch: fetchFn = defaultFetch } = {}) {
  const q = (address || '').trim();
  if (!q) return null;
  const c = await deadline(geocode(q, { fetch: fetchFn, ms: budgetMs, country }), budgetMs);
  return c ? { ...c, source: 'name', approx: true } : null;
}
