import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Trash2, Upload, Music } from 'lucide-react';
import { SOUNDS, VIBRATIONS, preview, stopAll } from '@/lib/alarmAudio';
import { getSettings, getCustomTracks, addCustomTrack, deleteCustomTrack } from '@/lib/store';
import { cn } from '@/lib/utils';
import ColorPicker from './ColorPicker';

const DAY_LABELS = ['s', 'm', 't', 'w', 't', 'f', 's'];

const pad = (n) => String(n).padStart(2, '0');

// custom chevron drawn inside the select (moved off the border, toward centre)
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23717171' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")";
const chevronStyle = {
  backgroundImage: CHEVRON,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.7rem center',
  backgroundSize: '14px',
};

function TimePicker({ value, onChange, format }) {
  let h = 0, m = 0;
  if (value) { const [hh, mm] = value.split(':').map(Number); h = hh || 0; m = mm || 0; }
  const ampm = h >= 12 ? 'pm' : 'am';
  const dispH = format === '12h' ? (h % 12 || 12) : h;
  const setH = (nh) => {
    let hh = nh;
    if (format === '12h') { hh = nh % 12; if (ampm === 'pm') hh += 12; }
    onChange(`${pad(hh)}:${pad(m)}`);
  };
  const setM = (nm) => onChange(`${pad(h)}:${pad(nm)}`);
  const setAmpm = (ap) => {
    let hh = h % 12; if (ap === 'pm') hh += 12;
    onChange(`${pad(hh)}:${pad(m)}`);
  };
  const hours = format === '12h' ? Array.from({ length: 12 }, (_, i) => i + 1) : Array.from({ length: 24 }, (_, i) => i);
  const numSelect = 'text-sm font-semibold lowercase bg-muted rounded-xl px-3 py-2 outline-none text-center';
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      <select value={dispH} onChange={(e) => setH(Number(e.target.value))} className={numSelect}>
        {hours.map((hh) => <option key={hh} value={hh}>{hh}</option>)}
      </select>
      <span className="text-2xl font-extrabold">:</span>
      <select value={m} onChange={(e) => setM(Number(e.target.value))} className={numSelect}>
        {Array.from({ length: 60 }, (_, i) => i).map((mm) => <option key={mm} value={mm}>{pad(mm)}</option>)}
      </select>
      {format === '12h' && (
        <select value={ampm} onChange={(e) => setAmpm(e.target.value)} className="text-base font-extrabold lowercase bg-muted rounded-xl px-2.5 py-2 outline-none">
          <option value="am">am</option>
          <option value="pm">pm</option>
        </select>
      )}
    </div>
  );
}

