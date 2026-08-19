import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckSquare, List, Star, MapPin, Bell, StickyNote, Palette, Repeat,
  Calendar, CalendarClock, Book, Film, Map as MapIcon, BookHeart, Share2, Pencil, Trash2,
  LayoutGrid, ChevronRight, ChevronDown, Folder, FolderPlus, FolderInput, Copy, Images, Search, Pin, ArrowDownUp, X,
} from 'lucide-react';
import {
  getFolders, getRootFolders, addFolder, updateFolder, deleteFolder, moveFolder, copyFolder,
  addItem, updateItem, deleteItem,
  getProfile, addEvent, addAlarm, getSettings, saveSettings, LIST_TYPES,
} from '@/lib/store';
import FolderCard from '@/components/FolderCard';
import MasonryGrid from '@/components/MasonryGrid';
import PlusWheel from '@/components/PlusWheel';
import FolderEditModal from '@/components/FolderEditModal';
import FolderPicker from '@/components/FolderPicker';
import EventModal from '@/components/EventModal';
import AlarmModal from '@/components/AlarmModal';
import ReminderModal from '@/components/ReminderModal';
import ShareDialog from '@/components/ShareDialog';
import ItemEditor from '@/components/ItemEditor';
import { ALL_ITEM_KINDS } from '@/components/AddItemPicker';

