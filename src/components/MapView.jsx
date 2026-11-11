import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { rememberUserPosition } from '@/lib/userBias';

// The in-app map. Replaces pigeon-maps (flat OpenStreetMap raster tiles, no building shapes,
// choppy zooming) with MapLibre GL: a vector map that zooms smoothly, draws building footprints
// and — when tilted — 3D buildings, in a clean Google-Maps-like palette.
//
//   style     OpenFreeMap "liberty" (free, no API key, vector tiles with buildings)
//   fallback  if that style can't load, CARTO "voyager" raster tiles (also shows buildings)
//
// Pins are plain DOM markers (a short teardrop, one colour per place) so they stay crisp and
// tappable. Everything the page needs is exposed through a ref: flyTo, fit, zoomBy, toggleTilt,
// locate. Commands issued before the map has loaded are queued and run when it is ready.

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const RASTER_FALLBACK = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors © CARTO',
    },
  },
  layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
};

// Shorter teardrop: a round head with only a short point below it. The tip is the bottom-centre of
// the box, so anchoring the box's bottom-centre on a coordinate puts the point exactly on it.
const PIN_W = 26;
const PIN_H = 32;
const pinSvg = (color) =>
  `<svg width="${PIN_W}" height="${PIN_H}" viewBox="0 0 26 32" aria-hidden="true" style="display:block;overflow:visible">` +
  `<path d="M13 30.5C13 30.5 2 20.6 2 12.2A11 11 0 0 1 24 12.2C24 20.6 13 30.5 13 30.5Z" fill="${color}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>` +
  '<circle cx="13" cy="12.2" r="4.2" fill="#fff"/></svg>';

// Essential MapLibre rules, injected as well as imported: if a build ever drops the package
// stylesheet the map must still lay out (markers, canvas, popup) instead of showing a blank box.
const CRITICAL_CSS = `
.maplibregl-map{position:relative;overflow:hidden;-webkit-tap-highlight-color:rgb(0 0 0/0)}
.maplibregl-canvas{position:absolute;left:0;top:0}
.maplibregl-marker{position:absolute;top:0;left:0;will-change:transform}
.maplibregl-popup{position:absolute;top:0;left:0;display:flex;will-change:transform;pointer-events:none}
.maplibregl-popup-content{pointer-events:auto}
.maplibregl-popup-tip{width:0;height:0;border:10px solid transparent;z-index:1}
.maplibregl-popup-anchor-bottom{flex-direction:column-reverse}
.maplibregl-popup-anchor-bottom .maplibregl-popup-tip{align-self:center;border-top-color:#fff;border-bottom:none}
.maplibregl-popup-anchor-top{flex-direction:column}
.maplibregl-popup-anchor-top .maplibregl-popup-tip{align-self:center;border-bottom-color:#fff;border-top:none}
.maplibregl-popup-anchor-left{flex-direction:row}
.maplibregl-popup-anchor-left .maplibregl-popup-tip{align-self:center;border-right-color:#fff;border-left:none}
.maplibregl-popup-anchor-right{flex-direction:row-reverse}
.maplibregl-popup-anchor-right .maplibregl-popup-tip{align-self:center;border-left-color:#fff;border-right:none}
.maplibregl-ctrl-attrib{font:600 10px/1.4 var(--font-body,system-ui),sans-serif;background:rgba(255,255,255,.7);padding:0 4px;border-radius:6px 0 0 0}
.maplibregl-ctrl-attrib a{color:#555;text-decoration:none}
.maplibregl-ctrl-bottom-right{position:absolute;right:0;bottom:0;z-index:2}
.rl-pin{cursor:pointer;position:relative;width:${PIN_W}px;height:${PIN_H}px}
.rl-pin-body{transform-origin:50% 100%;transition:transform .18s ease-out;filter:drop-shadow(0 1.5px 1.5px rgba(0,0,0,.35))}
.rl-pin.sel{z-index:5}
.rl-label{display:none;position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:2px;font:700 11px/1.3 var(--font-body,system-ui),sans-serif;text-transform:lowercase;color:#202124;background:rgba(255,255,255,.92);padding:1px 6px;border-radius:6px;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 4px rgba(0,0,0,.25);pointer-events:none}
.rl-labels-on .rl-label,.rl-pin.sel .rl-label{display:block}
.rl-me{width:16px;height:16px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 0 0 6px rgba(26,115,232,.25)}
.rl-popup .maplibregl-popup-content{background:#fff;color:#111;border-radius:14px;padding:8px;box-shadow:0 6px 24px rgba(0,0,0,.28);max-width:220px;font:600 13px/1.35 var(--font-body,system-ui),sans-serif;text-transform:lowercase}
.rl-popup .maplibregl-popup-content a{text-transform:lowercase}
`;
function ensureCss() {
  if (typeof document === 'undefined' || document.getElementById('rl-map-css')) return;
  const el = document.createElement('style');
  el.id = 'rl-map-css';
  el.textContent = CRITICAL_CSS;
  document.head.appendChild(el);
}

