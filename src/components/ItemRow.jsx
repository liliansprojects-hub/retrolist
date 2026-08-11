import React, { useState } from 'react';
import { Check, X, Palette, Bell, Link as LinkIcon, ExternalLink, FolderInput, Copy } from 'lucide-react';
import { LIST_TYPES } from '@/lib/store';
import ColorPicker from './ColorPicker';
import FolderPicker from './FolderPicker';
import MediaUploader from './MediaUploader';
import { cn } from '@/lib/utils';

const normalizeUrl = (u) => {
  if (!u) return '';
  const s = u.trim();
  if (/^https?:\/\//i.test(s)) return s;
  return 'https://' + s;
};

const URL_TYPES = ['reminder', 'todo', 'list'];

export default function ItemRow({ item, folderType, onUpdate, onDelete, folderId, onMove, onCopy }) {
  const cfg = LIST_TYPES[folderType] || LIST_TYPES.list;
  const [expanded, setExpanded] = useState(false);
  const [picker, setPicker] = useState(null);
  const canUrl = URL_TYPES.includes(folderType);
  const preview = item.media?.find((m) => m.type === 'photo') || item.media?.[0] || (item.photo ? { url: item.photo } : null);

  const toggleDone = () => {
    if (cfg.hasCheckbox) onUpdate(item.id, { done: !item.done });
  };

  const openUrl = () => {
    const u = normalizeUrl(item.url);
    if (u) window.open(u, '_blank', 'noopener,noreferrer');
  };

  const textClass = cn(
    'flex-1 text-sm bg-transparent outline-none selectable',
    item.done && cfg.crossOut && 'line-through text-muted-foreground',
    item.done && !cfg.crossOut && 'font-bold'
  );

  return (
    <div
      className="rounded-2xl border border-border overflow-hidden transition-all"
      style={item.color ? { backgroundColor: item.color + '33', borderLeft: `4px solid ${item.color}` } : undefined}
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

        {item.url && (
          <button onClick={openUrl} className="touch-44 p-1 rounded-full text-foreground">
            <ExternalLink className="w-4 h-4" />
          </button>
        )}

        {cfg.hasNotification && (
          <button
            onClick={() => {
              const time = prompt('set reminder time (e.g. 14:30)');
              if (time) {
                onUpdate(item.id, { remindAt: time });
                if ('Notification' in window) Notification.requestPermission();
              }
            }}
            className="touch-44 p-1 rounded-full text-muted-foreground"
          >
            <Bell className={cn('w-4 h-4', item.remindAt && 'text-foreground fill-foreground')} />
          </button>
        )}

        {preview && (
          <button onClick={() => setExpanded(!expanded)} className="shrink-0">
            <img src={preview.url} alt="" className="w-10 h-10 rounded-lg object-cover" />
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
          {canUrl && (
            <div>
              <label className="text-xs font-medium text-muted-foreground lowercase block mb-1.5">link</label>
              <div className="flex gap-2">
                <input
                  value={item.url || ''}
                  onChange={(e) => onUpdate(item.id, { url: e.target.value })}
                  placeholder="https://..."
                  className="flex-1 px-3 py-2 rounded-xl bg-muted text-sm outline-none"
                />
                {item.url && (
                  <button onClick={openUrl} className="touch-44 px-3 rounded-xl bg-muted flex items-center gap-1 text-xs font-medium lowercase">
                    <LinkIcon className="w-3.5 h-3.5" /> open
                  </button>
                )}
              </div>
            </div>
          )}
          <MediaUploader
            media={item.media || (item.photo ? [{ id: 'legacy', type: 'photo', url: item.photo }] : [])}
            onChange={(m) => onUpdate(item.id, { media: m })}
            allowUrl={canUrl}
            enableViewer
          />
          <ColorPicker
            value={item.color}
            onChange={(c) => onUpdate(item.id, { color: c })}
            label="item colour"
          />
          {onMove && (
            <div className="flex gap-2">
              <button onClick={() => setPicker('move')} className="touch-44 flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted text-xs font-medium lowercase">
                <FolderInput className="w-3.5 h-3.5" /> move to
              </button>
              {onCopy && (
                <button onClick={() => setPicker('copy')} className="touch-44 flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted text-xs font-medium lowercase">
                  <Copy className="w-3.5 h-3.5" /> copy to
                </button>
              )}
            </div>
          )}
          <FolderPicker
            open={!!picker}
            title={picker === 'copy' ? 'copy to' : 'move to'}
            allowMainPage={false}
            onClose={() => setPicker(null)}
            onSelect={(targetId) => {
              if (picker === 'copy' && onCopy) onCopy(item.id, targetId);
              else if (onMove) onMove(item.id, targetId);
              setPicker(null);
            }}
          />
        </div>
      )}
    </div>
  );
}