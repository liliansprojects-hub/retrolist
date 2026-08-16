import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import ColorPicker from './ColorPicker';
import { getSettings } from '@/lib/store';

const pad = (n) => String(n).padStart(2, '0');

// reminder editor: time + date, subheading, description, colour. no alarm
// (no sound / vibration / snooze), no cover photo. shows the creation date at
// the bottom of the panel.
export default function ReminderModal({ open, onClose, onSave, onDelete, folder }) {
  const [name, setName] = useState('');
  const [time, setTime] = useState('07:00');
  const [date, setDate] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [format, setFormat] = useState('24h');

  useEffect(() => {
    if (open) {
      const s = getSettings();
      setName(folder?.name || '');
      setTime(folder?.time || '07:00');
      setDate(folder?.date || '');
      setSubtitle(folder?.subtitle || '');
      setDescription(folder?.description || '');
      setColor(folder?.color || '#3b82f6');
      setFormat(s.clockFormat || '24h');
    }
  }, [open, folder]);

  if (!open) return null;

  const handleSave = () => {
    onSave({
      name: (name || '').trim() || 'reminder',
      type: 'reminder',
      time,
      date,
      subtitle: subtitle.trim(),
      description: description.trim(),
      color,
      size: folder?.size || 'portrait',
      ...(folder ? {} : { items: [] }),
    });
  };

  const labelCls = 'text-xs font-medium text-muted-foreground lowercase block mb-1.5';
  const created = folder?.created_date || Date.now();
  const createdStr = new Date(created).toLocaleString();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto no-scrollbar bg-card rounded-t-3xl sm:rounded-3xl border border-border p-5 pb-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold lowercase">{folder ? 'edit reminder' : 'new reminder'}</h3>
          <button onClick={onClose} className="touch-44 p-1 rounded-full">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelCls}>name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="reminder name"
              autoFocus
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className={labelCls}>time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
              />
            </div>
            <div className="flex-1">
              <label className={labelCls}>date (optional)</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>subheading</label>
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="add a subheading…"
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
            />
          </div>

          <div>
            <label className={labelCls}>description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="describe this reminder..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground resize-none selectable"
            />
          </div>

          <ColorPicker value={color} onChange={setColor} label="reminder colour" />
        </div>

        <p className="text-[10px] text-muted-foreground/60 lowercase text-center mt-5">
          created {createdStr}
        </p>

        <div className="flex gap-2 mt-3">
          {folder && onDelete && (
            <button onClick={onDelete} className="touch-44 w-12 h-12 rounded-2xl bg-muted text-destructive flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="touch-44 flex-1 py-3 rounded-2xl bg-muted text-muted-foreground text-sm font-medium lowercase">cancel</button>
          <button onClick={handleSave} className="touch-44 flex-1 py-3 rounded-2xl bg-foreground text-background text-sm font-medium lowercase">{folder ? 'save' : 'create'}</button>
        </div>
      </div>
    </div>
  );
}