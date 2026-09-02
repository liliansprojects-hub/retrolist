import React from 'react';
import { MoreVertical, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';

function readableText(hex) {
  if (!hex || hex[0] !== '#') return undefined;
  const c = hex.length === 4 ? hex.slice(1).split('').map((x) => x + x).join('') : hex.slice(1);
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#1a1a1a' : '#fff';
}

// a loose item shown directly on the main page (not wrapped in a folder
// cover): renders the item the way it looks inside a list — colour tip, title,
// subheading, media count — and fills its resizable block. tap opens the editor.
export default function ItemBlock({ folder, onClick, onMenu }) {
  const item = (folder.items || [])[0] || {};
  const hasColor = !!item.color;
  const isFull = hasColor && item.style === 'full';
  const tipLeft = hasColor && item.style === 'tip-left';
  const tipRight = hasColor && item.style === 'tip-right';
  const contentColor = isFull ? readableText(item.color) : undefined;
  const mediaCount = (item.media?.length || 0) + (item.photo ? 1 : 0);
  const meta = [];
  if (item.subheading) meta.push(item.subheading);
  const bg = isFull ? { backgroundColor: item.color + 'D9' } : undefined;

  return (
    <button
      onClick={onClick}
      className={cn('card-no-select group relative block rounded-2xl overflow-hidden active:scale-95 transition-transform text-left w-full h-full', !hasColor && 'border border-border')}
      style={bg}
    >
      {tipLeft && <span className="absolute top-0 bottom-0 left-0 rounded-r-2xl" style={{ width: '12.5%', backgroundColor: item.color }} />}
      {tipRight && <span className="absolute top-0 bottom-0 right-0 rounded-l-2xl" style={{ width: '12.5%', backgroundColor: item.color }} />}
      <div
        className="relative flex flex-col justify-center h-full gap-1"
        style={{ paddingLeft: tipLeft ? 'calc(12.5% + 12px)' : '14px', paddingRight: tipRight ? 'calc(12.5% + 12px)' : '14px', ...(contentColor ? { color: contentColor } : {}) }}
      >
        <span className={cn('text-sm font-medium lowercase leading-tight line-clamp-4', item.done && 'line-through opacity-60')}>{item.text || 'untitled'}</span>
        {(meta.length > 0 || mediaCount > 0) && (
          <div className={cn('flex flex-wrap items-center gap-x-2 text-[11px] lowercase', isFull ? '' : 'text-muted-foreground')}>
            {meta.map((m, i) => <span key={i} className="whitespace-nowrap">{m}</span>)}
            {mediaCount > 0 && <span className="flex items-center gap-0.5"><Paperclip className="w-3 h-3" />{mediaCount}</span>}
          </div>
        )}
      </div>
      {onMenu && (
        <button onClick={(e) => { e.stopPropagation(); onMenu(); }} className="touch-44 absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center text-muted-foreground">
          <MoreVertical className="w-3.5 h-3.5" style={{ color: contentColor || undefined }} />
        </button>
      )}
    </button>
  );
}