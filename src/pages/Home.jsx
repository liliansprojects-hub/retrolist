import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckSquare, List, Star, MapPin, Bell, StickyNote, Palette, Repeat,
  Calendar, Book, Film, Map as MapIcon, BookHeart, Share2, Pencil, Trash2,
} from 'lucide-react';
import {
  getFolders, addFolder, updateFolder, deleteFolder, getProfile, addEvent,
} from '@/lib/store';
import FolderCard from '@/components/FolderCard';
import PlusWheel from '@/components/PlusWheel';
import FolderEditModal from '@/components/FolderEditModal';
import EventModal from '@/components/EventModal';
import ShareDialog from '@/components/ShareDialog';

export default function Home() {
  const navigate = useNavigate();
  const [folders, setFolders] = useState([]);
  const [profile, setProfile] = useState(getProfile());
  const [createType, setCreateType] = useState(null);
  const [editFolder, setEditFolder] = useState(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [menuFolder, setMenuFolder] = useState(null);
  const [shareData, setShareData] = useState(null);

  const refresh = () => {
    setFolders(getFolders());
    setProfile(getProfile());
  };

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('retrolist:synced', handler);
    return () => window.removeEventListener('retrolist:synced', handler);
  }, []);

  const wheelItems = [
    { label: 'todo', value: 'todo', icon: CheckSquare },
    { label: 'list', value: 'list', icon: List },
    { label: 'aspiration', value: 'aspiration', icon: Star },
    { label: 'places', value: 'place', icon: MapPin },
    { label: 'reminder', value: 'reminder', icon: Bell },
    { label: 'note', value: 'note', icon: StickyNote },
    { label: 'hobby', value: 'hobby', icon: Palette },
    { label: 'habit', value: 'habit', icon: Repeat },
    { label: 'event', value: 'event', icon: Calendar },
    { label: 'books', value: 'book', icon: Book },
    { label: 'movies', value: 'movie', icon: Film },
    { label: 'map', value: 'map_folder', icon: MapIcon },
    { label: 'journal', value: 'journal', icon: BookHeart },
  ];

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
    setCreateType(value);
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

  return (
    <div className="safe-top px-4 pb-4 min-h-screen">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold lowercase tracking-tight">retrolist</h1>
          <p className="text-sm text-muted-foreground lowercase mt-0.5">
            hi, {profile.name} ✶
          </p>
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="touch-44 w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold uppercase"
        >
          {profile.name?.slice(0, 1) || 'y'}
        </button>
      </header>

      {folders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <svg
            className="w-20 h-20 text-muted-foreground/20 mb-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H10L8 6H4a1 1 0 0 0-1 1z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
          <p className="text-sm text-muted-foreground lowercase">no folders yet</p>
          <p className="text-xs text-muted-foreground/50 lowercase mt-1">
            hold + to choose a list type
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {folders.map((f) => (
            <FolderCard
              key={f.id}
              folder={f}
              onClick={() => navigate(`/folder/${f.id}`)}
              onMenu={() => setMenuFolder(f)}
            />
          ))}
        </div>
      )}

      <PlusWheel items={wheelItems} onSelect={handleSelect} />

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
      <ShareDialog
        open={!!shareData}
        data={shareData}
        title={shareData?.name}
        onClose={() => setShareData(null)}
      />

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
                onClick={() => {
                  setEditFolder(menuFolder);
                  setMenuFolder(null);
                }}
                className="touch-44 w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted text-sm lowercase"
              >
                <Pencil className="w-4 h-4 text-muted-foreground" /> edit
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