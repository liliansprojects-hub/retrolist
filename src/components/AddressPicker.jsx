import React, { useEffect, useRef, useState } from 'react';
import { Search, ChevronDown, ChevronUp, X, MapPin, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COUNTRIES, emptyFields, addressLines } from '@/lib/addressFormats';
import { searchAddresses } from '@/lib/addressSearch';

// Exactly the same box as every other field in the place editor: app font, regular size and weight.
const field = 'w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground placeholder:text-muted-foreground';

// value: { country: 'GB'|'US'|…, fields: {line1,line2,city,county,region,postcode,countryName}, coords: {lat,lng}|null }
// only these three; any other country a search result lands in is shown under "other"
const CHIPS = ['GB', 'US', 'OTHER'];

export default function AddressPicker({ value, onChange, onPickName }) {
  const { country, fields, coords } = value;
  const cfg = COUNTRIES[country] || COUNTRIES.OTHER;
  const isActive = (code) => (code === 'OTHER' ? !['GB', 'US'].includes(country) : country === code);
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

  const setField = (key, v) => onChange({ ...value, fields: { ...fields, [key]: key === 'postcode' ? v.toUpperCase() : v } });

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
    <section className="font-body rounded-2xl border border-border p-4 space-y-4 text-sm" aria-label="address">
      <div className="flex items-center justify-between px-1">
        <h4 className="text-base font-semibold lowercase">address</h4>
        {(hasAny || coords) && (
          <button type="button" onClick={clear} className="touch-44 text-sm text-muted-foreground lowercase flex items-center gap-1"><X className="w-3.5 h-3.5" /> clear</button>
        )}
      </div>

      {/* country toggle */}
      <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="country">
        {CHIPS.map((code) => (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={isActive(code)}
            onClick={() => onChange({ ...value, country: code })}
            className={cn('touch-44 w-full h-10 rounded-full text-sm font-medium lowercase transition-colors', isActive(code) ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}
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
          placeholder="find a postcode, place or address"
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
                <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 leading-snug">
                  {r.title && <span className="block text-sm font-medium truncate">{r.title}</span>}
                  <span className={cn('block text-sm', r.title ? 'text-muted-foreground' : '')}>{r.sub}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searched && !busy && results.length === 0 && (
        <p className="text-sm text-muted-foreground px-1">no matches{country !== 'OTHER' ? ` in ${cfg.name}` : ''} — try the postcode, or enter the address manually</p>
      )}

      {/* collapsed summary / expanded full address */}
      {!expanded ? (
        <button type="button" onClick={() => setExpanded(true)} className="touch-44 w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground lowercase">
          enter address manually <ChevronDown className="w-4 h-4" />
        </button>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {cfg.fields.map((fd) => (
              <input
                key={fd.key}
                value={fields[fd.key] || ''}
                onChange={(e) => setField(fd.key, e.target.value)}
                placeholder={fd.label}
                aria-label={fd.label}
                className={cn(field, fd.half ? '' : 'col-span-2', fd.key === 'postcode' && 'uppercase')}
                autoCapitalize={fd.key === 'postcode' ? 'characters' : 'sentences'}
              />
            ))}
          </div>
          {country !== 'OTHER' && <p className="text-sm text-muted-foreground lowercase px-1">{cfg.name}</p>}
          {coords && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 px-1"><MapPin className="w-3.5 h-3.5" /> location found for this address</p>
          )}
          {lines.length > 0 && <p className="text-sm text-muted-foreground leading-snug px-1">{lines.join(', ')}</p>}
          <button type="button" onClick={() => setExpanded(false)} className="touch-44 w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground lowercase">
            hide <ChevronUp className="w-4 h-4" />
          </button>
        </div>
      )}
    </section>
  );
}
