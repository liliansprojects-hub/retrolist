import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import MapView from '@/components/MapView';
import { Plus, Minus, Globe, Box, LocateFixed, X, FolderPlus, ChevronDown, ChevronRight, ChevronLeft, Trash2, MapPin, Link2, Pencil, MoreVertical, Crosshair } from 'lucide-react';
import {
  getMapFolders, saveMapFolders, addMapFolder, deleteMapFolder, updateMapFolder, addPlace, deletePlace, updatePlace,
} from '@/lib/store';
import ImageUpload from '@/components/ImageUpload';
import ColorPicker from '@/components/ColorPicker';
import { useSync } from '@/lib/SyncContext';
import { cn } from '@/lib/utils';
import { resolveCoords, parseManualCoords, geocode, getLastHint } from '@/lib/mapsResolve';
import { primeUserBias, getUserBias } from '@/lib/userBias';
import AddressPicker from '@/components/AddressPicker';
import { COUNTRIES, ccFor, codeForCc, emptyFields, addressText } from '@/lib/addressFormats';
import { WifiOff } from 'lucide-react';

// MAP LIBRARY: MapLibre GL (see @/components/MapView) — vector tiles with building shapes, smooth
// zooming, and a raster fallback if the vector style can't load. It replaced pigeon-maps, whose flat
// OpenStreetMap raster tiles had no building detail. Pins, popups, fit-to-pins and fly-to all live
// in MapView and are driven from here through a ref.

// places the background sweep has already tried to locate this session, so an
// unlocatable one isn't re-queried (and re-waited-on) every time the page opens
const sweepTried = new Set();

const folderColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

const hasCoords = (p) =>
  p.lat != null && p.lng != null && p.lat !== '' && p.lng !== '' &&
  Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));

