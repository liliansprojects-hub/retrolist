import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Plus, X, FolderPlus, ChevronDown, ChevronRight, ChevronLeft, Trash2, MapPin, Link2, Pencil, MoreVertical } from 'lucide-react';
import {
  getMapFolders, saveMapFolders, addMapFolder, deleteMapFolder, updateMapFolder, addPlace, deletePlace, updatePlace,
} from '@/lib/store';
import ImageUpload from '@/components/ImageUpload';
import ColorPicker from '@/components/ColorPicker';

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
    const name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
    if (name) return { placeName: name };
  }
  const qText = url.match(/[?&](?:q|query)=([^&#]+)/);
  if (qText) {
    const name = decodeURIComponent(qText[1]).replace(/^[-\d.]+,[-\d.]+$/, '').trim();
    if (name) return { placeName: name };
  }
  return null;
}

async function geocode(address) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
    );
    const data = await res.json();
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    /* offline — store without coords */
  }
  return null;
}

async function resolveShortLink(url) {
  try {
    const proxied = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxied, { redirect: 'follow' });
    const finalUrl = res.url || url;
    const coords = parseMapsUrl(finalUrl);
    if (coords && coords.lat) return coords;
    const text = await res.text();
    const og = text.match(/property="og:image"[^>]*url=([^"&]+)/) || text.match(/"https:[^"]+maps[^"]+@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (og && og.length >= 3) return { lat: parseFloat(og[1]), lng: parseFloat(og[2]) };
    return parseMapsUrl(finalUrl);
  } catch {
    return null;
  }
}

async function resolveCoords({ url, address }) {
  let coords = null;
  if (url) {
    const parsed = parseMapsUrl(url);
    if (parsed?.lat) coords = parsed;
    else if (parsed?.placeName) coords = await geocode(parsed.placeName);
    if (!coords && /goo\.gl|maps\.app/i.test(url)) coords = await resolveShortLink(url);
  }
  if (!coords && address) coords = await geocode(address);
  return coords;
}

function coloredIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color || '#0a0a0a'};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
  });
}

const folderColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

// flies the map to a target place whenever it changes
function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target && target.lat) {
      map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 14), { duration: 0.8 });
    }
  }, [target]);
  return null;
}

function FitBounds({ places, signal }) {
  const map = useMap();
  useEffect(() => {
    if (!places.length) return;
    const bounds = L.latLngBounds(places.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [signal]);
  return null;
}

function clusterIcon(count) {
  return L.divIcon({
    className: '',
    html: `<div style="width:30px;height:30px;border-radius:50%;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)">${count}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

// smart pin-density clustering: at low zoom nearby pins collapse into a count
// badge (tap to zoom in); at high zoom every pin shows individually, coloured
// to match its folder. tap any pin to open its contents.
function MarkerLayer({ places }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
    moveend: () => setZoom(map.getZoom()),
  });
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
        <Marker key={p.id} position={[p.lat, p.lng]} icon={coloredIcon(p.folderColor)}>
          <Popup>
            <div className="text-sm max-w-[200px]">
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
          </Popup>
        </Marker>
      );
    }
    const lat = bucket.reduce((s, p) => s + p.lat, 0) / bucket.length;
    const lng = bucket.reduce((s, p) => s + p.lng, 0) / bucket.length;
    return (
      <Marker
        key={'c:' + lat + '|' + lng}
        position={[lat, lng]}
        icon={clusterIcon(bucket.length)}
        eventHandlers={{ click: () => map.flyTo([lat, lng], Math.min(18, zoom + 2)) }}
      />
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

  const handlePlaceSave = async (folderId, placeId, data) => {
    if (!folderId) return;
    if (placeId) {
      updatePlace(folderId, placeId, data);
      setEditingPlace(null);
      refresh();
      return;
    }
    if (!data.name?.trim() && !data.url?.trim()) return;
    setResolving(true);
    const coords = await resolveCoords({ url: data.url, address: data.address });
    setResolving(false);
    const created = addPlace(folderId, {
      name: data.name.trim() || 'unnamed place',
      subheading: data.subheading?.trim() || '',
      address: data.address?.trim() || '',
      url: data.url?.trim() || '',
      notes: data.notes?.trim() || '',
      photo: data.photo || null,
      color: data.color || '',
      lat: coords?.lat || null,
      lng: coords?.lng || null,
    });
    setEditingPlace(null);
    refresh();
    if (created && coords?.lat) setFlyTarget({ lat: coords.lat, lng: coords.lng, ts: Date.now() });
  };

  const center = mappedPlaces[0] ? [mappedPlaces[0].lat, mappedPlaces[0].lng] : [51.505, -0.09];

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

      {/* map — collapses when a place is being edited */}
      <div className={`rounded-2xl overflow-hidden mb-4 transition-all duration-300 ${editingPlace ? 'h-36' : 'h-64'}`}>
        {mappedPlaces.length > 0 ? (
          <MapContainer center={center} zoom={2} className="w-full h-full" style={{ borderRadius: '1rem' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; openstreetmap" />
            <FlyTo target={flyTarget} />
            <FitBounds places={mappedPlaces} signal={filterSignal} />
            <MarkerLayer places={mappedPlaces} />
          </MapContainer>
        ) : (
          <div className="w-full h-full bg-muted flex flex-col items-center justify-center text-center p-6">
            <MapPin className="w-10 h-10 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground lowercase">no places on map yet</p>
            <p className="text-xs text-muted-foreground/50 lowercase mt-1">add a place below with a google maps link</p>
          </div>
        )}
      </div>

      {/* folders */}
      <div className="space-y-2">
        {folders.map((folder) => {
          const hidden = activeFolders !== null && !activeFolders.includes(folder.id);
          return (
            <div key={folder.id} className={`rounded-2xl border border-border ${hidden ? 'opacity-40' : ''}`} style={{ borderLeft: `6px solid ${folder.color || '#888'}` }}>
              {/* note: no overflow-hidden here (unlike a typical card) — the
                  "..." dropdown below needs to render outside this folder's
                  bounds when it's collapsed, and nothing else in this
                  container needs edge clipping. */}
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

  const save = () => onSave(
    isNew ? selFolder : folderId,
    isNew ? undefined : place.id,
    { name: name.trim() || 'unnamed place', subheading: subheading.trim(), address: address.trim(), url: url.trim(), notes: notes.trim(), photo, color }
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
          <ColorPicker value={color} onChange={setColor} label="place colour" />
          <ImageUpload value={photo} onChange={setPhoto} label="photo" aspect={1} maxSize={800} className="h-28" />
        </div>

        <button onClick={save} className="touch-44 w-full mt-5 py-3 rounded-2xl bg-foreground text-background text-sm font-medium lowercase">{isNew ? 'add place' : 'save'}</button>
      </div>
    </div>
  );
}