// Address / postcode / place search for the place editor. Results come back already split into
// the fields of the country they belong to, in the short form the app shows (first line, town,
// county, postcode, country — no suburbs or "city centre" extras).
//
// Sources, all queried together and merged (duplicates dropped):
//   - Google Places  — ONLY if VITE_GOOGLE_PLACES_KEY is set (best match for what Google Maps shows:
//                      businesses, cafes, restaurants). Without a key this source is skipped.
//   - Photon         — OpenStreetMap search that is good with business / place NAMES ("chahalo bristol")
//   - Nominatim      — OpenStreetMap search, best with street addresses and postcodes
//   - postcodes.io   — exact UK postcode lookup
// Everything except Google is OpenStreetMap data, so a business nobody has added to OSM can only be
// found through Google Places.

import { COUNTRIES, codeForCc, emptyFields, addressText } from '@/lib/addressFormats';
import { getUserBias } from '@/lib/userBias';

const UK_POSTCODE = /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/;
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const GOOGLE_KEY = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GOOGLE_PLACES_KEY) || '';

// keeps results short: no repeated town, a county only when it adds something
function tidy(country, fields) {
  const f = { ...emptyFields(), ...fields };
  if (f.county && f.county.toLowerCase() === f.city.toLowerCase()) f.county = '';
  if (f.line2 && (f.line2.toLowerCase() === f.city.toLowerCase())) f.line2 = '';
  return f;
}

function build(id, country, fields, lat, lng, poiName) {
  const f = tidy(country, fields);
  const sub = addressText(country, f);
  const title = poiName && !sub.toLowerCase().startsWith(poiName.toLowerCase()) ? poiName : '';
  return { id, title, sub, label: [title, sub].filter(Boolean).join(', '), lat, lng, country, fields: f, poiName: title };
}

const NOT_A_PLACE_NAME = new Set(['place', 'highway', 'boundary', 'postcode', 'building']);

function fromNominatim(item) {
  const a = item.address || {};
  const country = codeForCc(String(a.country_code || '').toLowerCase());
  const street = a.road || a.pedestrian || a.footway || a.path || '';
  const house = a.house_number || '';
  const line1 = (country === 'DE' ? `${street} ${house}` : `${house} ${street}`).trim();
  const ukLike = country === 'GB' || country === 'IE';
  const fields = {
    line1,
    city: a.city || a.town || a.village || a.municipality || a.hamlet || '',
    // UK/Ireland: only a real county ("state_district" there is a region such as "south west england")
    county: a.county || (ukLike ? '' : a.state_district) || '',
    region: ukLike ? '' : (a.state || a.region || ''),
    postcode: a.postcode || '',
    countryName: country === 'OTHER' ? (a.country || '') : '',
  };
  const poi = item.name && !NOT_A_PLACE_NAME.has(item.category) && item.name !== street && item.name !== fields.city ? item.name : '';
  return build(`n${item.place_id}`, country, fields, num(item.lat), num(item.lon), poi);
}

function fromPhoton(ft) {
  const p = ft.properties || {};
  const [lng, lat] = (ft.geometry && ft.geometry.coordinates) || [];
  const country = codeForCc(String(p.countrycode || '').toLowerCase());
  const ukLike = country === 'GB' || country === 'IE';
  let street = p.street || '';
  if (!street && p.osm_key === 'highway') street = p.name || '';
  const line1 = (country === 'DE' ? `${street} ${p.housenumber || ''}` : `${p.housenumber || ''} ${street}`).trim();
  const city = p.city || (p.osm_key === 'place' ? p.name : '') || p.locality || p.district || '';
  const fields = {
    line1, city,
    county: p.county || '',
    region: ukLike ? '' : (p.state || ''),
    postcode: p.postcode || '',
    countryName: country === 'OTHER' ? (p.country || '') : '',
  };
  const poi = p.name && !NOT_A_PLACE_NAME.has(p.osm_key) && p.name !== street && p.name !== city ? p.name : '';
  return build(`p${p.osm_type || ''}${p.osm_id || `${lat},${lng}`}`, country, fields, num(lat), num(lng), poi);
}

