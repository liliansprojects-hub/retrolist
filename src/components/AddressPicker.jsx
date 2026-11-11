import React, { useEffect, useRef, useState } from 'react';
import { Search, ChevronDown, ChevronUp, X, MapPin, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COUNTRIES, COUNTRY_ORDER, emptyFields, addressLines } from '@/lib/addressFormats';
import { searchAddresses } from '@/lib/addressSearch';

const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground';

// value: { country: 'GB'|'US'|…, fields: {line1,line2,city,county,region,postcode,countryName}, coords: {lat,lng}|null }
export default function AddressPicker({ value, onChange }) {
  const { country, fields, coords } = value;
  const cfg = COUNTRIES[country] || COUNTRIES.OTHER;
  const hasAny = Object.values(fields).some((v) => String(v || '').trim());
  const [expanded, setExpanded] = useState(hasAny);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const abortRef = useRef(null);

  // search as you type (postcodes included), after a short pause — the free geocoder asks for
  // no more than about one request a second
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setResults([]); setSearched(false); setBusy(false); return undefined; }
    setBusy(true);
    const t = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const r = await searchAddresses(q, country, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      setResults(r);
      setSearched(true);
      setBusy(false);
    }, 650);
    return () => clearTimeout(t);
  }, [query, country]);

  const setField = (key, v) => onChange({ ...value, fields: { ...fields, [key]: cfg.upper && key === 'postcode' ? v.toUpperCase() : v } });
  const setCountry = (code) => onChange({ ...value, country: code });

  const pick = (r) => {
    // the picked result decides the country too (a search under "other" can land anywhere)
    onChange({ country: r.country, fields: { ...emptyFields(), ...r.fields }, coords: { lat: r.lat, lng: r.lng } });
    setQuery('');
    setResults([]);
    setSearched(false);
    setExpanded(true);
  };

  const clear = () => { onChange({ ...value, fields: emptyFields(), coords: null }); setExpanded(false); };
  const lines = addressLines(country, fields);

  return (
    <div className="rounded-2xl border border-border bg-background/40 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold lowercase text-muted-foreground">address</span>
        {(hasAny || coords) && (
          <button type="button" onClick={clear} className="touch-44 text-[11px] lowercase text-muted-foreground flex items-center gap-0.5"><X className="w-3 h-3" /> clear</button>
        )}
      </div>

      {/* country toggle */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-0.5 px-0.5" role="radiogroup" aria-label="country">
        {COUNTRY_ORDER.map((code) => (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={country === code}
            onClick={() => setCountry(code)}
            className={cn('touch-44 shrink-0 px-3 h-7 rounded-full text-[11px] font-medium lowercase transition-colors', country === code ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}
          >
            {COUNTRIES[code].chip}
          </button>
        ))}
      </div>

      {/* search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={country === 'OTHER' ? 'search an address or postcode (any country)' : `search a postcode or address in ${cfg.name}${cfg.postcodeHint ? ` — ${cfg.postcodeHint}` : ''}`}
          className={cn(inputCls, 'pl-9 pr-9')}
          autoComplete="off"
          enterKeyHint="search"
        />
        {busy && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground animate-spin" />}
      </div>

      {results.length > 0 && (
        <ul className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden max-h-56 overflow-y-auto">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => pick(r)} className="w-full text-left px-3 py-2 flex items-start gap-2 active:bg-muted">
                <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <span className="text-xs leading-snug">{r.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searched && !busy && results.length === 0 && (
        <p className="text-[11px] text-muted-foreground px-1 lowercase">no matches{country !== 'OTHER' ? ` in ${cfg.name}` : ''} — try the postcode, or enter it below</p>
      )}

      {/* collapsed summary / expanded full address */}
      {!expanded ? (
        <button type="button" onClick={() => setExpanded(true)} className="touch-44 w-full flex items-center justify-center gap-1 text-[11px] lowercase text-muted-foreground py-1">
          enter the full address yourself <ChevronDown className="w-3 h-3" />
        </button>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {cfg.fields.map((fd) => (
              <input
                key={fd.key}
                value={fields[fd.key] || ''}
                onChange={(e) => setField(fd.key, e.target.value)}
                placeholder={fd.label}
                aria-label={fd.label}
                className={cn(inputCls, fd.half ? '' : 'col-span-2')}
                autoCapitalize={fd.key === 'postcode' ? 'characters' : 'words'}
              />
            ))}
          </div>
          {country !== 'OTHER' && (
            <div className="px-1 text-[11px] text-muted-foreground lowercase">country: {cfg.name}</div>
          )}
          {lines.length > 0 && (
            <p className="px-1 text-[11px] text-muted-foreground leading-snug">{lines.join(' · ')}</p>
          )}
          {coords && (
            <p className="px-1 text-[11px] text-muted-foreground lowercase flex items-center gap-1"><MapPin className="w-3 h-3" /> location found for this address</p>
          )}
          <button type="button" onClick={() => setExpanded(false)} className="touch-44 w-full flex items-center justify-center gap-1 text-[11px] lowercase text-muted-foreground py-1">
            hide <ChevronUp className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
