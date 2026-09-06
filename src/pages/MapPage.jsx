import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Map as PigeonMap, Overlay } from 'pigeon-maps';
import { Plus, X, FolderPlus, ChevronDown, ChevronRight, ChevronLeft, Trash2, MapPin, Link2, Pencil, MoreVertical } from 'lucide-react';
import {
  getMapFolders, saveMapFolders, addMapFolder, deleteMapFolder, updateMapFolder, addPlace, deletePlace, updatePlace,
} from '@/lib/store';
import ImageUpload from '@/components/ImageUpload';
import ColorPicker from '@/components/ColorPicker';

// NOTE ON THE MAP LIBRARY: this used to be react-leaflet. Leaflet's own
// layout model depends entirely on a big external stylesheet
// (leaflet.css) to give its tile/pane DOM the right position/overflow
// rules — if that stylesheet doesn't actually apply for any reason (a
// bundler quirk, a CSP, a build target that drops it), NOTHING renders and
// there's no error, just a permanently blank box, which is exactly what
// kept happening here even after fixing the zoom/sizing bugs underneath
// it. pigeon-maps needs no external stylesheet at all — it lays itself out
// with plain inline styles it sets itself — which removes that entire
// failure mode outright. It's also a much smaller, dependency-free
// library, so this is a straight simplification, not just a swap.

