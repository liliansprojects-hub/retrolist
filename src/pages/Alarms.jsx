import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { getAlarms, addAlarm, updateAlarm, deleteAlarm, getSettings } from '@/lib/store';
import { nextTrigger, formatRemaining, dayLabel, formatTime } from '@/lib/alarms';
import AlarmModal from '@/components/AlarmModal';
import { cn } from '@/lib/utils';

export default function Alarms() {
  const [alarms, setAlarms] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [, setTick] = useState(0);
  const clockFmt = getSettings().clockFormat || '24h';

  const refresh = () => setAlarms(getAlarms());

  useEffect(() => {
    refresh();
    const h = () => refresh();
    window.addEventListener('retrolist:data-changed', h);
    window.addEventListener('retrolist:synced', h);
    const t = setInterval(() => setTick((x) => x + 1), 20000);
    return () => {
      window.removeEventListener('retrolist:data-changed', h);
      window.removeEventListener('retrolist:synced', h);
      clearInterval(t);
    };
  }, []);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (a) => { setEditing(a); setModalOpen(true); };

  const handleSave = (data) => {
    if (editing) updateAlarm(editing.id, data);
    else addAlarm(data);
    setModalOpen(false);
    setEditing(null);
    refresh();
  };
  const handleDelete = () => {
    if (editing) deleteAlarm(editing.id);
    setModalOpen(false);
    setEditing(null);
    refresh();
  };
  const toggle = (a) => { updateAlarm(a.id, { enabled: !a.enabled }); refresh(); };

  const now = new Date();

  return (
    <div className="safe-top px-6 sm:px-8 pb-4 min-h-screen">
      <header className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold lowercase tracking-tight">alarms</h1>
          <p className="text-sm text-muted-foreground lowercase mt-0.5">wake up, your way</p>
        </div>
        <button onClick={openNew} className="touch-44 w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center">
          <Plus className="w-5 h-5" />
        </button>
      </header>

      {alarms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-sm text-muted-foreground lowercase">no alarms yet</p>
          <p className="text-xs text-muted-foreground/50 lowercase mt-1">tap + to add one</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alarms.map((a) => {
            const next = a.enabled ? nextTrigger(a, now) : null;
            const diff = next ? next.getTime() - now.getTime() : null;
            return (
              <div
                key={a.id}
                className={cn('rounded-2xl border border-border p-4', !a.enabled && 'opacity-50')}
                style={a.color ? { borderLeft: `6px solid ${a.color}` } : undefined}
              >
                <div className="flex items-center justify-between gap-3">
                  <button onClick={() => openEdit(a)} className="flex-1 text-left">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-extrabold lowercase">{formatTime(a.time, clockFmt)}</span>
                      <span className="text-xs text-muted-foreground lowercase truncate">{a.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground lowercase mt-1">
                      {a.days && a.days.length ? `every ${dayLabel(a.days)}` : a.date ? `on ${a.date}` : 'once'}
                      {a.enabled && diff != null ? ` · rings in ${formatRemaining(diff)}` : ''}
                    </p>
                  </button>
                  <button
                    onClick={() => toggle(a)}
                    className={cn('touch-44 relative w-12 h-7 rounded-full transition-colors shrink-0', a.enabled ? 'bg-foreground' : 'bg-muted')}
                  >
                    <span className={cn('absolute top-1 w-5 h-5 rounded-full bg-background transition-all', a.enabled ? 'left-6' : 'left-1')} />
                  </button>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => openEdit(a)} className="touch-44 flex items-center gap-1.5 px-3 h-8 rounded-full bg-muted text-xs font-medium lowercase">
                    <Pencil className="w-3 h-3" /> edit
                  </button>
                  <button onClick={() => { deleteAlarm(a.id); refresh(); }} className="touch-44 flex items-center gap-1.5 px-3 h-8 rounded-full bg-muted text-xs font-medium lowercase text-destructive">
                    <Trash2 className="w-3 h-3" /> delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-[11px] text-muted-foreground/40 lowercase mt-6 px-4">
        alarms fire while retrolist is open or in the background. keep the app running for reliable alarms.
      </p>

      <AlarmModal
        open={modalOpen}
        alarm={editing}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        onDelete={editing ? handleDelete : undefined}
      />
    </div>
  );
}