// Make the base style read like Google Maps: visible light-warm building footprints from city
// zoom, solid 3D blocks when tilted.
function tuneBuildings(map) {
  try {
    (map.getStyle().layers || []).forEach((l) => {
      if (l['source-layer'] !== 'building') return;
      try {
        if (l.type === 'fill') {
          map.setLayerZoomRange(l.id, 13, 24);
          map.setPaintProperty(l.id, 'fill-color', '#e6e1d6');
          map.setPaintProperty(l.id, 'fill-outline-color', '#cdc5b4');
          map.setPaintProperty(l.id, 'fill-opacity', ['interpolate', ['linear'], ['zoom'], 13, 0.5, 15, 1]);
        } else if (l.type === 'fill-extrusion') {
          map.setLayerZoomRange(l.id, 14, 24);
          map.setPaintProperty(l.id, 'fill-extrusion-color', '#e3ded3');
          map.setPaintProperty(l.id, 'fill-extrusion-opacity', 0.9);
        }
      } catch { /* a layer that doesn't take these properties is left as it is */ }
    });
  } catch { /* style not ready */ }
}

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

// popup content built with DOM nodes (never innerHTML) so place text can't inject markup
function popupContent(p) {
  const box = el('div');
  if (p.photo) { const img = el('img'); img.src = p.photo; img.alt = ''; img.style.cssText = 'width:100%;height:96px;object-fit:cover;border-radius:10px;margin-bottom:4px;display:block'; box.appendChild(img); }
  const n = el('div', '', p.name || 'place'); n.style.fontWeight = '700'; box.appendChild(n);
  if (p.address) { const a = el('div', '', p.address); a.style.cssText = 'font-size:11px;color:#6b7280'; box.appendChild(a); }
  if (p.notes) { const a = el('div', '', p.notes); a.style.cssText = 'font-size:11px;margin-top:3px'; box.appendChild(a); }
  if (p.url && /^https?:\/\//i.test(p.url)) {
    const a = el('a', '', 'open in maps'); a.href = p.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.style.cssText = 'font-size:11px;color:#1a73e8;text-decoration:underline;display:inline-block;margin-top:3px';
    box.appendChild(a);
  }
  return box;
}


