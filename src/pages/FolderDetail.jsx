import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Share2, Pencil } from 'lucide-react';
import {
  getFolder, addItem, updateItem, deleteItem, updateFolder, LIST_TYPES,
} from '@/lib/store';
import { Image } from '@/components/ui/image';
import ItemRow from '@/components/ItemRow';
import FolderEditModal from '@/components/FolderEditModal';
import ShareDialog from '@/components/ShareDialog';

export default function FolderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [folder, setFolder] = useState(null);
  const [newItem, setNewItem] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    const load = () => {
      const f = getFolder(id);
      if (!f) {
        navigate('/');
        return;
      }
      setFolder(f);
    };
    load();
    const handler = () => load();
    window.addEventListener('retrolist:synced', handler);
    return () => window.removeEventListener('retrolist:synced', handler);
  }, [id, navigate]);

  const refresh = () => setFolder(getFolder(id));

  const handleAdd = () => {
    if (!newItem.trim()) return;
    addItem(id, { text: newItem.trim() });
    setNewItem('');
    refresh();
  };

  const handleUpdateItem = (itemId, updates) => {
    updateItem(id, itemId, updates);
    refresh();
  };

  const handleDeleteItem = (itemId) => {
    deleteItem(id, itemId);
    refresh();
  };

  const handleUpdateFolder = (data) => {
    updateFolder(id, data);
    setEditOpen(false);
    refresh();
  };

  if (!folder) return null;

  const cfg = LIST_TYPES[folder.type] || LIST_TYPES.list;
  const isNote = folder.type === 'note';

  return (
    <div className="min-h-screen">
      {/* header with cover */}
      <div
        className="relative h-44 flex items-end p-4"
        style={{
          backgroundColor: folder.cover ? '#000' : folder.color || '#f4f4f5',
        }}
      >
        {folder.cover && (
          <Image
            src={folder.cover}
            fittingType="fill"
            className="absolute inset-0 w-full h-full opacity-70"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

        <button
          onClick={() => navigate('/')}
          className="touch-44 absolute top-4 left-4 w-10 h-10 rounded-full bg-black/20 backdrop-blur flex items-center justify-center"
          style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>

        <div className="absolute top-4 right-4 flex gap-2" style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}>
          <button
            onClick={() => setEditOpen(true)}
            className="touch-44 w-10 h-10 rounded-full bg-black/20 backdrop-blur flex items-center justify-center"
          >
            <Pencil className="w-4 h-4 text-white" />
          </button>
          <button
            onClick={() => setShareOpen(true)}
            className="touch-44 w-10 h-10 rounded-full bg-black/20 backdrop-blur flex items-center justify-center"
          >
            <Share2 className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="relative">
          {folder.emoji && <span className="text-2xl block mb-1">{folder.emoji}</span>}
          <h1 className="text-2xl font-extrabold text-white lowercase drop-shadow">{folder.name}</h1>
          <span className="text-xs text-white/70 lowercase">{cfg.label}</span>
        </div>
      </div>

      {/* content */}
      <div className="p-4 space-y-2">
        {isNote ? (
          <NoteEditor folder={folder} onUpdate={(body) => { updateFolder(id, { body }); refresh(); }} />
        ) : (
          <>
            {(folder.items || []).map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                folderType={folder.type}
                onUpdate={handleUpdateItem}
                onDelete={handleDeleteItem}
              />
            ))}

            {folder.items?.length === 0 && (
              <p className="text-center text-sm text-muted-foreground/50 lowercase py-12">
                nothing here yet
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder={`add to ${folder.name}...`}
                className="flex-1 px-4 py-3 rounded-2xl bg-muted text-sm outline-none focus:bg-background focus:ring-1 focus:ring-foreground"
              />
              <button
                onClick={handleAdd}
                disabled={!newItem.trim()}
                className="touch-44 w-12 h-12 rounded-2xl bg-foreground text-background flex items-center justify-center disabled:opacity-40"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </>
        )}
      </div>

      <FolderEditModal
        open={editOpen}
        folder={folder}
        onClose={() => setEditOpen(false)}
        onSave={handleUpdateFolder}
      />
      <ShareDialog
        open={shareOpen}
        data={{ ...folder, kind: 'folder' }}
        title={folder.name}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}

function NoteEditor({ folder, onUpdate }) {
  const [body, setBody] = useState(folder.body || '');

  useEffect(() => {
    setBody(folder.body || '');
  }, [folder.body]);

  return (
    <textarea
      value={body}
      onChange={(e) => setBody(e.target.value)}
      onBlur={() => onUpdate(body)}
      placeholder="write your note..."
      className="w-full min-h-[300px] p-4 rounded-2xl bg-muted/50 text-sm outline-none resize-none selectable"
    />
  );
}