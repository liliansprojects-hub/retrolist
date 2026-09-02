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
  const handleSelect = (value, gIdx) => { onSelect(value, gIdx); close(); };

  const posClass = position === 'bottom-right' ? 'bottom-24 right-6' : 'bottom-24 left-1/2 -translate-x-1/2';

  const renderGroups = () =>
    groups.map((g, gIdx) => (
      <div key={g.title} className="mb-4">
        <h3 className="text-[11px] font-medium text-muted-foreground lowercase mb-2">{g.title}</h3>
        <div className="grid grid-cols-3 gap-3">
          {g.items.map((item) => (
            <button key={item.value} onClick={(e) => { e.stopPropagation(); handleSelect(item.value, gIdx); }} className="touch-44 flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-background border border-border active:scale-95 transition-transform icon-no-select">
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
  const outerR = Math.min(vp.w * 0.30, vp.h * 0.32, 210);
  const innerR = outerR * 0.6;
  const listOpts = groups[0]?.items || [];
  const itemOpts = groups[1]?.items || [];
  // size each ring's buttons to fit its circumference so nothing overlaps and
  // every option stays tappable (shrinks only when there isn't room for 44px).
  const fitBtn = (R, n) => Math.max(28, Math.min(44, Math.floor((2 * Math.PI * R) / Math.max(1, n)) - 4));
  const innerBtn = fitBtn(innerR, listOpts.length);
  const outerBtn = fitBtn(outerR, itemOpts.length);

  const ring = (opts, R, gIdx, btn) =>
    opts.map((item, i) => {
      const a = (i / opts.length) * 2 * Math.PI - Math.PI / 2;
      const x = Math.cos(a) * R;
      const y = Math.sin(a) * R;
      return (
        <button key={item.value} onClick={(e) => { e.stopPropagation(); handleSelect(item.value, gIdx); }} className="touch-44 absolute flex flex-col items-center justify-center gap-0.5 rounded-2xl bg-card border border-border shadow-sm active:scale-90 transition-transform icon-no-select" style={{ left: x - btn / 2, top: y - btn / 2, width: btn, height: btn }}>
          <item.icon className="w-4 h-4 text-foreground" strokeWidth={2} />
          <span className="text-[7px] lowercase text-muted-foreground leading-none">{item.label}</span>
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
                {(() => {
                   const pad = 48;
                   const cx = outerR + pad, cy = outerR + pad;
                   const innerLabelR = innerR + innerBtn / 2 + 12;
                   const outerLabelR = outerR + outerBtn / 2 + 12;
                  const arc = (r) => `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
                  return (
                    <svg className="absolute pointer-events-none" style={{ left: -(outerR + pad), top: -(outerR + pad), width: 2 * (outerR + pad), height: 2 * (outerR + pad) }} viewBox={`0 0 ${2 * (outerR + pad)} ${2 * (outerR + pad)}`}>
                      <defs>
                        <path id="b44-inner-label" d={arc(innerLabelR)} fill="none" />
                        <path id="b44-outer-label" d={arc(outerLabelR)} fill="none" />
                      </defs>
                      <text style={{ fontSize: 9, letterSpacing: 1, fill: 'hsl(var(--muted-foreground))' }}>
                        <textPath href="#b44-inner-label" startOffset="50%" textAnchor="middle">lists</textPath>
                      </text>
                      <text style={{ fontSize: 9, letterSpacing: 1, fill: 'hsl(var(--muted-foreground))' }}>
                        <textPath href="#b44-outer-label" startOffset="50%" textAnchor="middle">items</textPath>
                      </text>
                    </svg>
                  );
                })()}
                <button onClick={close} className="touch-44 absolute w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center shadow-lg z-10" style={{ left: -24, top: -24 }}>
                  <X className="w-5 h-5" />
                </button>
                {ring(listOpts, innerR, 0, innerBtn)}
                {ring(itemOpts, outerR, 1, outerBtn)}
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