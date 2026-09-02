import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import FolderCard from './FolderCard';
import ItemBlock from './ItemBlock';
import { BLOCK_SIZES } from '@/lib/store';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

// freeform skyline packer: every card keeps its own pixel width + height and
// drops onto the lowest available gap on the skyline — so cards never overlap,
// resizing one card reflows the rest, and any of the four edges can be dragged
// freely (no column snapping, no glitch). defaults still derive from the
// stored aspect/span so existing cards keep their look until resized.
const GAP = 14;
const H_MARGIN = 6;
const MIN_W = 120;
const MAX_W = 1000;
const MIN_H = 90;
const MAX_H = 760;

function parseRatio(r) {
  if (!r) return 3 / 4;
  const parts = String(r).split('/').map((s) => Number(s.trim()));
  if (parts.length !== 2 || !parts[0] || !parts[1]) return 3 / 4;
  return parts[0] / parts[1];
}

// skyline bottom-left bin packing — returns [{x,y,w,h}] for each item, in order.
function packSkyline(items, containerW) {
  const W = Math.max(1, containerW);
  let sky = [{ x1: 0, x2: W, y: 0 }];
  const placed = [];
  for (const it of items) {
    let w = Math.max(MIN_W, Math.min(it.w, W));
    let best = null;
    for (let i = 0; i < sky.length; i++) {
      const left = sky[i].x1;
      const right = left + w;
      if (right > W + 0.5) continue;
      let y = 0;
      for (const s of sky) {
        if (s.x2 <= left || s.x1 >= right) continue;
        if (s.y > y) y = s.y;
      }
      if (!best || y < best.y) best = { x: left, y };
    }
    if (!best) { best = { x: 0, y: sky.reduce((m, s) => Math.max(m, s.y), 0) }; w = W; }
    placed.push({ x: best.x, y: best.y, w, h: it.h });
    const top = best.y + it.h + GAP;
    const next = [];
    for (const s of sky) {
      if (s.x2 <= best.x || s.x1 >= best.x + w) { next.push(s); continue; }
      if (s.x1 < best.x) next.push({ x1: s.x1, x2: best.x, y: s.y });
      if (s.x2 > best.x + w) next.push({ x1: best.x + w, x2: s.x2, y: s.y });
      next.push({ x1: Math.max(s.x1, best.x), x2: Math.min(s.x2, best.x + w), y: top });
    }
    next.sort((a, b) => a.x1 - b.x1);
    const merged = [];
    for (const s of next) {
      const last = merged[merged.length - 1];
      if (last && last.x2 === s.x1 && last.y === s.y) merged[merged.length - 1] = { x1: last.x1, x2: s.x2, y: s.y };
      else merged.push(s);
    }
    sky = merged;
  }
  return placed;
}

