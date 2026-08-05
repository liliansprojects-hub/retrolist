import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import ColorPicker from './ColorPicker';
import ImageUpload from './ImageUpload';
import { LIST_TYPES } from '@/lib/store';

export default function FolderEditModal({ open, onClose, onSave, folder, defaultType }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('list');
  const [color, setColor] = useState('#f4f4f5');
  const [cover, setCover] = useState(null);
  const [emoji, setEmoji] = useState('');

  useEffect(() => {
    if (open) {
      setName(folder?.name || '');
      setType(folder?.type || defaultType || 'list');
      setColor(folder?.color || '#f4f4f5');
      setCover(folder?.cover || null);
      setEmoji(folder?.emoji || '');
    }
  }, [open, folder, defaultType]);

  if (!open) return null;

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), type, color, cover, emoji: emoji.trim() });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto no-scrollbar bg-card rounded-t-3xl sm:rounded-3xl border border-border p-5 pb-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold lowercase">{folder ? 'edit folder' : 'new folder'}</h3>
          <button onClick={onClose} className="touch-44 p-1 rounded-full">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground lowercase block mb-1.5">name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="folder name"
              autoFocus
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground lowercase block mb-1.5">type</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(LIST_TYPES).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setType(key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium lowercase transition-colors ${
                    type === key ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          <ImageUpload value={cover} onChange={setCover} label="cover photo" aspect={3 / 4} maxSize={1600} quality={0.92} className="h-40" />

          <div>
            <label className="text-xs font-medium text-muted-foreground lowercase block mb-1.5">emoji (optional)</label>
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value.slice(0, 2))}
              placeholder="✨"
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
            />
          </div>

          <ColorPicker value={color} onChange={setColor} label="folder colour" />
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="touch-44 flex-1 py-3 rounded-2xl bg-muted text-muted-foreground text-sm font-medium lowercase"
          >
            cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="touch-44 flex-1 py-3 rounded-2xl bg-foreground text-background text-sm font-medium lowercase disabled:opacity-40"
          >
            {folder ? 'save' : 'create'}
          </button>
        </div>
      </div>
    </div>
  );
}