// returns { lat, lng } if coords found, { placeName } if a place name is extractable, else null
function parseMapsUrl(url) {
  if (!url) return null;
  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  const qMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
  const destMatch = url.match(/destination=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (destMatch) return { lat: parseFloat(destMatch[1]), lng: parseFloat(destMatch[2]) };
  const coordMatch = url.match(/(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (coordMatch) return { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]) };
  const placeMatch = url.match(/maps\/(?:place|search)\/([^/@?#]+)/);
  if (placeMatch) {
    try {
      const name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
      if (name) return { placeName: name };
    } catch { /* malformed %-encoding in a pasted link — fall through */ }
  }
  const qText = url.match(/[?&](?:q|query)=([^&#]+)/);
  if (qText) {
    try {
      const name = decodeURIComponent(qText[1]).replace(/^[-\d.]+,[-\d.]+$/, '').trim();
      if (name) return { placeName: name };
    } catch { /* malformed %-encoding — fall through */ }
  }
  return null;
}

// every network call below now goes through this — a proxy or geocoder
// that hangs (rather than erroring quickly) previously had no timeout at
// all, so "add place" could sit doing nothing for a very long time with
// zero feedback, which reads exactly like "the button doesn't work."
// capped at a few seconds each, this guarantees the save always completes
// promptly — worst case, the place saves without a pin instead of hanging.
async function fetchWithTimeout(url, opts = {}, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function geocode(address) {
  try {
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
    );
    const data = await res.json();
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    /* offline, blocked, or timed out — save without coords rather than hang */
  }
  return null;
}

async function resolveShortLink(url) {
  // try more than one public CORS proxy — if corsproxy.io is down, rate
  // limited, or has changed its API (this is exactly the kind of failure
  // that would break identically on Base44's own hosting too, since this
  // all runs client-side regardless of where the frontend is deployed),
  // a second option gives this a real chance of still working.
  const proxies = [
    // r.jina.ai renders the page (handles JS-based consent walls Google can
    // throw at plain scraper requests) and returns clean text — tried
    // first since it's the most likely to actually get real content back
    // rather than a blank consent page.
    (u) => `https://r.jina.ai/${u}`,
    (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  ];
  for (const buildProxyUrl of proxies) {
    try {
      const res = await fetchWithTimeout(buildProxyUrl(url), { redirect: 'follow' }, 6000);
      const finalUrl = res.url || url;
      const coords = parseMapsUrl(finalUrl);
      if (coords && coords.lat) return coords;
      const text = await res.text();
      // several patterns, tried in order of how reliably each shows up in
      // scraped Google Maps HTML: the classic @lat,lng in a URL anywhere in
      // the page, a raw lat/lng JSON pair, and Google's internal
      // "!3d<lat>!4d<lng>" data-blob marker, which is present on almost
      // every place page (including ones with no @lat,lng in the URL at
      // all) since it's how Google encodes the pin's exact position
      // internally.
      const embedded =
        text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
        text.match(/"lat['"]?\s*:\s*(-?\d+\.\d+)[^}]*"lng['"]?\s*:\s*(-?\d+\.\d+)/) ||
        text.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
      if (embedded) return { lat: parseFloat(embedded[1]), lng: parseFloat(embedded[2]) };
      const fromFinal = parseMapsUrl(finalUrl);
      if (fromFinal && fromFinal.lat) return fromFinal;
    } catch {
      // try the next proxy
    }
  }
  return null;
}

async function resolveCoords({ url, address }) {
  const attempt = (async () => {
    let coords = null;
    if (url) {
      const parsed = parseMapsUrl(url);
      if (parsed?.lat) coords = parsed;
      else if (parsed?.placeName) coords = await geocode(parsed.placeName);
      // fall back to actually fetching the real Google Maps page and scraping
      // its embedded coordinates — not just for goo.gl/maps.app short links,
      // but for ANY maps URL once a plain Nominatim name search comes up
      // empty. Modern Google share links are often long-format, place-ID-based
      // URLs (no @lat,lng in the URL itself), and Nominatim's business/venue
      // name coverage is much weaker than Google's — searching by bare name
      // frequently fails for real places, while the actual page HTML almost
      // always has the true coordinates embedded somewhere.
      if (!coords) coords = await resolveShortLink(url);
    }
    if (!coords && address) coords = await geocode(address);
    return coords;
  })();
  // belt-and-suspenders: fetchWithTimeout already caps each individual
  // network call, but this caps the WHOLE resolution attempt too, so
  // "add place" is guaranteed to finish (with or without a pin) in a
  // bounded time no matter what goes wrong underneath.
  return Promise.race([
    attempt,
    new Promise((resolve) => setTimeout(() => resolve(null), 15000)),
  ]);
}

// last-resort, 100%-reliable path: a "lat, lng" pair typed/pasted straight
// from Google Maps (tap-and-hold a spot → the coordinates shown at the
// bottom can be copied directly). doesn't depend on any link parsing,
// third-party proxy, or geocoding service working at all.
function parseManualCoords(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

const folderColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

// standard web-mercator projection, used only to compute a center+zoom that
// fits a set of points — pigeon-maps doesn't ship a fitBounds helper, so
// this is a small, dependency-free version of the same math every map
// library uses internally for it.
function project([lat, lng]) {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const x = lng / 360 + 0.5;
  const y = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
  return [x, y];
}
function unproject([x, y]) {
  const lng = (x - 0.5) * 360;
  const n = Math.PI - 2 * Math.PI * y;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return [lat, lng];
}
function fitPoints(points, width, height, { maxZoom = 16, padding = 50 } = {}) {
  if (!points.length || !width || !height) return null;
  if (points.length === 1) return { center: points[0], zoom: Math.min(15, maxZoom) };
  const proj = points.map(project);
  const minX = Math.min(...proj.map((p) => p[0]));
  const maxX = Math.max(...proj.map((p) => p[0]));
  const minY = Math.min(...proj.map((p) => p[1]));
  const maxY = Math.max(...proj.map((p) => p[1]));
  const TILE = 256;
  const availW = Math.max(1, width - padding * 2);
  const availH = Math.max(1, height - padding * 2);
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const zoom = Math.max(1, Math.min(Math.log2(availW / (TILE * spanX)), Math.log2(availH / (TILE * spanY)), maxZoom));
  const center = unproject([(minX + maxX) / 2, (minY + maxY) / 2]);
  return { center, zoom };
}

function coloredPin(color) {
  return (
    <div style={{ width: 18, height: 18, borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg) translate(-50%, -100%)', background: color || '#0a0a0a', border: '2.5px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }} />
  );
}
function clusterBadge(count) {
  return (
    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#0a0a0a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, border: '2.5px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', transform: 'translate(-50%, -50%)' }}>
      {count}
    </div>
  );
}

// smart pin-density clustering: at low zoom nearby pins collapse into a count
// badge (tap to zoom in); at high zoom every pin shows individually, coloured
// to match its folder. tap any pin to open its popup.
function MarkerLayer({ places, zoom, onPinClick, onClusterClick, selected }) {
  const prec = zoom <= 12 ? Math.max(1, 9 - Math.floor(zoom)) : 99;
  const buckets = {};
  places.forEach((p) => {
    const key = p.lat.toFixed(prec) + '|' + p.lng.toFixed(prec);
    (buckets[key] = buckets[key] || []).push(p);
  });
  return Object.values(buckets).map((bucket) => {
    if (bucket.length === 1) {
      const p = bucket[0];
      return (
        <Overlay key={p.id} anchor={[p.lat, p.lng]} offset={[0, 0]}>
          <div onClick={(e) => { e.stopPropagation(); onPinClick(p); }} style={{ cursor: 'pointer' }}>
            {coloredPin(p.folderColor)}
          </div>
          {selected === p.id && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="text-sm max-w-[200px] bg-white text-black rounded-xl shadow-xl p-2"
              style={{ position: 'absolute', bottom: 26, left: '50%', transform: 'translateX(-50%)' }}
            >
              {p.photo && <img src={p.photo} alt="" className="w-full h-24 object-cover rounded-lg mb-1" />}
              <p className="font-bold">{p.name}</p>
              {p.address && <p className="text-xs text-gray-500">{p.address}</p>}
              {p.notes && <p className="text-xs mt-1">{p.notes}</p>}
              {p.url && (
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 underline flex items-center gap-1 mt-1">
                  <Link2 className="w-3 h-3" /> open in maps
                </a>
              )}
            </div>
          )}
        </Overlay>
      );
    }
    const lat = bucket.reduce((s, p) => s + p.lat, 0) / bucket.length;
    const lng = bucket.reduce((s, p) => s + p.lng, 0) / bucket.length;
    return (
      <Overlay key={'c:' + lat + '|' + lng} anchor={[lat, lng]} offset={[0, 0]}>
        <div onClick={(e) => { e.stopPropagation(); onClusterClick(lat, lng); }} style={{ cursor: 'pointer' }}>
          {clusterBadge(bucket.length)}
        </div>
      </Overlay>
    );
  });
}

export default function MapPage() {
  const [searchParams] = useSearchParams();
  const [folders, setFolders] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [showAddFolder, setShowAddFolder] = useState(searchParams.get('create') === 'true');
  const [addingTo, setAddingTo] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(folderColors[0]);
  const [newFolderSubtitle, setNewFolderSubtitle] = useState('');
  const [placeForm, setPlaceForm] = useState({ name: '', subheading: '', address: '', url: '', notes: '', color: '' });
  const [activeFolders, setActiveFolders] = useState(null); // null = all
  const [editingPlace, setEditingPlace] = useState(null); // { folderId, place }
  const [editingFolder, setEditingFolder] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [filterSignal, setFilterSignal] = useState(0);
  const [folderMenu, setFolderMenu] = useState(null);
  const [center, setCenter] = useState([20, 0]);
  const [zoom, setZoom] = useState(2);
  const [selectedPin, setSelectedPin] = useState(null);
  const mapWrapRef = useRef(null);
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });

  const refresh = () => setFolders(getMapFolders());

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('retrolist:synced', handler);
    return () => window.removeEventListener('retrolist:synced', handler);
  }, []);

  useEffect(() => {
    const conn = (typeof navigator !== 'undefined' && navigator.connection) || null;
    if (!navigator.onLine || (conn && conn.saveData)) return;
    let cancelled = false;
    (async () => {
      const folders = getMapFolders();
      let changed = false;
      for (const folder of folders) {
        for (const place of folder.places || []) {
          if (place.lat) continue;
          if (!place.url && !place.address) continue;
          const coords = await resolveCoords({ url: place.url, address: place.address });
          if (coords?.lat && !cancelled) {
            place.lat = coords.lat;
            place.lng = coords.lng;
            changed = true;
          }
        }
      }
      if (changed && !cancelled) { saveMapFolders(folders); refresh(); }
    })();
    return () => { cancelled = true; };
  }, []);

  const allPlaces = folders.flatMap((f) =>
    (f.places || []).map((p) => ({ ...p, folderId: f.id, folderName: f.name, folderColor: f.color || '#888' }))
  );
  const visiblePlaces = activeFolders === null
    ? allPlaces
    : allPlaces.filter((p) => activeFolders.includes(p.folderId));
  const mappedPlaces = visiblePlaces.filter((p) => p.lat && p.lng);

  // track the map's actual pixel size so fitPoints() can compute a zoom
  // level that really fits the container, not a guess.
  useEffect(() => {
    if (!mapWrapRef.current) return;
    const el = mapWrapRef.current;
    const update = () => setMapSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // fit all currently-visible pins whenever the folder filter changes, and
  // once on first load — this is what makes "show as many pins as possible"
  // work on re-entering the page or after (re)filtering.
  useEffect(() => {
    if (!mapSize.w || !mapSize.h) return;
    if (!mappedPlaces.length) return;
    const fit = fitPoints(mappedPlaces.map((p) => [p.lat, p.lng]), mapSize.w, mapSize.h);
    if (fit) { setCenter(fit.center); setZoom(fit.zoom); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSignal, mapSize.w, mapSize.h, mappedPlaces.length]);

  // zoom into a specific place whenever it's targeted (new place just
  // created, or an existing one tapped in the list/on the map).
  useEffect(() => {
    if (flyTarget && flyTarget.lat) {
      setCenter([flyTarget.lat, flyTarget.lng]);
      setZoom((z) => Math.max(z, 15));
      setSelectedPin(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTarget]);

  const toggleFolderFilter = (id) => {
    setActiveFolders((prev) => {
      if (prev === null) return [id];
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        return next.length ? next : null;
      }
      return [...prev, id];
    });
    setFilterSignal((s) => s + 1);
  };

  const showAll = () => { setActiveFolders(null); setFilterSignal((s) => s + 1); };

  const handleAddFolder = () => {
    if (!newFolderName.trim()) return;
    const f = addMapFolder({ name: newFolderName.trim(), color: newFolderColor, subtitle: newFolderSubtitle.trim() });
    setNewFolderName('');
    setNewFolderColor(folderColors[0]);
    setNewFolderSubtitle('');
    setShowAddFolder(false);
    setExpanded({ ...expanded, [f.id]: true });
    refresh();
  };

  const [resolving, setResolving] = useState(false);
  // the "add place" window used to `await resolveCoords(...)` before ever
  // saving anything or closing itself — so whenever a google maps link was
  // present (the ONLY time real network calls actually happen; a bare name
  // with no link/address saves instantly with nothing to look up), the
  // window sat there until every proxy attempt settled. That's not really
  // fixable by tuning timeouts further — waiting on a network call before
  // saving is the wrong shape for this action. Saving now happens
  // synchronously and closes the window immediately every time, and
  // coordinate lookup runs afterward in the background, patching the pin
  // in (and flying the map to it) whenever it resolves.
  const handlePlaceSave = (folderId, placeId, data) => {
    // nothing worth saving yet — leave the editor open rather than closing
    // it on an empty save (unchanged from before).
    if (!placeId && !data.name?.trim() && !data.url?.trim()) return;
    // defensive: guarantee there's always a real folder to save into, even
    // if this got called with no folderId (e.g. the corner + button when
    // the map had no folders at all yet) — previously that silently did
    // nothing at all, no error, no saved place, nothing.
    let realFolderId = folderId;
    if (!realFolderId) {
      const existing = getMapFolders();
      realFolderId = existing[0]?.id || addMapFolder({ name: 'saved places' }).id;
    }
    const manual = parseManualCoords(data.manualCoords);

    const resolveInBackground = (targetPlaceId, needsLookup) => {
      if (!needsLookup) return;
      setResolving(true);
      resolveCoords({ url: data.url, address: data.address })
        .then((coords) => {
          if (coords?.lat) {
            updatePlace(realFolderId, targetPlaceId, { lat: coords.lat, lng: coords.lng });
            refresh();
            setFlyTarget({ lat: coords.lat, lng: coords.lng, ts: Date.now() });
          }
        })
        .catch((err) => console.error('place geocoding failed', err))
        .finally(() => setResolving(false));
    };

    if (placeId) {
      const existing = editingPlace?.place || {};
      const linkChanged = (data.url || '') !== (existing.url || '') || (data.address || '') !== (existing.address || '');
      updatePlace(realFolderId, placeId, {
        name: data.name, subheading: data.subheading, address: data.address, url: data.url,
        notes: data.notes, photo: data.photo, color: data.color,
        ...(manual ? { lat: manual.lat, lng: manual.lng } : {}),
      });
      if (manual) setFlyTarget({ lat: manual.lat, lng: manual.lng, ts: Date.now() });
      else if (linkChanged) resolveInBackground(placeId, true);
      setEditingPlace(null);
      refresh();
      return;
    }

    const created = addPlace(realFolderId, {
      name: data.name.trim() || 'unnamed place',
      subheading: data.subheading?.trim() || '',
      address: data.address?.trim() || '',
      url: data.url?.trim() || '',
      notes: data.notes?.trim() || '',
      photo: data.photo || null,
      color: data.color || '',
      lat: manual?.lat || null,
      lng: manual?.lng || null,
    });
    setEditingPlace(null);
    refresh();
    if (manual) setFlyTarget({ lat: manual.lat, lng: manual.lng, ts: Date.now() });
    else if (created && (data.url?.trim() || data.address?.trim())) resolveInBackground(created.id, true);
  };

  return (
    <div className="safe-top px-4 pb-4 min-h-screen">
      <header className="mb-4">
        <h1 className="text-3xl font-extrabold lowercase tracking-tight">map</h1>
        <p className="text-sm text-muted-foreground lowercase mt-0.5">places you want to go</p>
      </header>

      {/* folder filter chips (multi-select) */}
      {folders.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-3">
          <button
            onClick={showAll}
            className={`touch-44 shrink-0 px-3 h-8 rounded-full text-xs font-medium lowercase ${activeFolders === null ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}
          >
            all
          </button>
          {folders.map((f) => {
            const on = activeFolders !== null && activeFolders.includes(f.id);
            return (
              <button
                key={f.id}
                onClick={() => toggleFolderFilter(f.id)}
                className={`touch-44 shrink-0 flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium lowercase ${on ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: f.color || '#888' }} />
                {f.name}
              </button>
            );
          })}
        </div>
      )}

      {/* map — collapses when a place is being edited. always rendered
          (not gated on having any resolved places) so the base map itself
          is always visible. */}
      <div ref={mapWrapRef} className={`relative rounded-2xl overflow-hidden mb-4 transition-all duration-300 ${editingPlace ? 'h-36' : 'h-64'}`}>
        {mapSize.w > 0 && (
          <PigeonMap
            center={center}
            zoom={zoom}
            width={mapSize.w}
            height={mapSize.h}
            animate
            animateMaxScreens={10}
            onBoundsChanged={({ center: c, zoom: z }) => { setCenter(c); setZoom(z); }}
            onClick={() => setSelectedPin(null)}
          >
            <MarkerLayer
              places={mappedPlaces}
              zoom={zoom}
              selected={selectedPin}
              onPinClick={(p) => setSelectedPin((cur) => (cur === p.id ? null : p.id))}
              onClusterClick={(lat, lng) => { setCenter([lat, lng]); setZoom((z) => Math.min(18, z + 2)); }}
            />
          </PigeonMap>
        )}
        <span className="absolute bottom-1 right-1.5 text-[9px] text-black/40 bg-white/60 px-1 rounded pointer-events-none">© OpenStreetMap</span>
        {resolving && (
          <span className="absolute top-2 left-2 text-[10px] bg-black/70 text-white px-2 py-1 rounded-full lowercase pointer-events-none">
            locating…
          </span>
        )}
      </div>
      {mappedPlaces.length === 0 && (
        <p className="text-xs text-muted-foreground/50 lowercase -mt-2 mb-4">add a place below with a google maps link — it'll appear on the map above once resolved</p>
      )}

      {/* folders */}
      <div className="space-y-2">
        {folders.map((folder) => {
          const hidden = activeFolders !== null && !activeFolders.includes(folder.id);
          return (
            <div key={folder.id} className={`rounded-2xl border border-border ${hidden ? 'opacity-40' : ''}`} style={{ borderLeft: `6px solid ${folder.color || '#888'}` }}>
              <div className="flex items-center gap-3 p-3">
                <button
                  onClick={() => setExpanded({ ...expanded, [folder.id]: !expanded[folder.id] })}
                  className="touch-44 p-1 rounded-full shrink-0"
                >
                  {expanded[folder.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: folder.color || '#888' }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold lowercase truncate">{folder.name}</span>
                  {folder.subtitle && <span className="block text-[11px] text-muted-foreground lowercase truncate -mt-0.5">{folder.subtitle}</span>}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">{folder.places?.length || 0}</span>
                <button
                  onClick={() => setEditingPlace({ folderId: folder.id, place: {} })}
                  className="touch-44 w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <div className="relative shrink-0">
                  <button
                    onClick={() => setFolderMenu(folderMenu === folder.id ? null : folder.id)}
                    className="touch-44 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground"
                    aria-label="more"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {folderMenu === folder.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setFolderMenu(null)} />
                      <div className="absolute right-0 top-full mt-1 z-20 flex gap-1 p-1 rounded-2xl border border-border bg-popover shadow-lg animate-fade-in">
                        <button
                          onClick={() => { setEditingFolder(folder); setFolderMenu(null); }}
                          className="touch-44 w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted text-muted-foreground"
                          aria-label="edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { deleteMapFolder(folder.id); setFolderMenu(null); refresh(); }}
                          className="touch-44 w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted text-destructive"
                          aria-label="delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {expanded[folder.id] && (
                <div className="px-3 pb-3 space-y-1.5 animate-fade-in">
                  {(folder.places || []).map((p) => (
                    <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/50">
                      <button
                        onClick={() => { if (p.lat) setFlyTarget({ lat: p.lat, lng: p.lng, ts: Date.now() }); }}
                        className="touch-44 w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                        style={{ backgroundColor: (p.color || folder.color || '#888') + '22' }}
                      >
                        {p.photo ? (
                          <img src={p.photo} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <MapPin className="w-4 h-4" style={{ color: p.color || folder.color || '#888' }} />
                        )}
                      </button>
                      <div
                        onClick={() => setEditingPlace({ folderId: folder.id, place: p })}
                        className="flex-1 min-w-0 text-left flex flex-col justify-center"
                      >
                        <p className="text-sm font-medium lowercase truncate">{p.name}</p>
                        {p.subheading && <p className="text-xs text-muted-foreground lowercase truncate">{p.subheading}</p>}
                        {p.notes ? <p className="text-xs text-muted-foreground truncate">{p.notes}</p> : (p.address ? <p className="text-xs text-muted-foreground/70 truncate">{p.address}</p> : null)}
                      </div>
                      <button
                        onClick={() => { setEditingPlace({ folderId: folder.id, place: p }); }}
                        className="touch-44 p-1 text-muted-foreground"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { deletePlace(folder.id, p.id); refresh(); }}
                        className="touch-44 p-1 text-muted-foreground"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {(folder.places || []).length === 0 && (
                    <p className="text-xs text-muted-foreground/50 lowercase text-center py-2">no places yet</p>
                  )}
                </div>
              )}

            </div>
          );
        })}
      </div>

      {/* add folder */}
      {showAddFolder ? (
        <div className="mt-3 rounded-2xl border border-border p-3 space-y-2 animate-slide-up">
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="folder name"
            autoFocus
            className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
          />
          <input
            value={newFolderSubtitle}
            onChange={(e) => setNewFolderSubtitle(e.target.value)}
            placeholder="subheading (optional)"
            className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
          />
          <ColorPicker value={newFolderColor} onChange={setNewFolderColor} label="folder colour" />
          <div className="flex gap-2">
            <button onClick={() => setShowAddFolder(false)} className="touch-44 px-4 rounded-2xl bg-muted text-muted-foreground text-sm font-medium lowercase">cancel</button>
            <button onClick={handleAddFolder} disabled={!newFolderName.trim()} className="touch-44 flex-1 rounded-2xl bg-foreground text-background text-sm font-medium lowercase disabled:opacity-40">add folder</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAddFolder(true)} className="touch-44 mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-border text-sm font-medium lowercase text-muted-foreground">
          <FolderPlus className="w-4 h-4" /> new folder
        </button>
      )}

      {editingPlace && (
        <PlaceEditor
          folderId={editingPlace.folderId}
          place={editingPlace.place}
          folders={folders}
          onClose={() => setEditingPlace(null)}
          onSave={handlePlaceSave}
          onDelete={editingPlace.place?.id ? () => { deletePlace(editingPlace.folderId, editingPlace.place.id); setEditingPlace(null); refresh(); } : undefined}
        />
      )}

      <button
        onClick={() => setEditingPlace({ folderId: folders[0]?.id || null, place: {} })}
        className="fixed z-50 touch-44 flex items-center justify-center gap-1 w-16 h-14 rounded-full bg-foreground text-background shadow-lg shadow-foreground/20 active:scale-90 transition-transform icon-no-select"
        style={{ bottom: '1.5rem', right: '1.5rem', touchAction: 'manipulation' }}
        aria-label="add place"
      >
        <Plus className="w-5 h-5" />
        <MapPin className="w-4 h-4" />
      </button>

      {editingFolder && (
        <MapFolderEditor
          folder={editingFolder}
          onClose={() => setEditingFolder(null)}
          onSave={(data) => { updateMapFolder(editingFolder.id, data); setEditingFolder(null); refresh(); }}
          onDelete={() => { deleteMapFolder(editingFolder.id); setEditingFolder(null); refresh(); }}
        />
      )}
    </div>
  );
}

function MapFolderEditor({ folder, onClose, onSave, onDelete }) {
  const [name, setName] = useState(folder.name || '');
  const [color, setColor] = useState(folder.color || folderColors[0]);
  const [subtitle, setSubtitle] = useState(folder.subtitle || '');
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />
      <div className="relative w-full max-w-lg bg-card rounded-t-3xl sm:rounded-3xl border border-border p-5 pb-8 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={onClose} className="touch-44 flex items-center gap-1 text-xs font-medium lowercase text-muted-foreground"><ChevronLeft className="w-4 h-4" /> back</button>
          <h3 className="text-sm font-semibold lowercase">edit list</h3>
          <button onClick={onDelete} className="touch-44 p-1 rounded-full text-destructive"><Trash2 className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="list name" className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground" />
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="subheading" className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground" />
          <ColorPicker value={color} onChange={setColor} label="list colour" />
        </div>
        <button onClick={() => onSave({ name: name.trim() || 'unnamed list', color, subtitle: subtitle.trim() })} className="touch-44 w-full mt-5 py-3 rounded-2xl bg-foreground text-background text-sm font-medium lowercase">save</button>
      </div>
    </div>
  );
}

