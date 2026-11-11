// Per-country address layouts. All countries share the same canonical keys (line1, line2, city,
// county, region, postcode, countryName) so switching country keeps whatever has been typed; each
// country just chooses which of them to show, in what order, and what to call them.

const f = (key, label, extra = {}) => ({ key, label, ...extra });

export const COUNTRIES = {
  GB: {
    chip: 'uk', name: 'united kingdom', cc: 'gb', upper: true, postcodeHint: 'e.g. b1 1aa',
    fields: [f('line1', 'address line 1'), f('line2', 'address line 2 (optional)'), f('city', 'town / city', { half: true }), f('county', 'county', { half: true }), f('postcode', 'postcode', { half: true })],
    lines: (v) => [v.line1, v.line2, v.city, v.county, v.postcode],
  },
  US: {
    chip: 'us', name: 'united states', cc: 'us', postcodeHint: 'e.g. 90210',
    fields: [f('line1', 'street address'), f('line2', 'apt / suite / unit'), f('city', 'city', { half: true }), f('region', 'state', { half: true }), f('postcode', 'zip code', { half: true })],
    lines: (v) => [v.line1, v.line2, [v.city, [v.region, v.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ')],
  },
  IE: {
    chip: 'ireland', name: 'ireland', cc: 'ie', upper: true, postcodeHint: 'e.g. d02 af30',
    fields: [f('line1', 'address line 1'), f('line2', 'address line 2'), f('city', 'town / city', { half: true }), f('county', 'county', { half: true }), f('postcode', 'eircode', { half: true })],
    lines: (v) => [v.line1, v.line2, v.city, v.county, v.postcode],
  },
  CA: {
    chip: 'canada', name: 'canada', cc: 'ca', upper: true, postcodeHint: 'e.g. m5v 2t6',
    fields: [f('line1', 'street address'), f('line2', 'unit'), f('city', 'city', { half: true }), f('region', 'province', { half: true }), f('postcode', 'postal code', { half: true })],
    lines: (v) => [v.line1, v.line2, [v.city, [v.region, v.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ')],
  },
  AU: {
    chip: 'australia', name: 'australia', cc: 'au', postcodeHint: 'e.g. 2000',
    fields: [f('line1', 'street address'), f('line2', 'unit'), f('city', 'suburb', { half: true }), f('region', 'state / territory', { half: true }), f('postcode', 'postcode', { half: true })],
    lines: (v) => [v.line1, v.line2, [v.city, v.region, v.postcode].filter(Boolean).join(' ')],
  },
  FR: {
    chip: 'france', name: 'france', cc: 'fr', postcodeHint: 'e.g. 75001',
    fields: [f('line1', 'numéro et rue'), f('line2', 'complément'), f('postcode', 'code postal', { half: true }), f('city', 'ville', { half: true }), f('region', 'région')],
    lines: (v) => [v.line1, v.line2, [v.postcode, v.city].filter(Boolean).join(' '), v.region],
  },
  DE: {
    chip: 'germany', name: 'germany', cc: 'de', postcodeHint: 'e.g. 10115',
    fields: [f('line1', 'straße und hausnummer'), f('line2', 'zusatz'), f('postcode', 'postleitzahl', { half: true }), f('city', 'ort', { half: true }), f('region', 'bundesland')],
    lines: (v) => [v.line1, v.line2, [v.postcode, v.city].filter(Boolean).join(' '), v.region],
  },
  OTHER: {
    chip: 'other', name: '', cc: '', postcodeHint: '',
    fields: [f('countryName', 'country'), f('line1', 'address line 1'), f('line2', 'address line 2'), f('city', 'town / city', { half: true }), f('county', 'county / district', { half: true }), f('region', 'state / region', { half: true }), f('postcode', 'postal code', { half: true })],
    lines: (v) => [v.line1, v.line2, v.city, v.county, v.region, v.postcode],
  },
};

export const COUNTRY_ORDER = ['GB', 'US', 'IE', 'CA', 'AU', 'FR', 'DE', 'OTHER'];

export const ccFor = (code) => (COUNTRIES[code] ? COUNTRIES[code].cc : '');
export const codeForCc = (cc) => COUNTRY_ORDER.find((k) => COUNTRIES[k].cc && COUNTRIES[k].cc === String(cc || '').toLowerCase()) || 'OTHER';

export const emptyFields = () => ({ line1: '', line2: '', city: '', county: '', region: '', postcode: '', countryName: '' });

// the lines of the address, in this country's order, then the country itself
export function addressLines(country, fields) {
  const c = COUNTRIES[country] || COUNTRIES.OTHER;
  const v = fields || {};
  const lines = c.lines(v).map((x) => String(x || '').trim()).filter(Boolean);
  if (!lines.length && country !== 'OTHER') return []; // only the country is set: that is not an address
  const countryName = country === 'OTHER' ? String(v.countryName || '').trim() : c.name;
  if (countryName) lines.push(countryName);
  return lines;
}

export const addressText = (country, fields) => addressLines(country, fields).join(', ');
