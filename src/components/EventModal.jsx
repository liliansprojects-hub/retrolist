import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import ColorPicker from './ColorPicker';

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'does not repeat' },
  { value: 'daily', label: 'every day' },
  { value: 'weekly', label: 'every week' },
  { value: 'monthly', label: 'every month' },
  { value: 'yearly', label: 'every year' },
];

export default function EventModal({ open, onClose, onSave }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [recurrence, setRecurrence] = useState('none');

  useEffect(() => {
    if (open) {
      setName('');
      setDate(new Date().toISOString().slice(0, 10));
      setTime('');
      setPlace('');
      setDescription('');
      setColor('#3b82f6');
      setRecurrence('none');
    }
  }, [open]);

  if (!open) return null;

  const handleSave = () => {
    if (!name.trim() || !date) return;
    onSave({ name: name.trim(), date, time, place: place.trim(), description: description.trim(), color, recurrence });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-lg bg-card rounded-t-3xl sm:rounded-3xl border border-border p-5 pb-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold lowercase">new event</h3>
          <button onClick={onClose} className="touch-44 p-1 rounded-full">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="event name"
            autoFocus
            className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="flex-1 px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
            />
          </div>
          <input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="place"
            className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="description"
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground resize-none"
          />
          <ColorPicker value={color} onChange={setColor} label="event colour" />
          <div>
            <label className="text-xs font-medium text-muted-foreground lowercase block mb-1.5">repeat</label>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
            >
              {RECURRENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="touch-44 flex-1 py-3 rounded-2xl bg-muted text-muted-foreground text-sm font-medium lowercase"
          >
            cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || !date}
            className="touch-44 flex-1 py-3 rounded-2xl bg-foreground text-background text-sm font-medium lowercase disabled:opacity-40"
          >
            add to calendar
          </button>
        </div>
      </div>
    </div>
  );
}