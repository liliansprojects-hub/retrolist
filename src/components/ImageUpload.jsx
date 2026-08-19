import React, { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import CropModal from './CropModal';

// single "choose photo" source — the in-app camera / "take photo" option was
// removed everywhere; all photos are picked from the library and stored
// offline as data URLs.
export default function ImageUpload({
  value,
  onChange,
  label = 'photo',
  className,
  aspect = 1,
  round = false,
  maxSize = 800,
  quality = 0.8,
  enableCrop = true,
  controlsOutside = false,
}) {
  const inputRef = useRef(null);
  const [rawSrc, setRawSrc] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (enableCrop) {
        setRawSrc(reader.result);
      } else {
        compressDirect(reader.result, maxSize, quality, onChange);
      }
    };
    reader.readAsDataURL(file);
    // reset so selecting the same file again still fires
    e.target.value = '';
  };

  // used when cropping is disabled
  const compressDirect = (src, ms, q, cb) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      const max = ms;
      if (width > max || height > max) {
        if (width > height) { height = (height * max) / width; width = max; }
        else { width = (width * max) / height; height = max; }
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      cb(canvas.toDataURL('image/jpeg', q));
    };
    img.src = src;
  };

  return (
    <div>
      {label && <span className="text-xs font-medium text-muted-foreground lowercase block mb-2">{label}</span>}
      {value ? (
        <div className={cn('relative w-full', className)} style={{ aspectRatio: aspect || undefined }}>
          <img src={value} alt="" className={cn('w-full h-full object-cover', round ? 'rounded-full' : 'rounded-2xl')} />
          {!controlsOutside && (
            <div className="absolute -top-2 right-0 flex gap-1 z-10">
              <button
                onClick={() => inputRef.current?.click()}
                className="w-7 h-7 rounded-full bg-foreground text-background shadow flex items-center justify-center"
                aria-label="change"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onChange(null)}
                className="w-7 h-7 rounded-full bg-background border border-border shadow flex items-center justify-center"
                aria-label="remove"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className={cn('touch-44 w-full min-h-[64px] rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 p-2 text-muted-foreground', className)}
        >
          <Camera className="w-4 h-4" />
          <span className="text-[10px] lowercase">choose photo</span>
        </button>
      )}
      {/* gallery / file picker */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />

      {rawSrc && (
        <CropModal
          imageSrc={rawSrc}
          aspect={aspect}
          round={round}
          maxSize={maxSize}
          quality={quality}
          onSave={(d) => { onChange(d); setRawSrc(null); }}
          onCancel={() => setRawSrc(null)}
        />
      )}

      {controlsOutside && value && (
        <div className="flex items-center justify-center gap-2 mt-2">
          <button
            onClick={() => inputRef.current?.click()}
            className="touch-44 flex items-center gap-1 px-3 h-8 rounded-full bg-muted text-xs lowercase"
          >
            <Camera className="w-3.5 h-3.5" /> change
          </button>
          <button
            onClick={() => onChange(null)}
            className="touch-44 flex items-center gap-1 px-3 h-8 rounded-full bg-muted text-xs lowercase"
          >
            <X className="w-3.5 h-3.5" /> remove
          </button>
        </div>
      )}
    </div>
  );
}