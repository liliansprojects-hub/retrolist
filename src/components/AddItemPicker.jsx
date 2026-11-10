import React, { useState } from 'react';
import {
  Plus, CheckSquare, List, CircleDot, Film, Tv, Clapperboard, Book, Headphones, Star,
  Dumbbell, PiggyBank, Repeat, Palette, MapPin, X, Briefcase, GraduationCap, Compass,
  Trophy, Languages, Wrench, Folder, StickyNote, Images, ListPlus, ChefHat, FolderKanban,
} from 'lucide-react';
import { ALL_ITEM_KINDS, subKindsOf } from '@/lib/itemKinds';

// bottom-centre "add" button. in a plain folder it offers the same list of
// list-types as the main page (so you can drop any sub-list inside); in a
// feature list it offers type-specific item options (todo→todo/checklist/list,
// movie→movie/series/drama, habit→exercise/saving/habit, …).
const FOLDER_LIST = [
  { kind: 'folder', label: 'folder', icon: Folder },
  { kind: 'todo', label: 'todo', icon: CheckSquare },
  { kind: 'list', label: 'list', icon: List },
  { kind: 'aspiration', label: 'aspiration', icon: Star },
  { kind: 'place', label: 'places', icon: MapPin },
  { kind: 'note', label: 'note', icon: StickyNote },
  { kind: 'hobby', label: 'hobby', icon: Palette },
  { kind: 'habit', label: 'habit', icon: Repeat },
  { kind: 'book', label: 'books', icon: Book },
  { kind: 'movie', label: 'movies', icon: Film },
  { kind: 'album', label: 'album', icon: Images },
  { kind: 'education', label: 'education', icon: GraduationCap },
  { kind: 'cooking', label: 'cooking', icon: ChefHat },
  { kind: 'project', label: 'project', icon: FolderKanban },
];

// feature lists offer that parent's sub-types; the full flat list is exported for the
// "all items" pickers
const OPTIONS = {
  todo: subKindsOf('todo').concat([{ kind: 'list', label: 'list', icon: List }]),
  list: [{ kind: 'list', label: 'item', icon: List }, { kind: 'note', label: 'note', icon: StickyNote }],
  movie: subKindsOf('movie'), book: subKindsOf('book'), aspiration: subKindsOf('aspiration'),
  habit: subKindsOf('habit'), hobby: subKindsOf('hobby'),
  education: subKindsOf('education'), cooking: subKindsOf('cooking'), project: subKindsOf('project'),
  place: [{ kind: 'place', label: 'place', icon: MapPin }],
  folder: FOLDER_LIST,
};

export { ALL_ITEM_KINDS };

export default function AddItemPicker({ folderType, onSelect }) {
  const [open, setOpen] = useState(false);
  const opts = OPTIONS[folderType] || OPTIONS.list;
  if (!opts || !opts.length) return null;
  const isFolder = folderType === 'folder';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed z-50 touch-44 flex items-center justify-center w-14 h-14 rounded-full bg-foreground text-background shadow-lg shadow-foreground/20 active:scale-90 transition-transform icon-no-select"
        style={{ bottom: '6rem', left: '50%', transform: 'translateX(-50%)', touchAction: 'manipulation' }}
        aria-label={isFolder ? 'new list or folder' : 'add item'}
      >
        {isFolder ? <ListPlus className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />
          <div className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto no-scrollbar bg-card rounded-t-3xl border-t border-border p-5 pb-8 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} className="touch-44 absolute top-3 right-3 w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center"><X className="w-4 h-4" /></button>
            <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-4" />
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 lowercase">{isFolder ? 'new list or folder' : 'add item'}</h3>
            <div className="grid grid-cols-3 gap-3">
              {opts.map((o) => (
                <button key={o.kind} onClick={() => { setOpen(false); onSelect(o.kind); }} className="touch-44 flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-background border border-border active:scale-95 transition-transform icon-no-select">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-muted"><o.icon className="w-5 h-5 text-foreground" /></div>
                  <span className="text-[10px] font-medium text-muted-foreground lowercase">{o.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}