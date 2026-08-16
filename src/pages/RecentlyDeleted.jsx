import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Check, Trash2, RotateCcw, FileText, AlertTriangle, Download } from 'lucide-react';
import {
  getFileTrash, restoreFileTrash, purgeFileTrash, emptyFileTrash,
  getTrash, restoreFromTrash, purgeTrashItem, getFolder, updateFolder, addFile,
} from '@/lib/store';
import { cn } from '@/lib/utils';
import PhotoViewer from '@/components/PhotoViewer';

const TRASH_DAYS = 15;

// dedicated "recently deleted" page — mirrors my files: grid view, multi-select,
// select all, individual photo viewer, scroll. combines album media trash and
// my-files trash. items auto-purge after 15 days.
export default function RecentlyDeleted() {
  const navigate = useNavigate();
  const [, setTick] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [viewerIndex, setViewerIndex] = useState(null);

  useEffect(() => {
    const h = () => setTick((t) => t + 1);
    window.addEventListener('retrolist:data-changed', h);
    window.addEventListener('retrolist:synced', h);
    return () => {
      window.removeEventListener('retrolist:data-changed', h);
      window.removeEventListener('retrolist:synced', h);
    };
  }, []);

  // merge album trash + my-files trash into one list
  const items = [
    ...getTrash().map((t) => ({ ...t, bin: 'album' })),
    ...getFileTrash().map((t) => ({ ...t, bin: 'files' })),
  ];

  const photos = items.filter((it) => it.type === 'photo' && it.url);
  const photoItems = items; // grid shows everything

  const toggleSelect = (key) => setSelected((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const selectAll = () => { if (selected.size === items.length) setSelected(new Set()); else setSelected(new Set(items.map((_, i) => i))); };

  const restoreOne = (it) => {
    if (it.bin === 'files') {
      const r = restoreFileTrash(it.id);
      if (r) addFile({ name: r.name || 'file', url: r.url });
    } else {
      const restored = restoreFromTrash(it.id);
      if (restored && it.folderId) {
        const f = getFolder(it.folderId);
        if (f) updateFolder(it.folderId, { media: [...(f.media || []), restored] });
      }
    }
    setTick((t) => t + 1);
  };

  const purgeOne = (it) => {
    if (it.bin === 'files') purgeFileTrash(it.id);
    else purgeTrashItem(it.id);
    setTick((t) => t + 1);
  };

  const restoreSelected = () => {
    [...selected].forEach((i) => restoreOne(items[i]));
    setSelected(new Set());
    setSelectMode(false);
  };
  const deleteSelected = () => {
    [...selected].forEach((i) => purgeOne(items[i]));
    setSelected(new Set());
    setSelectMode(false);
  };

  const downloadSelected = () => {
    [...selected].forEach((i, k) => {
      const it = items[i];
      if (!it || !it.url) return;
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = it.url;
        a.download = it.name || `file-${i + 1}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, k * 250);
    });
  };

  const openViewer = (i) => {
    const p = photos.findIndex((x) => x === items[i]);
    if (p >= 0) setViewerIndex(p);
  };

  return (
    <div className="safe-top px-6 sm:px-8 pb-4 min-h-screen">
      <header className="mb-4 flex items-center gap-2">
        <button onClick={() => navigate('/my-files')} className="touch-44 w-9 h-9 rounded-full bg-muted flex items-center justify-center">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-extrabold lowercase tracking-tight">recently deleted</h1>
        {items.length > 0 && (
          <button
            onClick={() => { setSelectMode((s) => !s); setSelected(new Set()); }}
            className={cn('touch-44 ml-auto px-3 py-1.5 rounded-full text-xs font-medium lowercase', selectMode ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}
          >
            {selectMode ? 'cancel' : 'select'}
          </button>
        )}
      </header>

      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-muted/50 mb-3">
        <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground lowercase">items here are auto-deleted after {TRASH_DAYS} days. restore or delete forever anytime.</p>
      </div>

      {items.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground/50 lowercase py-16">nothing here</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {items.map((it, i) => {
              const key = i;
              const isPhoto = it.type === 'photo' && it.url;
              return (
                <div key={key} className={cn('relative rounded-xl overflow-hidden border border-border bg-muted/40', selectMode && selected.has(i) && 'ring-2 ring-foreground')}>
                  {isPhoto ? (
                    <button onClick={() => (selectMode ? toggleSelect(i) : openViewer(i))} className="block w-full">
                      <img src={it.url} alt="" className={cn('w-full aspect-square object-cover', selectMode && selected.has(i) && 'opacity-50')} />
                    </button>
                  ) : (
                    <button onClick={() => (selectMode ? toggleSelect(i) : undefined)} className="flex flex-col items-center justify-center gap-1 w-full aspect-square p-2 text-center">
                      <FileText className="w-6 h-6 text-muted-foreground" />
                      <span className="text-[10px] lowercase truncate w-full">{it.name || 'file'}</span>
                    </button>
                  )}
                  {selectMode && (
                    <button onClick={() => toggleSelect(i)} className="touch-44 absolute top-1 left-1 w-6 h-6 rounded-full bg-background/80 flex items-center justify-center">
                      {selected.has(i) ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border-2 border-foreground/60" />}
                    </button>
                  )}
                  {!selectMode && (
                    <>
                      <button onClick={() => restoreOne(it)} className="touch-44 absolute top-1 left-1 w-6 h-6 rounded-full bg-background/80 backdrop-blur flex items-center justify-center">
                        <RotateCcw className="w-3 h-3" />
                      </button>
                      <button onClick={() => purgeOne(it)} className="touch-44 absolute top-1 right-1 w-6 h-6 rounded-full bg-background/80 backdrop-blur flex items-center justify-center text-destructive">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {selectMode && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button onClick={selectAll} className="touch-44 flex items-center justify-center gap-1.5 py-3.5 rounded-xl bg-muted text-xs font-medium lowercase">
                <Check className="w-3.5 h-3.5" /> {selected.size === items.length ? 'deselect all' : 'select all'}
              </button>
              <button onClick={downloadSelected} disabled={selected.size === 0} className="touch-44 flex items-center justify-center gap-1.5 py-3.5 rounded-xl bg-muted text-xs font-medium lowercase disabled:opacity-40">
                <Download className="w-3.5 h-3.5" /> download
              </button>
              <button onClick={restoreSelected} disabled={selected.size === 0} className="touch-44 flex items-center justify-center gap-1.5 py-3.5 rounded-xl bg-muted text-xs font-medium lowercase disabled:opacity-40">
                <RotateCcw className="w-3.5 h-3.5" /> restore
              </button>
              <button onClick={deleteSelected} disabled={selected.size === 0} className="touch-44 flex items-center justify-center gap-1.5 py-3.5 rounded-xl bg-destructive text-destructive-foreground text-xs font-medium lowercase disabled:opacity-40">
                <Trash2 className="w-3.5 h-3.5" /> delete
              </button>
            </div>
          )}

          {!selectMode && items.length > 0 && (
            <button
              onClick={() => { emptyFileTrash(); getTrash().forEach((t) => purgeTrashItem(t.id)); setTick((t) => t + 1); }}
              className="touch-44 w-full py-2.5 rounded-xl bg-destructive/10 text-destructive text-xs font-medium lowercase"
            >
              empty bin
            </button>
          )}
        </>
      )}

      {viewerIndex !== null && photos[viewerIndex] && (
        <PhotoViewer
          photos={photos}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
}