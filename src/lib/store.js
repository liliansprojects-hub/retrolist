// offline-first localStorage data layer for retrolist

const PREFIX = 'retrolist_';

const read = (key, fallback) => {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key, val) => {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(val));
  } catch (e) {
    console.error('storage write failed', e);
  }
  // notify sync layer that local data changed
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('retrolist:data-changed'));
  }
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ── sync: deleted records log (tracks local deletes to propagate to cloud) ──
export const getDeletedLog = () => read('deleted_log', []);
export const clearDeletedLog = () => {
  try { localStorage.setItem(PREFIX + 'deleted_log', JSON.stringify([])); } catch {}
};
export const saveDeletedLog = (log) => {
  try { localStorage.setItem(PREFIX + 'deleted_log', JSON.stringify(log)); } catch {}
};
export const logDelete = (kind, localId) => {
  const log = getDeletedLog();
  log.push({ kind, local_id: localId, at: Date.now() });
  try { localStorage.setItem(PREFIX + 'deleted_log', JSON.stringify(log)); } catch {}
};

// ── profile ──
export const getProfile = () =>
  read('profile', {
    name: 'you',
    bio: '',
    avatar: null,
    theme: 'system',
    accent: '#1a1a1a',
    font: 'nunito',
  });
export const saveProfile = (p) => write('profile', { ...getProfile(), ...p, updated_date: Date.now() });
// used by sync to write a cloud record back without bumping the timestamp
export const saveProfileRaw = (p) => write('profile', p);

// ── folders ──
export const getFolders = () => read('folders', []);
export const saveFolders = (f) => write('folders', f);
export const addFolder = (folder) => {
  const folders = getFolders();
  const f = { id: uid(), items: [], created_date: Date.now(), ...folder };
  saveFolders([...folders, f]);
  return f;
};
export const updateFolder = (id, updates) => {
  const folders = getFolders().map((f) => (f.id === id ? { ...f, ...updates, updated_date: Date.now() } : f));
  saveFolders(folders);
};
export const deleteFolder = (id) => {
  logDelete('folder', id);
  saveFolders(getFolders().filter((f) => f.id !== id));
};
export const getFolder = (id) => getFolders().find((f) => f.id === id);

// ── items within folders ──
export const addItem = (folderId, item) => {
  const folders = getFolders();
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return null;
  const newItem = { id: uid(), done: false, created_date: Date.now(), ...item };
  folder.items = [...(folder.items || []), newItem];
  folder.updated_date = Date.now();
  saveFolders(folders);
  return newItem;
};
export const updateItem = (folderId, itemId, updates) => {
  const folders = getFolders();
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return;
  folder.items = (folder.items || []).map((i) => (i.id === itemId ? { ...i, ...updates, updated_date: Date.now() } : i));
  folder.updated_date = Date.now();
  saveFolders(folders);
};
export const deleteItem = (folderId, itemId) => {
  const folders = getFolders();
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return;
  folder.items = (folder.items || []).filter((i) => i.id !== itemId);
  folder.updated_date = Date.now();
  saveFolders(folders);
};

// ── journal entries ──
export const getJournal = () => read('journal', []);
export const saveJournal = (j) => write('journal', j);
export const addJournalEntry = (entry) => {
  const j = getJournal();
  const e = { id: uid(), created_date: Date.now(), ...entry };
  saveJournal([e, ...j]);
  return e;
};
export const updateJournalEntry = (id, updates) =>
  saveJournal(getJournal().map((e) => (e.id === id ? { ...e, ...updates, updated_date: Date.now() } : e)));
export const deleteJournalEntry = (id) => {
  logDelete('journal', id);
  saveJournal(getJournal().filter((e) => e.id !== id));
};
export const getEntryByDate = (date) => getJournal().find((e) => e.date === date);

// ── events (calendar) ──
export const getEvents = () => read('events', []);
export const saveEvents = (e) => write('events', e);
export const addEvent = (event) => {
  const e = getEvents();
  const newEvent = { id: uid(), created_date: Date.now(), ...event };
  saveEvents([...e, newEvent]);
  return newEvent;
};
export const deleteEvent = (id) => {
  logDelete('event', id);
  saveEvents(getEvents().filter((e) => e.id !== id));
};

// ── period tracking ──
export const getPeriodData = () => read('period', []);
export const savePeriod = (p) => write('period', p);
export const addPeriodEntry = (entry) => {
  const p = getPeriodData();
  const e = { id: uid(), created_date: Date.now(), ...entry };
  savePeriod([...p, e]);
  return e;
};
export const deletePeriodEntry = (id) => {
  logDelete('period', id);
  savePeriod(getPeriodData().filter((p) => p.id !== id));
};

