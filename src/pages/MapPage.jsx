import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Plus, X, FolderPlus, ChevronDown, ChevronRight, Trash2, MapPin, Link2 } from 'lucide-react';
import {
  getMapFolders, saveMapFolders, addMapFolder, deleteMapFolder, addPlace, deletePlace,
} from '@/lib/store';

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
  // google maps place/search name in the path
  const placeMatch = url.match(/maps\/(?:place|search)\/([^/@?#]+)/);
  if (placeMatch) {
    const name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
    if (name) return { placeName: name };
  }
  // generic ?q= or ?query= with a text value
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

// try to resolve a maps url (incl. short links) to coordinates by following redirects via a CORS proxy
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

const markerIcon = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#0a0a0a;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 18],
});

const folderColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

export default function MapPage() {
  const [searchParams] = useSearchParams();
  const [folders, setFolders] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [showAddFolder, setShowAddFolder] = useState(searchParams.get('create') === 'true');
  const [addingTo, setAddingTo] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [placeForm, setPlaceForm] = useState({ name: '', address: '', url: '', notes: '' });

  const refresh = () => setFolders(getMapFolders());

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('retrolist:synced', handler);
    return () => window.removeEventListener('retrolist:synced', handler);
  }, []);

  // resolve existing places that have a map url but no coordinates yet
  useEffect(() => {
    if (!navigator.onLine) return;
    let cancelled = false;
    (async () => {
      const folders = getMapFolders();
      let changed = false;
      for (const folder of folders) {
        for (const place of folder.places || []) {
          if (place.lat || !place.url) continue;
          const parsed = parseMapsUrl(place.url);
          let coords = parsed?.lat ? parsed : null;
          if (!coords && parsed?.placeName) coords = await geocode(parsed.placeName);
          if (!coords && /goo\.gl|maps\.app/i.test(place.url)) coords = await resolveShortLink(place.url);
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
    (f.places || []).map((p) => ({ ...p, folderName: f.name, folderColor: f.color }))
  );

  const handleAddFolder = () => {
    if (!newFolderName.trim()) return;
    const f = addMapFolder({ name: newFolderName.trim(), color: folderColors[folders.length % folderColors.length] });
    setNewFolderName('');
    setShowAddFolder(false);
    setExpanded({ ...expanded, [f.id]: true });
    refresh();
  };

  const [resolving, setResolving] = useState(false);

  const handleAddPlace = async (folderId) => {
    const { name, address, url, notes } = placeForm;
    if (!name.trim() && !url.trim()) return;

    setResolving(true);
    let coords = null;
    if (url) {
      const parsed = parseMapsUrl(url);
      if (parsed?.lat) coords = parsed;
      else if (parsed?.placeName) coords = await geocode(parsed.placeName);
      // short links (maps.app.goo.gl / goo.gl) — follow redirect to resolve coords
      if (!coords && /goo\.gl|maps\.app/i.test(url)) coords = await resolveShortLink(url);
    }
    if (!coords && address) coords = await geocode(address);
    if (!coords && name.trim()) coords = await geocode(name.trim());
    setResolving(false);

    addPlace(folderId, {
      name: name.trim() || 'unnamed place',
      address: address.trim(),
      url: url.trim(),
      notes: notes.trim(),
      lat: coords?.lat || null,
      lng: coords?.lng || null,
    });

    setPlaceForm({ name: '', address: '', url: '', notes: '' });
    setAddingTo(null);
    refresh();
  };

  return (
    <div className="safe-top px-4 pb-4 min-h-screen">
      <header className="mb-4">
        <h1 className="text-3xl font-extrabold lowercase tracking-tight">map</h1>
        <p className="text-sm text-muted-foreground lowercase mt-0.5">places you want to go</p>
      </header>

      {/* map */}
      <div className="rounded-2xl overflow-hidden mb-4 h-64">
        {allPlaces.filter((p) => p.lat && p.lng).length > 0 ? (
          <MapContainer
            center={allPlaces.find((p) => p.lat && p.lng)
              ? [allPlaces.find((p) => p.lat && p.lng).lat, allPlaces.find((p) => p.lat && p.lng).lng]
              : [51.505, -0.09]}
            zoom={2}
            className="w-full h-full"
            style={{ borderRadius: '1rem' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; openstreetmap'
            />
            {allPlaces.filter((p) => p.lat && p.lng).map((p) => (
              <Marker key={p.id} position={[p.lat, p.lng]} icon={markerIcon}>
                <Popup>
                  <div className="text-sm">
                    <p className="font-bold">{p.name}</p>
                    {p.address && <p className="text-xs text-gray-500">{p.address}</p>}
                    {p.notes && <p className="text-xs mt-1">{p.notes}</p>}
                  </div>
                </Popup>
              </Marker>
            ))}
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
        {folders.map((folder) => (
          <div key={folder.id} className="rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center gap-2 p-3">
              <button
                onClick={() => setExpanded({ ...expanded, [folder.id]: !expanded[folder.id] })}
                className="touch-44 p-1 rounded-full"
              >
                {expanded[folder.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: folder.color || '#888' }} />
              <span className="flex-1 text-sm font-semibold lowercase">{folder.name}</span>
              <span className="text-xs text-muted-foreground">{folder.places?.length || 0}</span>
              <button
                onClick={() => setAddingTo(addingTo === folder.id ? null : folder.id)}
                className="touch-44 w-8 h-8 rounded-full bg-muted flex items-center justify-center"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => { deleteMapFolder(folder.id); refresh(); }}
                className="touch-44 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {expanded[folder.id] && (
              <div className="px-3 pb-3 space-y-1.5 animate-fade-in">
                {(folder.places || []).map((p) => (
                  <div key={p.id} className="flex items-start gap-2 p-2.5 rounded-xl bg-muted/50">
                    <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium lowercase truncate">{p.name}</p>
                      {p.address && <p className="text-xs text-muted-foreground truncate">{p.address}</p>}
                      {p.lat && <p className="text-[10px] text-muted-foreground/60">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</p>}
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 underline flex items-center gap-1 mt-0.5">
                          <Link2 className="w-3 h-3" /> open in maps
                        </a>
                      )}
                    </div>
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

            {addingTo === folder.id && (
              <div className="px-3 pb-3 space-y-2 animate-slide-up">
                <input
                  value={placeForm.name}
                  onChange={(e) => setPlaceForm({ ...placeForm, name: e.target.value })}
                  placeholder="place name"
                  className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
                />
                <input
                  value={placeForm.url}
                  onChange={(e) => setPlaceForm({ ...placeForm, url: e.target.value })}
                  placeholder="paste google maps link"
                  className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
                />
                <input
                  value={placeForm.address}
                  onChange={(e) => setPlaceForm({ ...placeForm, address: e.target.value })}
                  placeholder="or type address"
                  className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
                />
                <textarea
                  value={placeForm.notes}
                  onChange={(e) => setPlaceForm({ ...placeForm, notes: e.target.value })}
                  placeholder="notes (optional)"
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground resize-none"
                />
                <button
                  onClick={() => handleAddPlace(folder.id)}
                  disabled={resolving}
                  className="touch-44 w-full py-2.5 rounded-xl bg-foreground text-background text-sm font-medium lowercase disabled:opacity-50"
                >
                  {resolving ? 'locating…' : 'add place'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* add folder */}
      {showAddFolder ? (
        <div className="mt-3 flex gap-2">
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddFolder()}
            placeholder="folder name"
            autoFocus
            className="flex-1 px-4 py-3 rounded-2xl bg-muted text-sm outline-none focus:bg-background focus:ring-1 focus:ring-foreground"
          />
          <button
            onClick={handleAddFolder}
            disabled={!newFolderName.trim()}
            className="touch-44 px-4 rounded-2xl bg-foreground text-background text-sm font-medium lowercase disabled:opacity-40"
          >
            add
          </button>
          <button
            onClick={() => setShowAddFolder(false)}
            className="touch-44 w-12 h-12 rounded-2xl bg-muted flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAddFolder(true)}
          className="touch-44 mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-border text-sm font-medium lowercase text-muted-foreground"
        >
          <FolderPlus className="w-4 h-4" /> new folder
        </button>
      )}
    </div>
  );
}