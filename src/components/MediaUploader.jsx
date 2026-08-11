import React, { useRef, useState } from 'react';
import { Upload, X, Download, FileText, Link as LinkIcon, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import PhotoViewer from './PhotoViewer';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// multi photo/file uploader — originals are stored as data URLs (NO compression,
// so original resolution/quality is retained). supports images + arbitrary files
// from the local gallery/files, optional url entries, optional per-item captions,
// and per-item + bulk download (original quality preserved).
export default function MediaUploader({ media = [], onChange, allowUrl = false, allowCaption = false, columns = 3, enableViewer = false, selectable = false, onDeleteItems }) {
  const imageRef = useRef(null);
  const anyFileRef = useRef(null);
  const [urlInput, setUrlInput] = useState('');
  const [viewerIndex, setViewerIndex] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const photos = media.filter((m) => m.type === 'photo');

  const remove = (id) => {
    if (onDeleteItems) onDeleteItems([id]);
    else onChange(media.filter((m) => m.id !== id));
  };
  const deleteSelected = () => {
    if (selected.size === 0) return;
    const ids = [...selected];
    if (onDeleteItems) onDeleteItems(ids);
    else onChange(media.filter((m) => !selected.has(m.id)));
    setSelected(new Set());
    setSelectMode(false);
  };
  const toggleSel = (id) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const addFiles = (files) => {
    const list = Array.from(files || []);
    list.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const isImage = file.type.startsWith('image/');
        onChange([
          ...media,
          { id: uid(), type: isImage ? 'photo' : 'file', url: reader.result, name: file.name, size: file.size },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const addUrl = () => {
    const u = urlInput.trim();
    if (!u) return;
    const norm = /^https?:\/\//i.test(u) ? u : 'https://' + u;
    onChange([...media, { id: uid(), type: 'url', url: norm, name: norm }]);
    setUrlInput('');
  };

  const setCaption = (id, caption) => onChange(media.map((m) => (m.id === id ? { ...m, caption } : m)));

  const downloadable = media.filter((m) => m.type !== 'url');
  const downloadAll = () => {
    downloadable.forEach((m, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = m.url;
        a.download = m.name || `file-${i + 1}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 250);
    });
  };

  return (
    <div className="space-y-3">
      {selectable && media.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSelectMode((s) => !s); setSelected(new Set()); }}
            className={cn('touch-44 px-2.5 py-1 rounded-full text-[11px] font-medium lowercase', selectMode ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}
          >
            {selectMode ? 'cancel' : 'select'}
          </button>
          {selectMode && selected.size > 0 && (
            <button onClick={deleteSelected} className="touch-44 px-2.5 py-1 rounded-full bg-destructive text-destructive-foreground text-[11px] font-medium lowercase">
              delete {selected.size}
            </button>
          )}
        </div>
      )}

      {media.length > 0 && (
        <div className={cn('grid gap-2', columns === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
          {media.map((m) => (
            <div
              key={m.id}
              onClick={selectMode ? () => toggleSel(m.id) : undefined}
              className={cn(
                'relative rounded-xl overflow-hidden border border-border bg-muted/40',
                selectMode && 'cursor-pointer',
                selectMode && selected.has(m.id) && 'ring-2 ring-foreground'
              )}
            >
              {m.type === 'photo' ? (
                selectMode ? (
                  <img src={m.url} alt={m.caption || ''} className={cn('w-full aspect-square object-cover', selected.has(m.id) && 'opacity-50')} />
                ) : enableViewer ? (
                  <button onClick={() => setViewerIndex(photos.findIndex((p) => p.id === m.id))} className="block w-full">
                    <img src={m.url} alt={m.caption || ''} className="w-full aspect-square object-cover" />
                  </button>
                ) : (
                  <img src={m.url} alt={m.caption || ''} className="w-full aspect-square object-cover" />
                )
              ) : m.type === 'file' ? (
                <a href={m.url} download={m.name} onClick={selectMode ? (e) => { e.preventDefault(); toggleSel(m.id); } : undefined} className="flex flex-col items-center justify-center gap-1 w-full aspect-square p-2 text-center">
                  <FileText className="w-6 h-6 text-muted-foreground" />
                  <span className="text-[10px] lowercase truncate w-full">{m.name}</span>
                </a>
              ) : (
                <a href={m.url} target="_blank" rel="noopener noreferrer" onClick={selectMode ? (e) => { e.preventDefault(); toggleSel(m.id); } : undefined} className="flex flex-col items-center justify-center gap-1 w-full aspect-square p-2 text-center">
                  <LinkIcon className="w-6 h-6 text-muted-foreground" />
                  <span className="text-[10px] lowercase truncate w-full">{m.name}</span>
                </a>
              )}
              {selectMode && (
                <div className="touch-44 absolute top-1 left-1 w-5 h-5 rounded-full bg-background/80 flex items-center justify-center">
                  {selected.has(m.id) && <Check className="w-3 h-3" />}
                </div>
              )}
              {!selectMode && (
                <button
                  onClick={() => remove(m.id)}
                  className="touch-44 absolute top-1 right-1 w-6 h-6 rounded-full bg-background/80 backdrop-blur flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              {!selectMode && m.type !== 'url' && (
                <a
                  href={m.url}
                  download={m.name || 'file'}
                  className="touch-44 absolute bottom-1 right-1 w-6 h-6 rounded-full bg-background/80 backdrop-blur flex items-center justify-center"
                >
                  <Download className="w-3 h-3" />
                </a>
              )}
              {allowCaption && !selectMode && (
                <input
                  value={m.caption || ''}
                  onChange={(e) => setCaption(m.id, e.target.value)}
                  placeholder="caption"
                  className="w-full px-1.5 py-1 text-[10px] bg-background/70 text-center outline-none lowercase selectable"
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => imageRef.current?.click()}
          className="touch-44 flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-dashed border-border text-xs font-medium lowercase text-muted-foreground"
        >
          <Upload className="w-4 h-4" /> add photos
        </button>
        <button
          onClick={() => anyFileRef.current?.click()}
          className="touch-44 flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-dashed border-border text-xs font-medium lowercase text-muted-foreground"
        >
          <Upload className="w-4 h-4" /> add files
        </button>
        <input ref={imageRef} type="file" multiple accept="image/*" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} className="hidden" />
        <input ref={anyFileRef} type="file" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} className="hidden" />
      </div>

      {allowUrl && (
        <div className="flex gap-2">
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addUrl()}
            placeholder="add a link (url)"
            className="flex-1 px-3 py-2 rounded-xl bg-muted text-sm outline-none"
          />
          <button onClick={addUrl} className="touch-44 px-3 rounded-xl bg-muted text-xs font-medium lowercase">add</button>
        </div>
      )}

      {downloadable.length > 1 && (
        <button
          onClick={downloadAll}
          className="touch-44 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted text-xs font-medium lowercase text-muted-foreground"
        >
          <Download className="w-3.5 h-3.5" /> download all (original quality)
        </button>
      )}

      {enableViewer && viewerIndex !== null && photos.length > 0 && (
        <PhotoViewer
          photos={photos}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onDelete={(i) => {
            const p = photos[i];
            if (!p) return;
            remove(p.id);
            setViewerIndex((cur) => (photos.length <= 1 ? null : Math.min(cur, photos.length - 2)));
          }}
        />
      )}
    </div>
  );
}