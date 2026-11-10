import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Share2, FolderInput, Copy, ChevronLeft, Check, PanelLeft, PanelRight, Square, RectangleVertical } from 'lucide-react';
import ColorPicker from './ColorPicker';
import MediaUploader from './MediaUploader';
import FolderPicker from './FolderPicker';
import ShareDialog from './ShareDialog';
import { cn } from '@/lib/utils';
import { getSettings, saveSettings } from '@/lib/store';
import { KINDS, PARENTS, CHIP_PARENTS, CUSTOM_ICONS, MORE_ICON, kindInfo, parentOf, defaultKindFor, subKindsOf } from '@/lib/itemKinds';

// separate-window item editor: name + subheading + type-specific fields (year,
// date/month, reps/times, amount), notes, colour, photos/files, link, and
// move/copy/share. items are leaf nodes — nothing can be added inside them,
// only edited or deleted.
// every extra box any kind can use; their values live on the item under these keys
const EXTRA_KEYS = ['year', 'date', 'times', 'reps', 'amount', 'cycle', 'level', 'endDate', 'code', 'credits', 'grade', 'servings', 'prepTime', 'cookTime', 'ingredients', 'courses', 'category', 'status', 'priority', 'startDate', 'dueDate'];

export default function ItemEditor({ item, folderType, folderId, atRoot = false, onClose, onSave, onDelete, onMove, onCopy }) {
  const [kind, setKind] = useState(item.kind || defaultKindFor(folderType));
  const [customLabel, setCustomLabel] = useState(item.customLabel || '');
  const [customIcon, setCustomIcon] = useState(item.customIcon || 'sparkles');
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreName, setMoreName] = useState('');
  const [moreIcon, setMoreIcon] = useState('sparkles');
  const [saved, setSaved] = useState(() => getSettings().customSubtypes || {});
  const [extra, setExtra] = useState(() => { const o = {}; EXTRA_KEYS.forEach((k) => { o[k] = item[k] ?? ''; }); return o; });
  const setX = (k, v) => setExtra((x) => ({ ...x, [k]: v }));
  const parent = item.parentType || parentOf(kind === 'custom' ? null : kind, folderType);
  const info = kindInfo({ ...item, kind, customLabel, customIcon, parentType: parent }, folderType);
  const KIND_LABELS = { [kind]: info.label };
  const KIND_META = { [kind]: { name: info.name, sub: info.sub } };
  const [text, setText] = useState(item.text || '');
  const [subheading, setSubheading] = useState(item.subheading || '');
  const [notes, setNotes] = useState(item.notes || item.body || '');
  const [color, setColor] = useState(item.color || '');
  const [url, setUrl] = useState(item.url || '');
  const [media, setMedia] = useState(item.media || (item.photo ? [{ id: 'legacy', type: 'photo', url: item.photo }] : []));
  const [done, setDone] = useState(!!item.done);
  const [style, setStyle] = useState(item.style || 'tip-left');
  const [itemHeight, setItemHeight] = useState(item.itemHeight || 'long');
  const [pendingAction, setPendingAction] = useState(null);
  const [picker, setPicker] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);

  const isTodoish = kind === 'todo' || kind === 'checklist';
  const showSubheading = !isTodoish || true;
  const canUrl = true;

  const draft = { text, subheading, ...extra, notes: notes, body: notes, color, url, media, done, kind, parentType: parent, customLabel: kind === 'custom' ? customLabel : undefined, customIcon: kind === 'custom' ? customIcon : undefined, style, itemHeight };

  // this editor previously only wrote anything on an explicit "save" tap —
  // fine when the user reliably reaches that button, but if the app gets
  // backgrounded/closed offline before they do (very easy to do — switching
  // apps, phone locking, the OS reclaiming a backgrounded tab), every edit
  // was silently discarded, matching the exact bug reported. autosave every
  // change (debounced) for existing items so nothing depends on the save
  // button actually being pressed; brand-new items are untouched here since
  // they don't exist in storage yet until the first real save anyway.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const autosaveTimer = useRef(null);
  const skipFirst = useRef(true);
  useEffect(() => {
    if (item.__isNew) return;
    if (skipFirst.current) { skipFirst.current = false; return; }
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => onSave(draftRef.current), 400);
    return () => clearTimeout(autosaveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, subheading, extra, kind, customLabel, customIcon, notes, color, url, media, done, style, itemHeight]);
  useEffect(() => () => clearTimeout(autosaveTimer.current), []);

  // move/copy is deferred until "save" is pressed — the chosen target is held
  // here and applied after the draft is persisted, so the moved/copied version
  // carries the latest contents.
  const save = () => {
    onSave(draft);
    if (pendingAction) {
      if (pendingAction.type === 'move' && onMove) onMove(item.id, pendingAction.targetId);
      else if (pendingAction.type === 'copy' && onCopy) onCopy(item.id, pendingAction.targetId);
    }
    onClose();
  };
  // NOTE: edits to an existing item now autosave as you type (see the
  // effect above), so "cancel" only closes the screen — it no longer
  // discards changes, since the whole point is that nothing should be lost
  // by not pressing an explicit save button.
  const cancel = () => { if (item.__isNew) onDelete(); else onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={cancel}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto no-scrollbar bg-card rounded-t-3xl sm:rounded-3xl border border-border p-5 pb-8 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={cancel} className="touch-44 flex items-center gap-1 text-xs font-medium lowercase text-muted-foreground"><ChevronLeft className="w-4 h-4" /> back</button>
          <h3 className="text-sm font-semibold lowercase">{item.__isNew ? 'new ' + (info.label || 'item') : 'edit ' + (info.label || 'item')}</h3>
          <button onClick={() => onDelete()} className="touch-44 p-1 rounded-full text-destructive"><Trash2 className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          {isTodoish && (
            <div className="flex items-center gap-2">
              <button onClick={() => setDone(!done)} className={cn('touch-44 w-6 h-6 rounded-full border-2 flex items-center justify-center', done ? 'bg-foreground border-foreground' : 'border-border')}>
                {done && <Check className="w-3.5 h-3.5 text-background" strokeWidth={3} />}
              </button>
              <span className="text-xs text-muted-foreground lowercase">{kind === 'todo' ? 'cross out when done' : 'tick when done'}</span>
            </div>
          )}

          {CHIP_PARENTS.includes(parent) && (
            <div>
              <span className="text-[11px] text-muted-foreground lowercase block mb-1.5">type of {PARENTS[parent].label.replace(/s$/, '')}</span>
              <div className="flex flex-wrap gap-1.5">
                {subKindsOf(parent).map((o) => (
                  <button key={o.kind} onClick={() => { setKind(o.kind); setMoreOpen(false); }} className={cn('touch-44 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs lowercase', kind === o.kind ? 'bg-foreground text-background border-foreground' : 'bg-background border-border')}>
                    <o.icon className="w-3.5 h-3.5" /> {o.label}
                  </button>
                ))}
                {(saved[parent] || []).map((c) => {
                  const CI = CUSTOM_ICONS[c.icon] || CUSTOM_ICONS.sparkles;
                  const on = kind === 'custom' && customLabel === c.label;
                  return (
                    <button key={c.label} onClick={() => { setKind('custom'); setCustomLabel(c.label); setCustomIcon(c.icon); setMoreOpen(false); }} className={cn('touch-44 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs lowercase', on ? 'bg-foreground text-background border-foreground' : 'bg-background border-border')}>
                      <CI className="w-3.5 h-3.5" /> {c.label}
                    </button>
                  );
                })}
                <button onClick={() => setMoreOpen((m) => !m)} className={cn('touch-44 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed text-xs lowercase', moreOpen ? 'bg-muted' : 'bg-background border-border')}>
                  <MORE_ICON className="w-3.5 h-3.5" /> more
                </button>
              </div>
              {moreOpen && (
                <div className="mt-2 p-3 rounded-2xl bg-muted/60 space-y-2">
                  <input value={moreName} onChange={(e) => setMoreName(e.target.value)} placeholder="name your own type (e.g. gardening)" className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground" />
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(CUSTOM_ICONS).map(([key, Ic]) => (
                      <button key={key} onClick={() => setMoreIcon(key)} className={cn('touch-44 w-9 h-9 rounded-xl flex items-center justify-center border', moreIcon === key ? 'bg-foreground text-background border-foreground' : 'bg-background border-border')}><Ic className="w-4 h-4" /></button>
                    ))}
                  </div>
                  <button
                    disabled={!moreName.trim()}
                    onClick={() => {
                      const label = moreName.trim().toLowerCase();
                      const next = { ...saved, [parent]: [...(saved[parent] || []).filter((c) => c.label !== label), { label, icon: moreIcon }] };
                      setSaved(next); saveSettings({ customSubtypes: next });
                      setKind('custom'); setCustomLabel(label); setCustomIcon(moreIcon); setMoreName(''); setMoreOpen(false);
                    }}
                    className="touch-44 w-full py-2 rounded-xl bg-foreground text-background text-xs font-medium lowercase disabled:opacity-30"
                  >add this type</button>
                </div>
              )}
              {kind === 'custom' && (saved[parent] || []).some((c) => c.label === customLabel) && (
                <button onClick={() => { const next = { ...saved, [parent]: (saved[parent] || []).filter((c) => c.label !== customLabel) }; setSaved(next); saveSettings({ customSubtypes: next }); setKind(defaultKindFor(parent)); }} className="mt-1.5 text-[11px] text-muted-foreground underline lowercase">remove "{customLabel}" from my types</button>
              )}
            </div>
          )}

          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={KIND_META[kind]?.name || 'name'} autoFocus className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm font-semibold outline-none focus:border-foreground" />

          {showSubheading && (
            <input value={subheading} onChange={(e) => setSubheading(e.target.value)} placeholder={KIND_META[kind]?.sub || 'subheading'} className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground" />
          )}
          {info.fields.filter((f) => f.type !== 'textarea').length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {info.fields.filter((f) => f.type !== 'textarea').map((f) => {
                const box = 'w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground';
                if (f.type === 'pair') {
                  return (
                    <div key={f.key} className="col-span-2">
                      <span className="text-[11px] text-muted-foreground lowercase block mb-1">{f.label}</span>
                      <div className="flex items-center gap-2">
                        <input value={extra[f.key]} onChange={(e) => setX(f.key, e.target.value)} placeholder="times" inputMode="numeric" className={box} />
                        <span className="text-sm text-muted-foreground">×</span>
                        <input value={extra[f.key2]} onChange={(e) => setX(f.key2, e.target.value)} placeholder="reps" inputMode="numeric" className={box} />
                      </div>
                    </div>
                  );
                }
                if (f.type === 'select') {
                  return (
                    <div key={f.key}>
                      <span className="text-[11px] text-muted-foreground lowercase block mb-1">{f.label}</span>
                      <select value={extra[f.key]} onChange={(e) => setX(f.key, e.target.value)} className={box + ' lowercase'}>
                        <option value="">–</option>
                        {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  );
                }
                return (
                  <div key={f.key} className={f.type === 'text' && f.label.length > 18 ? 'col-span-2' : ''}>
                    <span className="text-[11px] text-muted-foreground lowercase block mb-1">{f.label}</span>
                    <input type={f.type === 'date' ? 'date' : 'text'} value={extra[f.key]} onChange={(e) => setX(f.key, e.target.value)} inputMode={f.type === 'number' ? 'decimal' : undefined} className={box} />
                  </div>
                );
              })}
            </div>
          )}
          {info.fields.filter((f) => f.type === 'textarea').map((f) => (
            <div key={f.key}>
              <span className="text-[11px] text-muted-foreground lowercase block mb-1">{f.label}</span>
              <textarea value={extra[f.key]} onChange={(e) => setX(f.key, e.target.value)} rows={3} className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground resize-none selectable" />
            </div>
          ))}

          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="notes…" rows={4} className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground resize-none selectable" />

          {canUrl && (
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="link (url)" className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm outline-none focus:border-foreground" />
          )}

          <MediaUploader media={media} onChange={setMedia} enableViewer />
          <ColorPicker value={color} onChange={setColor} label="item colour" />
          {color && (
            <div>
              <span className="text-xs font-medium text-muted-foreground lowercase block mb-2">item style</span>
              <div className="flex gap-2">
                <button onClick={() => setStyle('full')} className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs lowercase', style === 'full' ? 'bg-foreground text-background border-foreground' : 'bg-background border-border')}>
                  <Square className="w-4 h-4" /> full
                </button>
                <button onClick={() => setStyle('tip-left')} className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs lowercase', style === 'tip-left' ? 'bg-foreground text-background border-foreground' : 'bg-background border-border')}>
                  <PanelLeft className="w-4 h-4" /> tip (l)
                </button>
                <button onClick={() => setStyle('tip-right')} className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs lowercase', style === 'tip-right' ? 'bg-foreground text-background border-foreground' : 'bg-background border-border')}>
                  <PanelRight className="w-4 h-4" /> tip (r)
                </button>
              </div>
            </div>
          )}

          <div>
            <span className="text-xs font-medium text-muted-foreground lowercase block mb-2">item height</span>
            <div className="flex gap-2">
              <button onClick={() => setItemHeight('long')} className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs lowercase', itemHeight === 'long' ? 'bg-foreground text-background border-foreground' : 'bg-background border-border')}>
                <RectangleVertical className="w-4 h-4" /> longer
              </button>
              <button onClick={() => setItemHeight('short')} className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs lowercase', itemHeight === 'short' ? 'bg-foreground text-background border-foreground' : 'bg-background border-border')}>
                <Square className="w-4 h-4" /> shorter
              </button>
            </div>
          </div>

          {pendingAction && (
            <div className="px-3 py-2 rounded-xl bg-muted text-xs lowercase text-center text-muted-foreground">
              will {pendingAction.type} to {pendingAction.targetName || 'the new spot'} when you press save
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={() => setPicker('move')} className="touch-44 flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted text-xs font-medium lowercase"><FolderInput className="w-3.5 h-3.5" /> move to</button>
            <button onClick={() => setPicker('copy')} className="touch-44 flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted text-xs font-medium lowercase"><Copy className="w-3.5 h-3.5" /> copy to</button>
            <button onClick={() => setShareOpen(true)} className="touch-44 flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted text-xs font-medium lowercase"><Share2 className="w-3.5 h-3.5" /> share</button>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground/60 lowercase text-center mt-5">
          {item.__isNew ? 'created ' : 'updated '}{new Date(item.created_date || Date.now()).toLocaleString()}
        </p>
        <button onClick={save} className="touch-44 w-full mt-3 py-3 rounded-2xl bg-foreground text-background text-sm font-medium lowercase">save</button>

        <FolderPicker
          open={!!picker}
          title={picker === 'copy' ? 'copy item to' : 'move item to'}
          kind="item"
          mode={picker === 'copy' ? 'copy' : 'move'}
          currentContainerId={folderId || null}
          currentIsRoot={atRoot}
          onClose={() => setPicker(null)}
          onSelect={(targetId, targetName) => {
            setPendingAction({ type: picker, targetId, targetName });
            setPicker(null);
          }}
        />
        <ShareDialog open={shareOpen} data={{ ...item, ...draft, kind: 'item' }} title={text || 'item'} onClose={() => setShareOpen(false)} />
      </div>
    </div>
  );
}