export default function MapPage() {
  const { syncState } = useSync();
  // navigator.onLine directly covers the instant the connection drops —
  // syncState can lag a tick behind since it only updates on the
  // window 'online'/'offline' events, so check both.
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  const mapIsOffline = !isOnline || syncState === 'offline';
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
  const fitMode = useRef('fit'); // 'world' | 'fit' — how the next explicit re-frame behaves
  const [folderMenu, setFolderMenu] = useState(null);
  const mapApi = useRef(null);
  const [tilted, setTilted] = useState(false);
  const [resolveInfo, setResolveInfo] = useState('');
  const [selectedPin, setSelectedPin] = useState(null);
  // "tap the map to place this pin exactly" mode — the guaranteed-precise fallback when a link can't be resolved exactly
  const [pickFor, setPickFor] = useState(null); // { folderId, placeId, name }
  const mapWrapRef = useRef(null);
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });

  const refresh = () => setFolders(getMapFolders());

  // learn roughly where the person is (silent — only if location is already allowed) so that
  // typed addresses are searched near them first instead of anywhere on Earth
  useEffect(() => { primeUserBias(); }, []);

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
          if (sweepTried.has(place.id)) continue; // already tried this session
          sweepTried.add(place.id);
          const coords = await resolveCoords({ url: place.url, address: place.address, name: place.name, country: ccFor(place.addressData?.country) });
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

  // ONE-TIME REPAIR of pins saved by the older, wrong lookups (e.g. UK links plotted in Ohio).
  // Every place with a link is re-read from the link itself. An exact answer replaces the saved
  // pin; a link that can't be read exactly loses a saved pin only if it sits in the US while you
  // are somewhere else (those are the bad guesses). Pins typed in by hand are never touched.
  useEffect(() => {
    const FLAG = 'rl-pin-repair-v13';
    try { if (localStorage.getItem(FLAG)) return undefined; } catch { /* storage blocked */ }
    if (!navigator.onLine) return undefined;
    let cancelled = false;
    (async () => {
      const mf = getMapFolders();
      const bias = getUserBias();
      const inUS = (la, ln) => la > 24 && la < 50 && ln > -125 && ln < -66;
      let changed = false;
      for (const folder of mf) {
        for (const place of folder.places || []) {
          if (cancelled) return;
          if (!place.url || place.coordSource === 'manual') continue;
          const c = await resolveCoords({ url: place.url }).catch(() => null);
          if (c && !c.approx) {
            if (Math.abs(Number(place.lat) - c.lat) > 0.002 || Math.abs(Number(place.lng) - c.lng) > 0.002 || place.lat == null) {
              place.lat = c.lat; place.lng = c.lng; place.coordSource = 'link'; changed = true;
            }
          } else if (place.lat != null && inUS(Number(place.lat), Number(place.lng)) && bias && bias.cc && bias.cc !== 'us') {
            place.lat = null; place.lng = null; changed = true;
          }
        }
      }
      if (cancelled) return;
      if (changed) { saveMapFolders(mf); refresh(); }
      try { localStorage.setItem(FLAG, '1'); } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const allPlaces = folders.flatMap((f) =>
    (f.places || []).map((p) => ({ ...p, folderId: f.id, folderName: f.name, folderColor: f.color || '#888' }))
  );
  const visiblePlaces = activeFolders === null
    ? allPlaces
    : allPlaces.filter((p) => activeFolders.includes(p.folderId));
  const mappedPlaces = visiblePlaces.filter(hasCoords).map((p) => ({ ...p, lat: Number(p.lat), lng: Number(p.lng) }));

  // track the map's actual pixel size so the map can frame the pins
  // to fit the container, not a guess.
  useEffect(() => {
    if (!mapWrapRef.current) return;
    const el = mapWrapRef.current;
    const update = () => setMapSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The map fits every visible pin into one frame ONLY when asked to: on
  // first load, and when the "all" chip, a folder filter, the globe button or
  // the Map nav button is pressed (each bumps filterSignal). It used to also
  // re-fit whenever the map resized or the pin count changed — which kept
  // yanking the view away from a place you had just zoomed into, and made
  // panning/zooming feel locked.
  //   'initial'  waits (without moving anything) until there are pins to show
  //   'explicit' always acts: fit the pins, or show the whole world if none
  const pendingFit = useRef('initial');
  const lastSignal = useRef(0);
  useEffect(() => {
    if (filterSignal !== lastSignal.current) { lastSignal.current = filterSignal; pendingFit.current = 'explicit'; }
    if (!pendingFit.current) return;
    if (!mapSize.w || !mapSize.h) return;
    const pts = mappedPlaces.map((p) => [p.lat, p.lng]);
    // 'all' / globe / map button: pull all the way out so the whole world is in
    // frame — every pin, wherever it is on Earth, is then on screen at once
    if (pendingFit.current === 'explicit' && (fitMode.current === 'world' || !pts.length)) {
      mapApi.current && mapApi.current.fit([], { world: true });
      pendingFit.current = false;
      return;
    }
    if (!pts.length) return;
    mapApi.current && mapApi.current.fit(pts);
    pendingFit.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSignal, mapSize.w, mapSize.h, mappedPlaces.length]);

  // pressing the Map button in the bottom nav while already on this page
  // resets to the all-pins world view (a nav click to the same URL still
  // produces a new location key)
  const location = useLocation();
  const firstLocationKey = useRef(location.key);
  useEffect(() => {
    if (location.key === firstLocationKey.current) return;
    firstLocationKey.current = location.key;
    setActiveFolders(null);
    setSelectedPin(null);
    fitMode.current = 'world';
    setFilterSignal((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // zoom straight onto a specific place whenever it's targeted (a place just
  // located, or one tapped in the list / on the map): centred on the exact
  // point at street level (zoom 17), with its popup open. (The map still
  // fits every pin into one frame by default and when filters change — that
  // lives in the fit effect above; this is only for "take me to THIS place".)
  useEffect(() => {
    if (flyTarget && flyTarget.lat != null) {
      pendingFit.current = false;
      mapApi.current && mapApi.current.flyTo({ lat: flyTarget.lat, lng: flyTarget.lng, keepZoom: !!flyTarget.keepZoom, zoom: 17 });
      // select whichever place this fly-to is for (or none, for a plain
      // re-center) — clearing it here used to close a popup the same tap had
      // just opened.
      setSelectedPin(flyTarget.placeId ?? null);
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
    fitMode.current = 'fit';
    setFilterSignal((s) => s + 1);
  };

  const showAll = () => { setActiveFolders(null); setSelectedPin(null); fitMode.current = 'world'; setFilterSignal((n) => n + 1); };

  // zoom in / out one step; if a pin is selected, keep it centred while zooming
  const zoomBy = (d) => {
    const sel = selectedPin ? mappedPlaces.find((p) => p.id === selectedPin) : null;
    mapApi.current && mapApi.current.zoomBy(d, sel ? [sel.lat, sel.lng] : null);
  };

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
  const [resolveResult, setResolveResult] = useState(null); // null | 'found' | 'failed'
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
    // nothing worth saving yet — leave the editor open rather than closing it on an empty save
    if (!placeId && !data.name?.trim() && !data.url?.trim()) return;
    // defensive: guarantee there's always a real folder to save into
    let realFolderId = folderId;
    if (!realFolderId) {
      const existing = getMapFolders();
      realFolderId = existing[0]?.id || addMapFolder({ name: 'saved places' }).id;
    }
    // The coordinates box is pre-filled with a place's SAVED pin when editing. It only counts as
    // "typed by hand" if the person actually changed it — otherwise an old wrong pin (Ohio) was
    // read back as manual input every time the place was saved, and a changed link never got read.
    const touched = !!data.manualTouched;
    const manual = touched ? parseManualCoords(data.manualCoords) : null;
    const addrC = data.addressCoords && Number.isFinite(Number(data.addressCoords.lat)) && Number.isFinite(Number(data.addressCoords.lng))
      ? { lat: Number(data.addressCoords.lat), lng: Number(data.addressCoords.lng) } : null;
    const hasLink = !!(data.url || '').trim();
    const country = ccFor(data.addressData?.country);

    const resolveInBackground = (targetPlaceId) => {
      setResolving(true);
      setResolveResult(null);
      resolveCoords({ url: data.url, address: data.address, name: data.name, country })
        .then((coords) => {
          if (coords?.lat) {
            updatePlace(realFolderId, targetPlaceId, { lat: coords.lat, lng: coords.lng, coordSource: coords.source === 'link' || coords.source === 'server' || coords.source === 'proxy' ? 'link' : 'search' });
            refresh();
            setFlyTarget({ lat: coords.lat, lng: coords.lng, ts: Date.now() });
            setResolveInfo(`${Number(coords.lat).toFixed(5)}, ${Number(coords.lng).toFixed(5)}`);
            setResolveResult(coords.approx ? 'approx' : 'found');
            if (coords.approx) setPickFor({ folderId: realFolderId, placeId: targetPlaceId, name: data.name });
          } else if (addrC) {
            // the link couldn't be read, but the address was picked from the search: use that
            updatePlace(realFolderId, targetPlaceId, { lat: addrC.lat, lng: addrC.lng, coordSource: 'address' });
            refresh();
            setFlyTarget({ lat: addrC.lat, lng: addrC.lng, ts: Date.now() });
            setResolveResult('found');
          } else {
            setResolveInfo('');
            setResolveResult('failed');
            setPickFor({ folderId: realFolderId, placeId: targetPlaceId, name: data.name, hint: getLastHint() || data.address || '' });
          }
        })
        .catch((err) => { console.error('place geocoding failed', err); setResolveResult('failed'); })
        .finally(() => {
          setResolving(false);
          setTimeout(() => setResolveResult(null), 4500);
        });
    };

    const common = { subheading: data.subheading, address: data.address, addressData: data.addressData, url: data.url, notes: data.notes, photo: data.photo, color: data.color };

    if (placeId) {
      const existing = editingPlace?.place || {};
      const linkChanged = (data.url || '') !== (existing.url || '');
      const addrChanged = (data.address || '') !== (existing.address || '');
      // emptying the coordinates box removes a pin (e.g. one placed by an old bad lookup)
      const cleared = touched && !manual && !(data.manualCoords || '').trim() && existing.lat != null;
      const relocate = !manual && (linkChanged || cleared || (!hasLink && addrChanged));
      let coordUpdate = {};
      if (manual) coordUpdate = { lat: manual.lat, lng: manual.lng, coordSource: 'manual' };
      else if (relocate) coordUpdate = (!hasLink && addrC) ? { lat: addrC.lat, lng: addrC.lng, coordSource: 'address' } : { lat: null, lng: null }; // a changed link never keeps the old pin
      updatePlace(realFolderId, placeId, { name: data.name, ...common, ...coordUpdate });
      if (manual) setFlyTarget({ lat: manual.lat, lng: manual.lng, ts: Date.now() });
      else if (relocate && !hasLink && addrC) setFlyTarget({ lat: addrC.lat, lng: addrC.lng, ts: Date.now() });
      else if (relocate && (hasLink || data.address)) resolveInBackground(placeId);
      setEditingPlace(null);
      refresh();
      return;
    }

    const start = manual || (!hasLink && addrC ? addrC : null);
    const created = addPlace(realFolderId, {
      name: data.name.trim() || 'unnamed place',
      subheading: data.subheading?.trim() || '',
      address: data.address?.trim() || '',
      addressData: data.addressData || null,
      url: data.url?.trim() || '',
      notes: data.notes?.trim() || '',
      photo: data.photo || null,
      color: data.color || '',
      lat: start ? start.lat : null,
      lng: start ? start.lng : null,
      ...(start ? { coordSource: manual ? 'manual' : 'address' } : {}),
    });
    setEditingPlace(null);
    refresh();
    if (start) setFlyTarget({ lat: start.lat, lng: start.lng, ts: Date.now() });
    else if (created && (hasLink || data.address?.trim())) resolveInBackground(created.id);
  };

  return (
    <div className="safe-top px-4 pb-4 min-h-screen">
      {resolving && (
        <div className="fixed top-0 left-0 right-0 z-[60] flex justify-center pointer-events-none">
          <span className="mt-[calc(env(safe-area-inset-top,0px)+8px)] text-[11px] bg-black/80 text-white px-3 py-1.5 rounded-full lowercase shadow-lg">
            locating…
          </span>
        </div>
      )}
      {!resolving && resolveResult && (
        <div className="fixed top-0 left-0 right-0 z-[60] flex justify-center pointer-events-none">
          <span className={cn(
            'mt-[calc(env(safe-area-inset-top,0px)+8px)] text-[11px] px-3 py-1.5 rounded-full lowercase shadow-lg text-center max-w-[90%]',
            resolveResult === 'failed' ? 'bg-destructive text-destructive-foreground' : 'bg-black/80 text-white'
          )}>
            {resolveResult === 'found' ? 'location found'
              : resolveResult === 'approx' ? 'approximate spot found — tap the map to place it exactly'
              : (resolveInfo || "couldn't locate that link — tap the map to place the pin yourself")}
          </span>
        </div>
      )}
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
      <div ref={mapWrapRef} data-allow-pinch="true" style={{ touchAction: 'none' }} className={`relative rounded-2xl overflow-hidden mb-4 transition-all duration-300 ${editingPlace ? 'h-36' : 'h-64'}`}>
        {mapSize.w > 0 && (
          <MapView
            ref={mapApi}
            className="absolute inset-0"
            places={mappedPlaces}
            selectedId={selectedPin}
            pickMode={!!pickFor}
            onSelect={(p) => setFlyTarget({ lat: p.lat, lng: p.lng, placeId: p.id, keepZoom: true, ts: Date.now() })}
            onMapClick={({ latLng }) => {
              if (pickFor && latLng) {
                updatePlace(pickFor.folderId, pickFor.placeId, { lat: latLng[0], lng: latLng[1] });
                setSelectedPin(pickFor.placeId);
                setPickFor(null);
                refresh();
                return;
              }
              setSelectedPin(null);
            }}
          />
        )}
        {/* on-screen controls: drag to pan and pinch / scroll still work, but
            these give a reliable way to zoom from any pin, plus a one-tap
            "show everything" */}
        <div className="absolute right-2 top-2 z-[5] flex flex-col gap-1.5">
          {[
            { label: 'zoom in', Icon: Plus, onClick: () => zoomBy(1) },
            { label: 'zoom out', Icon: Minus, onClick: () => zoomBy(-1) },
            { label: 'show all pins', Icon: Globe, onClick: showAll },
            { label: tilted ? 'flat map' : '3d buildings', Icon: Box, onClick: () => setTilted(!!(mapApi.current && mapApi.current.toggleTilt())), active: tilted },
            { label: 'my location', Icon: LocateFixed, onClick: () => mapApi.current && mapApi.current.locate((msg) => { setResolveResult('failed'); setResolveInfo(msg); setTimeout(() => setResolveResult(null), 3000); }) },
          ].map(({ label, Icon, onClick, active }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              onClick={onClick}
              className={cn('w-9 h-9 rounded-full shadow-md border border-black/10 flex items-center justify-center active:scale-90 transition-transform', active ? 'bg-black text-white' : 'bg-white/95 text-black')}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        {pickFor && (
          <div className="absolute left-2 right-12 top-2 z-[6] flex items-center gap-2 px-3 py-2 rounded-2xl bg-black/85 text-white text-[11px] lowercase shadow-lg">
            <Crosshair className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 leading-snug">tap the map exactly where "{pickFor.name || 'this place'}" is — zoom in first for precision</span>
            {pickFor.hint && (
              <button type="button" className="touch-44 px-2 underline" onClick={async () => {
                const g = await geocode(pickFor.hint);
                if (g && mapApi.current) mapApi.current.flyTo({ lat: g.lat, lng: g.lng, zoom: 12 });
              }}>find</button>
            )}
            <button type="button" onClick={() => setPickFor(null)} className="touch-44 px-2 text-white/70">cancel</button>
          </div>
        )}
        {mapIsOffline && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/80 backdrop-blur-sm">
            <WifiOff className="w-6 h-6 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground lowercase text-center px-6">currently offline — connect to use map</p>
          </div>
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
                        onClick={() => { if (p.lat) setFlyTarget({ lat: p.lat, lng: p.lng, placeId: p.id, ts: Date.now() }); }}
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
                        onClick={() => { setPickFor({ folderId: folder.id, placeId: p.id, name: p.name }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className="touch-44 p-1 text-muted-foreground"
                        aria-label="set exact spot on map"
                      >
                        <Crosshair className="w-3.5 h-3.5" />
                      </button>
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
        style={{ bottom: '6.5rem', right: '1.5rem', touchAction: 'manipulation' }}
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
  const [addr, setAddr] = useState(() => {
    const d = place?.addressData;
    if (d && d.country) return { country: COUNTRIES[d.country] ? d.country : 'OTHER', fields: { ...emptyFields(), ...(d.fields || {}) }, coords: d.coords || null };
    // older places only have one address string: keep it, on the first line
    const bias = getUserBias();
    return { country: bias?.cc ? codeForCc(bias.cc) : 'GB', fields: { ...emptyFields(), line1: place?.address || '' }, coords: null };
  });
  const [manualTouched, setManualTouched] = useState(false);
  const [url, setUrl] = useState(place?.url || '');
  const [notes, setNotes] = useState(place?.notes || '');
  const [photo, setPhoto] = useState(place?.photo || null);
  const [color, setColor] = useState(place?.color || '');
  const [manualCoords, setManualCoords] = useState(place?.lat != null ? `${place.lat}, ${place.lng}` : '');

  const save = () => onSave(
    isNew ? selFolder : folderId,
    isNew ? undefined : place.id,
    { name: name.trim() || 'unnamed place', subheading: subheading.trim(), address: addressText(addr.country, addr.fields), addressData: { country: addr.country, fields: addr.fields, coords: addr.coords }, addressCoords: addr.coords, url: url.trim(), notes: notes.trim(), photo, color, manualCoords: manualCoords.trim(), manualTouched }
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
          <AddressPicker value={addr} onChange={setAddr} onPickName={(n) => setName((cur) => cur.trim() ? cur : n)} />
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
              onChange={(e) => { setManualCoords(e.target.value); setManualTouched(true); }}
              placeholder="lat, lng (optional)"
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
            />
            <p className="text-[11px] text-muted-foreground mt-1 px-1 lowercase leading-snug">
              only needed if the link above doesn't auto-plot: in google maps, tap and hold the spot — the coordinates shown at the bottom can be copied straight in here. empty this box and save to remove a wrong pin.
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