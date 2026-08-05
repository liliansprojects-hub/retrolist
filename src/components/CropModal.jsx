import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Check, X, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/utils';

// touch-friendly image cropper: pan by dragging, zoom with a slider
export default function CropModal({ imageSrc, aspect = 1, round = false, maxSize = 1600, quality = 0.9, onSave, onCancel }) {
  const frameRef = useRef(null);
  const imgRef = useRef(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [pos, setPos] = useState({ x: 0, y: 0 }); // translate in px (image top-left relative to frame)
  const [scale, setScale] = useState(1); // multiplier over "cover" fit
  const [drag, setDrag] = useState(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      imgRef.current = img;
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // size the frame to fit viewport, respecting aspect
  useEffect(() => {
    const fit = () => {
      const maxW = Math.min(window.innerWidth - 48, 360);
      const maxH = Math.min(window.innerHeight * 0.5, 360);
      let w = maxW;
      let h = w / aspect;
      if (h > maxH) { h = maxH; w = h * aspect; }
      setFrame({ w, h });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [aspect]);

  // cover scale + initial centered position
  const coverScale = natural.w && natural.h
    ? Math.max(frame.w / natural.w, frame.h / natural.h)
    : 1;
  const dispScale = coverScale * scale;

  useEffect(() => {
    if (natural.w && frame.w) {
      const ds = coverScale * scale;
      const imgW = natural.w * ds;
      const imgH = natural.h * ds;
      // center
      setPos({ x: (frame.w - imgW) / 2, y: (frame.h - imgH) / 2 });
    }
  }, [natural, frame, scale]); // eslint-disable-line

  const clampPos = useCallback((x, y) => {
    const ds = coverScale * scale;
    const imgW = natural.w * ds;
    const imgH = natural.h * ds;
    // image must cover frame: can't show edges
    let minX = frame.w - imgW; // imgW >= frameW so minX <= 0
    let maxX = 0;
    let minY = frame.h - imgH;
    let maxY = 0;
    if (imgW < frame.w) { minX = maxX = (frame.w - imgW) / 2; }
    if (imgH < frame.h) { minY = maxY = (frame.h - imgH) / 2; }
    return {
      x: Math.min(maxX, Math.max(minX, x)),
      y: Math.min(maxY, Math.max(minY, y)),
    };
  }, [coverScale, scale, natural, frame]);

  const onPointerDown = (e) => {
    setDrag({ startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const clamped = clampPos(drag.origX + dx, drag.origY + dy);
    setPos(clamped);
  };
  const onPointerUp = (e) => {
    setDrag(null);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };

  const handleSave = () => {
    if (!imgRef.current || !natural.w) { onSave?.(imageSrc); return; }
    const ds = coverScale * scale;
    const sx = (-pos.x) / ds;
    const sy = (-pos.y) / ds;
    const sw = frame.w / ds;
    const sh = frame.h / ds;
    let outW = sw;
    let outH = sh;
    const cap = maxSize;
    if (outW > cap || outH > cap) {
      const r = cap / Math.max(outW, outH);
      outW = Math.round(outW * r);
      outH = Math.round(outH * r);
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(outW));
    canvas.height = Math.max(1, Math.round(outH));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    onSave?.(canvas.toDataURL('image/jpeg', quality));
  };

  if (!imageSrc) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fade-in" />
      <div className="relative w-full max-w-md px-6 flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between w-full mb-5">
          <button onClick={onCancel} className="touch-44 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
            <X className="w-5 h-5 text-white" />
          </button>
          <h3 className="text-sm font-semibold text-white lowercase">adjust & crop</h3>
          <button onClick={handleSave} className="touch-44 w-10 h-10 rounded-full bg-white flex items-center justify-center">
            <Check className="w-5 h-5 text-black" strokeWidth={3} />
          </button>
        </div>

        <div
          ref={frameRef}
          className="relative overflow-hidden bg-black/40 touch-none"
          style={{ width: frame.w, height: frame.h, borderRadius: round ? '9999px' : '1.25rem' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {natural.w > 0 && (
            <img
              src={imageSrc}
              alt=""
              draggable={false}
              className="absolute select-none pointer-events-none"
              style={{
                width: natural.w * dispScale,
                height: natural.h * dispScale,
                transform: `translate(${pos.x}px, ${pos.y}px)`,
              }}
            />
          )}
        </div>

        <div className="w-full mt-6 flex items-center gap-3">
          <ZoomIn className="w-4 h-4 text-white/70 shrink-0" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            className="flex-1 accent-white"
          />
        </div>
        <p className="text-[11px] text-white/50 lowercase mt-3">drag to reposition · slide to zoom</p>
      </div>
    </div>
  );
}