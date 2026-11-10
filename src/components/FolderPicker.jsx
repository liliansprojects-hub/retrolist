import React, { useState, useEffect, useMemo } from 'react';
import { X, Folder as FolderIcon, Home, Check } from 'lucide-react';
import { getFolders, canHold } from '@/lib/store';
import { cn } from '@/lib/utils';

// Destination picker for move / copy.
//  - laid out as a tree: main page first, then folders A→Z, sub-folders indented under their parent
//  - ineligible destinations stay visible but greyed out, with the reason beside them
//  - folders can only go into folders (or the main page); items may stand alone on the main page or sit in a folder
//  - a folder can't go into itself or anything inside it
// tap a destination to select it, then confirm with the button at the bottom.
//
// props: kind 'folder' | 'item' · mode 'move' | 'copy'
//   movingFolderIds   folders being moved/copied (their own subtree is greyed out)
//   currentContainerId  folder the thing is in now (null = main page)
//   currentIsRoot     true when it is currently on the main page
export default function FolderPicker({
  open, onClose, onSelect, title = 'move to', kind = 'folder', mode = 'move',
  movingFolderIds = [], currentContainerId = null, currentIsRoot = false,
}) {
  const [folders, setFolders] = useState([]);
  const [chosen, setChosen] = useState(undefined); // undefined = nothing, null = main page
  useEffect(() => { if (open) { setFolders(getFolders().filter((f) => !f.isItemBlock)); setChosen(undefined); } }, [open]);

  const byParent = useMemo(() => {
    const m = {};
    folders.forEach((f) => { const k = f.parent_id || 'root'; (m[k] = m[k] || []).push(f); });
    Object.values(m).forEach((a) => a.sort((x, y) => (x.name || '').localeCompare(y.name || '')));
    return m;
  }, [folders]);

  // ids that sit inside any folder being moved (greyed: "inside the folder you're moving")
  const insideMoving = useMemo(() => {
    const set = new Set(movingFolderIds);
    let grew = true;
    while (grew) {
      grew = false;
      folders.forEach((f) => { if (f.parent_id && set.has(f.parent_id) && !set.has(f.id)) { set.add(f.id); grew = true; } });
    }
    return set;
  }, [folders, movingFolderIds]);

  if (!open) return null;
  const verb = mode === 'copy' ? 'copy' : 'move';
  const noun = kind === 'item' ? 'item' : 'folder';

  const reasonFor = (f) => {
    if (!canHold(f)) return `can't hold ${noun}s`;
    if (kind === 'folder' && movingFolderIds.includes(f.id)) return `can't ${verb} into itself`;
    if (kind === 'folder' && insideMoving.has(f.id)) return 'inside the folder being moved';
    if (f.id === currentContainerId) return mode === 'copy' ? 'already here' : 'already here';
    return null;
  };
  const mainReason = (mode === 'move' && currentIsRoot) ? 'already on the main page' : null;

  const chosenName = chosen === undefined ? '' : chosen === null ? 'main page' : (folders.find((f) => f.id === chosen)?.name || '');

  const Row = ({ f, depth }) => {
    const reason = reasonFor(f);
    const kids = byParent[f.id] || [];
    const isChosen = chosen === f.id;
    return (
      <div>
        <button
          disabled={!!reason}
          onClick={() => setChosen(f.id)}
          style={{ marginLeft: depth * 16, width: `calc(100% - ${depth * 16}px)` }}
          className={cn(
            'touch-44 flex items-center gap-2 pl-3 pr-3 py-2.5 rounded-xl text-sm lowercase text-left border',
            depth > 0 && 'border-l-2 border-l-border',
            reason ? 'opacity-40 cursor-not-allowed border-transparent bg-muted/40' : isChosen ? 'bg-foreground text-background border-foreground' : 'border-transparent hover:bg-muted',
          )}
        >
          <FolderIcon className="w-4 h-4 shrink-0" style={reason || isChosen ? undefined : { color: f.color || undefined }} />
          <span className="flex-1 min-w-0 truncate">{f.name || 'untitled'}</span>
          {reason ? <span className="text-[10px] shrink-0">{reason}</span> : isChosen ? <Check className="w-4 h-4 shrink-0" /> : <span className="text-[10px] opacity-50 shrink-0">{(f.items || []).length}</span>}
        </button>
        {kids.map((c) => <Row key={c.id} f={c} depth={depth + 1} />)}
      </div>
    );
  };

  const roots = byParent.root || [];
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />
      <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col bg-card rounded-t-3xl sm:rounded-3xl border border-border pt-5 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 flex items-center justify-between mb-1">
          <h3 className="text-base font-semibold lowercase">{title}</h3>
          <button onClick={onClose} className="touch-44 p-1 rounded-full"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <p className="px-5 text-[11px] text-muted-foreground lowercase mb-3">
          {kind === 'item' ? 'items can stand alone on the main page or go in any folder' : 'folders can only go into folders (or the main page)'} · greyed out = not allowed
        </p>
        <div className="px-3 overflow-y-auto no-scrollbar space-y-0.5 pb-3">
          <button
            disabled={!!mainReason}
            onClick={() => setChosen(null)}
            className={cn(
              'touch-44 w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm lowercase text-left border',
              mainReason ? 'opacity-40 cursor-not-allowed border-transparent bg-muted/40' : chosen === null ? 'bg-foreground text-background border-foreground' : 'border-transparent hover:bg-muted',
            )}
          >
            <Home className="w-4 h-4 shrink-0" />
            <span className="flex-1">main page</span>
            {mainReason ? <span className="text-[10px]">{mainReason}</span> : chosen === null ? <Check className="w-4 h-4" /> : null}
          </button>
          {roots.length === 0
            ? <p className="text-sm text-muted-foreground/50 lowercase py-6 text-center">no folders yet</p>
            : roots.map((f) => <Row key={f.id} f={f} depth={0} />)}
        </div>
        <div className="px-5 pt-2 pb-6 border-t border-border">
          <button
            disabled={chosen === undefined}
            onClick={() => onSelect(chosen, chosenName)}
            className="touch-44 w-full py-3 rounded-2xl bg-foreground text-background text-sm font-medium lowercase disabled:opacity-30"
          >
            {chosen === undefined ? `choose where to ${verb} it` : `${verb} to ${chosenName}`}
          </button>
        </div>
      </div>
    </div>
  );
}