export default function MasonryGrid({ folders, editMode, onResize, onOpen, onMenu }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  const dragRef = useRef(null);
  const extraHRef = useRef(0);
  const [, force] = useState(0);
  const rerender = () => force((x) => x + 1);
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  useLayoutEffect(() => {
    if (!ref.current) return;
    setWidth(ref.current.clientWidth);
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const columns = width < 640 ? 2 : width < 1024 ? 3 : 4;
  // blocks pack edge-to-edge in the skyline; placedM adds the horizontal margins
  // afterwards, so the column width is the full width divided by columns.
  const colW = width > 0 ? width / columns : 0;

  const items = folders.map((f, idx) => {
    const sz = BLOCK_SIZES.find((s) => s.id === (f.size || 'portrait'));
    const aspect = f.aspect || parseRatio(sz ? sz.ratio : '3/4');
    const span = f.span === 2 && width >= 2 * MIN_W ? 2 : 1;
    const defW = span === 2 ? Math.min(width, 2 * colW) : colW;
    const w = f.w != null ? Math.max(MIN_W, Math.min(width || defW, f.w)) : defW;
    const h = f.h != null ? f.h : (defW > 0 ? defW / aspect : 300);
    return { id: f.id, w: Math.max(MIN_W, Math.min(MAX_W, w)), h: Math.max(MIN_H, Math.min(MAX_H, h)), order: f.order != null ? f.order : idx };
  });

  const packItems = items.slice().sort((a, b) => a.order - b.order);
  if (dragRef.current && dragRef.current.mode === 'resize') {
    const idx = packItems.findIndex((it) => it.id === dragRef.current.id);
    if (idx >= 0) packItems[idx] = { ...packItems[idx], w: dragRef.current.w, h: dragRef.current.h };
  }

  const placed = width > 0 ? packSkyline(packItems, width) : [];
  // add horizontal margin so blocks never touch the viewport edge or each other
  const placedM = placed.map((p) => ({ ...p, x: p.x + H_MARGIN, w: Math.max(MIN_W, p.w - 2 * H_MARGIN) }));
  const totalH = placedM.reduce((m, p) => Math.max(m, p.y + p.h), 0) + extraHRef.current;

  const placedRef = useRef(placed); placedRef.current = placed;

  // packItems only carries packing geometry (id/w/h/order) for the skyline
  // math — look the real folder record back up by id so the card/item block
  // gets its actual name/color/items/isItemBlock instead of the stripped
  // packing object.
  const foldersById = {};
  folders.forEach((fl) => { foldersById[fl.id] = fl; });
  const foldersRef = useRef(folders); foldersRef.current = folders;

  const onMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    const rect = ref.current.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    if (d.mode === 'move') {
      // the held block follows the finger (delta transform) while others auto-shift
      // (insert-and-shift reorder). on release the block settles into its new
      // slot. lastInsert avoids jitter on repeated moves. pointer coords are
      // converted to the grid's own space so hover/insert detection matches the
      // packed layout (no viewport-offset drift, no blocks vanishing).
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      dragRef.current = { ...d, lastX: e.clientX, lastY: e.clientY, dx, dy };
      rerender();
      const cur = placedRef.current;
      const maxBottom0 = cur.reduce((m, p) => Math.max(m, p.y + p.h), 0);
      extraHRef.current = localY > maxBottom0 ? Math.max(0, localY - maxBottom0 + 100) : 0;
      const all = foldersRef.current;
      const over = cur.find((p) => p.id !== d.id && localX >= p.x && localX <= p.x + p.w && localY >= p.y && localY <= p.y + p.h);
      if (over) {
        const ids = all.map((f) => f.id);
        const orders = all.map((f, i) => f.order != null ? f.order : i);
        const sorted = ids.map((id, i) => ({ id, o: orders[i] })).sort((a, b) => a.o - b.o).map((s) => s.id);
        const fromIdx = sorted.indexOf(d.id);
        if (fromIdx >= 0) {
          sorted.splice(fromIdx, 1);
          const above = localY < over.y + over.h / 2;
          let insertAt = sorted.indexOf(over.id);
          if (!above) insertAt += 1;
          if (insertAt === d.lastInsert) return;
          sorted.splice(insertAt, 0, d.id);
          const map = {};
          sorted.forEach((id, i) => { map[id] = i; });
          dragRef.current = { ...dragRef.current, lastInsert: insertAt };
          all.forEach((f) => onResizeRef.current(f.id, { order: map[f.id] }));
        }
      } else {
        // empty space below all blocks → send the held block to the end so it
        // settles at the bottom (free space below). lastInsert guards jitter.
        const maxBottom = cur.reduce((m, p) => Math.max(m, p.y + p.h), 0);
        if (localY > maxBottom) {
          const ids = all.map((f) => f.id);
          const orders = all.map((f, i) => f.order != null ? f.order : i);
          const sorted = ids.map((id, i) => ({ id, o: orders[i] })).sort((a, b) => a.o - b.o).map((s) => s.id);
          const fromIdx = sorted.indexOf(d.id);
          if (fromIdx >= 0 && fromIdx !== sorted.length - 1) {
            sorted.splice(fromIdx, 1);
            sorted.push(d.id);
            const map = {};
            sorted.forEach((id, i) => { map[id] = i; });
            dragRef.current = { ...dragRef.current, lastInsert: sorted.length - 1 };
            all.forEach((f) => onResizeRef.current(f.id, { order: map[f.id] }));
          }
        }
      }
      return;
    }
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    let nw = d.startW;
    let nh = d.startH;
    if (d.edge === 'right') nw = d.startW + dx;
    else if (d.edge === 'left') nw = d.startW - dx;
    else if (d.edge === 'bottom') nh = d.startH + dy;
    else if (d.edge === 'top') nh = d.startH - dy;
    nw = Math.max(MIN_W, Math.min(width - 2 * H_MARGIN, nw));
    nh = Math.max(MIN_H, Math.min(MAX_H, nh));
    dragRef.current = { ...d, w: nw, h: nh };
    rerender();
  }, [width]);

  const onUp = useCallback(() => {
    const d = dragRef.current;
    if (d && d.mode === 'resize') onResizeRef.current(d.id, { w: d.w, h: d.h });
    dragRef.current = null;
    extraHRef.current = 0;
    rerender();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }, [onMove]);

  const onHandleDown = (e, edge, f, cardW, cardH) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = { id: f.id, mode: 'resize', edge, startX: e.clientX, startY: e.clientY, startW: cardW, startH: cardH, w: cardW, h: cardH };
    rerender();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onBodyDown = (e, f) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = { id: f.id, mode: 'move', startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY };
    rerender();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (!folders.length) return <div ref={ref} />;

  const Handle = ({ edge, cls, Icon, item }) => (
    <div
      onPointerDown={(e) => onHandleDown(e, edge, item.f, item.w, item.h)}
      className={`touch-44 absolute ${cls} w-5 h-5 rounded-lg bg-background/90 border border-border shadow flex items-center justify-center`}
      style={{ touchAction: 'none' }}
    >
      <Icon className="w-3 h-3 text-foreground" />
    </div>
  );

  return (
    <div ref={ref} className="relative" style={{ height: totalH, marginLeft: -H_MARGIN, marginRight: -H_MARGIN }}>
      {placedM.map((p, i) => {
        const f = packItems[i];
        const full = foldersById[f.id] || f;
        const isDraggingThis = dragRef.current && dragRef.current.id === f.id;
        const isResizingThis = isDraggingThis && dragRef.current.mode === 'resize';
        // during resize, size the box from the live drag values directly —
        // not the packer's in-progress recomputed position, which re-runs on
        // every pixel of a resize and can momentarily collapse this item's
        // box, making the card vanish while the (independently positioned)
        // arrow handles stay put.
        const boxW = isResizingThis ? dragRef.current.w : p.w;
        const boxH = isResizingThis ? dragRef.current.h : p.h;
        // resizing via the left/top edge grows width/height from a fixed
        // top-left anchor by default, which means the box only ever expands
        // to the right/down regardless of which edge you drag — so pulling
        // the LEFT handle further left (or TOP handle further up) visually
        // did nothing in that direction. Shifting the rendered position by
        // the size delta keeps the *opposite* edge fixed and lets the
        // dragged edge actually follow the pointer, both directions, on
        // every edge.
        const boxX = isResizingThis && dragRef.current.edge === 'left' ? p.x - (boxW - dragRef.current.startW) : p.x;
        const boxY = isResizingThis && dragRef.current.edge === 'top' ? p.y - (boxH - dragRef.current.startH) : p.y;
        return (
          <div key={f.id} className={`absolute ${isDraggingThis ? 'shadow-2xl' : ''}`} style={{ left: boxX, top: boxY, width: boxW, height: boxH, zIndex: isDraggingThis ? 30 : undefined, transform: isDraggingThis && dragRef.current.mode === 'move' ? `translate(${dragRef.current.dx || 0}px, ${dragRef.current.dy || 0}px)` : undefined, transition: isDraggingThis ? 'none' : 'left 0.18s ease, top 0.18s ease, width 0.18s ease, height 0.18s ease' }}>
            <div onPointerDown={editMode ? (e) => onBodyDown(e, f) : undefined} className={editMode ? 'w-full h-full cursor-move' : 'w-full h-full'} style={{ touchAction: editMode ? 'none' : undefined }}>
              {full.isItemBlock ? (
                <ItemBlock folder={full} onClick={editMode ? undefined : () => onOpen(f.id)} onMenu={editMode ? undefined : () => onMenu(full)} />
              ) : (
                <FolderCard fill folder={full} onClick={editMode ? undefined : () => onOpen(f.id)} onMenu={editMode ? undefined : () => onMenu(full)} />
              )}
            </div>
            {editMode && (
              <>
                <Handle edge="top" cls="top-1 left-1/2 -translate-x-1/2" Icon={ChevronUp} item={{ f, ...p }} />
                <Handle edge="bottom" cls="bottom-1 left-1/2 -translate-x-1/2" Icon={ChevronDown} item={{ f, ...p }} />
                <Handle edge="left" cls="left-1 top-1/2 -translate-y-1/2" Icon={ChevronLeft} item={{ f, ...p }} />
                <Handle edge="right" cls="right-1 top-1/2 -translate-y-1/2" Icon={ChevronRight} item={{ f, ...p }} />
              </>
            )}
          </div>
        );
      })}
      {dragRef.current && dragRef.current.mode === 'resize' && (
        <div className="absolute left-0 right-0 pointer-events-none" style={{ top: totalH - 1, height: 2, background: 'hsl(var(--foreground))' }} />
      )}
    </div>
  );
}