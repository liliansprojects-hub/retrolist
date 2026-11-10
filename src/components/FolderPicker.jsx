import React, { useState, useEffect, useMemo } from 'react';
import { X, Folder as FolderIcon, Home, Check, Plus } from 'lucide-react';
import { getFolders, canHold, addFolder } from '@/lib/store';
import { cn } from '@/lib/utils';

// Destination picker for move / copy.
//  - laid out as a tree: main page first, then folders A→Z, sub-folders indented under their parent
//  - ineligible destinations stay visible but greyed out, with the reason beside them
//  - folders can only go into folders (or the main page); items may stand alone on the main page or sit in a folder
//  - a folder can't go into itself or anything inside it
// tap a destination to select it, then confirm with the button at the bottom.
// a + lets you make a new folder on the spot: the top button creates one on the page you're
// currently on (the main page, or the folder you're in), and each folder that can hold things
// has its own + for creating a sub-folder inside it. a new folder is selected straight away.
//
// props: kind 'folder' | 'item' · mode 'move' | 'copy'
//   movingFolderIds   folders being moved/copied (their own subtree is greyed out)
//   currentContainerId  folder the thing is in now (null = main page)
//   currentIsRoot     true when it is currently on the main page
export default function FolderPicker({
  open, onClose, onSelect, title = 'move to', kind = 'folder', mode = 'move',
  movingFolderIds = [], currentContainerId = null, currentIsRoot = false, onCreated,
}) {
  const [folders, setFolders] = useState([]);
  const [chosen, setChosen] = useState(undefined); // undefined = nothing, null = main page
  const [creating, setCreating] = useState(undefined); // undefined = not creating, null = on main page, id = inside that folder
  const [newName, setNewName] = useState('');
  const [createErr, setCreateErr] = useState('');
  useEffect(() => { if (open) { setFolders(getFolders().filter((f) => !f.isItemBlock)); setChosen(undefined); setCreating(undefined); setNewName(''); setCreateErr(''); } }, [open]);

  const startCreate = (parentId) => { setCreating(parentId); setNewName(''); setCreateErr(''); };
  const cancelCreate = () => { setCreating(undefined); setNewName(''); setCreateErr(''); };
  const commitCreate = () => {
    const name = newName.trim();
    if (!name) return;
    // same rule as the normal folder editor: no two folders with the same name
    if (getFolders().some((f) => (f.name || '').trim().toLowerCase() === name.toLowerCase())) { setCreateErr('a folder with that name already exists'); return; }
    const made = addFolder({
      name, type: 'folder', color: '#f4f4f5', cover: null, emoji: '', size: 'portrait', subtitle: '',
      ...(creating ? { parent_id: creating } : {}),
    });
    setFolders(getFolders().filter((f) => !f.isItemBlock));
    setChosen(made.id);
    cancelCreate();
    if (onCreated) onCreated(made);
  };

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

  // inline "name the new folder" field — rendered by a plain function (not a component) so the input
  // keeps focus while typing
  const renderCreator = (parentId, depth) => (
    <div style={{ marginLeft: depth * 16, width: `calc(100% - ${depth * 16}px)` }} className="my-1">
      <div className="flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-xl border border-foreground bg-background">
        <FolderIcon className="w-4 h-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={newName}
          onChange={(e) => { setNewName(e.target.value); setCreateErr(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') commitCreate(); else if (e.key === 'Escape') cancelCreate(); }}
          placeholder="new folder name"
          className="flex-1 min-w-0 bg-transparent text-sm lowercase outline-none"
        />
        <button onClick={commitCreate} disabled={!newName.trim()} aria-label="create folder" className="touch-44 w-8 h-8 rounded-lg bg-foreground text-background flex items-center justify-center disabled:opacity-30"><Check className="w-4 h-4" /></button>
        <button onClick={cancelCreate} aria-label="cancel" className="touch-44 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground"><X className="w-4 h-4" /></button>
      </div>
      {createErr && <p className="text-[10px] text-destructive lowercase px-3 pt-1">{createErr}</p>}
    </div>
  );

  const renderRow = (f, depth) => {
    const reason = reasonFor(f);
    const kids = byParent[f.id] || [];
    const isChosen = chosen === f.id;
    // a sub-folder can be made inside any folder that can hold folders — except one being moved
    // (or inside one), since a folder can't be moved into itself
    const canCreateInside = canHold(f) && !(kind === 'folder' && (movingFolderIds.includes(f.id) || insideMoving.has(f.id)));
    return (
      <div key={f.id}>
        <div style={{ marginLeft: depth * 16, width: `calc(100% - ${depth * 16}px)` }} className="flex items-center gap-1">
          <button
            disabled={!!reason}
            onClick={() => setChosen(f.id)}
            className={cn(
              'touch-44 flex-1 min-w-0 flex items-center gap-2 pl-3 pr-3 py-2.5 rounded-xl text-sm lowercase text-left border',
              depth > 0 && 'border-l-2 border-l-border',
              reason ? 'opacity-40 cursor-not-allowed border-transparent bg-muted/40' : isChosen ? 'bg-foreground text-background border-foreground' : 'border-transparent hover:bg-muted',
            )}
          >
            <FolderIcon className="w-4 h-4 shrink-0" style={reason || isChosen ? undefined : { color: f.color || undefined }} />
            <span className="flex-1 min-w-0 truncate">{f.name || 'untitled'}</span>
            {reason ? <span className="text-[10px] shrink-0">{reason}</span> : isChosen ? <Check className="w-4 h-4 shrink-0" /> : <span className="text-[10px] opacity-50 shrink-0">{(f.items || []).length}</span>}
          </button>
          {canCreateInside && (
            <button onClick={() => startCreate(f.id)} aria-label={`new folder inside ${f.name || 'untitled'}`} className="touch-44 w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted"><Plus className="w-4 h-4" /></button>
          )}
        </div>
        {creating === f.id && renderCreator(f.id, depth + 1)}
        {kids.map((c) => renderRow(c, depth + 1))}
      </div>
    );
  };

  // the page the thing is on right now: the main page, or the folder it's in
  const hereId = currentContainerId || null;
  const hereFolder = hereId ? folders.find((f) => f.id === hereId) : null;
  const hereOk = hereId === null || canHold(hereFolder);
  const hereName = hereId === null ? 'the main page' : (hereFolder?.name || 'this folder');

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
          {hereOk && creating === undefined && (
            <button
              onClick={() => startCreate(hereId)}
              className="touch-44 w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm lowercase text-left border border-dashed border-border text-muted-foreground hover:bg-muted"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="flex-1 min-w-0 truncate">new folder in {hereName}</span>
            </button>
          )}
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
          {creating === null && renderCreator(null, 0)}
          {roots.length === 0
            ? <p className="text-sm text-muted-foreground/50 lowercase py-6 text-center">no folders yet</p>
            : roots.map((f) => renderRow(f, 0))}
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
