import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Share2, Pencil, Pin, Link as LinkIcon, FolderInput, Copy, Folder as FolderIcon, CheckSquare, List, Star, MapPin, Bell, StickyNote, Palette, Repeat, Calendar, Book, Film, Map as MapIcon, BookHeart, Images } from 'lucide-react';
import {
  getFolder, getFolders, getChildFolders, addItem, updateItem, deleteItem, moveItem, copyItem, moveFolder, copyFolder, addFolder, updateFolder, LIST_TYPES,
} from '@/lib/store';
import ItemRow from '@/components/ItemRow';
import AlbumView from '@/components/AlbumView';
import FolderCard from '@/components/FolderCard';
import FolderEditModal from '@/components/FolderEditModal';
import FolderPicker from '@/components/FolderPicker';
import PlusWheel from '@/components/PlusWheel';
import ShareDialog from '@/components/ShareDialog';

export default function FolderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [folder, setFolder] = useState(null);
  const [newItem, setNewItem] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [picker, setPicker] = useState(null); // { mode } for this folder
  const [childType, setChildType] = useState(null); // create sub-folder inside

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

  const [subtitle, setSubtitle] = useState(folder?.subtitle || '');
  useEffect(() => { setSubtitle(folder?.subtitle || ''); }, [folder?.id, folder?.subtitle]);

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

  const handleMoveItem = (itemId, toFolderId) => {
    moveItem(id, itemId, toFolderId);
    refresh();
  };

  const handleCopyItem = (itemId, toFolderId) => {
    copyItem(id, itemId, toFolderId);
    refresh();
  };

  const handleCreateChild = (data) => {
    addFolder({ ...data, parent_id: id });
    setChildType(null);
    refresh();
  };

  const handleFolderPicker = (targetId) => {
    if (!picker) return;
    if (picker.mode === 'move') {
      moveFolder(id, targetId);
      setPicker(null);
      refresh();
      if (!targetId) navigate('/');
    } else {
      copyFolder(id, targetId);
      setPicker(null);
      refresh();
    }
  };

  const handleUpdateFolder = (data) => {
    updateFolder(id, data);
    setEditOpen(false);
    refresh();
  };

  if (!folder) return null;

  const cfg = LIST_TYPES[folder.type] || LIST_TYPES.list;
  const isNote = folder.type === 'note';
  const isAlbum = folder.type === 'album';
  const isFolder = folder.type === 'folder';
  const allFolders = getFolders();
  const childFolders = isFolder ? getChildFolders(id) : [];

  return (
    <div className="min-h-screen">
      {/* header with cover */}
      <div className="safe-top px-4 pb-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => navigate('/')}
            className="touch-44 w-10 h-10 rounded-full bg-muted flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => updateFolder(id, { pinned: !folder.pinned })}
              className={`touch-44 w-10 h-10 rounded-full flex items-center justify-center ${folder.pinned ? 'bg-foreground text-background' : 'bg-muted'}`}
              aria-label="pin"
            >
              <Pin className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPicker({ mode: 'move' })}
              className="touch-44 w-10 h-10 rounded-full bg-muted flex items-center justify-center"
              aria-label="move to"
            >
              <FolderInput className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPicker({ mode: 'copy' })}
              className="touch-44 w-10 h-10 rounded-full bg-muted flex items-center justify-center"
              aria-label="copy to"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={() => setEditOpen(true)}
              className="touch-44 w-10 h-10 rounded-full bg-muted flex items-center justify-center"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShareOpen(true)}
              className="touch-44 w-10 h-10 rounded-full bg-muted flex items-center justify-center"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        {folder.emoji && <span className="text-2xl block mb-1">{folder.emoji}</span>}
        <h1 className="text-2xl font-extrabold lowercase tracking-tight">{folder.name}</h1>
        <input
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          onBlur={() => updateFolder(id, { subtitle })}
          placeholder="add a subheading…"
          className="mt-1 w-full bg-transparent text-sm text-muted-foreground lowercase outline-none selectable"
        />
        <span className="text-[11px] text-muted-foreground/60 lowercase">{cfg.label}</span>
      </div>

      {/* content */}
      <div className="p-5 space-y-2">
        {isNote ? (
          <NoteEditor folder={folder} onUpdate={(data) => { updateFolder(id, data); refresh(); }} />
        ) : isAlbum ? (
          <AlbumView folder={folder} onUpdate={(data) => { updateFolder(id, data); refresh(); }} />
        ) : isFolder ? (
          <>
            {childFolders.length > 0 && (
              <div className="columns-2 sm:columns-3 gap-3 mb-4">
                {childFolders.map((c) => (
                  <FolderCard key={c.id} folder={c} onClick={() => navigate(`/folder/${c.id}`)} />
                ))}
              </div>
            )}
            {(folder.items || []).map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                folderType={folder.type}
                folderId={id}
                onMove={handleMoveItem}
                onCopy={handleCopyItem}
                onUpdate={handleUpdateItem}
                onDelete={handleDeleteItem}
              />
            ))}
            {folder.items?.length === 0 && childFolders.length === 0 && (
              <p className="text-center text-sm text-muted-foreground/50 lowercase py-12">
                nothing here yet
              </p>
            )}
            <div className="flex gap-2 pt-2">
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="add item..."
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
        ) : (
          <>
            {(folder.items || []).map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                folderType={folder.type}
                folderId={id}
                onMove={handleMoveItem}
                onCopy={handleCopyItem}
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
      <FolderEditModal
        open={!!childType}
        defaultType={childType}
        defaultParentId={id}
        onClose={() => setChildType(null)}
        onSave={handleCreateChild}
      />
      <ShareDialog
        open={shareOpen}
        data={{ ...folder, kind: 'folder' }}
        title={folder.name}
        onClose={() => setShareOpen(false)}
      />
      <FolderPicker
        open={!!picker}
        title={picker?.mode === 'copy' ? 'copy to' : 'move to'}
        allowMainPage
        onClose={() => setPicker(null)}
        onSelect={handleFolderPicker}
      />
      {isFolder && (
        <PlusWheel
          items={[
            { label: 'folder', value: 'folder', icon: FolderIcon },
            { label: 'todo', value: 'todo', icon: CheckSquare },
            { label: 'list', value: 'list', icon: List },
            { label: 'note', value: 'note', icon: StickyNote },
            { label: 'reminder', value: 'reminder', icon: Bell },
            { label: 'album', value: 'album', icon: Images },
            { label: 'places', value: 'place', icon: MapPin },
            { label: 'books', value: 'book', icon: Book },
            { label: 'movies', value: 'movie', icon: Film },
            { label: 'aspiration', value: 'aspiration', icon: Star },
            { label: 'hobby', value: 'hobby', icon: Palette },
            { label: 'habit', value: 'habit', icon: Repeat },
            { label: 'event', value: 'event', icon: Calendar },
            { label: 'map', value: 'map_folder', icon: MapIcon },
            { label: 'journal', value: 'journal', icon: BookHeart },
          ]}
          onSelect={(v) => { if (v === 'journal') { navigate('/journal'); return; } setChildType(v); }}
        />
      )}
    </div>
  );
}

