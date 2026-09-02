import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Check, X, ZoomIn } from 'lucide-react';

// instagram-style cropper: drag to pan, pinch (two fingers) or slider to zoom.
// pinch zooms toward the finger midpoint (the pinched corner), not toward a corner
// of the frame — so zooming enlarges the area under your fingers instead of
// stretching/elongating the image. output samples the visible region at source
// resolution (never upscaled), so the image is never stretched or compressed.
export default function CropModal({ imageSrc, aspect = 1, round = false, maxSize = 1600, quality = 0.92, onSave, onCancel }) {
  const imgRef = useRef(null);
  const imgElRef = useRef(null);
  const frameRef = useRef(null);
  const wrapRef = useRef(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      imgRef.current = img;
    };
    img.src = imageSrc;
  }, [imageSrc]);

  useEffect(() => {
    const fit = () => {
      const el = wrapRef.current;
      const avail = el ? el.getBoundingClientRect().width : Math.min(window.innerWidth - 48, 340);
      const maxW = Math.min(avail, 340);
      const maxH = Math.min(window.innerHeight * 0.45, 340);
      // frame is locked to the CHOSEN orientation's aspect ratio (the aspect
      // prop) — not the photo's own shape. This was the actual squeezing
      // bug: with frame previously forced to match the photo's own aspect,
      // contain vs cover never mattered (they're identical when the box and
      // photo already share the same shape), so an entirely different photo
      // shape than the target orientation would get its frame silently
      // reshaped to match the photo instead of the photo being cropped to
      // fit the intended block orientation.
      let w = maxW;
      let h = w / aspect;
      if (h > maxH) { h = maxH; w = h * aspect; }
      setFrame({ w, h });
    };
    fit();
    const el = wrapRef.current;
    if (el && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(fit);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [aspect]);

  // COVER behaviour (fill the whole frame, crop the excess) — not contain —
  // so the photo always fills the chosen-orientation frame completely at
  // scale 1, with anything that doesn't fit the shape cut off rather than
  // letterboxed. Math.max (not Math.min) is the whole fix here.
  const fitScale = natural.w && natural.h && frame.w ? Math.max(frame.w / natural.w, frame.h / natural.h) : 1;

  const clamp = useCallback((x, y, imgW, imgH) => {
    // photo-bounded: never let the frame show empty space outside the picture.
    let minX, maxX, minY, maxY;
    if (imgW >= frame.w) { minX = frame.w - imgW; maxX = 0; }
    else { minX = 0; maxX = Math.max(0, frame.w - imgW); }
    if (imgH >= frame.h) { minY = frame.h - imgH; maxY = 0; }
    else { minY = 0; maxY = Math.max(0, frame.h - imgH); }
    return { x: Math.min(maxX, Math.max(minX, x)), y: Math.min(maxY, Math.max(minY, y)) };
  }, [frame]);

  // keep the picture filling the frame whenever size/scale changes
  useEffect(() => {
    if (!natural.w || !frame.w) return;
    const ds = fitScale * scale;
    setPos((p) => clamp(p.x, p.y, natural.w * ds, natural.h * ds));
  }, [natural, frame, scale, fitScale, clamp]);

  const localMid = () => {
    const rect = frameRef.current.getBoundingClientRect();
    const [a, b] = [...pointers.current.values()];
    return { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
  };

  const onPointerDown = (e) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        startScale: scale,
        startPos: { ...pos },
        mid0: localMid(),
      };
      drag.current = null;
    } else if (pointers.current.size === 1) {
      drag.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    }
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };

  const onPointerMove = (e) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinch.current && pointers.current.size >= 2) {
      e.preventDefault(); // some mobile browsers still contest native
      // pinch-zoom on the page during a two-finger gesture even with
      // touch-action:none set, unless the event itself is also prevented.
      const ds0 = fitScale * pinch.current.startScale;
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const newScale = Math.min(4, Math.max(1, pinch.current.startScale * (dist / pinch.current.startDist)));
      const ds1 = fitScale * newScale;
      const mid = localMid();
      // image-space point that sat under the initial midpoint
      const imgX = (pinch.current.mid0.x - pinch.current.startPos.x) / ds0;
      const imgY = (pinch.current.mid0.y - pinch.current.startPos.y) / ds0;
      // keep that same image point under the current midpoint (zoom-toward-fingers)
      const nx = mid.x - imgX * ds1;
      const ny = mid.y - imgY * ds1;
      setScale(newScale);
      setPos(clamp(nx, ny, natural.w * ds1, natural.h * ds1));
      return;
    }
    if (drag.current && pointers.current.size === 1) {
      const dx = e.clientX - drag.current.startX;
      const dy = e.clientY - drag.current.startY;
      const ds = fitScale * scale;
      setPos(clamp(drag.current.origX + dx, drag.current.origY + dy, natural.w * ds, natural.h * ds));
    }
  };

  const endPointer = (e) => {
    pointers.current.delete(e.pointerId);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };

  // slider zooms toward the frame centre (not the top-left corner)
  const onSlider = (v) => {
    if (!natural.w || !frame.w) { setScale(v); return; }
    const ds0 = fitScale * scale;
    const ds1 = fitScale * v;
    const cx = frame.w / 2, cy = frame.h / 2;
    const imgX = (cx - pos.x) / ds0;
    const imgY = (cy - pos.y) / ds0;
    setScale(v);
    setPos(clamp(cx - imgX * ds1, cy - imgY * ds1, natural.w * ds1, natural.h * ds1));
  };

  const handleSave = () => {
    // draw from the already-decoded displayed image so the user's crop always
    // survives (previously a not-yet-loaded in-memory image fell back to the
    // raw, un-cropped source — so the crop "didn't stay").
    const img = imgElRef.current || imgRef.current;
    const nw = (img && img.naturalWidth) || natural.w;
    const nh = (img && img.naturalHeight) || natural.h;
    if (!img || !nw || !nh) { onSave?.(imageSrc); return; }
    const ds = fitScale * scale;
    let sx = (-pos.x) / ds;
    let sy = (-pos.y) / ds;
    let sw = frame.w / ds;
    let sh = frame.h / ds;
    sw = Math.min(sw, nw - sx);
    sh = Math.min(sh, nh - sy);
    if (sw <= 0 || sh <= 0) {
      // fall back to a centred crop of the full image at the target aspect
      sw = nw; sh = nw / aspect;
      if (sh > nh) { sh = nh; sw = nh * aspect; }
      sx = (nw - sw) / 2; sy = (nh - sh) / 2;
    }
    sx = Math.max(0, sx);
    sy = Math.max(0, sy);
    let outW = sw;
    let outH = sh;
    if (Math.max(outW, outH) > maxSize) {
      const r = maxSize / Math.max(outW, outH);
      outW = Math.round(outW * r);
      outH = Math.round(outH * r);
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(outW));
    canvas.height = Math.max(1, Math.round(outH));
    try {
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      onSave?.(canvas.toDataURL('image/jpeg', quality));
    } catch {
      onSave?.(imageSrc);
    }
  };

  if (!imageSrc) return null;

  const dispScale = fitScale * scale;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fade-in" />
      <div ref={wrapRef} className="relative w-full max-w-md px-6 flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
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
          style={{ width: frame.w, height: frame.h, aspectRatio: aspect, borderRadius: round ? '9999px' : '1.25rem', touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          {natural.w > 0 && (
            <img
              ref={imgElRef}
              src={imageSrc}
              alt=""
              draggable={false}
              className="absolute select-none pointer-events-none"
              style={{ width: natural.w * dispScale, height: natural.h * dispScale, transform: `translate(${pos.x}px, ${pos.y}px)` }}
            />
          )}
          {/* rule-of-thirds grid overlay */}
          <div className="absolute inset-0 pointer-events-none z-10">
            <div className="absolute top-0 bottom-0" style={{ left: '33.333%', width: 1, background: 'rgba(255,255,255,0.35)' }} />
            <div className="absolute top-0 bottom-0" style={{ left: '66.666%', width: 1, background: 'rgba(255,255,255,0.35)' }} />
            <div className="absolute left-0 right-0" style={{ top: '33.333%', height: 1, background: 'rgba(255,255,255,0.35)' }} />
            <div className="absolute left-0 right-0" style={{ top: '66.666%', height: 1, background: 'rgba(255,255,255,0.35)' }} />
          </div>
        </div>

        <div className="w-full mt-6 flex items-center gap-3">
          <ZoomIn className="w-4 h-4 text-white/70 shrink-0" />
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={scale}
            onChange={(e) => onSlider(parseFloat(e.target.value))}
            className="flex-1 accent-white"
          />
        </div>
        <p className="text-[11px] text-white/50 lowercase mt-3">magnify to crop · drag to move</p>
      </div>
    </div>
  );
}