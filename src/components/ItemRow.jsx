import React from 'react';
import { Check, ChevronRight, Paperclip, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

const defaultKind = (folderType) => ({
  todo: 'todo', list: 'list', book: 'book', movie: 'movie', aspiration: 'aspiration',
  habit: 'habit', hobby: 'hobby', place: 'place', reminder: 'todo',
}[folderType] || 'list');

function readableText(hex) {
  if (!hex || hex[0] !== '#') return undefined;
  const c = hex.length === 4 ? hex.slice(1).split('').map((x) => x + x).join('') : hex.slice(1);
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#1a1a1a' : '#fff';
}

// compact item row: vertically centred, meta line sits just under the title,
// optional todo/checklist toggle, paperclip count, chevron to the editor.
// colour styles: full = solid colour fill; tip (l)/(r) = a 1/6-width rounded
// bar on one side with a semicircular inner edge (like "(" / ")").
export default function ItemRow({ item, folderType, onUpdate, onOpen }) {
  const kind = item.kind || defaultKind(folderType);
  const isTodo = kind === 'todo';
  const isChecklist = kind === 'checklist';
  const showYear = ['movie', 'series', 'drama', 'book', 'audiobook'].includes(kind);
  const showDate = kind === 'aspiration';
  const mediaCount = (item.media?.length || 0) + (item.photo ? 1 : 0);

  const toggle = () => { if (isTodo || isChecklist) onUpdate(item.id, { done: !item.done }); };

  const hasColor = !!item.color;
  const isFull = hasColor && item.style === 'full';
  const tipLeft = hasColor && item.style === 'tip-left';
  const tipRight = hasColor && item.style === 'tip-right';
  const contentColor = isFull ? readableText(item.color) : undefined;

  const textClass = cn(
    'w-full text-sm bg-transparent outline-none selectable min-w-0',
    isTodo && item.done && 'line-through text-muted-foreground',
    isChecklist && item.done && 'text-muted-foreground'
  );

  const meta = [];
  if (item.subheading) meta.push(item.subheading);
  if (showYear && item.year) meta.push(item.year);
  if (showDate && item.date) meta.push(item.date);
  if (kind === 'exercise') {
    if (item.reps) meta.push(item.reps + ' reps');
    if (item.times) meta.push(item.times + ' sets');
  }
  if (kind === 'saving' && item.amount) meta.push('£' + item.amount);

  const short = item.itemHeight === 'short';
  const padY = short ? 'py-1.5' : 'py-3';
  const minH = short ? 'min-h-[29px]' : 'min-h-[58px]'; // 29 = exactly half of 58

  const bg = isFull ? { backgroundColor: item.color + 'D9' } : undefined;

  return (
    <div
      className={cn(
        'relative rounded-2xl overflow-hidden transition-all flex items-center',
        padY, minH,
        !hasColor && 'border border-border',
        (tipLeft || tipRight) && 'shadow-[0_1px_3px_rgba(0,0,0,0.10)]'
      )}
      style={bg}
    >
      {tipLeft && <span className="absolute top-0 bottom-0 left-0 rounded-r-2xl" style={{ width: '12.5%', backgroundColor: item.color }} />}
      {tipRight && <span className="absolute top-0 bottom-0 right-0 rounded-l-2xl" style={{ width: '12.5%', backgroundColor: item.color }} />}
      <div
        className="relative flex items-center gap-2 w-full"
        style={{ paddingLeft: tipLeft ? 'calc(12.5% + 12px)' : '16px', paddingRight: tipRight ? 'calc(12.5% + 12px)' : '12px', ...(contentColor ? { color: contentColor } : {}) }}
      >
        {isTodo && (
          <button onClick={toggle} className={cn('touch-44 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 icon-no-select', item.done ? 'bg-foreground border-foreground' : 'border-border')}>
            {item.done && <Check className="w-3.5 h-3.5 text-background" strokeWidth={3} />}
          </button>
        )}
        {isChecklist && (
          <button onClick={toggle} className={cn('touch-44 w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 icon-no-select', item.done ? 'bg-foreground border-foreground' : 'border-border')}>
            {item.done && <Check className="w-3.5 h-3.5 text-background" strokeWidth={3} />}
          </button>
        )}
        <div className="flex-1 min-w-0 flex flex-col justify-center leading-tight">
          <input value={item.text || ''} onChange={(e) => onUpdate(item.id, { text: e.target.value })} placeholder="type something..." className={textClass} />
          {(meta.length > 0 || mediaCount > 0) && (
            <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0 text-[11px] lowercase', isFull ? '' : 'text-muted-foreground')}>
              {meta.map((m, i) => (
                <span key={i} className="whitespace-nowrap">{m}{i < meta.length - 1 ? ' ·' : ''}</span>
              ))}
              {mediaCount > 0 && (
                <span className="flex items-center gap-0.5"><Paperclip className="w-3 h-3" /> {mediaCount}</span>
              )}
            </div>
          )}
        </div>
        {folderType === 'reminder' && (
          <button
            onClick={() => {
              const time = prompt('set reminder time (e.g. 14:30)');
              if (time) { onUpdate(item.id, { remindAt: time }); if ('Notification' in window) Notification.requestPermission(); }
            }}
            className="touch-44 p-1 rounded-full text-muted-foreground shrink-0"
          >
            <Bell className={cn('w-4 h-4', item.remindAt && 'text-foreground fill-foreground')} />
          </button>
        )}
        <button onClick={() => onOpen?.(item)} className="touch-44 p-1 rounded-full text-muted-foreground shrink-0">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}