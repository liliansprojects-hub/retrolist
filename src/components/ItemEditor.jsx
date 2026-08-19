import React, { useState } from 'react';
import { Trash2, Share2, FolderInput, Copy, ChevronLeft, Check, PanelLeft, PanelRight, Square, RectangleVertical } from 'lucide-react';
import ColorPicker from './ColorPicker';
import MediaUploader from './MediaUploader';
import FolderPicker from './FolderPicker';
import ShareDialog from './ShareDialog';
import { cn } from '@/lib/utils';

const defaultKind = (folderType) => ({
  todo: 'todo', list: 'list', book: 'book', movie: 'movie', aspiration: 'aspiration',
  habit: 'habit', hobby: 'hobby', place: 'place',
}[folderType] || 'list');

const KIND_LABELS = {
  todo: 'todo', checklist: 'checklist', list: 'list', movie: 'movie', series: 'series',
  drama: 'drama', book: 'book', audiobook: 'audiobook', magazine: 'magazine', article: 'article',
  aspiration: 'goal', role: 'role', programme: 'programme', course: 'course',
  exercise: 'exercise', saving: 'saving', habit: 'habit', hobby: 'hobby',
  interest: 'interest', sport: 'sport', arts: 'arts', language: 'language', skills: 'skills', place: 'place',
};

const KIND_META = {
  todo: { name: 'to-do', sub: 'subheading' },
  checklist: { name: 'checklist item', sub: 'subheading' },
  list: { name: 'item', sub: 'subheading' },
  note: { name: 'note', sub: 'subheading' },
  movie: { name: 'movie title', sub: 'director' },
  series: { name: 'series title', sub: 'subheading' },
  drama: { name: 'drama title', sub: 'subheading' },
  book: { name: 'book title', sub: 'author' },
  audiobook: { name: 'audiobook title', sub: 'author' },
  magazine: { name: 'magazine', sub: 'issue' },
  article: { name: 'article title', sub: 'source' },
  aspiration: { name: 'goal', sub: 'subheading' },
  role: { name: 'role', sub: 'subheading' },
  programme: { name: 'programme', sub: 'subheading' },
  course: { name: 'course', sub: 'subheading' },
  exercise: { name: 'exercise', sub: 'target' },
  saving: { name: 'saving goal', sub: 'subheading' },
  habit: { name: 'habit', sub: 'subheading' },
  hobby: { name: 'hobby', sub: 'subheading' },
  interest: { name: 'interest', sub: 'subheading' },
  sport: { name: 'sport', sub: 'subheading' },
  arts: { name: 'art form', sub: 'subheading' },
  language: { name: 'language', sub: 'subheading' },
  skills: { name: 'skill', sub: 'subheading' },
  place: { name: 'place name', sub: 'subheading' },
};

