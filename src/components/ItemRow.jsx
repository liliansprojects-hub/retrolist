import React, { useState } from 'react';
import { Check, X, Camera, Palette, Bell } from 'lucide-react';
import { LIST_TYPES } from '@/lib/store';
import ColorPicker from './ColorPicker';
import ImageUpload from './ImageUpload';
import { cn } from '@/lib/utils';

export default function ItemRow({ item, folderType, onUpdate, onDelete }) {
  const cfg = LIST_TYPES[folderType] || LIST_TYPES.list;
  const [expanded, setExpanded] = useState(false);

  const toggleDone = () => {
    if (cfg.hasCheckbox) onUpdate(item.id, { done: !item.done });
  };

  const textClass = cn(
    'flex-1 text-sm bg-transparent outline-none selectable',
    item.done && cfg.crossOut && 'line-through text-muted-foreground',
    item.done && !cfg.crossOut && 'font-bold'
  );

  return (
    <div
      className="rounded-2xl border border-border overflow-hidden transition-all"
      style={{ borderLeftWidth: item.color ? '3px' : '1px', borderLeftColor: item.color || undefined }}
    >
      <div className="flex items-center gap-2 p-3">
        {cfg.hasCheckbox && (
          <button
            onClick={toggleDone}
            className={cn(
              'touch-44 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors icon-no-select',
              item.done ? 'bg-foreground border-foreground' : 'border-border'
            )}
          >
            {item.done && <Check className="w-3.5 h-3.5 text-background" strokeWidth={3} />}
          </button>
        )}

        <input
          value={item.text || ''}
          onChange={(e) => onUpdate(item.id, { text: e.target.value })}
          placeholder="type something..."
          className={textClass}
        />

        {cfg.hasNotification && (
          <button
            onClick={() => {
              const time = prompt('set reminder time (e.g. 14:30)');
              if (time) {
                onUpdate(item.id, { remindAt: time });
                // request notification permission
                if ('Notification' in window) Notification.requestPermission();
              }
            }}
            className="touch-44 p-1 rounded-full text-muted-foreground"
          >
            <Bell className={cn('w-4 h-4', item.remindAt && 'text-foreground fill-foreground')} />
          </button>
        )}

        {item.photo && (
          <button onClick={() => setExpanded(!expanded)} className="shrink-0">
            <img src={item.photo} alt="" className="w-10 h-10 rounded-lg object-cover" />
          </button>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="touch-44 p-1 rounded-full text-muted-foreground"
        >
          <Palette className={cn('w-4 h-4', expanded && 'text-foreground')} />
        </button>

        <button
          onClick={() => onDelete(item.id)}
          className="touch-44 p-1 rounded-full text-muted-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 animate-fade-in">
          <ImageUpload
            value={item.photo}
            onChange={(p) => onUpdate(item.id, { photo: p })}
            label="item photo"
            aspect={1}
            maxSize={800}
            className="h-32"
          />
          <ColorPicker
            value={item.color}
            onChange={(c) => onUpdate(item.id, { color: c })}
            label="item colour"
          />
        </div>
      )}
    </div>
  );
}