export default function AlarmModal({ open, onClose, onSave, onDelete, alarm }) {
  const [name, setName] = useState('');
  const [time, setTime] = useState('07:00');
  const [days, setDays] = useState([]);
  const [date, setDate] = useState('');
  const [sound, setSound] = useState('classic');
  const [vibration, setVibration] = useState('default');
  const [snooze, setSnooze] = useState(5);
  const [format, setFormat] = useState('24h');
  const [color, setColor] = useState('');
  const [style, setStyle] = useState('tip');
  const [tracks, setTracks] = useState([]);
  const fileRef = useRef(null);

  const refreshTracks = () => setTracks(getCustomTracks());

  useEffect(() => {
    if (open) {
      const s = getSettings();
      setName(alarm?.name || '');
      setTime(alarm?.time || '07:00');
      setDays(alarm?.days || []);
      setDate(alarm?.date || '');
      setSound(alarm?.sound || s.defaultSound || 'classic');
      setVibration(alarm?.vibration || s.defaultVibration || 'default');
      setSnooze(alarm?.snooze || s.defaultSnooze || 5);
      setFormat(s.clockFormat || '24h');
      setColor(alarm?.color || '');
      setStyle(alarm?.style || 'tip');
      refreshTracks();
    }
    return () => { stopAll(); };
  }, [open, alarm]);

  if (!open) return null;

  const toggleDay = (i) => setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]));
  const recurring = days.length > 0;

  const handleSave = () => {
    if (!time) return;
    onSave({
      name: (name || '').trim() || 'alarm',
      time,
      days: recurring ? days : [],
      date: recurring ? '' : date,
      sound,
      vibration,
      snooze: Number(snooze) || 5,
      enabled: alarm ? alarm.enabled : true,
      color,
      style,
    });
  };

  const test = () => {
    const v = VIBRATIONS.find((x) => x.id === vibration) || VIBRATIONS[0];
    preview(sound, v.pattern);
  };

  const handleTrackFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const nm = file.name.replace(/\.[^.]+$/, '').toLowerCase();
      addCustomTrack({ name: nm, url: reader.result });
      refreshTracks();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const labelCls = 'text-xs font-medium text-muted-foreground lowercase block mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto no-scrollbar bg-card rounded-t-3xl sm:rounded-3xl border border-border p-5 pb-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold lowercase">{alarm ? 'edit alarm' : 'new alarm'}</h3>
          <button onClick={onClose} className="touch-44 p-1 rounded-full">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-4">
          <TimePicker value={time} onChange={setTime} format={format} />

          <div>
            <label className={labelCls}>repeat</label>
            <div className="flex gap-1.5">
              {DAY_LABELS.map((d, i) => (
                <button
                  key={i}
                  onClick={() => toggleDay(i)}
                  className={cn(
                    'touch-44 flex-1 h-11 rounded-xl text-xs font-semibold uppercase transition-colors',
                    days.includes(i) ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {!recurring && (
            <div>
              <label className={labelCls}>date (optional — once if empty)</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground"
              />
            </div>
          )}

          <div>
            <label className={labelCls}>sound</label>
            <div className="flex gap-2">
              <select
                value={sound}
                onChange={(e) => setSound(e.target.value)}
                className="flex-1 px-3 py-2.5 pr-9 rounded-xl bg-muted text-sm outline-none appearance-none"
                style={chevronStyle}
              >
                <optgroup label="tones">
                  {SOUNDS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </optgroup>
                {tracks.length > 0 && (
                  <optgroup label="your tracks">
                    {tracks.map((t) => (
                      <option key={t.id} value={'track:' + t.id}>{t.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <button onClick={test} className="touch-44 px-4 rounded-xl bg-muted flex items-center gap-1.5 text-xs font-medium lowercase">
                <Play className="w-3.5 h-3.5" /> test
              </button>
            </div>
          </div>

          {/* upload tracks — custom audio stored offline, selectable above */}
          <div>
            <label className={labelCls}>upload tracks</label>
            <div className="flex gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                className="touch-44 flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-dashed border-border text-xs font-medium lowercase text-muted-foreground"
              >
                <Upload className="w-4 h-4" /> add audio file
              </button>
              <input ref={fileRef} type="file" accept="audio/*" onChange={handleTrackFile} className="hidden" />
            </div>
            {tracks.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {tracks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted">
                    <Music className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-xs lowercase truncate">{t.name}</span>
                    <button onClick={() => preview('track:' + t.id, [])} className="touch-44 text-muted-foreground">
                      <Play className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { deleteCustomTrack(t.id); if (sound === 'track:' + t.id) setSound('classic'); refreshTracks(); }}
                      className="touch-44 text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>vibration</label>
            <select
              value={vibration}
              onChange={(e) => setVibration(e.target.value)}
              className="w-full px-3 py-2.5 pr-9 rounded-xl bg-muted text-sm outline-none appearance-none"
              style={chevronStyle}
            >
              {VIBRATIONS.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>snooze</label>
            <div className="flex gap-2">
              {[1, 5, 10].map((m) => (
                <button
                  key={m}
                  onClick={() => setSnooze(m)}
                  className={cn(
                    'touch-44 flex-1 py-2.5 rounded-xl text-sm font-medium lowercase transition-colors',
                    Number(snooze) === m ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          <ColorPicker value={color} onChange={setColor} label="alarm colour" />
          {color && (
            <div>
              <label className={labelCls}>style</label>
              <div className="flex gap-2">
                <button onClick={() => setStyle('tip')} className={cn('touch-44 flex-1 py-2.5 rounded-xl border text-xs lowercase', style === 'tip' ? 'bg-foreground text-background border-foreground' : 'bg-background border-border')}>tip</button>
                <button onClick={() => setStyle('full')} className={cn('touch-44 flex-1 py-2.5 rounded-xl border text-xs lowercase', style === 'full' ? 'bg-foreground text-background border-foreground' : 'bg-background border-border')}>full</button>
              </div>
            </div>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground/60 lowercase text-center mt-6">
          created {new Date(alarm?.created_date || Date.now()).toLocaleString()}
        </p>
        <div className="flex gap-2 mt-3">
          {alarm && onDelete && (
            <button onClick={onDelete} className="touch-44 w-12 h-12 rounded-2xl bg-muted text-destructive flex items-center justify-center">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="touch-44 flex-1 py-3 rounded-2xl bg-muted text-muted-foreground text-sm font-medium lowercase">cancel</button>
          <button onClick={handleSave} className="touch-44 flex-1 py-3 rounded-2xl bg-foreground text-background text-sm font-medium lowercase">{alarm ? 'save' : 'create'}</button>
        </div>
      </div>
    </div>
  );
}