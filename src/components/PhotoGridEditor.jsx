import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Check, X, ZoomIn, ChevronRight } from 'lucide-react';

// original-dimension photo editor: shows the image at its true aspect (no
// squeeze), overlays a composition grid, and lets you freely magnify/drag to
// inspect it. the image can never be panned outside its own bounds. "add"
// stores the original image (full resolution, unchanged).
export default function PhotoGridEditor({ imageSrc, index = 0, total = 1, onAdd, onSkip, onCancel }) {
  const imgRef = useRef(null);
  const frameRef = useRef(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [interacting, setInteracting] = useState(false);
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imageSrc;
  }, [imageSrc]);

  useEffect(() => {
    const fit = () => {
      if (!natural.w || !natural.h) return;
      const maxW = Math.min(window.innerWidth - 48, 360);
      const maxH = Math.min(window.innerHeight * 0.5, 360);
      let w = maxW;
      let h = (w * natural.h) / natural.w;
      if (h > maxH) { h = maxH; w = (h * natural.w) / natural.h; }
      setFrame({ w, h });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [natural]);

  // baseScale makes the image fill the frame at scale=1 (same aspect → exact fit)
  const baseScale = natural.w && frame.w ? frame.w / natural.w : 1;
  const dispScale = baseScale * scale;

  const clamp = useCallback((x, y, imgW, imgH) => {
    let minX = frame.w - imgW, maxX = 0;
    let minY = frame.h - imgH, maxY = 0;
    if (imgW < frame.w) { minX = maxX = (frame.w - imgW) / 2; }
    if (imgH < frame.h) { minY = maxY = (frame.h - imgH) / 2; }
    return { x: Math.min(maxX, Math.max(minX, x)), y: Math.min(maxY, Math.max(minY, y)) };
  }, [frame]);

  useEffect(() => {
    if (!natural.w || !frame.w) return;
    setPos((p) => clamp(p.x, p.y, natural.w * dispScale, natural.h * dispScale));
  }, [natural, frame, scale, clamp, dispScale]);

  const localMid = () => {
    const rect = frameRef.current.getBoundingClientRect();
    const [a, b] = [...pointers.current.values()];
    return { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
  };

  const onPointerDown = (e) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1, startScale: scale, startPos: { ...pos }, mid0: localMid() };
      drag.current = null;
    } else if (pointers.current.size === 1) {
      drag.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    }
    setInteracting(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };

  const onPointerMove = (e) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const ds0 = baseScale * pinch.current.startScale;
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const ns = Math.min(5, Math.max(1, pinch.current.startScale * (dist / pinch.current.startDist)));
      const ds1 = baseScale * ns;
      const mid = localMid();
      const imgX = (pinch.current.mid0.x - pinch.current.startPos.x) / ds0;
      const imgY = (pinch.current.mid0.y - pinch.current.startPos.y) / ds0;
      setScale(ns);
      setPos(clamp(mid.x - imgX * ds1, mid.y - imgY * ds1, natural.w * ds1, natural.h * ds1));
      return;
    }
    if (drag.current && pointers.current.size === 1) {
      const dx = e.clientX - drag.current.startX;
      const dy = e.clientY - drag.current.startY;
      setPos(clamp(drag.current.origX + dx, drag.current.origY + dy, natural.w * dispScale, natural.h * dispScale));
    }
  };

  const endPointer = (e) => {
    pointers.current.delete(e.pointerId);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
    if (pointers.current.size === 0) setInteracting(false);
  };

  const onSlider = (v) => {
    if (!natural.w || !frame.w) { setScale(v); return; }
    const ds0 = baseScale * scale;
    const ds1 = baseScale * v;
    const cx = frame.w / 2, cy = frame.h / 2;
    const imgX = (cx - pos.x) / ds0;
    const imgY = (cy - pos.y) / ds0;
    setScale(v);
    setPos(clamp(cx - imgX * ds1, cy - imgY * ds1, natural.w * ds1, natural.h * ds1));
  };

  const buildCroppedOutput = () => {
    const img = imgRef.current;
    if (!img || !natural.w || !natural.h || !frame.w) return imageSrc;
    // sample at full 1:1 source pixel density — keeps "original resolution,
    // never downscaled" while actually applying what the grid frames,
    // instead of passing the untouched original through regardless of any
    // pan/zoom (which made the grid and drag/zoom purely cosmetic before).
    const sx = Math.max(0, (-pos.x) / dispScale);
    const sy = Math.max(0, (-pos.y) / dispScale);
    let sw = frame.w / dispScale;
    let sh = frame.h / dispScale;
    sw = Math.min(sw, natural.w - sx);
    sh = Math.min(sh, natural.h - sy);
    if (sw <= 0 || sh <= 0) return imageSrc;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw));
    canvas.height = Math.max(1, Math.round(sh));
    try {
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.95);
    } catch {
      return imageSrc;
    }
  };
  const handleAdd = () => onAdd(buildCroppedOutput());

  if (!imageSrc) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm animate-fade-in" />
      <div className="relative w-full max-w-md px-6 flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between w-full mb-5">
          <button onClick={onCancel} className="touch-44 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
            <X className="w-5 h-5 text-white" />
          </button>
          <h3 className="text-sm font-semibold text-white lowercase">photo {index + 1} of {total}</h3>
          <button onClick={handleAdd} className="touch-44 w-10 h-10 rounded-full bg-white flex items-center justify-center">
            <Check className="w-5 h-5 text-black" strokeWidth={3} />
          </button>
        </div>

        <div
          ref={frameRef}
          className="relative overflow-hidden bg-black/40 touch-none"
          style={{ width: frame.w, height: frame.h, borderRadius: '1.25rem', touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          {natural.w > 0 && (
            <img
              ref={imgRef}
              src={imageSrc}
              alt=""
              draggable={false}
              className="absolute select-none pointer-events-none"
              style={{ width: natural.w * dispScale, height: natural.h * dispScale, transform: `translate(${pos.x}px, ${pos.y}px)` }}
            />
          )}
          <div className="absolute inset-0 pointer-events-none z-10">
            <div className="absolute top-0 bottom-0" style={{ left: '33.333%', width: 1, background: 'rgba(255,255,255,0.3)' }} />
            <div className="absolute top-0 bottom-0" style={{ left: '66.666%', width: 1, background: 'rgba(255,255,255,0.3)' }} />
            <div className="absolute left-0 right-0" style={{ top: '33.333%', height: 1, background: 'rgba(255,255,255,0.3)' }} />
            <div className="absolute left-0 right-0" style={{ top: '66.666%', height: 1, background: 'rgba(255,255,255,0.3)' }} />
          </div>
          {interacting && <div className="absolute inset-0 bg-black/30 pointer-events-none z-20" />}
        </div>

        <div className="w-full mt-6 flex items-center gap-3">
          <ZoomIn className="w-4 h-4 text-white/70 shrink-0" />
          <input type="range" min={1} max={5} step={0.01} value={scale} onChange={(e) => onSlider(parseFloat(e.target.value))} className="flex-1 accent-white" />
        </div>
        <div className="flex items-center gap-2 mt-4">
          <button onClick={onSkip} className="touch-44 px-4 h-11 rounded-xl bg-white/10 text-white text-sm font-medium lowercase flex items-center gap-1">
            skip <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={handleAdd} className="touch-44 px-5 h-11 rounded-xl bg-white text-black text-sm font-medium lowercase flex items-center gap-1">
            <Check className="w-4 h-4" /> add
          </button>
        </div>
        <p className="text-[11px] text-white/50 lowercase mt-3">original quality · pinch to zoom · drag to move</p>
      </div>
    </div>
  );
}