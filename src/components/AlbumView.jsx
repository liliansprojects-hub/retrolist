import React, { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import MediaUploader from './MediaUploader';
import AlbumTrash from './AlbumTrash';
import { addToTrash, getTrash } from '@/lib/store';

// album folder: a grid of photos / files (originals, no compression) with an
// optional description and url entries. deleted media goes to a per-album
// "recently deleted" tray (restorable for 15 days, then auto-purged). select
// mode enables tick-box mass delete.
export default function AlbumView({ folder, onUpdate }) {
  const [body, setBody] = useState(folder.body || '');
  const [media, setMedia] = useState(folder.media || []);
  const [trashOpen, setTrashOpen] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    setBody(folder.body || '');
    setMedia(folder.media || []);
  }, [folder.id, folder.body, folder.media]);

  const handleDeleteItems = (ids) => {
    const removed = media.filter((m) => ids.includes(m.id));
    if (removed.length) addToTrash(folder.id, removed);
    const next = media.filter((m) => !ids.includes(m.id));
    setMedia(next);
    onUpdate({ media: next });
  };

  const handleRestore = (restored) => {
    const next = [...media, ...restored];
    setMedia(next);
    onUpdate({ media: next });
  };

  const trashCount = getTrash().filter((t) => t.folderId === folder.id).length;

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground lowercase block mb-1.5">description</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={() => onUpdate({ body, media })}
          placeholder="describe this album..."
          rows={2}
          className="w-full p-3 rounded-2xl bg-muted/50 text-sm outline-none resize-none selectable"
        />
      </div>
      <MediaUploader
        media={media}
        onChange={(m) => { setMedia(m); onUpdate({ media: m }); }}
        allowUrl
        allowCaption
        enableViewer
        selectable
        onDeleteItems={handleDeleteItems}
      />
      {trashCount > 0 && (
        <button
          onClick={() => setTrashOpen(true)}
          className="touch-44 flex items-center gap-1.5 text-xs font-medium lowercase text-muted-foreground"
        >
          <Trash2 className="w-3.5 h-3.5" /> recently deleted ({trashCount})
        </button>
      )}
      <AlbumTrash
        open={trashOpen}
        folderId={folder.id}
        onClose={() => { setTrashOpen(false); setTick((t) => t + 1); }}
        onRestore={handleRestore}
      />
    </div>
  );
}