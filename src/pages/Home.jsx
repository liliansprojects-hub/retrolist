import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckSquare, List, Star, MapPin, Bell, StickyNote, Palette, Repeat,
  Calendar, CalendarClock, Book, Film, Map as MapIcon, BookHeart, Share2, Pencil, Trash2,
  LayoutGrid, GraduationCap, ChefHat, FolderKanban, CheckCheck, ChevronRight, ChevronDown, Folder, FolderPlus, FolderInput, Copy, Images, Search, Pin, ArrowDownUp, X,
} from 'lucide-react';
import {
  getFolders, getRootFolders, addFolder, updateFolder, reorderFolders, deleteFolder, trashFolders, restoreFolderTrash, moveFolder, copyFolder,
  addItem, updateItem, deleteItem, moveItem, copyItem,
  getProfile, addEvent, getSettings, saveSettings, LIST_TYPES,
} from '@/lib/store';
import FolderCard from '@/components/FolderCard';
import MasonryGrid from '@/components/MasonryGrid';
import PlusWheel from '@/components/PlusWheel';
import FolderEditModal from '@/components/FolderEditModal';
import FolderPicker from '@/components/FolderPicker';
import EventModal from '@/components/EventModal';
import ReminderModal from '@/components/ReminderModal';
import ShareDialog from '@/components/ShareDialog';
import ItemEditor from '@/components/ItemEditor';
import { ALL_ITEM_KINDS } from '@/components/AddItemPicker';
import { PARENTS, KINDS } from '@/lib/itemKinds';