// separate-window item editor: name + subheading + type-specific fields (year,
// date/month, reps/times, amount), notes, colour, photos/files, link, and
// move/copy/share. items are leaf nodes — nothing can be added inside them,
// only edited or deleted.
export default function ItemEditor({ item, folderType, onClose, onSave, onDelete, onMove, onCopy }) {
  const kind = item.kind || defaultKind(folderType);
  const [text, setText] = useState(item.text || '');
  const [subheading, setSubheading] = useState(item.subheading || '');
  const [year, setYear] = useState(item.year || '');
  const [date, setDate] = useState(item.date || '');
  const [reps, setReps] = useState(item.reps || '');
  const [times, setTimes] = useState(item.times || '');
  const [amount, setAmount] = useState(item.amount || '');
  const [notes, setNotes] = useState(item.notes || item.body || '');
  const [color, setColor] = useState(item.color || '');
  const [url, setUrl] = useState(item.url || '');
  const [media, setMedia] = useState(item.media || (item.photo ? [{ id: 'legacy', type: 'photo', url: item.photo }] : []));
  const [done, setDone] = useState(!!item.done);
  const [style, setStyle] = useState(item.style || 'tip-left');
  const [itemHeight, setItemHeight] = useState(item.itemHeight || 'long');
  const [pendingAction, setPendingAction] = useState(null);
  const [picker, setPicker] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);

  const isTodoish = kind === 'todo' || kind === 'checklist';
  const showSubheading = ['list', 'note', 'movie', 'series', 'drama', 'book', 'audiobook', 'magazine', 'article', 'hobby', 'interest', 'sport', 'arts', 'language', 'skills', 'place', 'exercise', 'saving', 'habit', 'aspiration', 'role', 'programme', 'course'].includes(kind);
  const showYear = ['movie', 'series', 'drama', 'book', 'audiobook', 'magazine', 'article'].includes(kind);
  const showDate = ['aspiration', 'role', 'programme', 'course'].includes(kind);
  const showReps = kind === 'exercise';
  const showAmount = kind === 'saving';
  const canUrl = true;

  const draft = { text, subheading, year, date, reps, times, amount, notes: notes, body: notes, color, url, media, done, kind, style, itemHeight };

  // move/copy is deferred until "save" is pressed — the chosen target is held
  // here and applied after the draft is persisted, so the moved/copied version
  // carries the latest contents.
  const save = () => {
    onSave(draft);
    if (pendingAction) {
      if (pendingAction.type === 'move' && onMove) onMove(item.id, pendingAction.targetId);
      else if (pendingAction.type === 'copy' && onCopy) onCopy(item.id, pendingAction.targetId);
    }
    onClose();
  };
  // a brand-new item is only persisted once "save" is pressed — cancelling
  // (backdrop / back) always removes it; for existing items, cancel keeps the
  // original (unsaved edits are discarded).
  const cancel = () => { if (item.__isNew) onDelete(); else onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={cancel}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto no-scrollbar bg-card rounded-t-3xl sm:rounded-3xl border border-border p-5 pb-8 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={cancel} className="touch-44 flex items-center gap-1 text-xs font-medium lowercase text-muted-foreground"><ChevronLeft className="w-4 h-4" /> back</button>
          <h3 className="text-sm font-semibold lowercase">{item.__isNew ? 'new ' + (KIND_LABELS[kind] || 'item') : 'edit item'}</h3>
          <button onClick={() => onDelete()} className="touch-44 p-1 rounded-full text-destructive"><Trash2 className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          {isTodoish && (
            <div className="flex items-center gap-2">
              <button onClick={() => setDone(!done)} className={cn('touch-44 w-6 h-6 rounded-full border-2 flex items-center justify-center', done ? 'bg-foreground border-foreground' : 'border-border')}>
                {done && <Check className="w-3.5 h-3.5 text-background" strokeWidth={3} />}
              </button>
              <span className="text-xs text-muted-foreground lowercase">{kind === 'todo' ? 'cross out when done' : 'tick when done'}</span>
            </div>
          )}

          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={KIND_META[kind]?.name || 'name'} autoFocus className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm font-semibold outline-none focus:border-foreground" />

          {showSubheading && (
            <input value={subheading} onChange={(e) => setSubheading(e.target.value)} placeholder={KIND_META[kind]?.sub || 'subheading'} className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground" />
          )}
          {showYear && (
            <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="year" inputMode="numeric" className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground" />
          )}
          {showDate && (
            <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="date / month (e.g. aug 2026)" className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground" />
          )}
          {showReps && (
            <div className="flex gap-2">
              <input value={reps} onChange={(e) => setReps(e.target.value)} placeholder="reps" inputMode="numeric" className="flex-1 px-2 py-2 rounded-lg bg-background border border-border text-xs outline-none focus:border-foreground" />
              <input value={times} onChange={(e) => setTimes(e.target.value)} placeholder="sets" inputMode="numeric" className="flex-1 px-2 py-2 rounded-lg bg-background border border-border text-xs outline-none focus:border-foreground" />
            </div>
          )}
          {showAmount && (
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="amount (£)" inputMode="decimal" className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground" />
          )}

          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="notes…" rows={4} className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground resize-none selectable" />

          {canUrl && (
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="link (url)" className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground" />
          )}

          <MediaUploader media={media} onChange={setMedia} enableViewer />
          <ColorPicker value={color} onChange={setColor} label="item colour" />
          {color && (
            <div>
              <span className="text-xs font-medium text-muted-foreground lowercase block mb-2">item style</span>
              <div className="flex gap-2">
                <button onClick={() => setStyle('full')} className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs lowercase', style === 'full' ? 'bg-foreground text-background border-foreground' : 'bg-background border-border')}>
                  <Square className="w-4 h-4" /> full
                </button>
                <button onClick={() => setStyle('tip-left')} className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs lowercase', style === 'tip-left' ? 'bg-foreground text-background border-foreground' : 'bg-background border-border')}>
                  <PanelLeft className="w-4 h-4" /> tip (l)
                </button>
                <button onClick={() => setStyle('tip-right')} className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs lowercase', style === 'tip-right' ? 'bg-foreground text-background border-foreground' : 'bg-background border-border')}>
                  <PanelRight className="w-4 h-4" /> tip (r)
                </button>
              </div>
            </div>
          )}

          <div>
            <span className="text-xs font-medium text-muted-foreground lowercase block mb-2">item height</span>
            <div className="flex gap-2">
              <button onClick={() => setItemHeight('long')} className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs lowercase', itemHeight === 'long' ? 'bg-foreground text-background border-foreground' : 'bg-background border-border')}>
                <RectangleVertical className="w-4 h-4" /> longer
              </button>
              <button onClick={() => setItemHeight('short')} className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs lowercase', itemHeight === 'short' ? 'bg-foreground text-background border-foreground' : 'bg-background border-border')}>
                <Square className="w-4 h-4" /> shorter
              </button>
            </div>
          </div>

          {pendingAction && (
            <div className="px-3 py-2 rounded-xl bg-muted text-xs lowercase text-center text-muted-foreground">
              will {pendingAction.type} to new spot on save
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={() => setPicker('move')} className="touch-44 flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted text-xs font-medium lowercase"><FolderInput className="w-3.5 h-3.5" /> move to</button>
            <button onClick={() => setPicker('copy')} className="touch-44 flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted text-xs font-medium lowercase"><Copy className="w-3.5 h-3.5" /> copy to</button>
            <button onClick={() => setShareOpen(true)} className="touch-44 flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted text-xs font-medium lowercase"><Share2 className="w-3.5 h-3.5" /> share</button>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground/60 lowercase text-center mt-5">
          {item.__isNew ? 'created ' : 'updated '}{new Date(item.created_date || Date.now()).toLocaleString()}
        </p>
        <button onClick={save} className="touch-44 w-full mt-3 py-3 rounded-2xl bg-foreground text-background text-sm font-medium lowercase">save</button>

        <FolderPicker
          open={!!picker}
          title={picker === 'copy' ? 'copy to' : 'move to'}
          allowMainPage={false}
          excludeTypes={['note', 'album']}
          onClose={() => setPicker(null)}
          onSelect={(targetId) => {
            setPendingAction({ type: picker, targetId });
            setPicker(null);
          }}
        />
        <ShareDialog open={shareOpen} data={{ ...item, ...draft, kind: 'item' }} title={text || 'item'} onClose={() => setShareOpen(false)} />
      </div>
    </div>
  );
}