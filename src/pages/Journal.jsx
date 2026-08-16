import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, X, Droplet, MapPin, Trash2, Pencil,
} from 'lucide-react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameDay, isSameMonth, isToday, addMonths, subMonths,
  setMonth as setMonthOf, setYear as setYearOf,
} from 'date-fns';
import {
  getJournal, addJournalEntry, updateJournalEntry, deleteJournalEntry,
  getEvents, getPeriodData, addPeriodEntry, deletePeriodEntry, getMapFolders, getSettings,
} from '@/lib/store';
import ColorPicker from '@/components/ColorPicker';
import ImageUpload from '@/components/ImageUpload';
import { cn } from '@/lib/utils';

const MOODS = ['✨', '🌱', '☀️', '🌧️', '🔥', '💫', '🌙', '🌊'];

export default function Journal() {
  const [month, setMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [entries, setEntries] = useState([]);
  const [events, setEvents] = useState([]);
  const [period, setPeriod] = useState([]);
  const [settings, setSettings] = useState(getSettings());

  const refresh = () => {
    setEntries(getJournal());
    setEvents(getEvents());
    setPeriod(getPeriodData());
    setSettings(getSettings());
  };

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('retrolist:synced', handler);
    window.addEventListener('retrolist:data-changed', handler);
    return () => {
      window.removeEventListener('retrolist:synced', handler);
      window.removeEventListener('retrolist:data-changed', handler);
    };
  }, []);

  const periodEnabled = !!settings.periodTracking;

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const dateStr = (d) => format(d, 'yyyy-MM-dd');
  const entriesForDate = (d) => entries.filter((e) => e.date === dateStr(d));
  const isPeriodDay = (d) => periodEnabled && period.some((p) => p.date === dateStr(d));

  const eventsForDate = (d) => {
    const ds = dateStr(d);
    return events.filter((e) => {
      if (e.date === ds) return true;
      if (!e.recurrence || e.recurrence === 'none') return false;
      const start = new Date(e.date + 'T00:00:00');
      if (d < start) return false;
      if (e.recurrence === 'daily') return true;
      if (e.recurrence === 'weekly') return start.getDay() === d.getDay();
      if (e.recurrence === 'monthly') return start.getDate() === d.getDate();
      if (e.recurrence === 'yearly') return start.getMonth() === d.getMonth() && start.getDate() === d.getDate();
      return false;
    });
  };

  const currentYear = new Date().getFullYear();
  const yearOptions = [];
  for (let y = currentYear - 10; y <= currentYear + 10; y++) yearOptions.push(y);

  return (
    <div className="safe-top px-6 sm:px-8 pb-4 min-h-screen">
      <header className="mb-5">
        <h1 className="text-3xl font-extrabold lowercase tracking-tight">journal</h1>
        <p className="text-sm text-muted-foreground lowercase mt-0.5">your days, documented</p>
      </header>

      {/* month + year filter (narrowed) */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex gap-1.5 items-center">
          <select
            value={month.getMonth()}
            onChange={(e) => setMonth(setMonthOf(month, parseInt(e.target.value)))}
            className="px-2.5 py-1.5 rounded-xl bg-muted text-xs font-semibold lowercase outline-none focus:ring-1 focus:ring-foreground"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i}>{format(new Date(2000, i, 1), 'MMMM').toLowerCase()}</option>
            ))}
          </select>
          <select
            value={month.getFullYear()}
            onChange={(e) => setMonth(setYearOf(month, parseInt(e.target.value)))}
            className="px-2.5 py-1.5 rounded-xl bg-muted text-xs font-semibold outline-none focus:ring-1 focus:ring-foreground"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-1.5 mr-6">
          <button
            onClick={() => setMonth(subMonths(month, 1))}
            className="touch-44 w-7 h-7 rounded-full bg-muted flex items-center justify-center"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setMonth(new Date())}
            className="touch-44 px-2 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium lowercase"
          >
            today
          </button>
          <button
            onClick={() => setMonth(addMonths(month, 1))}
            className="touch-44 w-7 h-7 rounded-full bg-muted flex items-center justify-center"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* weekday labels */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['s', 'm', 't', 'w', 't', 'f', 's'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-muted-foreground/50 uppercase">{d}</div>
        ))}
      </div>

      {/* calendar grid */}
      <div className="grid grid-cols-7 gap-1 mb-6">
        {days.map((day) => {
          const dayEntries = entriesForDate(day);
          const dayEvents = eventsForDate(day);
          const periodDay = isPeriodDay(day);
          const inMonth = isSameMonth(day, month);
          const today = isToday(day);
          const selected = isSameDay(day, selectedDate);
          const photoEntry = [...dayEntries].reverse().find((e) => e.photo);

          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDate(day)}
              className={cn(
                'touch-44 aspect-square rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-colors relative overflow-hidden',
                !inMonth && 'opacity-30',
                !photoEntry?.photo && (periodDay || selected ? 'bg-foreground text-background' : 'bg-muted/50'),
                today && !selected && 'ring-1 ring-foreground'
              )}
              style={photoEntry?.photo ? {
                backgroundImage: `url(${photoEntry.photo})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              } : undefined}
            >
              {photoEntry?.photo && <div className="absolute inset-0 bg-black/30" />}
              <span className={cn('text-xs font-semibold relative z-10', photoEntry?.photo && 'text-white drop-shadow')}>
                {format(day, 'd')}
              </span>

              {/* note dots: one per entry (up to 3) */}
              {dayEntries.length > 0 && (
                <div className="flex gap-0.5 items-center absolute bottom-1 left-1 z-10">
                  {dayEntries.slice(0, 3).map((e) => (
                    <span
                      key={e.id}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: e.color || (photoEntry?.photo ? '#ffffff' : '#3b82f6') }}
                    />
                  ))}
                  {dayEntries.length > 3 && (
                    <span className="text-[8px] text-white/90 font-bold leading-none">+</span>
                  )}
                </div>
              )}

              {/* event dots */}
              {dayEvents.length > 0 && (
                <div className="flex gap-0.5 absolute bottom-1 right-1 z-10">
                  {dayEvents.slice(0, 3).map((e) => (
                    <span key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: e.color || '#3b82f6' }} />
                  ))}
                </div>
              )}

              {/* period shown via inverted day colours */}

              {selected && <div className="absolute inset-0 ring-2 ring-foreground rounded-2xl z-10" />}
            </button>
          );
        })}
      </div>

      {/* day detail */}
      <DayDetail date={selectedDate} onRefresh={refresh} periodEnabled={periodEnabled} />
    </div>
  );
}

function DayDetail({ date, onRefresh, periodEnabled }) {
  const dateStr = format(date, 'yyyy-MM-dd');
  const [entries, setEntries] = useState([]);
  const [events, setEvents] = useState([]);
  const [period, setPeriod] = useState([]);
  const [mapPlaces, setMapPlaces] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | entry object

  const load = () => {
    setEntries(getJournal().filter((e) => e.date === dateStr));
    setEvents(getEvents().filter((ev) => ev.date === dateStr));
    setPeriod(getPeriodData().filter((p) => p.date === dateStr));
    setMapPlaces(getMapFolders().flatMap((f) => f.places || []));
  };

  useEffect(() => {
    load();
    setEditing(null);
  }, [dateStr]);

  const togglePeriod = () => {
    if (period.length > 0) {
      period.forEach((p) => deletePeriodEntry(p.id));
    } else {
      addPeriodEntry({ date: dateStr, type: 'period' });
    }
    onRefresh();
    load();
  };

  if (editing) {
    return (
      <EntryEditor
        dateStr={dateStr}
        entry={editing === 'new' ? null : editing}
        mapPlaces={mapPlaces}
        onSave={(data) => {
          if (editing === 'new') addJournalEntry({ ...data, date: dateStr });
          else updateJournalEntry(editing.id, data);
          setEditing(null);
          onRefresh();
          load();
        }}
        onDelete={(id) => { if (id) deleteJournalEntry(id); setEditing(null); onRefresh(); load(); }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold lowercase">{format(date, 'EEEE, MMM d')}</h3>
        {periodEnabled && (
          <div className="flex items-center gap-2">
            <Droplet className="w-3.5 h-3.5 text-muted-foreground" />
            <button
              onClick={togglePeriod}
              className={cn('touch-44 relative w-12 h-6 rounded-lg transition-colors', period.length > 0 ? 'bg-foreground' : 'bg-muted')}
            >
              <span className={cn('absolute top-0.5 w-5 h-5 rounded-md bg-background transition-all', period.length > 0 ? 'left-6' : 'left-0.5')} />
            </button>
          </div>
        )}
      </div>

      {/* events on this day */}
      {events.length > 0 && (
        <div className="space-y-1.5">
          {events.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-2 p-3 rounded-2xl border border-border"
              style={{ borderLeftWidth: '3px', borderLeftColor: e.color }}
            >
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold lowercase truncate">{e.name}</p>
                {e.time && <p className="text-xs text-muted-foreground">{e.time}{e.place ? ` · ${e.place}` : ''}</p>}
                {e.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{e.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* entries list */}
      {entries.length > 0 ? (
        <div className="space-y-2">
          {entries.map((e) => (
            <button
              key={e.id}
              onClick={() => setEditing(e)}
              className="w-full text-left rounded-2xl border border-border p-3 active:scale-[0.98] transition-transform"
              style={{ borderLeftWidth: '3px', borderLeftColor: e.color || '#f59e0b' }}
            >
              <div className="flex items-start gap-2">
                {e.photo && <img src={e.photo} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {e.mood && <span className="text-sm">{e.mood}</span>}
                    <p className="text-sm font-semibold lowercase truncate">{e.title || 'untitled'}</p>
                  </div>
                  {e.content && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-wrap">{e.content}</p>
                  )}
                </div>
                <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground/50 lowercase py-4">no entries for this day</p>
      )}

      <button
        onClick={() => setEditing('new')}
        className="touch-44 w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-border text-sm font-medium lowercase text-muted-foreground"
      >
        <Plus className="w-4 h-4" /> add entry
      </button>
    </div>
  );
}

function EntryEditor({ dateStr, entry, mapPlaces, onSave, onDelete, onCancel }) {
  const [title, setTitle] = useState(entry?.title || '');
  const [content, setContent] = useState(entry?.content || '');
  const [color, setColor] = useState(entry?.color || '#f59e0b');
  const [mood, setMood] = useState(entry?.mood || '');
  const [photo, setPhoto] = useState(entry?.photo || null);
  const [showPlaces, setShowPlaces] = useState(false);

  const handleSave = () => onSave({ title, content, color, mood, photo });

  const addPlaceToJournal = (place) => {
    const next = content + (content ? '\n' : '') + `📍 ${place.name}${place.address ? ' — ' + place.address : ''}`;
    setContent(next);
    setShowPlaces(false);
  };

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <button onClick={onCancel} className="touch-44 flex items-center gap-1 text-xs font-medium lowercase text-muted-foreground">
          <ChevronLeft className="w-4 h-4" /> back
        </button>
        <h3 className="text-sm font-bold lowercase">{entry ? 'edit entry' : 'new entry'}</h3>
        {entry ? (
          <button onClick={() => onDelete(entry.id)} className="touch-44 p-1 rounded-full text-destructive">
            <Trash2 className="w-4 h-4" />
          </button>
        ) : <span className="w-8" />}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="title..."
        className="w-full px-4 py-2.5 rounded-xl bg-muted text-sm font-semibold outline-none focus:bg-background focus:ring-1 focus:ring-foreground"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="what happened today..."
        rows={5}
        className="w-full px-4 py-3 rounded-xl bg-muted text-sm outline-none focus:bg-background focus:ring-1 focus:ring-foreground resize-none selectable"
      />

      <div className="flex gap-2 flex-wrap">
        {MOODS.map((m) => (
          <button
            key={m}
            onClick={() => setMood(mood === m ? '' : m)}
            className={cn(
              'touch-44 w-10 h-10 rounded-full flex items-center justify-center text-lg transition-transform',
              mood === m ? 'bg-foreground/10 scale-110' : 'bg-muted/50'
            )}
          >
            {m}
          </button>
        ))}
        <button
          onClick={() => setShowPlaces(!showPlaces)}
          className="touch-44 px-3 h-10 rounded-full bg-muted/50 flex items-center gap-1.5 text-xs font-medium lowercase text-muted-foreground"
        >
          <MapPin className="w-3.5 h-3.5" /> place
        </button>
      </div>

      {showPlaces && (
        <div className="p-3 rounded-xl bg-muted/50 max-h-40 overflow-y-auto no-scrollbar space-y-1 animate-fade-in">
          {mapPlaces.length === 0 ? (
            <p className="text-xs text-muted-foreground lowercase text-center py-2">no saved places</p>
          ) : (
            mapPlaces.map((p) => (
              <button
                key={p.id}
                onClick={() => addPlaceToJournal(p)}
                className="touch-44 w-full text-left px-2 py-2 rounded-lg hover:bg-background text-xs lowercase"
              >
                📍 {p.name}
              </button>
            ))
          )}
        </div>
      )}

      {photo && (
        <div className="relative rounded-xl overflow-hidden">
          <img src={photo} alt="" className="w-full max-h-48 object-cover" />
          <button
            onClick={() => setPhoto(null)}
            className="touch-44 absolute top-2 right-2 w-8 h-8 rounded-full bg-black/40 backdrop-blur flex items-center justify-center"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      )}

      <ImageUpload value={photo} onChange={setPhoto} label="day photo" aspect={1} maxSize={1000} className="h-28" />
      <ColorPicker value={color} onChange={setColor} label="day colour" />

      <button
        onClick={handleSave}
        className="touch-44 w-full py-3 rounded-2xl bg-foreground text-background text-sm font-medium lowercase"
      >
        save entry
      </button>
    </div>
  );
}