function fromGoogle(pl) {
  const comp = (type) => (pl.addressComponents || []).find((c) => (c.types || []).includes(type));
  const long = (type) => (comp(type) ? comp(type).longText : '');
  const cc = comp('country') ? String(comp('country').shortText || '').toLowerCase() : '';
  const country = codeForCc(cc);
  const street = long('route');
  const house = long('street_number');
  const line1 = (country === 'DE' ? `${street} ${house}` : `${house} ${street}`).trim();
  const ukLike = country === 'GB' || country === 'IE';
  const fields = {
    line1,
    city: long('postal_town') || long('locality') || long('sublocality') || '',
    county: long('administrative_area_level_2') || '',
    region: ukLike ? '' : long('administrative_area_level_1'),
    postcode: long('postal_code'),
    countryName: country === 'OTHER' ? long('country') : '',
  };
  const isAddress = (pl.types || []).some((t) => ['street_address', 'route', 'premise', 'subpremise', 'postal_code', 'locality', 'political'].includes(t));
  const r = build(`g${pl.id}`, country, fields, num(pl.location && pl.location.latitude), num(pl.location && pl.location.longitude), isAddress ? '' : (pl.displayName && pl.displayName.text) || '');
  r.cc = cc;
  return r;
}

async function viaPostcodesIo(q, signal) {
  if (!UK_POSTCODE.test(q)) return [];
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(q.replace(/\s+/g, ''))}`, { signal });
    if (!res.ok) return [];
    const r = (await res.json()).result;
    if (!r || num(r.latitude) == null) return [];
    return [build(`pc-${r.postcode}`, 'GB', { city: r.admin_district || '', county: r.admin_county || '', postcode: r.postcode }, num(r.latitude), num(r.longitude), '')];
  } catch { return []; }
}

async function viaGoogle(q, cc, signal) {
  if (!GOOGLE_KEY) return [];
  try {
    const bias = getUserBias();
    const body = { textQuery: q, languageCode: 'en', maxResultCount: 6 };
    if (cc) body.regionCode = cc.toUpperCase();
    if (bias) body.locationBias = { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 50000 } };
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.addressComponents,places.types',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return (data.places || []).map(fromGoogle).filter((r) => r.lat != null);
  } catch { return []; }
}

async function viaPhoton(q, cc, signal) {
  try {
    const bias = getUserBias();
    const loc = bias ? `&lat=${bias.lat}&lon=${bias.lng}&location_bias_scale=0.4` : '';
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en${loc}`, { signal });
    const data = await res.json();
    return (data.features || []).map(fromPhoton).filter((r) => r.lat != null && (!cc || COUNTRIES[r.country]?.cc === cc));
  } catch { return []; }
}

async function viaNominatim(q, cc, signal) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&accept-language=en&q=${encodeURIComponent(q)}${cc ? `&countrycodes=${cc}` : ''}`;
    const res = await fetch(url, { signal });
    const data = await res.json();
    return Array.isArray(data) ? data.map(fromNominatim).filter((r) => r.lat != null) : [];
  } catch { return []; }
}

export async function searchAddresses(query, countryCode, { signal } = {}) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  const cc = countryCode && COUNTRIES[countryCode] ? COUNTRIES[countryCode].cc : '';
  const lists = await Promise.all([
    countryCode === 'GB' ? viaPostcodesIo(q, signal) : [],
    viaGoogle(q, cc, signal),
    viaPhoton(q, cc, signal),
    viaNominatim(q, cc, signal),
  ]);
  const seen = new Set();
  const out = [];
  lists.flat().forEach((r) => {
    if (cc && r.cc && r.cc !== cc) return;
    const key = `${r.title}|${r.sub}`.toLowerCase();
    const near = `${r.lat.toFixed(3)},${r.lng.toFixed(3)}|${r.title.toLowerCase()}`;
    if (seen.has(key) || seen.has(near)) return;
    seen.add(key); seen.add(near);
    out.push(r);
  });
  return out.slice(0, 8);
}
