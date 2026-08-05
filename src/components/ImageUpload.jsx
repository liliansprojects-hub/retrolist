import React, { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import CropModal from './CropModal';

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
}) {
  const inputRef = useRef(null);
  const cameraRef = useRef(null);
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
        <div className={cn('relative rounded-2xl overflow-hidden', className)}>
          <img src={value} alt="" className="w-full h-full object-cover" />
          <button
            onClick={() => onChange(null)}
            className="touch-44 absolute top-2 right-2 w-8 h-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            onClick={() => inputRef.current?.click()}
            className="touch-44 absolute bottom-2 right-2 px-3 h-8 rounded-full bg-background/80 backdrop-blur flex items-center gap-1.5 text-xs font-medium lowercase"
          >
            <Camera className="w-3.5 h-3.5" />
            change
          </button>
        </div>
      ) : (
        <div className={cn('grid grid-cols-2 gap-2', className)}>
          <button
            onClick={() => inputRef.current?.click()}
            className="touch-44 min-h-[80px] rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-muted-foreground"
          >
            <Camera className="w-5 h-5" />
            <span className="text-xs lowercase">photo library</span>
          </button>
          <button
            onClick={() => cameraRef.current?.click()}
            className="touch-44 min-h-[80px] rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-muted-foreground"
          >
            <Camera className="w-5 h-5" />
            <span className="text-xs lowercase">take photo</span>
          </button>
        </div>
      )}
      {/* gallery / file picker */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
      {/* camera capture */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
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
    </div>
  );
}