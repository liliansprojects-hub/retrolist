import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { Map as PigeonMap } from 'pigeon-maps';
import { Plus, Minus, Globe, X, FolderPlus, ChevronDown, ChevronRight, ChevronLeft, Trash2, MapPin, Link2, Pencil, MoreVertical } from 'lucide-react';
import {
  getMapFolders, saveMapFolders, addMapFolder, deleteMapFolder, updateMapFolder, addPlace, deletePlace, updatePlace,
} from '@/lib/store';
import ImageUpload from '@/components/ImageUpload';
import ColorPicker from '@/components/ColorPicker';
import { useSync } from '@/lib/SyncContext';
import { cn } from '@/lib/utils';
import { resolveCoords, parseManualCoords } from '@/lib/mapsResolve';
import { fitPoints, clampZoom, TILE, MIN_ZOOM, MAX_ZOOM } from '@/lib/mapView';
import { buildPins } from '@/components/MapPins';
import { WifiOff } from 'lucide-react';

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

// places the background sweep has already tried to locate this session, so an
// unlocatable one isn't re-queried (and re-waited-on) every time the page opens
const sweepTried = new Set();

const folderColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

// projection / fit-to-pins maths lives in @/lib/mapView, and the pins
// themselves (one waterdrop pin per place, no clustering) in
// @/components/MapPins.

// explicit tile source (the canonical OpenStreetMap host): the standard OSM
// style, which draws parks and green space, water, roads and building
// footprints around every location.
// (dpr 2 asks for the sharp @2x tiles on high-density phone screens)
const osmTiles = (x, y, z, dpr) => `https://tile.openstreetmap.org/${z}/${x}/${y}${dpr && dpr >= 2 ? '@2x' : ''}.png`;

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
          if (sweepTried.has(place.id)) continue; // already tried this session
          sweepTried.add(place.id);
          const coords = await resolveCoords({ url: place.url, address: place.address, name: place.name });
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
  const mappedPlaces = visiblePlaces.filter(hasCoords).map((p) => ({ ...p, lat: Number(p.lat), lng: Number(p.lng) }));

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
      setCenter([20, 0]);
      setZoom(clampZoom(Math.min(Math.log2(mapSize.w / TILE), Math.log2(mapSize.h / TILE))));
      pendingFit.current = false;
      return;
    }
    if (!pts.length) return;
    const fit = fitPoints(pts, mapSize.w, mapSize.h);
    if (fit) { setCenter(fit.center); setZoom(fit.zoom); }
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
      setCenter([flyTarget.lat, flyTarget.lng]);
      setZoom((z) => (flyTarget.keepZoom ? Math.max(Math.round(z), 14) : 17));
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
    if (sel) setCenter([sel.lat, sel.lng]);
    setZoom((z) => clampZoom(Math.round(z) + d));
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
      setResolveResult(null);
      resolveCoords({ url: data.url, address: data.address, name: data.name })
        .then((coords) => {
          if (coords?.lat) {
            updatePlace(realFolderId, targetPlaceId, { lat: coords.lat, lng: coords.lng });
            refresh();
            setFlyTarget({ lat: coords.lat, lng: coords.lng, ts: Date.now() });
            // name/address searches are a best guess, not the exact pin — say so
            setResolveResult(coords.approx ? 'approx' : 'found');
          } else {
            // was previously silent either way — from the person's side that
            // looks identical to "nothing happened," indistinguishable from
            // the feature being broken. this makes a failure to locate
            // explicit, and points at the one method that doesn't depend on
            // any third-party service staying up: pasting coordinates
            // directly (tap-and-hold a spot in Google Maps, copy the
            // "lat, lng" shown at the bottom).
            setResolveResult('failed');
          }
        })
        .catch((err) => { console.error('place geocoding failed', err); setResolveResult('failed'); })
        .finally(() => {
          setResolving(false);
          setTimeout(() => setResolveResult(null), 4500);
        });
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
              : resolveResult === 'approx' ? 'approximate location found from the name — check the pin'
              : "couldn't locate that — try pasting the lat, lng shown when you tap-and-hold a spot in google maps"}
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
          <PigeonMap
            center={center}
            zoom={zoom}
            width={mapSize.w}
            height={mapSize.h}
            provider={osmTiles}
            dprs={[1, 2]}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            animate
            animateMaxScreens={10}
            onBoundsChanged={({ center: c, zoom: z }) => { setCenter(c); setZoom(z); }}
            onClick={() => setSelectedPin(null)}
          >
            {buildPins({
              places: mappedPlaces,
              zoom,
              selected: selectedPin,
              onPinClick: (p) => setFlyTarget({ lat: p.lat, lng: p.lng, placeId: p.id, keepZoom: true, ts: Date.now() }),
            })}
          </PigeonMap>
        )}
        {/* on-screen controls: drag to pan and pinch / scroll still work, but
            these give a reliable way to zoom from any pin, plus a one-tap
            "show everything" */}
        <div className="absolute right-2 top-2 z-[5] flex flex-col gap-1.5">
          {[
            { label: 'zoom in', Icon: Plus, onClick: () => zoomBy(1) },
            { label: 'zoom out', Icon: Minus, onClick: () => zoomBy(-1) },
            { label: 'show all pins', Icon: Globe, onClick: showAll },
          ].map(({ label, Icon, onClick }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              onClick={onClick}
              className="w-9 h-9 rounded-full bg-white/95 text-black shadow-md border border-black/10 flex items-center justify-center active:scale-90 transition-transform"
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        <span className="absolute bottom-1 right-1.5 text-[9px] text-black/40 bg-white/60 px-1 rounded pointer-events-none">© OpenStreetMap</span>
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