import React, { useState, useEffect } from 'react';
import { X, Folder as FolderIcon, Home } from 'lucide-react';
import { getFolders } from '@/lib/store';

// file-explorer-style folder tree picker. used by "move to" / "copy to".
// onSelect receives the target folder id, or null when "main page" (root) is chosen.
export default function FolderPicker({ open, onClose, onSelect, title = 'move to', allowMainPage = true }) {
  const [folders, setFolders] = useState([]);
  useEffect(() => { if (open) setFolders(getFolders()); }, [open]);

  if (!open) return null;

  const roots = folders.filter((f) => !f.parent_id);
  const renderNode = (f, depth) => {
    const children = folders.filter((c) => c.parent_id === f.id);
    return (
      <div key={f.id}>
        <button
          onClick={() => onSelect(f.id)}
          style={{ paddingLeft: 12 + depth * 18 }}
          className="touch-44 w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-muted text-sm lowercase text-left"
        >
          <FolderIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="truncate">{f.name}</span>
        </button>
        {children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto no-scrollbar bg-card rounded-t-3xl sm:rounded-3xl border border-border p-5 pb-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold lowercase">{title}</h3>
          <button onClick={onClose} className="touch-44 p-1 rounded-full">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        <div className="space-y-0.5">
          {allowMainPage && (
            <button
              onClick={() => onSelect(null)}
              className="touch-44 w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-muted text-sm lowercase text-left"
            >
              <Home className="w-4 h-4 text-muted-foreground shrink-0" /> main page
            </button>
          )}
          {roots.length === 0
            ? <p className="text-sm text-muted-foreground/50 lowercase py-6 text-center">no folders yet</p>
            : roots.map((f) => renderNode(f, 0))}
        </div>
      </div>
    </div>
  );
}