export default function Home() {
  const navigate = useNavigate();
  const [folders, setFolders] = useState([]);
  const [profile, setProfile] = useState(getProfile());
  const [createType, setCreateType] = useState(null);
  const [editFolder, setEditFolder] = useState(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [menuFolder, setMenuFolder] = useState(null);
  const [shareData, setShareData] = useState(null);
  const [alarmOpen, setAlarmOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderFolder, setReminderFolder] = useState(null);
  const [layout, setLayout] = useState(getSettings().homeLayout || 'blocks');
  const [sortDir, setSortDir] = useState('desc');
  const [filterKey, setFilterKey] = useState('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [picker, setPicker] = useState(null); // { mode, folder }
  const [filterOpen, setFilterOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const refresh = () => {
    setFolders(getRootFolders());
    setProfile(getProfile());
  };

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('retrolist:synced', handler);
    return () => window.removeEventListener('retrolist:synced', handler);
  }, []);

  const LIST_OPTIONS = [
    { label: 'folder', value: 'folder', icon: Folder },
    { label: 'todo', value: 'todo', icon: CheckSquare },
    { label: 'list', value: 'list', icon: List },
    { label: 'note', value: 'note', icon: StickyNote },
    { label: 'album', value: 'album', icon: Images },
    { label: 'places', value: 'place', icon: MapPin },
    { label: 'reminder', value: 'reminder', icon: CalendarClock },
    { label: 'event', value: 'event', icon: Calendar },
    { label: 'books', value: 'book', icon: Book },
    { label: 'movies', value: 'movie', icon: Film },
    { label: 'aspiration', value: 'aspiration', icon: Star },
    { label: 'hobby', value: 'hobby', icon: Palette },
    { label: 'habit', value: 'habit', icon: Repeat },
    { label: 'map', value: 'map_folder', icon: MapIcon },
    { label: 'journal', value: 'journal', icon: BookHeart },
  ];
  const wheelGroups = [
    { title: 'lists & folders', items: LIST_OPTIONS },
    { title: 'items', items: ALL_ITEM_KINDS.map((it) => ({ label: it.label, value: it.kind, icon: it.icon })) },
  ];
  const ITEM_PARENT = { todo: 'todo', checklist: 'todo', list: 'list', note: 'list', movie: 'movie', series: 'movie', drama: 'movie', book: 'book', audiobook: 'book', magazine: 'book', article: 'book', aspiration: 'aspiration', role: 'aspiration', programme: 'aspiration', course: 'aspiration', exercise: 'habit', saving: 'habit', habit: 'habit', hobby: 'hobby', interest: 'hobby', sport: 'hobby', arts: 'hobby', language: 'hobby', skills: 'hobby', place: 'place' };
  const ITEM_KINDS = new Set(ALL_ITEM_KINDS.map((it) => it.kind));

  const handleSelect = (value) => {
    if (value === 'event') {
      setEventOpen(true);
      return;
    }
    if (value === 'map_folder') {
      navigate('/map?create=true');
      return;
    }
    if (value === 'journal') {
      navigate('/journal');
      return;
    }
    if (value === 'reminder') {
      setReminderOpen(true);
      setReminderFolder(null);
      return;
    }
    if (ITEM_KINDS.has(value)) {
      createItemFlow(value);
      return;
    }
    setCreateType(value);
  };

  const createItemFlow = (kind) => {
    const parentType = ITEM_PARENT[kind] || 'list';
    const label = ALL_ITEM_KINDS.find((it) => it.kind === kind)?.label || kind;
    // soloItem: true marks this as an item-only wrapper so the main page
    // renders the actual item block (not a folder cover) — see FolderCard's
    // soloItem branch and the onOpen handling below.
    const folder = addFolder({ name: 'new ' + label, type: parentType, size: 'portrait', soloItem: true });
    const it = addItem(folder.id, { text: '', kind });
    setEditingItem({ folderId: folder.id, item: { ...it, __isNew: true } });
    refresh();
  };

  const handleItemSave = (updates) => {
    if (!editingItem) return;
    updateItem(editingItem.folderId, editingItem.item.id, updates);
    const f = getFolders().find((x) => x.id === editingItem.folderId);
    if (f && f.name.startsWith('new ') && updates.text) {
      updateFolder(editingItem.folderId, { name: updates.text });
    }
    setEditingItem(null);
    refresh();
  };

  const handleItemDelete = () => {
    if (!editingItem) return;
    const fid = editingItem.folderId;
    deleteItem(fid, editingItem.item.id);
    const f = getFolders().find((x) => x.id === fid);
    if (f && (f.items || []).length === 0 && f.name.startsWith('new ')) {
      deleteFolder(fid);
    }
    setEditingItem(null);
    refresh();
  };

  const handleCreate = (data) => {
    addFolder(data);
    setCreateType(null);
    refresh();
  };

  const handleUpdate = (data) => {
    if (editFolder) {
      updateFolder(editFolder.id, data);
      setEditFolder(null);
      refresh();
    }
  };

  const handleShare = () => {
    setShareData({ ...menuFolder, kind: 'folder' });
    setMenuFolder(null);
  };

  const handleDelete = () => {
    if (menuFolder) deleteFolder(menuFolder.id);
    setMenuFolder(null);
    refresh();
  };

  const toggleLayout = () => {
    const next = layout === 'blocks' ? 'list' : 'blocks';
    saveSettings({ homeLayout: next });
    setLayout(next);
  };

  const TYPE_MAP = { notes: 'note', reminders: 'reminder', todos: 'todo', folders: 'folder', albums: 'album' };
  const FILTERS = ['all', 'notes', 'reminders', 'todos', 'folders', 'albums', 'others'];

  const matchesQuery = (f) => {
    if (!query.trim()) return true;
    const name = (f.name || '').toLowerCase();
    const q = query.trim().toLowerCase();
    if (name.includes(q)) return true;
    let i = 0;
    for (const ch of name) { if (ch === q[i]) i++; if (i === q.length) return true; }
    return false;
  };

  const visibleFolders = (() => {
    const known = ['note', 'reminder', 'todo', 'list', 'album', 'folder'];
    let list = folders.filter((f) => {
      if (filterKey === 'all') return true;
      const t = f.type || 'list';
      if (filterKey === 'others') return !known.includes(t);
      return TYPE_MAP[filterKey] === t;
    });
    list = list.filter(matchesQuery);
    list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || ((b.updated_date || b.created_date || 0) - (a.updated_date || a.created_date || 0)) * (sortDir === 'desc' ? 1 : -1));
    return list;
  })();

  return (
    <div className="px-8 sm:px-10 pb-6 min-h-screen">
      <div className="sticky top-0 z-20 -mx-8 sm:-mx-10 px-8 sm:px-10 pt-1 pb-4 safe-top bg-background/95 backdrop-blur-sm">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold lowercase tracking-tight">retrolist</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSearchOpen((s) => !s)}
            className={`w-10 h-10 rounded-full flex items-center justify-center ${searchOpen || query ? 'bg-foreground text-background' : 'bg-muted'}`}
            aria-label="search"
          >
            <Search className="w-[18px] h-[18px]" />
          </button>
          <button
            onClick={toggleLayout}
            className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"
            aria-label="toggle layout"
          >
            {layout === 'blocks' ? <List className="w-[18px] h-[18px]" /> : <LayoutGrid className="w-[18px] h-[18px]" />}
          </button>
          <button
            onClick={() => setCreateType('folder')}
            className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center"
            aria-label="new folder"
          >
            <FolderPlus className="w-[18px] h-[18px]" />
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden"
          >
            {profile.avatar ? (
              <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[9px] font-bold uppercase">{profile.name?.slice(0, 1) || 'y'}</span>
            )}
          </button>
        </div>
      </header>

      {searchOpen && (
        <div className="mb-3 flex items-center gap-2 animate-fade-in">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search by name…"
              className="w-full pl-10 pr-10 h-11 rounded-2xl bg-muted text-sm outline-none lowercase"
            />
            {query && (
              <button onClick={() => setQuery('')} className="touch-44 absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <button onClick={() => { setSearchOpen(false); setQuery(''); }} className="touch-44 px-3 h-11 rounded-2xl bg-muted text-xs font-medium lowercase">cancel</button>
        </div>
      )}

      {folders.length !== 0 && (
        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
            className="touch-44 shrink-0 flex items-center gap-1 px-3 h-7 rounded-full bg-muted text-[10px] font-medium lowercase"
          >
            <ArrowDownUp className="w-3 h-3" /> {sortDir === 'desc' ? 'newest' : 'oldest'}
          </button>
          <div className="relative shrink-0">
            <button
              onClick={() => setFilterOpen((o) => !o)}
              className="touch-44 flex items-center gap-1.5 pl-3 pr-2 h-7 rounded-full bg-muted text-[10px] font-medium lowercase"
            >
              {filterKey === 'all' ? 'all types' : filterKey}
              <ChevronDown className="w-3 h-3" />
            </button>
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
                <div className="absolute z-20 mt-1 left-0 min-w-[120px] rounded-2xl border border-border bg-popover shadow-lg overflow-hidden animate-fade-in">
                  {FILTERS.map((key) => (
                    <button
                      key={key}
                      onClick={() => { setFilterKey(key); setFilterOpen(false); }}
                      className={`touch-44 w-full text-left px-3 py-2 text-[11px] lowercase ${filterKey === key ? 'bg-foreground text-background font-medium' : 'hover:bg-muted'}`}
                    >
                      {key === 'all' ? 'all types' : key}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {layout === 'blocks' && visibleFolders.length > 0 && (
            <button
              onClick={() => setEditMode((e) => !e)}
              className={`touch-44 shrink-0 flex items-center gap-1 px-3 h-7 rounded-full text-[10px] font-medium lowercase ${editMode ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}
            >
              {editMode ? 'done' : 'resize'}
            </button>
          )}
        </div>
      )}
      {editMode && layout === 'blocks' && folders.length !== 0 && (
        <p className="mb-3 text-[11px] text-muted-foreground lowercase">drag any edge to resize · others auto-shift</p>
      )}
      </div>

      {folders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <svg className="w-20 h-20 text-muted-foreground/20 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H10L8 6H4a1 1 0 0 0-1 1z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
          <p className="text-sm text-muted-foreground lowercase">no folders yet</p>
          <p className="text-xs text-muted-foreground/50 lowercase mt-1">tap + to create · hold for all types</p>
        </div>
      ) : (
        <>
          {visibleFolders.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground/50 lowercase py-16">no matches</p>
          ) : layout === 'blocks' ? (
            <MasonryGrid
              folders={visibleFolders}
              editMode={editMode}
              onResize={(id, data) => { updateFolder(id, data); refresh(); }}
              onOpen={(id) => {
                const f = folders.find((x) => x.id === id);
                if (f && f.soloItem && (f.items || []).length === 1) {
                  setEditingItem({ folderId: f.id, item: f.items[0] });
                } else if (f && f.type === 'reminder') { setReminderFolder(f); setReminderOpen(true); }
                else navigate(`/folder/${id}`);
              }}
              onMenu={(f) => setMenuFolder(f)}
            />
          ) : (
            <div className="space-y-2">
              {visibleFolders.map((f) => (
                <button key={f.id} onClick={() => { if (f.soloItem && (f.items || []).length === 1) { setEditingItem({ folderId: f.id, item: f.items[0] }); } else if (f.type === 'reminder') { setReminderFolder(f); setReminderOpen(true); } else navigate(`/folder/${f.id}`); }} className="w-full flex items-center gap-3 p-3 rounded-2xl border border-border bg-card active:scale-[0.98] transition-transform text-left">
                  <span className="w-9 h-9 rounded-xl border-2 border-foreground/40 flex items-center justify-center shrink-0 relative">
                    <Folder className="w-5 h-5 text-foreground/70" strokeWidth={1.75} />
                    {f.pinned && <Pin className="w-3 h-3 absolute -top-1 -right-1 text-foreground fill-foreground" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold lowercase truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground lowercase">{f.items?.length || 0} items · {(LIST_TYPES[f.type]?.label) || f.type}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <PlusWheel groups={wheelGroups} onSelect={handleSelect} />

      <FolderEditModal
        open={!!createType}
        defaultType={createType}
        onClose={() => setCreateType(null)}
        onSave={handleCreate}
      />
      <FolderEditModal
        open={!!editFolder}
        folder={editFolder}
        onClose={() => setEditFolder(null)}
        onSave={handleUpdate}
      />
      <EventModal
        open={eventOpen}
        onClose={() => setEventOpen(false)}
        onSave={(e) => {
          addEvent(e);
          navigate('/journal');
        }}
      />
      <AlarmModal
        open={alarmOpen}
        onClose={() => setAlarmOpen(false)}
        onSave={(data) => {
          addAlarm(data);
          setAlarmOpen(false);
          navigate('/alarms');
        }}
      />
      <ReminderModal
        open={reminderOpen}
        folder={reminderFolder}
        onClose={() => { setReminderOpen(false); setReminderFolder(null); }}
        onSave={(data) => {
          if (reminderFolder) updateFolder(reminderFolder.id, data);
          else addFolder(data);
          setReminderOpen(false);
          setReminderFolder(null);
          refresh();
        }}
        onDelete={reminderFolder ? () => { deleteFolder(reminderFolder.id); setReminderOpen(false); setReminderFolder(null); refresh(); } : undefined}
      />
      <ShareDialog
        open={!!shareData}
        data={shareData}
        title={shareData?.name}
        onClose={() => setShareData(null)}
      />
      <FolderPicker
        open={!!picker}
        title={picker?.mode === 'copy' ? 'copy to' : 'move to'}
        allowMainPage
        onClose={() => setPicker(null)}
        onSelect={(targetId) => {
          if (!picker) return;
          if (picker.mode === 'move') moveFolder(picker.folder.id, targetId);
          else copyFolder(picker.folder.id, targetId);
          setPicker(null);
          refresh();
        }}
      />

      {editingItem && (
        <ItemEditor
          item={editingItem.item}
          folderType={ITEM_PARENT[editingItem.item.kind] || 'list'}
          folderId={editingItem.folderId}
          onClose={() => setEditingItem(null)}
          onSave={(updates) => handleItemSave(updates)}
          onDelete={() => handleItemDelete()}
        />
      )}

      {menuFolder && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          onClick={() => setMenuFolder(null)}
        >
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />
          <div
            className="relative w-full max-w-lg bg-card rounded-t-3xl border-t border-border p-5 pb-8 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-4" />
            <h3 className="text-sm font-semibold lowercase mb-3">{menuFolder.name}</h3>
            <div className="space-y-1">
              <button
                onClick={() => { updateFolder(menuFolder.id, { pinned: !menuFolder.pinned }); setMenuFolder(null); refresh(); }}
                className="touch-44 w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted text-sm lowercase"
              >
                <Pin className="w-4 h-4 text-muted-foreground" /> {menuFolder.pinned ? 'unpin' : 'pin to top'}
              </button>
              <button
                onClick={() => {
                  if (menuFolder.type === 'reminder') { setReminderFolder(menuFolder); setReminderOpen(true); }
                  else setEditFolder(menuFolder);
                  setMenuFolder(null);
                }}
                className="touch-44 w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted text-sm lowercase"
              >
                <Pencil className="w-4 h-4 text-muted-foreground" /> edit
              </button>
              <button
                onClick={() => { setPicker({ mode: 'move', folder: menuFolder }); setMenuFolder(null); }}
                className="touch-44 w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted text-sm lowercase"
              >
                <FolderInput className="w-4 h-4 text-muted-foreground" /> move to
              </button>
              <button
                onClick={() => { setPicker({ mode: 'copy', folder: menuFolder }); setMenuFolder(null); }}
                className="touch-44 w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted text-sm lowercase"
              >
                <Copy className="w-4 h-4 text-muted-foreground" /> copy to
              </button>
              <button
                onClick={handleShare}
                className="touch-44 w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted text-sm lowercase"
              >
                <Share2 className="w-4 h-4 text-muted-foreground" /> share
              </button>
              <button
                onClick={handleDelete}
                className="touch-44 w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted text-sm lowercase text-destructive"
              >
                <Trash2 className="w-4 h-4" /> delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}