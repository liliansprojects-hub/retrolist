import React, { useState, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// long-press opens the "wheel" — a radial menu of icons circling the + button
// (two rings: lists & folders inside, items outside) with margins so nothing
// overlaps. a quick tap opens a grouped bottom sheet. on small screens the
// wheel falls back to the grouped sheet.
export default function PlusWheel({ groups, onSelect, position = 'bottom-center' }) {
  const [open, setOpen] = useState(false);
  const [wheelMode, setWheelMode] = useState(false);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const longPressTimer = useRef(null);

  useEffect(() => {
    const u = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    u();
    window.addEventListener('resize', u);
    return () => window.removeEventListener('resize', u);
  }, []);

  const handlePressStart = () => {
    longPressTimer.current = setTimeout(() => { setWheelMode(true); setOpen(true); }, 450);
  };
  const handlePressEnd = () => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } };
  const handleClick = () => { if (open) { close(); return; } setWheelMode(false); setOpen(true); };
  const close = () => { setOpen(false); setWheelMode(false); };
  const handleSelect = (value, groupIndex) => { onSelect(value, groupIndex); close(); };

  const posClass = position === 'bottom-right' ? 'bottom-24 right-6' : 'bottom-24 left-1/2 -translate-x-1/2';

  const renderGroups = () =>
    groups.map((g, groupIndex) => (
      <div key={g.title} className="mb-4">
        <h3 className="text-[11px] font-medium text-muted-foreground lowercase mb-2">{g.title}</h3>
        <div className="grid grid-cols-3 gap-3">
          {g.items.map((item) => (
            <button key={item.value} onClick={(e) => { e.stopPropagation(); handleSelect(item.value, groupIndex); }} className="touch-44 flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-background border border-border active:scale-95 transition-transform icon-no-select">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: (item.color || '#f4f4f5') + '30' }}>
                <item.icon className="w-5 h-5 text-foreground" strokeWidth={2} />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground lowercase text-center leading-tight">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    ));

  const useRadial = vp.w >= 600 && vp.h >= 520;
  const listOpts = groups[0]?.items || [];
  const itemOpts = groups[1]?.items || [];
  const BTN = 48; // slightly bigger than before
  const GAP = 16; // real empty space enforced between adjacent buttons, not just eyeballed
  const SIDE_MARGIN = 32;

  // radius is computed from the actual item count so gaps are guaranteed,
  // not guessed: for N buttons evenly spaced on a ring of radius R, the
  // straight-line distance between adjacent centers is 2R·sin(π/N) — solving
  // for the radius that gives at least BTN+GAP between them.
  const minRadiusFor = (count) => count > 1 ? (BTN + GAP) / (2 * Math.sin(Math.PI / count)) : BTN;
  const innerMinR = minRadiusFor(listOpts.length);
  const outerMinR = minRadiusFor(itemOpts.length);
  let innerR = Math.max(innerMinR, BTN + GAP);
  let outerR = Math.max(outerMinR, innerR + BTN + GAP * 1.4);

  const maxOuterR = Math.min(vp.w, vp.h) / 2 - SIDE_MARGIN - BTN / 2;
  if (outerR > maxOuterR && maxOuterR > innerR + BTN) {
    outerR = maxOuterR;
  }

  // a short curved label sitting just outside/inside each ring near the top,
  // reading along the ring's own curvature — purely decorative, doesn't
  // affect layout math.
  const arcLabel = (text, R, id, inside) => {
    const halfSpan = 0.42; // radians, ~24° each side of straight up
    const start = -Math.PI / 2 - halfSpan;
    const end = -Math.PI / 2 + halfSpan;
    const sx = Math.cos(start) * R, sy = Math.sin(start) * R;
    const ex = Math.cos(end) * R, ey = Math.sin(end) * R;
    const size = R * 2 + 40;
    return (
      <svg
        key={id}
        className="absolute pointer-events-none"
        style={{ left: -size / 2, top: -size / 2, width: size, height: size, zIndex: 0 }}
        viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
      >
        <path id={id} d={`M ${sx} ${sy} A ${R} ${R} 0 0 1 ${ex} ${ey}`} fill="none" />
        <text className="fill-muted-foreground" style={{ fontSize: 9, letterSpacing: '0.06em' }}>
          <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
            {text}
          </textPath>
        </text>
      </svg>
    );
  };

  const ring = (opts, R, groupIndex) =>
    opts.map((item, i) => {
      const a = (i / opts.length) * 2 * Math.PI - Math.PI / 2;
      const x = Math.cos(a) * R;
      const y = Math.sin(a) * R;
      return (
        <button key={item.value} onClick={(e) => { e.stopPropagation(); handleSelect(item.value, groupIndex); }} className="touch-44 absolute flex flex-col items-center justify-center gap-0.5 rounded-2xl bg-card border border-border shadow-sm active:scale-90 transition-transform icon-no-select z-[1]" style={{ width: BTN, height: BTN, left: x - BTN / 2, top: y - BTN / 2 }}>
          <item.icon className="w-[18px] h-[18px] text-foreground" strokeWidth={2} />
          <span className="text-[7.5px] lowercase text-muted-foreground leading-none">{item.label}</span>
        </button>
      );
    });

  return (
    <>
      {(!open || !wheelMode) && (
        <button
          onClick={handleClick}
          onPointerDown={handlePressStart}
          onPointerUp={handlePressEnd}
          onPointerLeave={handlePressEnd}
          onPointerCancel={handlePressEnd}
          className={cn('fixed z-50 touch-44 flex items-center justify-center w-14 h-14 rounded-full bg-foreground text-background shadow-lg shadow-foreground/20 active:scale-90 transition-transform icon-no-select', posClass)}
          style={{ touchAction: 'manipulation' }}
          aria-label={open ? 'close' : 'create'}
        >
          {open ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center" onClick={close}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />

          {wheelMode && useRadial ? (
            <div className="absolute inset-0 flex items-center justify-center" onClick={close}>
              <div className="relative" style={{ width: 1, height: 1 }} onClick={(e) => e.stopPropagation()}>
                <button onClick={close} className="touch-44 absolute w-14 h-14 rounded-full bg-foreground text-background flex items-center justify-center shadow-lg z-10" style={{ left: -28, top: -28 }}>
                  <X className="w-6 h-6" />
                </button>
                {arcLabel('lists', Math.max(innerR - 26, 40), 'wheel-label-inner')}
                {arcLabel('items', outerR + 24, 'wheel-label-outer')}
                {ring(listOpts, innerR, 0)}
                {ring(itemOpts, outerR, 1)}
              </div>
            </div>
          ) : (
            <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto no-scrollbar bg-card rounded-t-3xl border-t border-border p-5 pb-12 animate-slide-up" onClick={(e) => e.stopPropagation()}>
              <button onClick={close} className="touch-44 absolute top-3 right-3 w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center z-10"><X className="w-4 h-4" /></button>
              <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-4" />
              {renderGroups()}
              <div className="h-6" />
            </div>
          )}
        </div>
      )}
    </>
  );
}