export default function Home() {
  const navigate = useNavigate();
  const [folders, setFolders] = useState([]);
  const [profile, setProfile] = useState(getProfile());
  const [createType, setCreateType] = useState(null);
  const [editFolder, setEditFolder] = useState(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [menuFolder, setMenuFolder] = useState(null);
  const [shareData, setShareData] = useState(null);
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
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [movePicker, setMovePicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState(null); // { text, undo? }
  const noticeTimer = React.useRef(null);
  const showNotice = (n, ms = 7000) => { setNotice(n); clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(null), ms); };

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
    { label: 'education', value: 'education', icon: GraduationCap },
    { label: 'cooking', value: 'cooking', icon: ChefHat },
    { label: 'project', value: 'project', icon: FolderKanban },
    { label: 'map', value: 'map_folder', icon: MapIcon },
    { label: 'journal', value: 'journal', icon: BookHeart },
  ];
  // the wheel's inner ring uses a small, curated subset too — every folder
  // TYPE is still fully reachable regardless, since FolderEditModal has its
  // own complete type picker inside it (tapping any wheel option just sets
  // the modal's *starting* type, which can be changed to anything there) —
  // so trimming what's on the ring itself doesn't remove any capability.
  const WHEEL_LIST_VALUES = ['folder', 'todo', 'list', 'note', 'album', 'reminder', 'journal'];
  const WHEEL_LIST_OPTIONS = LIST_OPTIONS.filter((o) => WHEEL_LIST_VALUES.includes(o.value));
  // the wheel's outer ring uses a small, curated subset of ALL_ITEM_KINDS —
  // the full list (movie/series/drama, aspiration/role/programme/course,
  // etc.) is still available via the in-folder "+" add-item picker
  // (AddItemPicker, used in FolderDetail); cramming all 25 variants onto one
  // ring is exactly what made it messy. picking one representative kind per
  // concept keeps the ring small enough to fit without the crowding-related
  // inner/outer sub-ring split ever needing to kick in.
  // the outer ring holds only the PARENT item types; their sub-types (exercise,
  // subscription, recipe, milestone …) are chosen inside the item's own editor
  const wheelGroups = [
    { title: 'lists & folders', items: WHEEL_LIST_OPTIONS },
    { title: 'items', items: Object.values(PARENTS).map((p) => ({ label: p.label, value: p.kind, icon: p.icon })) },
  ];
  const ITEM_PARENT = Object.fromEntries(Object.entries(KINDS).map(([kk, v]) => [kk, v.parent]));
  const ITEM_KINDS = new Set(ALL_ITEM_KINDS.map((it) => it.kind));

  const handleSelect = (value, groupIdx) => {
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
    if (groupIdx === 1) {
      createItemFlow(value);
      return;
    }
    setCreateType(value);
  };

  const createItemFlow = (kind) => {
    const parentType = ITEM_PARENT[kind] || 'list';
    const label = PARENTS[parentType]?.label || ALL_ITEM_KINDS.find((it) => it.kind === kind)?.label || kind;
    const folder = addFolder({ name: 'new ' + label, type: parentType, size: 'portrait', isItemBlock: true });
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
    const f = getFolders().find((x) => x.id === fid);
    if (f && f.isItemBlock) {
      trashFolders([fid]);
      setEditingItem(null);
      refresh();
      return;
    }
    deleteItem(fid, editingItem.item.id);
    if (f && (f.items || []).length <= 1 && f.name.startsWith('new ')) {
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
    if (menuFolder) trashFolders([menuFolder.id]);
    setMenuFolder(null);
    refresh();
  };

  const toggleLayout = () => {
    const next = layout === 'blocks' ? 'list' : 'blocks';
    saveSettings({ homeLayout: next });
    setLayout(next);
  };

  const exitSelect = () => { setSelectMode(false); setSelectedIds([]); setMovePicker(false); setConfirmDelete(false); };
  // the sticky header sits on top of the page, so a block selected while its top edge is tucked
  // under it would have its selection border hidden. after selecting, nudge the page so the whole
  // block (border included) sits just below the header.
  const headerRef = React.useRef(null);
  const revealBlock = (id) => {
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-block-id="${id}"]`);
      const hd = headerRef.current;
      if (!el || !hd) return;
      const clearance = hd.getBoundingClientRect().bottom + 8; // 8px of air for the 3px ring
      const top = el.getBoundingClientRect().top;
      if (top < clearance) window.scrollBy({ top: top - clearance, behavior: 'smooth' });
    });
  };
  const toggleSelected = (id) => {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    revealBlock(id);
  };
  const toggleItemDone = (block) => { const it = (block.items || [])[0]; if (!it) return; updateItem(block.id, it.id, { done: !it.done }); refresh(); };

  const selectedFolders = () => folders.filter((f) => selectedIds.includes(f.id));

  const doMoveSelected = (targetId, targetName) => {
    let ok = 0; let fail = 0;
    selectedFolders().forEach((f) => {
      const moved = f.isItemBlock ? moveItem(f.id, (f.items || [])[0]?.id, targetId) : moveFolder(f.id, targetId);
      if (moved) ok++; else fail++;
    });
    setMovePicker(false);
    exitSelect();
    refresh();
    showNotice({ text: fail ? `moved ${ok} to ${targetName} · ${fail} couldn't be moved` : `moved ${ok} to ${targetName}` }, 4000);
  };

  const doDeleteSelected = () => {
    const entries = trashFolders(selectedIds); // kept in recently deleted, sub-folders and all
    const n = selectedIds.length;
    setConfirmDelete(false);
    exitSelect();
    refresh();
    showNotice({ text: `${n} deleted`, undo: () => { entries.forEach((e) => restoreFolderTrash(e.id)); refresh(); setNotice(null); } }, 1000);
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
    <div className="px-4 sm:px-5 pb-8 pt-2 min-h-screen">
      <div ref={headerRef} className="sticky top-0 z-20 -mx-4 sm:-mx-5 px-4 sm:px-5 pb-4 mb-2 safe-top bg-background/95 backdrop-blur-sm">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold lowercase tracking-tight">retrolist</h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSearchOpen((s) => !s)}
            className={`w-10 h-10 rounded-full flex items-center justify-center ${searchOpen || query ? 'bg-foreground text-background' : 'bg-muted'}`}
            aria-label="search"
          >
            <Search className="w-5 h-5" />
          </button>
          <button
            onClick={toggleLayout}
            className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"
            aria-label="toggle layout"
          >
            {layout === 'blocks' ? <List className="w-5 h-5" /> : <LayoutGrid className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setCreateType('folder')}
            className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center"
            aria-label="new folder"
          >
            <FolderPlus className="w-5 h-5" />
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden"
          >
            {profile.avatar ? (
              <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[8px] font-bold uppercase">{profile.name?.slice(0, 1) || 'y'}</span>
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
          {visibleFolders.length > 0 && (
            <button
              onClick={() => { if (selectMode) exitSelect(); else { setSelectMode(true); setEditMode(false); } }}
              className={`touch-44 shrink-0 flex items-center gap-1 px-3 h-7 rounded-full text-[10px] font-medium lowercase ${selectMode ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}
            >
              <CheckCheck className="w-3 h-3" /> {selectMode ? 'cancel' : 'select'}
            </button>
          )}
          {layout === 'blocks' && visibleFolders.length > 0 && !selectMode && (
            <button
              onClick={() => setEditMode((e) => !e)}
              className={`touch-44 shrink-0 flex items-center gap-1 px-3 h-7 rounded-full text-[10px] font-medium lowercase ${editMode ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}
            >
              {editMode ? 'done' : 'resize'}
            </button>
          )}
        </div>
      )}
      {selectMode && (
        <p className="mb-3 text-[11px] text-muted-foreground lowercase">tap blocks to select · then move them into a folder or delete</p>
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
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleItem={toggleItemDone}
              onResize={(id, data) => { updateFolder(id, data); refresh(); }}
              onReorder={(orderMap) => { reorderFolders(orderMap); refresh(); }}
              onOpen={(id) => {
                const f = folders.find((x) => x.id === id);
                if (!f) return;
                if (selectMode) { toggleSelected(id); return; }
                if (f.isItemBlock) { setEditingItem({ folderId: f.id, item: (f.items || [])[0] }); return; }
                if (f.type === 'reminder') { setReminderFolder(f); setReminderOpen(true); }
                else navigate(`/folder/${id}`);
              }}
              onMenu={(f) => (f.isItemBlock ? setEditingItem({ folderId: f.id, item: (f.items || [])[0] }) : setMenuFolder(f))}
            />
          ) : (
            <div className="space-y-2">
              {visibleFolders.map((f) => (
                <button key={f.id} data-block-id={f.id} style={{ scrollMarginTop: 'calc(env(safe-area-inset-top, 0px) + 96px)' }} onClick={() => { if (selectMode) { toggleSelected(f.id); return; } if (f.isItemBlock) { setEditingItem({ folderId: f.id, item: (f.items || [])[0] }); return; } if (f.type === 'reminder') { setReminderFolder(f); setReminderOpen(true); } else navigate(`/folder/${f.id}`); }} className={`w-full flex items-center gap-3 p-3 rounded-2xl border bg-card active:scale-[0.98] transition-transform text-left ${selectMode && selectedIds.includes(f.id) ? 'border-foreground ring-2 ring-foreground' : 'border-border'}`}>
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

      {!selectMode && <PlusWheel groups={wheelGroups} onSelect={handleSelect} />}

      {selectMode && (
        <div className="fixed left-0 right-0 z-40 px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}>
          <div className="mx-auto max-w-lg flex items-center gap-2 p-2 rounded-3xl bg-foreground text-background shadow-xl">
            <span className="px-3 text-xs lowercase flex-1">{selectedIds.length} selected</span>
            <button onClick={() => setSelectedIds(visibleFolders.map((f) => f.id))} className="touch-44 px-3 h-10 rounded-2xl text-xs lowercase text-background/80">all</button>
            <button disabled={!selectedIds.length} onClick={() => setMovePicker(true)} className="touch-44 flex items-center gap-1.5 px-4 h-10 rounded-2xl bg-background text-foreground text-xs font-medium lowercase disabled:opacity-30"><FolderInput className="w-4 h-4" /> move</button>
            <button disabled={!selectedIds.length} onClick={() => setConfirmDelete(true)} className="touch-44 flex items-center gap-1.5 px-4 h-10 rounded-2xl bg-destructive text-destructive-foreground text-xs font-medium lowercase disabled:opacity-30"><Trash2 className="w-4 h-4" /> bin</button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-6" onClick={() => setConfirmDelete(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-xs rounded-3xl bg-card border border-border p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold lowercase mb-1">move {selectedIds.length} to the bin?</p>
            <p className="text-xs text-muted-foreground lowercase mb-4">folders take everything inside them too. they go to recently deleted, where you can restore them in full.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="touch-44 flex-1 py-2.5 rounded-2xl bg-muted text-xs font-medium lowercase">keep</button>
              <button onClick={doDeleteSelected} className="touch-44 flex-1 py-2.5 rounded-2xl bg-destructive text-destructive-foreground text-xs font-medium lowercase">delete</button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className="fixed left-0 right-0 z-[70] px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 9rem)' }}>
          <div className="mx-auto max-w-sm flex items-center gap-3 px-4 py-3 rounded-2xl bg-foreground text-background text-xs lowercase shadow-xl">
            <span className="flex-1">{notice.text}</span>
            {notice.undo && <button onClick={notice.undo} className="touch-44 font-semibold underline">undo</button>}
          </div>
        </div>
      )}

      <FolderPicker
        open={movePicker}
        title={`move ${selectedIds.length} to`}
        kind={selectedFolders().length > 0 && selectedFolders().every((f) => f.isItemBlock) ? 'item' : 'folder'}
        mode="move"
        movingFolderIds={selectedFolders().filter((f) => !f.isItemBlock).map((f) => f.id)}
        currentContainerId={null}
        currentIsRoot
        onCreated={refresh}
        onClose={() => setMovePicker(false)}
        onSelect={doMoveSelected}
      />

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
        onDelete={editFolder ? () => { trashFolders([editFolder.id]); setEditFolder(null); refresh(); } : undefined}
      />
      <EventModal
        open={eventOpen}
        onClose={() => setEventOpen(false)}
        onSave={(e) => {
          addEvent(e);
          navigate('/journal');
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
        onDelete={reminderFolder ? () => { trashFolders([reminderFolder.id]); setReminderOpen(false); setReminderFolder(null); refresh(); } : undefined}
      />
      <ShareDialog
        open={!!shareData}
        data={shareData}
        title={shareData?.name}
        onClose={() => setShareData(null)}
      />
      <FolderPicker
        open={!!picker}
        title={picker?.mode === 'copy' ? 'copy folder to' : 'move folder to'}
        kind="folder"
        mode={picker?.mode === 'copy' ? 'copy' : 'move'}
        movingFolderIds={picker ? [picker.folder.id] : []}
        currentContainerId={null}
        currentIsRoot
        onCreated={refresh}
        onClose={() => setPicker(null)}
        onSelect={(targetId, targetName) => {
          if (!picker) return;
          let ok = true;
          if (picker.mode === 'move') ok = moveFolder(picker.folder.id, targetId);
          else copyFolder(picker.folder.id, targetId);
          setPicker(null);
          refresh();
          showNotice({ text: ok ? `${picker.mode === 'copy' ? 'copied' : 'moved'} to ${targetName}` : "couldn't move it there" }, 3500);
        }}
      />

      {editingItem && (
        <ItemEditor
          item={editingItem.item}
          folderType={getFolders().find((x) => x.id === editingItem.folderId)?.type || ITEM_PARENT[editingItem.item.kind] || 'list'}
          folderId={editingItem.folderId}
          atRoot
          onMove={(itemId, toId) => { if (toId) { const ok = moveItem(editingItem.folderId, itemId, toId); setEditingItem(null); refresh(); showNotice({ text: ok ? 'item moved' : "couldn't move the item" }, 3500); } }}
          onCopy={(itemId, toId) => { if (toId) { copyItem(editingItem.folderId, itemId, toId); refresh(); showNotice({ text: 'item copied' }, 3500); } }}
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