function NoteEditor({ folder, onUpdate }) {
  const [body, setBody] = useState(folder.body || '');
  const [url, setUrl] = useState(folder.url || '');

  useEffect(() => {
    setBody(folder.body || '');
    setUrl(folder.url || '');
  }, [folder.body, folder.url]);

  const normalize = (u) => {
    if (!u) return '';
    const s = u.trim();
    return /^https?:\/\//i.test(s) ? s : 'https://' + s;
  };
  const open = () => {
    const u = normalize(url);
    if (u) window.open(u, '_blank', 'noopener,noreferrer');
  };
  const save = () => onUpdate({ body, url: url.trim() });

  return (
    <div className="space-y-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={save}
        placeholder="write your note..."
        className="w-full min-h-[300px] p-4 rounded-2xl bg-muted/50 text-sm outline-none resize-none selectable"
      />
      <div>
        <label className="text-xs font-medium text-muted-foreground lowercase block mb-1.5">link</label>
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={save}
            placeholder="https://..."
            className="flex-1 px-3 py-2.5 rounded-xl bg-muted text-sm outline-none"
          />
          {url && (
            <button onClick={open} className="touch-44 px-3 rounded-xl bg-muted flex items-center gap-1.5 text-xs font-medium lowercase">
              <LinkIcon className="w-3.5 h-3.5" /> open
            </button>
          )}
        </div>
      </div>
    </div>
  );
}