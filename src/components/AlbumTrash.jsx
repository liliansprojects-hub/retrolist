import React, { useState, useEffect } from 'react';
import { X, RotateCcw, Trash2 } from 'lucide-react';
import { getTrash, restoreFromTrash, purgeTrashItem, emptyTrashForFolder } from '@/lib/store';

// per-album "recently deleted" tray. items are restorable (returned to the
// album) or purgeable forever; everything auto-purges after 15 days.
export default function AlbumTrash({ open, onClose, folderId, onRestore }) {
  const [items, setItems] = useState([]);

  const refresh = () => setItems(getTrash().filter((t) => t.folderId === folderId));
  useEffect(() => { if (open) refresh(); }, [open, folderId]);

  if (!open) return null;

  const handleRestore = (id) => {
    const restored = restoreFromTrash(id);
    if (restored && onRestore) onRestore([restored]);
    refresh();
  };

  const handleEmpty = () => {
    emptyTrashForFolder(folderId);
    refresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-lg bg-card rounded-t-3xl sm:rounded-3xl border border-border p-5 pb-8 animate-slide-up max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold lowercase">recently deleted</h3>
          <button onClick={onClose} className="touch-44 p-1 rounded-full">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground lowercase mb-3">items auto-delete after 15 days.</p>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground/50 lowercase py-8 text-center">nothing here</p>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-2 mb-3">
              {items.map((it) => (
                <div key={it.id} className="relative rounded-xl overflow-hidden border border-border">
                  {it.type === 'photo' ? (
                    <img src={it.url} alt="" className="w-full aspect-square object-cover" />
                  ) : (
                    <div className="w-full aspect-square flex items-center justify-center bg-muted">
                      <Trash2 className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <button
                    onClick={() => handleRestore(it.id)}
                    className="touch-44 absolute top-1 left-1 w-6 h-6 rounded-full bg-background/80 backdrop-blur flex items-center justify-center"
                    aria-label="restore"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => { purgeTrashItem(it.id); refresh(); }}
                    className="touch-44 absolute top-1 right-1 w-6 h-6 rounded-full bg-background/80 backdrop-blur flex items-center justify-center"
                    aria-label="delete forever"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={handleEmpty}
              className="touch-44 w-full py-2.5 rounded-xl bg-destructive text-destructive-foreground text-xs font-medium lowercase"
            >
              empty trash
            </button>
          </>
        )}
      </div>
    </div>
  );
}