import React from 'react';
import { Overlay } from 'pigeon-maps';
import { Link2 } from 'lucide-react';
import WaterdropPin, { PIN_ASPECT } from '@/components/WaterdropPin';

// One individual waterdrop pin per place, coloured to match its folder. There
// is deliberately NO clustering: the old version collapsed nearby places into
// numbered badges (and its precision formula was backwards, so it grouped
// everything within ~10 km at normal city zoom). Every place gets its own pin.
//
// NOT a JSX component: pigeon-maps only positions Overlay elements that are
// DIRECT children of <Map> (it walks props.children one level deep). Call this
// as a plain function inside <Map>{buildPins(...)}</Map> and it returns the
// Overlay elements straight into Map's children.

// pins shrink a little when zoomed far out so a world-wide set stays readable
const pinHeight = (zoom) => (zoom < 3 ? 24 : zoom < 5 ? 30 : zoom < 8 ? 35 : 40);

// places at (almost) exactly the same point would sit perfectly on top of one
// another and look like a single pin — fan them out a few pixels so every one
// stays individually visible and tappable.
function fanOut(places) {
  const groups = new Map();
  places.forEach((p) => {
    const key = Number(p.lat).toFixed(5) + ',' + Number(p.lng).toFixed(5);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  const shift = new Map();
  groups.forEach((g) => {
    g.forEach((p, i) => {
      if (g.length === 1) return shift.set(p.id, [0, 0]);
      const a = (i / g.length) * 2 * Math.PI - Math.PI / 2;
      shift.set(p.id, [Math.cos(a) * 12, Math.sin(a) * 9]);
    });
  });
  return shift;
}

export function buildPins({ places, zoom, selected, onPinClick }) {
  const h = pinHeight(zoom);
  const w = Math.round(h * PIN_ASPECT);
  const shift = fanOut(places);
  const showLabels = zoom >= 11;

  // southern pins sit lower on screen, so draw them last (on top); the
  // selected pin always goes on top of everything.
  const ordered = [...places].sort((a, b) => {
    if (a.id === selected) return 1;
    if (b.id === selected) return -1;
    return b.lat - a.lat;
  });

  return ordered.map((p) => {
    const [dx, dy] = shift.get(p.id) || [0, 0];
    const isSel = selected === p.id;
    return (
      // offset places the BOTTOM-CENTRE of the pin (its tip) on the coordinate
      <Overlay key={p.id} anchor={[Number(p.lat), Number(p.lng)]} offset={[w / 2 - dx, h - dy]}>
        <div
          onClick={(e) => { e.stopPropagation(); onPinClick(p); }}
          data-place-id={p.id}
          style={{ position: 'relative', width: w, height: h, cursor: 'pointer' }}
        >
          <WaterdropPin color={p.color || p.folderColor || '#111827'} height={h} selected={isSel} />

          {(showLabels || isSel) && (
            <span
              style={{
                position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 3,
                fontSize: 11, fontWeight: 700, color: '#0a0a0a', background: 'rgba(255,255,255,0.92)',
                padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden',
                textOverflow: 'ellipsis', boxShadow: '0 1px 4px rgba(0,0,0,0.25)', pointerEvents: 'none',
              }}
            >
              {p.name}
            </span>
          )}

          {isSel && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="text-sm max-w-[200px] bg-white text-black rounded-xl shadow-xl p-2"
              style={{ position: 'absolute', bottom: Math.round(h * 1.22) + 10, left: '50%', transform: 'translateX(-50%)', width: 'max-content', zIndex: 5 }}
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
        </div>
      </Overlay>
    );
  });
}