// ZOOMING OUT: pins are a fixed size on screen, so places that are close in real life would look like
// separate big points. Instead, pins whose on-screen distance is small are drawn pulled towards each
// other (weighted average of the neighbours), completely overlapping once they are about CLUSTER_NEAR px
// apart, and sitting at their exact spot once they are more than CLUSTER_FAR px apart. Zoomed in, nothing moves.
// (about 1 km apart overlaps completely at city-wide zoom; ~1.5 km a little further out)
const CLUSTER_NEAR = 45;
const CLUSTER_FAR = 90;
function clusterOffsets(map, items) {
  const pts = items.map(([id, lng, lat]) => { const q = map.project([lng, lat]); return { id, x: q.x, y: q.y }; });
  const out = new Map();
  pts.forEach((a) => {
    let sw = 1, sx = a.x, sy = a.y;
    pts.forEach((b) => {
      if (a === b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const w = d <= CLUSTER_NEAR ? 1 : d >= CLUSTER_FAR ? 0 : (CLUSTER_FAR - d) / (CLUSTER_FAR - CLUSTER_NEAR);
      if (w > 0) { sw += w; sx += w * b.x; sy += w * b.y; }
    });
    out.set(a.id, [Math.round((sx / sw - a.x) * 10) / 10, Math.round((sy / sw - a.y) * 10) / 10]);
  });
  return out;
}

const MapView = forwardRef(function MapView({ places = [], selectedId = null, onSelect, onMapClick, pickMode = false, className = '' }, ref) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const queueRef = useRef([]);
  const markersRef = useRef(new Map()); // id -> { marker, el, sig }
  const popupRef = useRef(null);
  const meRef = useRef(null);
  const tiltRef = useRef(false);
  const cbRef = useRef({});
  const lastMarkerClick = useRef(0);
  const clusterRef = useRef(() => {});
  const rafRef = useRef(0);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'slow'
  cbRef.current = { onSelect, onMapClick, pickMode };
  // the page rebuilds its `places` array on every render; only real changes should touch the markers
  const placesRef = useRef(places);
  placesRef.current = places;
  const placesKey = JSON.stringify(places.map((p) => [p.id, p.lat, p.lng, p.color || p.folderColor || '', p.name, p.address, p.notes, p.url, (p.photo || '').length]));

  const whenReady = (fn) => { if (readyRef.current && mapRef.current) fn(mapRef.current); else queueRef.current.push(fn); };

  useImperativeHandle(ref, () => ({
    flyTo({ lat, lng, zoom, keepZoom }) {
      whenReady((m) => {
        const z = keepZoom ? Math.max(m.getZoom(), 13) : (zoom ?? 16.5);
        m.flyTo({ center: [lng, lat], zoom: z, duration: 900, essential: true });
      });
    },
    // fit every point into view; `world` pulls all the way out
    fit(points, { world = false } = {}) {
      whenReady((m) => {
        const box = boxRef.current;
        const w = box ? box.clientWidth : 360;
        const h = box ? box.clientHeight : 256;
        if (world || !points.length) {
          m.easeTo({ center: [0, 20], zoom: Math.max(-1, Math.log2(Math.max(1, Math.min(w, h * 2)) / 512)), duration: 700 });
          return;
        }
        if (points.length === 1) { m.flyTo({ center: [points[0][1], points[0][0]], zoom: 13, duration: 800 }); return; }
        const b = new maplibregl.LngLatBounds();
        points.forEach(([la, ln]) => b.extend([ln, la]));
        // pins are tall: more room above (pin + label) than below
        m.fitBounds(b, { padding: { top: 56, bottom: 36, left: 44, right: 52 }, maxZoom: 14.5, duration: 800 });
      });
    },
    zoomBy(d, point) {
      whenReady((m) => {
        if (point) m.easeTo({ center: [point[1], point[0]], zoom: m.getZoom() + d, duration: 300 });
        else m.zoomTo(m.getZoom() + d, { duration: 300 });
      });
    },
    toggleTilt() {
      const next = !tiltRef.current;
      tiltRef.current = next;
      whenReady((m) => {
        m.easeTo({ pitch: next ? 55 : 0, zoom: next ? Math.max(m.getZoom(), 15.5) : m.getZoom(), duration: 600 });
      });
      return next;
    },
    locate(onError) {
      if (!navigator.geolocation) { onError && onError('location is not available on this device'); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => whenReady((m) => {
          const c = [pos.coords.longitude, pos.coords.latitude];
          rememberUserPosition(pos.coords.latitude, pos.coords.longitude); // so address searches favour where you are
          if (!meRef.current) meRef.current = new maplibregl.Marker({ element: el('div', 'rl-me') }).setLngLat(c).addTo(m);
          else meRef.current.setLngLat(c);
          m.flyTo({ center: c, zoom: 15.5, duration: 900 });
        }),
        () => onError && onError("couldn't get your location"),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      );
    },
    resize() { whenReady((m) => m.resize()); },
  }));

  // create the map once
  useEffect(() => {
    ensureCss();
    if (!boxRef.current) return undefined;
    let map;
    try {
      map = new maplibregl.Map({
        container: boxRef.current,
        style: STYLE_URL,
        center: [0, 20],
        zoom: 1,
        minZoom: -1,
        maxZoom: 20,
        attributionControl: false,
        fadeDuration: 120,
        pitchWithRotate: false,
        dragRotate: false,
        maxPitch: 70,
      });
    } catch (e) {
      setError('the map needs WebGL, which this browser has turned off');
      return undefined;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.touchZoomRotate.disableRotation();

    let usedFallback = false;
    const useFallback = () => {
      if (usedFallback) return;
      usedFallback = true;
      readyRef.current = false;
      map.setStyle(RASTER_FALLBACK);
    };
    // the vector style failed to download (offline CDN, blocked host) -> raster tiles instead
    let loadedOnce = false;
    // (errors tied to a tile or source are ordinary — only a failure of the style itself matters)
    map.on('error', (e) => {
      if (!loadedOnce && !usedFallback && e && !e.sourceId && !e.tile) useFallback();
    });
    const styleTimer = setTimeout(() => { if (!loadedOnce) useFallback(); }, 9000);
    const slowTimer = setTimeout(() => { if (!loadedOnce) setStatus('slow'); }, 14000);

    const onStyle = () => {
      loadedOnce = true;
      setStatus('ready');
      if (!usedFallback) tuneBuildings(map);
      readyRef.current = true;
      const q = queueRef.current; queueRef.current = [];
      q.forEach((fn) => fn(map));
    };
    map.on('load', onStyle);
    map.on('styledata', () => { if (!readyRef.current && map.isStyleLoaded()) onStyle(); });

    const setLabels = () => boxRef.current && boxRef.current.classList.toggle('rl-labels-on', map.getZoom() >= 12);
    map.on('zoom', setLabels);
    const schedCluster = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; clusterRef.current(); });
    };
    map.on('zoom', schedCluster);
    map.on('pitch', schedCluster);
    setLabels();

    map.on('click', (e) => {
      if (Date.now() - lastMarkerClick.current < 80) return; // that tap was on a pin
      const cb = cbRef.current.onMapClick;
      if (cb) cb({ latLng: [e.lngLat.lat, e.lngLat.lng] });
    });

    // the container changes height (the place editor shrinks it) — keep the canvas in step
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(boxRef.current);

    return () => {
      clearTimeout(styleTimer);
      clearTimeout(slowTimer);
      ro.disconnect();
      markersRef.current.forEach((m) => m.marker.remove());
      markersRef.current.clear();
      if (popupRef.current) popupRef.current.remove();
      if (meRef.current) meRef.current.remove();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []);

  // crosshair cursor while placing a pin by tapping the map
  useEffect(() => {
    const c = boxRef.current && boxRef.current.querySelector('.maplibregl-canvas');
    if (c) c.style.cursor = pickMode ? 'crosshair' : '';
  }, [pickMode]);

  // keep the markers in step with `places`
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const list = placesRef.current;
    clusterRef.current = () => {
      const mm = mapRef.current;
      if (!mm) return;
      const items = [];
      markersRef.current.forEach((entry, id) => { items.push([id, entry.place.lng, entry.place.lat]); });
      const off = clusterOffsets(mm, items);
      markersRef.current.forEach((entry, id) => { const o = off.get(id) || [0, 0]; entry.marker.setOffset(o); });
    };
    const seen = new Set();
    // southern pins sit lower on screen, so they are added last (on top)
    [...list].sort((a, b) => b.lat - a.lat).forEach((p) => {
      seen.add(p.id);
      const color = p.color || p.folderColor || '#111827';
      const sig = `${color}|${p.name}`;
      const cur = markersRef.current.get(p.id);
      if (cur) {
        cur.marker.setLngLat([p.lng, p.lat]);
        if (cur.sig !== sig) {
          cur.body.innerHTML = pinSvg(color);
          cur.label.textContent = p.name || '';
          cur.sig = sig;
        }
        cur.place = p;
        return;
      }
      const root = el('div', 'rl-pin');
      const body = el('div', 'rl-pin-body');
      body.innerHTML = pinSvg(color);
      const label = el('span', 'rl-label', p.name || '');
      root.appendChild(body);
      root.appendChild(label);
      const entry = { place: p, sig, body, label, el: root };
      root.addEventListener('click', (ev) => {
        ev.stopPropagation();
        lastMarkerClick.current = Date.now();
        const cb = cbRef.current.onSelect;
        if (cb) cb(entry.place);
      });
      entry.marker = new maplibregl.Marker({ element: root, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(m);
      markersRef.current.set(p.id, entry);
    });
    markersRef.current.forEach((entry, id) => {
      if (!seen.has(id)) { entry.marker.remove(); markersRef.current.delete(id); }
    });
    clusterRef.current();
  }, [placesKey]);

  // selected pin: enlarged, on top, with its info card
  useEffect(() => {
    const m = mapRef.current;
    markersRef.current.forEach((entry, id) => entry.el.classList.toggle('sel', id === selectedId));
    if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }
    if (!m || !selectedId) return;
    const entry = markersRef.current.get(selectedId);
    if (!entry) return;
    const p = entry.place;
    popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -PIN_H * 1.2], className: 'rl-popup', maxWidth: '220px' })
      .setLngLat([p.lng, p.lat])
      .setDOMContent(popupContent(p))
      .addTo(m);
  }, [selectedId, placesKey]);

  if (error) {
    return <div className={`flex items-center justify-center text-center text-xs text-muted-foreground lowercase px-6 bg-muted ${className}`}>{error}</div>;
  }
  // The element MapLibre takes over gets its own class `maplibregl-map` with `position: relative`,
  // which beats a Tailwind `absolute inset-0` on the same element and collapsed the map to zero
  // height (a blank box). So the map lives in an inner div sized with inline styles, and the caller's
  // className sits on a plain wrapper.
  return (
    <div className={`bg-muted ${className}`} style={{ touchAction: 'none' }}>
      <div ref={boxRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
      {status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground lowercase text-center px-6 pointer-events-none">
          {status === 'slow' ? "the map is taking a long time to load — check your connection" : 'loading map…'}
        </div>
      )}
    </div>
  );
});

export default MapView;
