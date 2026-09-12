import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import ColorPicker from './ColorPicker';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function toDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// weekday mode materializes concrete dates across a bounded window rather
// than a computed on-the-fly rule — this app's existing single-event
// recurrence engine only ever looks forward from its start date, but this
// feature explicitly needs past + present + future, so a fixed (generous)
// window is generated directly instead. 1 year back, 2 years forward is a
// reasonable bound — a literally-infinite recurrence isn't something that
// can be pre-materialized as concrete calendar entries.
const PAST_DAYS = 365;
const FUTURE_DAYS = 365 * 2;

function datesForWeekday(weekday) {
  const dates = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - PAST_DAYS);
  for (let i = 0; i <= PAST_DAYS + FUTURE_DAYS; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d.getDay() === weekday) dates.push(toDateStr(d));
  }
  return dates;
}

export default function RecurringEventModal({ open, onClose, onSave }) {
  const [name, setName] = useState('');
  const [subheading, setSubheading] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [mode, setMode] = useState('weekday'); // 'weekday' | 'custom'
  const [weekday, setWeekday] = useState(new Date().getDay());
  const [customDates, setCustomDates] = useState([]); // array of 'yyyy-mm-dd'
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(new Date());

  if (!open) return null;

  const reset = () => {
    setName(''); setSubheading(''); setColor('#3b82f6');
    setMode('weekday'); setWeekday(new Date().getDay());
    setCustomDates([]); setCalendarOpen(false); setCalMonth(new Date());
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSave = () => {
    if (!name.trim()) return;
    const dates = mode === 'weekday' ? datesForWeekday(weekday) : customDates;
    if (!dates.length) return;
    onSave({ name: name.trim(), subheading: subheading.trim(), color, dates });
    reset();
  };

  const toggleCustomDate = (ds) => {
    setCustomDates((prev) => prev.includes(ds) ? prev.filter((d) => d !== ds) : [...prev, ds]);
  };

  // simple month grid for the custom-days calendar
  const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(calMonth.getFullYear(), calMonth.getMonth(), d));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={handleClose}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto no-scrollbar bg-card rounded-t-3xl sm:rounded-3xl border border-border p-5 pb-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold lowercase">events</h3>
          <button onClick={handleClose} className="touch-44 p-1 rounded-full">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="event"
            autoFocus
            className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
          />
          <input
            value={subheading}
            onChange={(e) => setSubheading(e.target.value)}
            placeholder="subheading"
            className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
          />
          <ColorPicker value={color} onChange={setColor} label="event colour" />

          <div className="flex gap-2 p-1 rounded-xl bg-muted">
            <button
              onClick={() => setMode('weekday')}
              className={mode === 'weekday' ? 'touch-44 flex-1 py-2 rounded-lg bg-card text-xs font-semibold lowercase' : 'touch-44 flex-1 py-2 rounded-lg text-xs font-medium lowercase text-muted-foreground'}
            >
              day of the week
            </button>
            <button
              onClick={() => setMode('custom')}
              className={mode === 'custom' ? 'touch-44 flex-1 py-2 rounded-lg bg-card text-xs font-semibold lowercase' : 'touch-44 flex-1 py-2 rounded-lg text-xs font-medium lowercase text-muted-foreground'}
            >
              custom days
            </button>
          </div>

          {mode === 'weekday' ? (
            <div>
              <p className="text-[10px] text-muted-foreground lowercase mb-1.5">choose one day — applies every week, past and future</p>
              <div className="flex gap-1.5">
                {WEEKDAYS.map((w, i) => (
                  <button
                    key={w}
                    onClick={() => setWeekday(i)}
                    className={cn(
                      'touch-44 flex-1 py-2.5 rounded-xl text-[11px] font-semibold lowercase',
                      weekday === i ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <button
                onClick={() => setCalendarOpen((v) => !v)}
                className="touch-44 w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-muted/50 text-xs font-medium lowercase text-muted-foreground"
              >
                <span className="flex items-center gap-1.5"><CalendarIcon className="w-3.5 h-3.5" /> custom days</span>
                <span>{customDates.length ? customDates.length + ' selected' : 'tap to choose'}</span>
              </button>

              {calendarOpen && (
                <div className="mt-2 p-3 rounded-xl bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))} className="touch-44 p-1">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-semibold lowercase">{calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
                    <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))} className="touch-44 p-1">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {WEEKDAYS.map((w) => (
                      <span key={w} className="text-[9px] text-center text-muted-foreground lowercase">{w[0]}</span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {cells.map((d, i) => {
                      if (!d) return <div key={i} />;
                      const ds = toDateStr(d);
                      const selected = customDates.includes(ds);
                      // the date itself IS the selection control — no
                      // separate tick box, tapping the number toggles it.
                      return (
                        <button
                          key={i}
                          onClick={() => toggleCustomDate(ds)}
                          className={cn(
                            'touch-44 aspect-square rounded-lg text-[11px] flex items-center justify-center',
                            selected ? 'bg-foreground text-background font-semibold' : 'text-foreground'
                          )}
                        >
                          {d.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={handleClose} className="touch-44 flex-1 py-3 rounded-2xl bg-muted text-muted-foreground text-sm font-medium lowercase">
            cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || (mode === 'custom' && !customDates.length)}
            className="touch-44 flex-1 py-3 rounded-2xl bg-foreground text-background text-sm font-medium lowercase disabled:opacity-40"
          >
            add to calendar
          </button>
        </div>
      </div>
    </div>
  );
}

