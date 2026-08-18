import React, { useState, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// long-press opens the original radial "wheel" (all creatable options fanned
// out in a circular arc around the +/x button itself, not the screen
// center); a quick tap opens the grouped bottom-sheet panel instead. both
// read from the same `groups` prop.
const WHEEL_MARGIN = 40; // px kept clear from every screen edge
const ITEM_GAP = 14; // minimum px gap between adjacent wheel items
const BUTTON_SIZE = 56; // matches w-14/h-14 on the trigger button
const BUTTON_CLEARANCE = 18; // gap between the button's own edge and the ring

export default function PlusWheel({ groups, onSelect, position = 'bottom-center' }) {
  const [open, setOpen] = useState(false);
  const [wheelMode, setWheelMode] = useState(false);
  const [animating, setAnimating] = useState(false);
  const longPressTimer = useRef(null);
  const [vp, setVp] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 360,
    h: typeof window !== 'undefined' ? window.innerHeight : 600,
  }));

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // flatten the grouped items into one list for the radial layout — the
  // wheel fans everything out at once rather than showing group sections.
  const wheelItems = (groups || []).flatMap((g) => g.items);
  const count = wheelItems.length;

  // the wheel's origin is the button's own on-screen center (not the
  // viewport center), so the ring genuinely wraps around the +/x button.
  const originX = position === 'bottom-right' ? vp.w - 24 - BUTTON_SIZE / 2 : vp.w / 2;
  const originY = vp.h - 96 - BUTTON_SIZE / 2;

  const minDim = Math.min(vp.w, vp.h);
  let itemSize = minDim < 380 ? 48 : 56;

  // sweep angle: a wide arc (~210°) centered straight up from the button —
  // reads as a circle wrapping around the button, without dipping items
  // below it where they'd collide with the button itself.
  const ARC = Math.PI * 1.18;
  const angularStep = count > 1 ? ARC / (count - 1) : 0;

  // radius must satisfy three things at once: clear the button itself,
  // keep adjacent items ITEM_GAP apart, and stay WHEEL_MARGIN clear of
  // every screen edge. shrink itemSize as a last resort if a small screen
  // genuinely can't fit everything at comfortable spacing.
  const clearanceRadius = BUTTON_SIZE / 2 + BUTTON_CLEARANCE + itemSize / 2;
  const spacingRadius = angularStep > 0 ? (itemSize + ITEM_GAP) / (2 * Math.sin(angularStep / 2)) : clearanceRadius;
  const sideClearance = Math.max(40, Math.min(originX, vp.w - originX) - WHEEL_MARGIN);
  const capRadiusX = Math.sin(Math.min(ARC / 2, Math.PI / 2)) > 0.01
    ? sideClearance / Math.sin(Math.min(ARC / 2, Math.PI / 2))
    : sideClearance;
  const capRadiusY = Math.max(40, originY - WHEEL_MARGIN);
  const maxRadius = Math.min(capRadiusX, capRadiusY);

  let radius = Math.max(clearanceRadius, spacingRadius);
  if (radius > maxRadius && spacingRadius > clearanceRadius) {
    // shrink items proportionally so the required spacing still fits
    const shrink = Math.max(0.6, maxRadius / spacingRadius);
    itemSize = itemSize * shrink;
    radius = Math.max(clearanceRadius * shrink, maxRadius);
  } else {
    radius = Math.min(radius, maxRadius);
  }

  const handlePressStart = () => {
    longPressTimer.current = setTimeout(() => {
      setWheelMode(true);
      setOpen(true);
      setAnimating(true);
      setTimeout(() => setAnimating(false), 400);
    }, 450);
  };
  const handlePressEnd = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };
  const handleClick = () => {
    if (open) { close(); return; }
    setWheelMode(false);
    setOpen(true);
  };
  const close = () => { setOpen(false); setWheelMode(false); };
  const handleSelect = (value) => { onSelect(value); close(); };

  const posClass = position === 'bottom-right' ? 'bottom-24 right-6' : 'bottom-24 left-1/2 -translate-x-1/2';

  const renderGroups = () =>
    groups.map((g) => (
      <div key={g.title} className="mb-4">
        <h3 className="text-[11px] font-medium text-muted-foreground lowercase mb-2">{g.title}</h3>
        <div className="grid grid-cols-3 gap-3">
          {g.items.map((item) => (
            <button
              key={item.value}
              onClick={(e) => { e.stopPropagation(); handleSelect(item.value); }}
              className="touch-44 flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-background border border-border active:scale-95 transition-transform icon-no-select"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: (item.color || '#f4f4f5') + '30' }}>
                <item.icon className="w-5 h-5 text-foreground" strokeWidth={2} />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground lowercase text-center leading-tight">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    ));

  return (
    <>
      <button
        onClick={handleClick}
        onPointerDown={handlePressStart}
        onPointerUp={handlePressEnd}
        onPointerLeave={handlePressEnd}
        onPointerCancel={handlePressEnd}
        className={cn(
          'fixed z-50 touch-44 flex items-center justify-center w-14 h-14 rounded-full bg-foreground text-background shadow-lg shadow-foreground/20 active:scale-90 transition-transform icon-no-select',
          posClass
        )}
        style={{ touchAction: 'manipulation' }}
        aria-label={open ? 'close' : 'create'}
      >
        {open ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center" onClick={close}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />

          {wheelMode ? (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {/* close button stays reachable even though items are fanned across the screen */}
              <button
                onClick={(e) => { e.stopPropagation(); close(); }}
                className="touch-44 absolute top-4 right-4 w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center z-10 shadow pointer-events-auto"
              >
                <X className="w-4 h-4" />
              </button>
              {wheelItems.map((item, i) => {
                // angleFromUp: 0 = straight up from the button, spreading
                // outward left/right — keeps the ring above/around the
                // button instead of dipping into it.
                const angleFromUp = count > 1 ? (i / (count - 1) - 0.5) * ARC : 0;
                const x = originX + Math.sin(angleFromUp) * radius;
                const y = originY - Math.cos(angleFromUp) * radius;
                const delay = i * 0.03;
                return (
                  <button
                    key={item.value}
                    onClick={(e) => { e.stopPropagation(); handleSelect(item.value); }}
                    className="wheel-item pointer-events-auto absolute flex flex-col items-center justify-center rounded-2xl bg-card border border-border shadow-lg active:scale-90"
                    style={{
                      width: itemSize,
                      height: itemSize,
                      left: x - itemSize / 2,
                      top: y - itemSize / 2,
                      opacity: animating ? 0 : 1,
                      animation: `scale-in 0.3s ease ${delay}s both`,
                      transitionDelay: `${delay}s`,
                    }}
                  >
                    <item.icon className="text-foreground mb-0.5" strokeWidth={2} style={{ width: itemSize * 0.32, height: itemSize * 0.32 }} />
                    <span className="text-[8px] font-medium text-muted-foreground leading-none lowercase text-center px-0.5">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div
              className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto no-scrollbar bg-card rounded-t-3xl border-t border-border p-5 pb-12 animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={close} className="touch-44 absolute top-3 right-3 w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center z-10">
                <X className="w-4 h-4" />
              </button>
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