// ── map folders & places ──
export const getMapFolders = () => {
  const existing = read('map_folders', null);
  if (existing) return existing;
  // persist the default so the ID stays stable across calls (avoids sync duplicates)
  const defaultFolders = [{ id: uid(), name: 'saved places', places: [], created_date: Date.now() }];
  try { localStorage.setItem(PREFIX + 'map_folders', JSON.stringify(defaultFolders)); } catch {}
  return defaultFolders;
};
export const saveMapFolders = (mf) => write('map_folders', mf);
export const addMapFolder = (folder) => {
  const mf = getMapFolders();
  const f = { id: uid(), places: [], created_date: Date.now(), ...folder };
  saveMapFolders([...mf, f]);
  return f;
};
export const updateMapFolder = (id, updates) => {
  saveMapFolders(getMapFolders().map((f) => (f.id === id ? { ...f, ...updates, updated_date: Date.now() } : f)));
};
export const deleteMapFolder = (id) => {
  logDelete('map_folder', id);
  saveMapFolders(getMapFolders().filter((f) => f.id !== id));
};
export const addPlace = (folderId, place) => {
  const mf = getMapFolders();
  const folder = mf.find((f) => f.id === folderId);
  if (!folder) return null;
  const p = { id: uid(), created_date: Date.now(), ...place };
  folder.places = [...(folder.places || []), p];
  folder.updated_date = Date.now();
  saveMapFolders(mf);
  return p;
};
export const deletePlace = (folderId, placeId) => {
  const mf = getMapFolders();
  const folder = mf.find((f) => f.id === folderId);
  if (folder) {
    folder.places = (folder.places || []).filter((p) => p.id !== placeId);
    folder.updated_date = Date.now();
    saveMapFolders(mf);
  }
};

// ── shared folders (simple link-based) ──
export const getSharedData = (shareId) => read('share_' + shareId, null);
export const createShare = (data) => {
  const shareId = uid();
  write('share_' + shareId, data);
  return shareId;
};

// ── account deletion ──
export const deleteAccount = () => {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
  keys.forEach((k) => localStorage.removeItem(k));
};

// ── color palette ──
export const COLORS = [
  '#000000', '#1a1a1a', '#2d2d2d', '#404040', '#525252', '#737373', '#a3a3a3', '#d4d4d4', '#ffffff',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
  '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#e11d48',
  '#dc2626', '#ea580c', '#ca8a04', '#65a30d', '#16a34a', '#059669', '#0d9488', '#0891b2', '#0284c7',
  '#2563eb', '#4f46e5', '#7c3aed', '#9333ea', '#c026d3', '#db2777', '#be185d', '#9f1239', '#7f1d1d',
  '#78350f', '#365314', '#14532d', '#064e3b', '#115e59', '#155e75', '#1e3a8a', '#3730a3', '#581c87',
  '#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6', '#ec4899', '#db2777', '#be185d', '#9d174d', '#831843',
  '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95',
  '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a',
  '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f',
  '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857', '#065f46', '#064e3b',
  '#cffafe', '#a5f3fc', '#67e8f9', '#22d3ee', '#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63',
  '#f3e8ff', '#e9d5ff', '#d8b4fe', '#c084fc', '#a855f7', '#9333ea', '#7e22ce', '#6b21a8', '#581c87',
  '#ffedd5', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12',
  '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d', '#450a0a',
  '#fafafa', '#f4f4f5', '#e4e4e7', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b', '#3f3f46', '#27272a',
  '#fdf4ff', '#fae8ff', '#f5d0fe', '#f0abfc', '#e879f9', '#d946ef', '#c026d3', '#a21caf', '#86198f',
  '#ecfeff', '#cffafe', '#a5f3fc', '#67e8f9', '#22d3ee', '#06b6d4', '#0891b2', '#0e7490', '#155e75',
  '#fff7ed', '#ffedd5', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412',
  '#f0fdf4', '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534',
];

// ── list type definitions ──
export const LIST_TYPES = {
  todo: { label: 'todo list', icon: 'check-square', hasCheckbox: true, crossOut: true },
  list: { label: 'list', icon: 'list', hasCheckbox: false },
  aspiration: { label: 'aspiration list', icon: 'star', hasCheckbox: false },
  place: { label: 'place list', icon: 'map-pin', hasCheckbox: false },
  reminder: { label: 'reminder', icon: 'bell', hasCheckbox: true, crossOut: false, hasNotification: true },
  note: { label: 'note', icon: 'file-text', hasCheckbox: false, hasBody: true },
  hobby: { label: 'hobby', icon: 'palette', hasCheckbox: false },
  habit: { label: 'habit', icon: 'repeat', hasCheckbox: true, crossOut: false },
  event: { label: 'event', icon: 'calendar', isEvent: true },
  book: { label: 'book list', icon: 'book', hasCheckbox: true, crossOut: true },
  movie: { label: 'movie list', icon: 'film', hasCheckbox: true, crossOut: true },
};