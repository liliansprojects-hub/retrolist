import React, { useEffect, useRef, useState } from 'react';
import { Search, ChevronDown, ChevronUp, X, MapPin, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COUNTRIES, COUNTRY_ORDER, emptyFields, addressLines } from '@/lib/addressFormats';
import { searchAddresses } from '@/lib/addressSearch';

// Same look as the rest of the app: the app font, lowercase, soft muted fills and hairline borders.
const field = 'w-full px-3.5 py-2.5 rounded-xl bg-muted/60 border border-transparent text-[13px] font-medium lowercase placeholder:normal-case placeholder:font-normal placeholder:text-muted-foreground/70 outline-none transition-colors focus:bg-background focus:border-border';

// value: { country: 'GB'|'US'|…, fields: {line1,line2,city,county,region,postcode,countryName}, coords: {lat,lng}|null }
export default function AddressPicker({ value, onChange, onPickName }) {
  const { country, fields, coords } = value;
  const cfg = COUNTRIES[country] || COUNTRIES.OTHER;
  const hasAny = Object.values(fields).some((v) => String(v || '').trim());
  const [expanded, setExpanded] = useState(hasAny);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const abortRef = useRef(null);

  // search as you type (postcodes included), after a short pause
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
    }, 600);
    return () => clearTimeout(t);
  }, [query, country]);

  const setField = (key, v) => onChange({ ...value, fields: { ...fields, [key]: cfg.upper && key === 'postcode' ? v.toUpperCase() : v } });

  const pick = (r) => {
    // the picked result decides the country too (a search under "other" can land anywhere)
    onChange({ country: r.country, fields: { ...emptyFields(), ...r.fields }, coords: { lat: r.lat, lng: r.lng } });
    if (r.poiName && onPickName) onPickName(r.poiName);
    setQuery('');
    setResults([]);
    setSearched(false);
    setExpanded(true);
  };

  const clear = () => { onChange({ ...value, fields: emptyFields(), coords: null }); setExpanded(false); };
  const lines = addressLines(country, fields);

  return (
    <section className="space-y-2.5 font-body lowercase" aria-label="address">
      <div className="flex items-center justify-between px-0.5">
        <h4 className="text-[11px] font-bold tracking-wide text-muted-foreground">address</h4>
        {(hasAny || coords) && (
          <button type="button" onClick={clear} className="touch-44 text-[11px] font-medium text-muted-foreground flex items-center gap-0.5"><X className="w-3 h-3" /> clear</button>
        )}
      </div>

      {/* country toggle */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar" role="radiogroup" aria-label="country">
        {COUNTRY_ORDER.map((code) => (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={country === code}
            onClick={() => onChange({ ...value, country: code })}
            className={cn('touch-44 shrink-0 px-3 h-7 rounded-full text-[11px] font-semibold transition-colors', country === code ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}
          >
            {COUNTRIES[code].chip}
          </button>
        ))}
      </div>

      {/* search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={country === 'OTHER' ? 'find an address, place or postcode' : `find a postcode, place or address${cfg.postcodeHint ? ` (${cfg.postcodeHint.replace('e.g. ', '')})` : ''}`}
          className={cn(field, 'pl-9 pr-9')}
          autoComplete="off"
          enterKeyHint="search"
        />
        {busy && <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground animate-spin" />}
      </div>

      {results.length > 0 && (
        <ul className="rounded-xl border border-border/70 divide-y divide-border/60 overflow-hidden max-h-56 overflow-y-auto no-scrollbar">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => pick(r)} className="w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 active:bg-muted/70">
                <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 leading-snug">
                  {r.title && <span className="block text-[13px] font-semibold truncate">{r.title}</span>}
                  <span className={cn('block text-xs', r.title ? 'text-muted-foreground' : 'font-medium')}>{r.sub}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searched && !busy && results.length === 0 && (
        <p className="text-[11px] text-muted-foreground px-1">no matches{country !== 'OTHER' ? ` in ${cfg.name}` : ''} — try the postcode, or enter it yourself</p>
      )}

      {/* collapsed summary / expanded full address */}
      {!expanded ? (
        <button type="button" onClick={() => setExpanded(true)} className="touch-44 w-full flex items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground py-1">
          enter the address yourself <ChevronDown className="w-3 h-3" />
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
                className={cn(field, fd.half ? '' : 'col-span-2')}
                autoCapitalize={fd.key === 'postcode' ? 'characters' : 'none'}
              />
            ))}
          </div>
          {country !== 'OTHER' && <p className="px-1 text-[11px] text-muted-foreground">{cfg.name}</p>}
          {coords && (
            <p className="px-1 text-[11px] text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> location found for this address</p>
          )}
          {lines.length > 0 && <p className="px-1 text-[11px] text-muted-foreground/80 leading-snug">{lines.join(' · ')}</p>}
          <button type="button" onClick={() => setExpanded(false)} className="touch-44 w-full flex items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground py-1">
            hide <ChevronUp className="w-3 h-3" />
          </button>
        </div>
      )}
    </section>
  );
}
