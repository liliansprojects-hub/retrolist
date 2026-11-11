// Address / postcode search for the place editor. Results are already split into the fields of
// the country they belong to, ready to fill the form.
//   - UK postcodes go to postcodes.io first (exact, free, no key)
//   - everything else (and street-level UK results) goes to OpenStreetMap's Nominatim, restricted
//     to the chosen country, so "b1 1aa" can't be answered by somewhere in another country.

import { COUNTRIES, codeForCc, emptyFields } from '@/lib/addressFormats';

const UK_POSTCODE = /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/;
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

function fromNominatim(item) {
  const a = item.address || {};
  const cc = String(a.country_code || '').toLowerCase();
  const country = codeForCc(cc);
  const street = a.road || a.pedestrian || a.footway || a.path || '';
  const house = a.house_number || a.house_name || '';
  const line1 = (country === 'DE' ? `${street} ${house}` : `${house} ${street}`).trim();
  const fields = {
    ...emptyFields(),
    line1,
    line2: a.suburb || a.neighbourhood || a.quarter || a.hamlet || '',
    city: a.city || a.town || a.village || a.municipality || '',
    county: a.county || a.state_district || '',
    region: a.state || a.region || '',
    postcode: a.postcode || '',
    countryName: country === 'OTHER' ? (a.country || '') : '',
  };
  // the town is sometimes the only locality there is: don't repeat it on the second line
  if (fields.line2 && fields.line2 === fields.city) fields.line2 = '';
  // a named place (a cafe, a station) has no street of its own in the address — keep its name visible in the label
  return { id: `n${item.place_id}`, label: item.display_name, lat: num(item.lat), lng: num(item.lon), country, fields };
}

export async function searchAddresses(query, countryCode, { signal } = {}) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  const out = [];

  if (countryCode === 'GB' && UK_POSTCODE.test(q)) {
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(q.replace(/\s+/g, ''))}`, { signal });
      if (res.ok) {
        const r = (await res.json()).result;
        if (r && num(r.latitude) != null) {
          out.push({
            id: `pc-${r.postcode}`,
            label: [r.postcode, r.admin_district, r.admin_county, r.country].filter(Boolean).join(', '),
            lat: num(r.latitude), lng: num(r.longitude), country: 'GB',
            fields: { ...emptyFields(), city: r.admin_district || '', county: r.admin_county || '', region: r.country || '', postcode: r.postcode },
          });
        }
      }
    } catch { /* offline / aborted — the street-level search below may still answer */ }
  }

  try {
    const cc = countryCode && COUNTRIES[countryCode] ? COUNTRIES[countryCode].cc : '';
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&accept-language=en&q=${encodeURIComponent(q)}${cc ? `&countrycodes=${cc}` : ''}`;
    const res = await fetch(url, { signal });
    const data = await res.json();
    if (Array.isArray(data)) data.forEach((d) => { const r = fromNominatim(d); if (r.lat != null) out.push(r); });
  } catch { /* offline / aborted */ }

  return out;
}
