import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import FolderCard from './FolderCard';
import ItemBlock from './ItemBlock';
import { BLOCK_SIZES } from '@/lib/store';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

// row-flow layout: every card keeps its own pixel width + height and lines
// up left-to-right in order, wrapping to a new row when it doesn't fit —
// so cards never overlap, resizing one card reflows the rest, and any of
// the four edges can be dragged freely (no column snapping, no glitch).
// defaults still derive from the stored aspect/span so existing cards keep
// their look until resized. (see packSkyline() below for why this isn't
// an actual skyline packer anymore.)
const GAP = 8;
const H_MARGIN = 3;
const MIN_W = 120;
const MAX_W = 1000;
const MIN_H = 90;
const MAX_H = 760;
// "emphasized decelerate" easing — glides to a stop instead of the linear/
// ease curves that read as a snap. used for every auto-shift and the
// drop-settle animation.
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const DURATION = 260; // ms

function parseRatio(r) {
  if (!r) return 3 / 4;
  const parts = String(r).split('/').map((s) => Number(s.trim()));
  if (parts.length !== 2 || !parts[0] || !parts[1]) return 3 / 4;
  return parts[0] / parts[1];
}

// row-flow layout: items are placed strictly in order, left-to-right,
// wrapping to a new row once the running width would exceed the
// container — like a plain flex-wrap row, not a skyline packer.
//
// this replaces a skyline bin-packer that used to decide each item's
// position by "lowest available Y anywhere in the grid" rather than "next
// to its neighbours in the order array." that's an optimal-packing
// strategy, not a predictable one: once blocks had different heights,
// reordering the array didn't reliably move a block to where it was
// visually dropped — the packer could reflow it to some other gap
// entirely. that mismatch between "the order changed" and "the block
// visually moved" is what made dragging look like it only ever worked in
// one direction, refused to land between two blocks, or landed somewhere
// unrelated to the drop point. with row-flow, order IS visual position by
// construction, so there's nothing left to surprise the reorder logic.
function packSkyline(items, containerW) {
  const W = Math.max(1, containerW);
  const placed = [];
  let x = 0, y = 0, rowH = 0;
  for (const it of items) {
    const w = Math.max(MIN_W, Math.min(it.w, W));
    if (x > 0 && x + w > W + 0.5) {
      y += rowH + GAP;
      x = 0;
      rowH = 0;
    }
    placed.push({ id: it.id, x, y, w, h: it.h });
    x += w + GAP;
    if (it.h > rowH) rowH = it.h;
  }
  return placed;
}

