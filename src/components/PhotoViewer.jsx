import React, { useState, useRef, useEffect } from 'react';
import { X, Download, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

// full-screen photo viewer with swipe-to-next (touch + arrow keys) and a
// per-photo download / delete panel. used by My Files, albums, and item media.
export default function PhotoViewer({ photos = [], startIndex = 0, onClose, onDelete }) {
  const [index, setIndex] = useState(Math.min(startIndex, photos.length - 1));
  const touch = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(photos.length - 1, i + 1));
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photos.length, onClose]);

  const photo = photos[index];
  if (!photo) return null;

  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const next = () => setIndex((i) => Math.min(photos.length - 1, i + 1));

  const onTouchStart = (e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next(); else prev();
    }
    touch.current = null;
  };

  const handleDelete = () => {
    if (!onDelete) return;
    onDelete(index);
    if (index >= photos.length - 1) prev();
    if (photos.length <= 1) onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col animate-fade-in">
      <div className="safe-top flex items-center justify-between p-4">
        <button onClick={onClose} className="touch-44 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
          <X className="w-5 h-5 text-white" />
        </button>
        <span className="text-xs text-white/60 lowercase">{index + 1} / {photos.length}</span>
        <div className="flex gap-2">
          <a href={photo.url} download={photo.name || `photo-${index + 1}`} className="touch-44 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
            <Download className="w-5 h-5 text-white" />
          </a>
          {onDelete && (
            <button onClick={handleDelete} className="touch-44 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-white" />
            </button>
          )}
        </div>
      </div>
      <div
        className="relative flex-1 flex items-center justify-center overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {index > 0 && (
          <button onClick={prev} className="touch-44 absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center z-10">
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
        )}
        <img src={photo.url} alt={photo.caption || ''} className="max-w-full max-h-full object-contain" />
        {index < photos.length - 1 && (
          <button onClick={next} className="touch-44 absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center z-10">
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        )}
      </div>
    </div>
  );
}