function PlaceEditor({ folderId, place, folders, onClose, onSave, onDelete }) {
  const isNew = !place?.id;
  const [selFolder, setSelFolder] = useState(folderId || (folders[0]?.id || ''));
  const [name, setName] = useState(place?.name || '');
  const [subheading, setSubheading] = useState(place?.subheading || '');
  const [address, setAddress] = useState(place?.address || '');
  const [url, setUrl] = useState(place?.url || '');
  const [notes, setNotes] = useState(place?.notes || '');
  const [photo, setPhoto] = useState(place?.photo || null);
  const [color, setColor] = useState(place?.color || '');
  const [manualCoords, setManualCoords] = useState(place?.lat != null ? `${place.lat}, ${place.lng}` : '');

  const save = () => onSave(
    isNew ? selFolder : folderId,
    isNew ? undefined : place.id,
    { name: name.trim() || 'unnamed place', subheading: subheading.trim(), address: address.trim(), url: url.trim(), notes: notes.trim(), photo, color, manualCoords: manualCoords.trim() }
  );

  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />
      <div className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto no-scrollbar bg-card rounded-t-3xl sm:rounded-3xl border border-border p-5 pb-8 animate-slide-up shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={onClose} className="touch-44 flex items-center gap-1 text-xs font-medium lowercase text-muted-foreground">
            <ChevronLeft className="w-4 h-4" /> back
          </button>
          <h3 className="text-sm font-semibold lowercase">{isNew ? 'new place' : 'edit place'}</h3>
          {onDelete ? (
            <button onClick={onDelete} className="touch-44 p-1 rounded-full text-destructive">
              <Trash2 className="w-4 h-4" />
            </button>
          ) : <span className="w-8" />}
        </div>

        <div className="space-y-3">
          {isNew && folders.length > 0 && (
            <select value={selFolder} onChange={(e) => setSelFolder(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground">
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="place name" className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground" />
          <input value={subheading} onChange={(e) => setSubheading(e.target.value)} placeholder="subheading" className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground" />
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="address" className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground" />
          <div className="flex gap-2">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="google maps link" className="flex-1 px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground" />
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="touch-44 px-3 rounded-xl bg-muted flex items-center gap-1 text-xs font-medium lowercase">
                <Link2 className="w-3.5 h-3.5" /> open
              </a>
            )}
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="notes" rows={3} className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground resize-none" />
          <div>
            <input
              value={manualCoords}
              onChange={(e) => setManualCoords(e.target.value)}
              placeholder="lat, lng (optional)"
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
            />
            <p className="text-[11px] text-muted-foreground mt-1 px-1 lowercase leading-snug">
              only needed if the link above doesn't auto-plot: in google maps, tap and hold the spot — the coordinates shown at the bottom can be copied straight in here.
            </p>
            {!isNew && place?.lat == null && !manualCoords && (
              <p className="text-[11px] text-destructive mt-1 px-1 lowercase">not plotted on the map yet</p>
            )}
          </div>
          <ColorPicker value={color} onChange={setColor} label="place colour" />
          <ImageUpload value={photo} onChange={setPhoto} label="photo" aspect={1} maxSize={800} className="h-28" />
        </div>

        <button onClick={save} className="touch-44 w-full mt-5 py-3 rounded-2xl bg-foreground text-background text-sm font-medium lowercase">{isNew ? 'add place' : 'save'}</button>
      </div>
    </div>
  );
}