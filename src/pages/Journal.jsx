import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, X, Droplet, MapPin, Trash2,
} from 'lucide-react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameDay, isSameMonth, isToday, addMonths, subMonths, setMonth, setYear,
} from 'date-fns';
import {
  getJournal, addJournalEntry, updateJournalEntry, deleteJournalEntry,
  getEvents, getPeriodData, addPeriodEntry, deletePeriodEntry, getMapFolders,
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

  const refresh = () => {
    setEntries(getJournal());
    setEvents(getEvents());
    setPeriod(getPeriodData());
  };

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('retrolist:synced', handler);
    return () => window.removeEventListener('retrolist:synced', handler);
  }, []);

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const dateStr = (d) => format(d, 'yyyy-MM-dd');
  const entryForDate = (d) => entries.find((e) => e.date === dateStr(d));
  const isPeriodDay = (d) => period.some((p) => p.date === dateStr(d));

  // events that fall on a date, including recurring occurrences
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
    <div className="safe-top px-4 pb-4 min-h-screen">
      <header className="mb-5">
        <h1 className="text-3xl font-extrabold lowercase tracking-tight">journal</h1>
        <p className="text-sm text-muted-foreground lowercase mt-0.5">your days, documented</p>
      </header>

      {/* month + year filter */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex gap-1.5 items-center">
          <select
            value={month.getMonth()}
            onChange={(e) => setMonth(setMonth(month, parseInt(e.target.value)))}
            className="px-3 py-2 rounded-xl bg-muted text-sm font-semibold lowercase outline-none focus:ring-1 focus:ring-foreground"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i}>{format(new Date(2000, i, 1), 'MMMM').toLowerCase()}</option>
            ))}
          </select>
          <select
            value={month.getFullYear()}
            onChange={(e) => setMonth(setYear(month, parseInt(e.target.value)))}
            className="px-3 py-2 rounded-xl bg-muted text-sm font-semibold outline-none focus:ring-1 focus:ring-foreground"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setMonth(subMonths(month, 1))}
            className="touch-44 w-10 h-10 rounded-full bg-muted flex items-center justify-center"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMonth(new Date())}
            className="touch-44 px-3 h-10 rounded-full bg-muted flex items-center justify-center text-xs font-medium lowercase"
          >
            today
          </button>
          <button
            onClick={() => setMonth(addMonths(month, 1))}
            className="touch-44 w-10 h-10 rounded-full bg-muted flex items-center justify-center"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* calendar */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['s', 'm', 't', 'w', 't', 'f', 's'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-muted-foreground/50 uppercase">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-6">
        {days.map((day) => {
          const entry = entryForDate(day);
          const dayEvents = eventsForDate(day);
          const periodDay = isPeriodDay(day);
          const inMonth = isSameMonth(day, month);
          const today = isToday(day);
          const selected = isSameDay(day, selectedDate);

          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDate(day)}
              className={cn(
                'touch-44 aspect-square rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-colors relative overflow-hidden',
                !inMonth && 'opacity-30',
                !entry?.photo && (selected ? 'bg-foreground text-background' : 'bg-muted/50'),
                today && !selected && 'ring-1 ring-foreground'
              )}
              style={entry?.photo ? {
                backgroundImage: `url(${entry.photo})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              } : undefined}
            >
              {entry?.photo && <div className="absolute inset-0 bg-black/30" />}
              <span className={cn('text-xs font-semibold relative z-10', entry?.photo && 'text-white drop-shadow')}>
                {format(day, 'd')}
              </span>
              {(dayEvents.length > 0 || periodDay) && (
                <div className="flex gap-0.5 absolute bottom-1 z-10">
                  {dayEvents.map((e) => (
                    <span key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: e.color || '#3b82f6' }} />
                  ))}
                  {periodDay && (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  )}
                </div>
              )}
              {selected && <div className="absolute inset-0 ring-2 ring-foreground rounded-2xl z-10" />}
            </button>
          );
        })}
      </div>

      {/* day detail */}
      <DayDetail date={selectedDate} onRefresh={refresh} />
    </div>
  );
}

function DayDetail({ date, onRefresh }) {
  const dateStr = format(date, 'yyyy-MM-dd');
  const [entry, setEntry] = useState(null);
  const [events, setEvents] = useState([]);
  const [period, setPeriod] = useState([]);
  const [mapPlaces, setMapPlaces] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [color, setColor] = useState('#f59e0b');
  const [mood, setMood] = useState('');
  const [photo, setPhoto] = useState(null);
  const [showPlaces, setShowPlaces] = useState(false);

  const load = () => {
    const entries = getJournal();
    const e = entries.find((en) => en.date === dateStr);
    setEntry(e || null);
    setTitle(e?.title || '');
    setContent(e?.content || '');
    setColor(e?.color || '#f59e0b');
    setMood(e?.mood || '');
    setPhoto(e?.photo || null);
    setEvents(getEvents().filter((ev) => ev.date === dateStr));
    setPeriod(getPeriodData().filter((p) => p.date === dateStr));
    const places = getMapFolders().flatMap((f) => f.places || []);
    setMapPlaces(places);
  };

  useEffect(() => {
    load();
  }, [dateStr]);

  const handleSave = () => {
    const data = { date: dateStr, title, content, color, mood, photo };
    if (entry) {
      updateJournalEntry(entry.id, data);
    } else {
      addJournalEntry(data);
    }
    onRefresh();
    load();
  };

  const togglePeriod = () => {
    if (period.length > 0) {
      period.forEach((p) => deletePeriodEntry(p.id));
    } else {
      addPeriodEntry({ date: dateStr, type: 'period' });
    }
    onRefresh();
    load();
  };

  const addPlaceToJournal = (place) => {
    const newContent = content + (content ? '\n' : '') + `📍 ${place.name}${place.address ? ' — ' + place.address : ''}`;
    setContent(newContent);
    setShowPlaces(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold lowercase">{format(date, 'EEEE, MMM d')}</h3>
        <button
          onClick={togglePeriod}
          className={cn(
            'touch-44 flex items-center gap-1.5 px-3 h-9 rounded-full text-xs font-medium lowercase',
            period.length > 0 ? 'bg-rose-500 text-white' : 'bg-muted text-muted-foreground'
          )}
        >
          <Droplet className="w-3.5 h-3.5" />
          {period.length > 0 ? 'tracked' : 'period'}
        </button>
      </div>

      {/* events */}
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

      {/* journal entry */}
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

      {/* mood */}
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

      {entry && (
        <button
          onClick={() => {
            deleteJournalEntry(entry.id);
            onRefresh();
            load();
          }}
          className="touch-44 w-full flex items-center justify-center gap-2 py-2 text-xs lowercase text-destructive"
        >
          <Trash2 className="w-3.5 h-3.5" /> delete entry
        </button>
      )}
    </div>
  );
}