export default function MasonryGrid({ folders, editMode, onResize, onReorder, onOpen, onMenu }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  const dragRef = useRef(null);
  const extraHRef = useRef(0);
  const [, force] = useState(0);
  const rerender = () => force((x) => x + 1);
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  // order changes while actively dragging are visual-only (this state) —
  // NOT written to storage on every pointer move. previously every reorder
  // tick called onResize() once per folder, each doing a full localStorage
  // read+write plus a full-page refresh — dozens of times a second while
  // dragging. that heavy synchronous work on every tick is what actually
  // made drags feel snappy/janky and, worse, could cause pointer events to
  // get processed against a stale folder list mid-drag. now the live order
  // only lives here until the drag ends, and gets written to storage once.
  const [liveOrder, setLiveOrder] = useState(null); // { [folderId]: order } | null
  const liveOrderRef = useRef(liveOrder);
  liveOrderRef.current = liveOrder;
  const pendingCommitRef = useRef(null);

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
    const order = (liveOrder && liveOrder[f.id] != null) ? liveOrder[f.id] : (f.order != null ? f.order : idx);
    return { id: f.id, w: Math.max(MIN_W, Math.min(MAX_W, w)), h: Math.max(MIN_H, Math.min(MAX_H, h)), order };
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

  // hit-testing in onMove needs the SAME coordinate space the pointer is
  // measured in (relative to the container, i.e. including the horizontal
  // margin) — using the pre-margin `placed` here silently offset every
  // target rect by H_MARGIN, on top of the missing-id bug above.
  const placedRef = useRef(placedM); placedRef.current = placedM;

  // packItems only carries packing geometry (id/w/h/order) for the skyline
  // math — look the real folder record back up by id so the card/item block
  // gets its actual name/color/items/isItemBlock instead of the stripped
  // packing object.
  const foldersById = {};
  folders.forEach((fl) => { foldersById[fl.id] = fl; });
  const foldersRef = useRef(folders); foldersRef.current = folders;

  const settleTimeoutRef = useRef(null);

  const onMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d || d.mode === 'settling') return;
    const rect = ref.current.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    if (d.mode === 'move') {
      // the held block follows the pointer 1:1 from its captured drag-start
      // position (originX/originY, set once in onBodyDown) — NOT from its
      // live packed slot, which changes every time the order below causes a
      // reflow. tracking the live slot was the reason the dragged block
      // itself used to jump around mid-drag instead of gliding smoothly:
      // every reorder shifted its "base" position out from under the
      // pointer offset. other (non-dragged) blocks still animate into their
      // new slots via the transition set at render time.
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      dragRef.current = { ...d, lastX: e.clientX, lastY: e.clientY, dx, dy };
      rerender();
      const cur = placedRef.current;
      const others = cur.filter((p) => p.id !== d.id);
      const maxBottom = others.reduce((m, p) => Math.max(m, p.y + p.h), 0);
      // extra scroll room appears as soon as you drag past the last block,
      // so there's always somewhere to drop below everything, however far
      // down you drag.
      extraHRef.current = localY > maxBottom ? Math.max(0, localY - maxBottom + 100) : 0;
      const all = foldersRef.current;

      if (!others.length) return;

      // hit-test the block whose rect the pointer is actually inside first.
      // this is the fix for reordering only ever working right-to-left:
      // picking whichever block's *center* was nearest broke down as soon
      // as blocks had different sizes, since a wide block's center can sit
      // far from a pointer that's still plainly hovering over it — a
      // smaller, closer-centered neighbour kept winning instead, so hovering
      // rightward onto a wide block never actually targeted it. falling
      // back to nearest-center only when the pointer isn't over any block
      // (i.e. it's in a gap/margin) keeps "drop in the gap between two
      // blocks" working too.
      let target = null;
      for (const p of others) {
        if (localX >= p.x && localX <= p.x + p.w && localY >= p.y && localY <= p.y + p.h) { target = p; break; }
      }
      if (!target) {
        let bestDist = Infinity;
        for (const p of others) {
          const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
          const dist = Math.hypot(localX - cx, localY - cy);
          if (dist < bestDist) { bestDist = dist; target = p; }
        }
      }
      // below everything: always goes to the very end, regardless of which
      // block happens to be nearest — this is what makes "slide down to fit
      // below the last block" work reliably.
      if (localY > maxBottom) target = null;

      const ids = all.map((f) => f.id);
      const orders = all.map((f, i) => {
        const lo = liveOrderRef.current;
        return (lo && lo[f.id] != null) ? lo[f.id] : (f.order != null ? f.order : i);
      });
      const sorted = ids.map((id, i) => ({ id, o: orders[i] })).sort((a, b) => a.o - b.o).map((s) => s.id);
      const fromIdx = sorted.indexOf(d.id);
      if (fromIdx < 0) return;

      let insertAt;
      if (target === null) {
        insertAt = sorted.length; // one-past-the-end — "after the last element", not "at" it
      } else {
        // crossing the midpoint of the target block (horizontally when
        // roughly in its row — supports left-to-right AND right-to-left
        // equally since it's a plain x-comparison; vertically otherwise —
        // supports top-to-bottom AND bottom-to-top, triggering exactly at
        // the 50% mark) is what decides before/after. diagonal drags are
        // just whichever axis currently applies, so hovering any direction,
        // including diagonally, onto any block works the same way.
        const sameRow = localY > target.y - target.h * 0.15 && localY < target.y + target.h * 1.15;
        const before = sameRow
          ? localX < target.x + target.w / 2
          : localY < target.y + target.h / 2;
        insertAt = sorted.indexOf(target.id);
        if (!before) insertAt += 1;
      }
      sorted.splice(fromIdx, 1);
      if (insertAt > fromIdx) insertAt -= 1; // account for the removal shifting later indices down
      insertAt = Math.max(0, Math.min(sorted.length, insertAt));
      if (insertAt === d.lastInsert) return;
      sorted.splice(insertAt, 0, d.id);
      const map = {};
      sorted.forEach((id, i) => { map[id] = i; });
      dragRef.current = { ...dragRef.current, lastInsert: insertAt };
      // visual-only for the rest of the drag — see the liveOrder comment at
      // the top of the component. persisted once, in onUp, when the drag
      // actually ends.
      pendingCommitRef.current = map;
      setLiveOrder(map);
      return;
    }
    // resize: the dragged edge follows the pointer 1:1, no transition —
    // direct manual feedback, unrelated to the reorder/settle animation.
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
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (d && d.mode === 'resize') {
      onResizeRef.current(d.id, { w: d.w, h: d.h });
      dragRef.current = null;
      extraHRef.current = 0;
      rerender();
      return;
    }
    if (d && d.mode === 'move') {
      // don't snap the instant the pointer lifts — that hard cut (dragged
      // block's pointer-follow offset vanishing at the exact same moment
      // its slot could also be changing) is what made every drop feel like
      // a snap. instead animate from wherever the pointer left it into the
      // final packed slot, then clear drag state once that settle finishes.
      dragRef.current = { ...d, mode: 'settling' };
      extraHRef.current = 0;
      rerender();
      // persist the final order exactly once here — not on every drag tick
      // (see the liveOrder comment above) — then let the parent's refreshed
      // `folders` prop take over once liveOrder is cleared below.
      if (pendingCommitRef.current) {
        const map = pendingCommitRef.current;
        pendingCommitRef.current = null;
        if (onReorderRef.current) onReorderRef.current(map);
        else foldersRef.current.forEach((f) => { if (map[f.id] != null) onResizeRef.current(f.id, { order: map[f.id] }); });
      }
      clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = setTimeout(() => {
        dragRef.current = null;
        setLiveOrder(null);
        rerender();
      }, DURATION + 20);
      return;
    }
    dragRef.current = null;
    extraHRef.current = 0;
    rerender();
  }, [onMove]);

  useEffect(() => () => {
    clearTimeout(settleTimeoutRef.current);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }, [onMove, onUp]);

  const onHandleDown = (e, edge, f, cardW, cardH) => {
    e.stopPropagation();
    e.preventDefault();
    clearTimeout(settleTimeoutRef.current);
    dragRef.current = { id: f.id, mode: 'resize', edge, startX: e.clientX, startY: e.clientY, startW: cardW, startH: cardH, w: cardW, h: cardH };
    rerender();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onBodyDown = (e, f, p) => {
    e.stopPropagation();
    e.preventDefault();
    clearTimeout(settleTimeoutRef.current);
    // capture this block's current on-screen slot once, at drag-start — the
    // dragged block tracks the pointer from this fixed origin for the whole
    // drag (see onMove), instead of from its live packed slot.
    dragRef.current = { id: f.id, mode: 'move', startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, dx: 0, dy: 0, originX: p.x, originY: p.y };
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
        const d = dragRef.current;
        const isDraggingThis = !!d && d.id === f.id && d.mode === 'move';
        const isSettlingThis = !!d && d.id === f.id && d.mode === 'settling';
        const isResizingThis = !!d && d.id === f.id && d.mode === 'resize';

        // during resize, size the box from the live drag values directly —
        // not the packer's in-progress recomputed position, which re-runs on
        // every pixel of a resize and can momentarily collapse this item's
        // box, making the card vanish while the (independently positioned)
        // arrow handles stay put.
        const boxW = isResizingThis ? d.w : p.w;
        const boxH = isResizingThis ? d.h : p.h;
        // resizing via the left/top edge grows width/height from a fixed
        // top-left anchor by default, which means the box only ever expands
        // to the right/down regardless of which edge you drag — so pulling
        // the LEFT handle further left (or TOP handle further up) visually
        // did nothing in that direction. Shifting the rendered position by
        // the size delta keeps the *opposite* edge fixed and lets the
        // dragged edge actually follow the pointer, both directions, on
        // every edge.
        const boxX = isResizingThis && d.edge === 'left' ? p.x - (boxW - d.startW) : p.x;
        const boxY = isResizingThis && d.edge === 'top' ? p.y - (boxH - d.startH) : p.y;

        // positioning: every card sits at (0,0) with its real position
        // applied via transform — this lets us animate a single `transform`
        // property consistently for both auto-shifts (other cards) and the
        // drop-settle (this card), instead of mixing transform (drag) with
        // left/top (layout) which is what caused the visible snap at the
        // moment a drag ended.
        let renderX = boxX, renderY = boxY, transition;
        if (isDraggingThis) {
          // pure 1:1 pointer tracking from the captured drag-start slot.
          renderX = d.originX + (d.dx || 0);
          renderY = d.originY + (d.dy || 0);
          transition = 'none';
        } else if (isResizingThis) {
          transition = 'none'; // direct manual feedback while actively resizing
        } else if (isSettlingThis) {
          transition = `transform ${DURATION}ms ${EASE}`; // glide from drop point into its slot
        } else {
          transition = `transform ${DURATION}ms ${EASE}, width ${DURATION}ms ${EASE}, height ${DURATION}ms ${EASE}`;
        }

        return (
          <div
            key={f.id}
            className={`absolute top-0 left-0 ${isDraggingThis || isSettlingThis ? 'shadow-2xl' : ''}`}
            style={{
              width: boxW,
              height: boxH,
              zIndex: isDraggingThis ? 30 : isSettlingThis ? 25 : undefined,
              transform: `translate(${renderX}px, ${renderY}px)`,
              transition,
            }}
          >
            <div onPointerDown={editMode ? (e) => onBodyDown(e, f, p) : undefined} className={editMode ? 'w-full h-full cursor-move' : 'w-full h-full'} style={{ touchAction: editMode ? 'none' : undefined }}>
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