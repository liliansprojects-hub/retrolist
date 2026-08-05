import React, { useState, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function PlusWheel({ items, onSelect, position = 'bottom-center' }) {
  const [open, setOpen] = useState(false);
  const [wheelMode, setWheelMode] = useState(false);
  const longPressTimer = useRef(null);
  const [animating, setAnimating] = useState(false);

  const handlePressStart = () => {
    longPressTimer.current = setTimeout(() => {
      setWheelMode(true);
      setOpen(true);
      setAnimating(true);
      setTimeout(() => setAnimating(false), 400);
    }, 400);
  };

  const handlePressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleClick = () => {
    if (!open) {
      setWheelMode(false);
      setOpen(true);
      setAnimating(true);
      setTimeout(() => setAnimating(false), 300);
    }
  };

  const close = () => {
    setOpen(false);
    setWheelMode(false);
  };

  const handleSelect = (value) => {
    onSelect(value);
    close();
  };

  const count = items.length;
  const arc = Math.PI; // semicircle
  const startAngle = Math.PI; // start from left

  // responsive radius: fit within the smaller of width/height, leaving margin for item labels
  const [vp, setVp] = useState(() => ({ w: typeof window !== 'undefined' ? window.innerWidth : 360, h: typeof window !== 'undefined' ? window.innerHeight : 600 }));
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize); };
  }, []);
  const minDim = Math.min(vp.w, vp.h);
  const itemSize = minDim < 380 ? 52 : 60;
  const radius = Math.max(60, Math.min(120, (minDim - itemSize - 48) / 2 / 1.5));

  const posClass =
    position === 'bottom-right'
      ? 'bottom-24 right-6'
      : 'bottom-24 left-1/2 -translate-x-1/2';

  return (
    <>
      {/* floating + button */}
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
        aria-label="create"
      >
        <Plus className={cn('w-6 h-6 transition-transform', open && 'rotate-45')} />
      </button>

      {/* overlay */}
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center" onClick={close}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />

          {/* wheel mode: radial */}
          {wheelMode && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-auto no-scrollbar p-4">
              {items.map((item, i) => {
                const angle = startAngle + (count > 1 ? (i / (count - 1)) * arc : arc / 2);
                const x = Math.cos(angle) * radius * 1.5;
                const y = Math.sin(angle) * radius * 1.5;
                const delay = i * 0.03;
                return (
                  <button
                    key={item.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(item.value);
                    }}
                    className="wheel-item pointer-events-auto absolute flex flex-col items-center justify-center rounded-2xl bg-card border border-border shadow-lg active:scale-90"
                    style={{
                      width: itemSize,
                      height: itemSize,
                      transform: `translate(${x}px, ${y}px) scale(1)`,
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
          )}

          {/* sheet mode: bottom sheet */}
          {!wheelMode && (
            <div
              className="relative w-full max-w-lg bg-card rounded-t-3xl border-t border-border p-5 pb-8 animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-4" />
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 lowercase">create</h3>
              <div className="grid grid-cols-3 gap-3">
                {items.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => handleSelect(item.value)}
                    className="touch-44 flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-background border border-border active:scale-95 transition-transform icon-no-select"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: (item.color || '#f4f4f5') + '30' }}
                    >
                      <item.icon className="w-5 h-5 text-foreground" strokeWidth={2} />
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground lowercase text-center leading-tight">
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={close}
                className="touch-44 mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-muted text-muted-foreground text-sm font-medium lowercase"
              >
                <X className="w-4 h-4" />
                close
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}