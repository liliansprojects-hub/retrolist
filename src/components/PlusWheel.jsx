import React, { useState, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// long-press opens the original radial "wheel" (all creatable options fanned
// out in an arc, well clear of the screen edges); a quick tap opens the
// grouped bottom-sheet panel instead. both read from the same `groups` prop.
const WHEEL_MARGIN = 40; // px kept clear from every screen edge, on purpose "wide"

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
  const arc = Math.PI; // semicircle
  const startAngle = Math.PI; // start pointing left, sweep to pointing right

  const minDim = Math.min(vp.w, vp.h);
  const itemSize = minDim < 380 ? 52 : 60;
  // radius sized so the farthest point of the farthest item still clears
  // WHEEL_MARGIN px from any screen edge — no overshoot multiplier this time.
  const radius = Math.max(70, Math.min(150, (minDim - itemSize) / 2 - WHEEL_MARGIN));

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
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
              {/* close button stays reachable even though items are fanned across the screen */}
              <button
                onClick={(e) => { e.stopPropagation(); close(); }}
                className="touch-44 absolute top-4 right-4 w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center z-10 shadow pointer-events-auto"
              >
                <X className="w-4 h-4" />
              </button>
              {wheelItems.map((item, i) => {
                const angle = startAngle + (count > 1 ? (i / (count - 1)) * arc : arc / 2);
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                const delay = i * 0.03;
                return (
                  <button
                    key={item.value}
                    onClick={(e) => { e.stopPropagation(); handleSelect(item.value); }}
                    className="wheel-item pointer-events-auto absolute flex flex-col items-center justify-center rounded-2xl bg-card border border-border shadow-lg active:scale-90"
                    style={{
                      width: itemSize,
                      height: itemSize,
                      transform: `translate(${x}px, ${y}px)`,
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