import React, { useState, useEffect } from 'react';
import { FileText, Link as LinkIcon, Trash2, Download, Check } from 'lucide-react';
import { getAllPhotos, getAllUrls, getAllFiles, deleteFile, deletePhotoByUrl } from '@/lib/store';
import { cn } from '@/lib/utils';
import PhotoViewer from './PhotoViewer';

// Settings > My Files — gallery of everything stored in-app (offline).
// tap a photo to open it full-size with swipe-to-next + download/delete;
// "select" mode enables tick-box mass download.
export default function MyFiles() {
  const [tab, setTab] = useState('photos');
  const [, setTick] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [viewerIndex, setViewerIndex] = useState(null);

  useEffect(() => {
    const h = () => setTick((t) => t + 1);
    window.addEventListener('retrolist:data-changed', h);
    window.addEventListener('retrolist:synced', h);
    return () => {
      window.removeEventListener('retrolist:data-changed', h);
      window.removeEventListener('retrolist:synced', h);
    };
  }, []);

  const photos = getAllPhotos();
  const urls = getAllUrls();
  const files = getAllFiles();

  const showPhotos = tab === 'all' || tab === 'photos';
  const showFiles = tab === 'all' || tab === 'files';

  const openUrl = (u) => { try { window.open(u, '_blank', 'noopener,noreferrer'); } catch {} };

  const toggleSelect = (i) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(i)) n.delete(i); else n.add(i);
    return n;
  });

  const downloadSelected = () => {
    [...selected].forEach((i, k) => {
      const p = photos[i];
      if (!p) return;
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = p.url;
        a.download = `photo-${i + 1}.jpg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, k * 250);
    });
  };

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {[['photos', 'photos'], ['all', 'all'], ['files', 'files']].map(([id, l]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'touch-44 px-3 py-1.5 rounded-full text-xs font-medium lowercase transition-colors',
              tab === id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
            )}
          >
            {l}
          </button>
        ))}
        {showPhotos && photos.length > 0 && (
          <button
            onClick={() => { setSelectMode((s) => !s); setSelected(new Set()); }}
            className={cn(
              'touch-44 ml-auto px-3 py-1.5 rounded-full text-xs font-medium lowercase transition-colors',
              selectMode ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
            )}
          >
            {selectMode ? 'cancel' : 'select'}
          </button>
        )}
      </div>

      {showPhotos && (photos.length ? (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {photos.map((p, i) => (
              <div
                key={i}
                className={cn(
                  'relative rounded-xl overflow-hidden border border-border active:scale-95 transition-transform',
                  selected.has(i) && 'ring-2 ring-foreground'
                )}
              >
                <button
                  onClick={() => (selectMode ? toggleSelect(i) : setViewerIndex(i))}
                  className="block w-full"
                >
                  <img src={p.url} alt="" className="w-full aspect-square object-cover" />
                </button>
                {selectMode && (
                  <button
                    onClick={() => toggleSelect(i)}
                    className="touch-44 absolute top-1 right-1 w-6 h-6 rounded-full bg-background/80 flex items-center justify-center"
                  >
                    {selected.has(i) ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border-2 border-foreground/60" />}
                  </button>
                )}
              </div>
            ))}
          </div>
          {selectMode && selected.size > 0 && (
            <button
              onClick={downloadSelected}
              className="touch-44 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-foreground text-background text-xs font-medium lowercase mb-4"
            >
              <Download className="w-3.5 h-3.5" /> download {selected.size} selected
            </button>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground/50 lowercase mb-4">no photos yet</p>
      ))}

      {showFiles && (files.length ? (
        <div className="space-y-2 mb-4">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-border">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="flex-1 text-xs lowercase truncate">{f.name}</span>
              <a href={f.url} download={f.name} className="touch-44 flex items-center gap-1 text-xs text-foreground lowercase">
                <Download className="w-3.5 h-3.5" /> save
              </a>
              <button onClick={() => { deleteFile(f.id); setTick((t) => t + 1); }} className="touch-44 text-destructive">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/50 lowercase mb-4">no files yet</p>
      ))}

      {urls.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground lowercase mb-2">saved links</p>
          <div className="space-y-2">
            {urls.map((u, i) => (
              <button
                key={i}
                onClick={() => openUrl(u.url)}
                className="w-full flex items-center gap-2 p-2.5 rounded-xl border border-border text-left active:scale-[0.99] transition-transform"
              >
                <LinkIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-xs lowercase truncate">{u.url}</span>
                <span className="text-[10px] text-muted-foreground/50 lowercase shrink-0">{u.source}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {viewerIndex !== null && photos[viewerIndex] && (
        <PhotoViewer
          photos={photos}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onDelete={(i) => { deletePhotoByUrl(photos[i].url); setViewerIndex(null); setTick((t) => t + 1); }}
        />
      )}
    </div>
  );
}