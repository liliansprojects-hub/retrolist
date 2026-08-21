import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Share2, Pencil, Pin, Link as LinkIcon, FolderInput, Copy, ListPlus, Folder as FolderIcon, CheckSquare, List, Star, MapPin, Bell, StickyNote, Palette, Repeat, Calendar, Book, Film, Map as MapIcon, BookHeart, Images, X } from 'lucide-react';
import {
  getFolder, getFolders, getChildFolders, addItem, updateItem, deleteItem, moveItem, copyItem, moveFolder, copyFolder, addFolder, updateFolder, reorderChecklist, reorderItemsByIndex, reorderChildFoldersByIndex, LIST_TYPES,
} from '@/lib/store';
import AlbumView from '@/components/AlbumView';
import FolderEditModal from '@/components/FolderEditModal';
import FolderPicker from '@/components/FolderPicker';
import AddItemPicker, { ALL_ITEM_KINDS } from '@/components/AddItemPicker';
import ItemEditor from '@/components/ItemEditor';
import ShareDialog from '@/components/ShareDialog';
import ItemsList from '@/components/ItemsList';
import ChildFoldersList from '@/components/ChildFoldersList';
import SortDropdown from '@/components/SortDropdown';

export default function FolderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [folder, setFolder] = useState(null);
  const [newItem, setNewItem] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [picker, setPicker] = useState(null); // { mode } for this folder
  const [childType, setChildType] = useState(null); // create sub-folder inside
  const [editingItem, setEditingItem] = useState(null);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [sort, setSort] = useState('newest');

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
    const cur = getFolder(id);
    const it = (cur?.items || []).find((x) => x.id === itemId);
    if (it && it.kind === 'checklist' && updates.done !== undefined) reorderChecklist(id);
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

  const handleAddItem = (kind) => {
    const it = addItem(id, { text: '', kind });
    refresh(); // was missing — every other mutating handler in this file
    // calls refresh(), but this one didn't, so a newly created item never
    // appeared in the list until something unrelated happened to trigger a
    // re-render later (e.g. saving the item editor).
    setEditingItem({ ...it, __isNew: true });
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

  const onItemDragEnd = (res) => {
    if (!res.destination || res.source.index === res.destination.index) return;
    reorderItemsByIndex(id, res.source.index, res.destination.index);
    setSort('custom');
    refresh();
  };
  const onFolderDragEnd = (res) => {
    if (!res.destination || res.source.index === res.destination.index) return;
    reorderChildFoldersByIndex(id, res.source.index, res.destination.index);
    setSort('custom');
    refresh();
  };

  if (!folder) return null;

  const cfg = LIST_TYPES[folder.type] || LIST_TYPES.list;
  const isNote = folder.type === 'note';
  const isAlbum = folder.type === 'album';
  const isFolder = folder.type === 'folder';
  const isReminder = folder.type === 'reminder';
  const allFolders = getFolders();
  const childFolders = getChildFolders(id);

  return (
    <div className="min-h-screen">
      {/* header with cover */}
      <div className="safe-top px-6 sm:px-8 pb-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => navigate('/')}
            className="touch-44 w-10 h-10 rounded-full bg-muted flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setCreateSheetOpen(true)}
              className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center"
              aria-label="new list or folder"
            >
              <ListPlus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => updateFolder(id, { pinned: !folder.pinned })}
              className={`w-8 h-8 rounded-full flex items-center justify-center ${folder.pinned ? 'bg-foreground text-background' : 'bg-muted'}`}
              aria-label="pin"
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPicker({ mode: 'move' })}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
              aria-label="move to"
            >
              <FolderInput className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPicker({ mode: 'copy' })}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
              aria-label="copy to"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setEditOpen(true)}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShareOpen(true)}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
            >
              <Share2 className="w-3.5 h-3.5" />
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
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground/60 lowercase">{cfg.label}</span>
          {!isNote && !isAlbum && <SortDropdown value={sort} onChange={setSort} />}
        </div>
      </div>

      {/* content */}
      <div className="p-6 sm:px-8 space-y-2">
        {childFolders.length > 0 && (
          <ChildFoldersList folders={childFolders} sort={sort} setSort={setSort} onDragEnd={onFolderDragEnd} />
        )}
        {isNote ? (
          <NoteEditor folder={folder} onUpdate={(data) => { updateFolder(id, data); refresh(); }} />
        ) : isAlbum ? (
          <AlbumView folder={folder} onUpdate={(data) => { updateFolder(id, data); refresh(); }} />
        ) : isReminder ? (
          <>
            <ItemsList
              items={folder.items || []}
              sort={sort}
              setSort={setSort}
              onDragEnd={onItemDragEnd}
              folderType={folder.type}
              folderId={id}
              onUpdate={handleUpdateItem}
              onOpen={setEditingItem}
              emptyText="nothing here yet"
            />
            <div className="flex gap-2 pt-2">
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder={`add to ${folder.name}...`}
                className="flex-1 px-4 py-3 rounded-2xl bg-muted text-sm outline-none focus:bg-background focus:ring-1 focus:ring-foreground"
              />
              <button onClick={handleAdd} disabled={!newItem.trim()} className="touch-44 w-12 h-12 rounded-2xl bg-foreground text-background flex items-center justify-center disabled:opacity-40">
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </>
        ) : (
          <ItemsList
          items={folder.items || []}
          sort={sort}
          setSort={setSort}
          onDragEnd={onItemDragEnd}
            folderType={folder.type}
            folderId={id}
            onUpdate={handleUpdateItem}
            onOpen={setEditingItem}
            emptyText={childFolders.length === 0 ? 'nothing here yet' : null}
          />
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
      {!isReminder && !editOpen && !childType && !picker && !editingItem && !createSheetOpen && !shareOpen && (
        <AddItemPicker folderType={folder.type} onSelect={(kind) => { if (isFolder) setChildType(kind); else handleAddItem(kind); }} />
      )}

      {editingItem && (
        <ItemEditor
          item={editingItem}
          folderType={folder.type}
          folderId={id}
          onClose={() => setEditingItem(null)}
          onSave={(updates) => { handleUpdateItem(editingItem.id, updates); setEditingItem(null); }}
          onDelete={() => { handleDeleteItem(editingItem.id); setEditingItem(null); }}
          onMove={(itemId, toId) => { handleMoveItem(itemId, toId); setEditingItem(null); }}
          onCopy={(itemId, toId) => { handleCopyItem(itemId, toId); }}
        />
      )}

      {createSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setCreateSheetOpen(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />
          <div className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto no-scrollbar bg-card rounded-t-3xl border-t border-border p-5 pb-8 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setCreateSheetOpen(false)} className="touch-44 absolute top-3 right-3 w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center"><X className="w-4 h-4" /></button>
            <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-4" />
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 lowercase">new item</h3>
            <div className="grid grid-cols-3 gap-3">
              {ALL_ITEM_KINDS.map((it) => (
                <button key={it.kind} onClick={() => { handleAddItem(it.kind); setCreateSheetOpen(false); }} className="touch-44 flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-background border border-border active:scale-95 transition-transform icon-no-select">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-muted"><it.icon className="w-5 h-5 text-foreground" /></div>
                  <span className="text-[10px] font-medium text-muted-foreground lowercase">{it.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
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