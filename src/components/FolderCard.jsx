import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MoreVertical, Pin } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { cn } from '@/lib/utils';
import { BLOCK_SIZES, LIST_TYPES } from '@/lib/store';

function readableText(hex) {
  if (!hex || hex[0] !== '#') return '#fff';
  const c = hex.length === 4
    ? hex.slice(1).split('').map((x) => x + x).join('')
    : hex.slice(1);
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#1a1a1a' : '#fff';
}

export default function FolderCard({ folder, onClick, onMenu, fill }) {
  const itemCount = folder.items?.length || 0;
  const coverPhoto = folder.cover;
  const bgColor = folder.color || '#f4f4f5';
  const isReminder = folder.type === 'reminder';

  const ratio = (BLOCK_SIZES.find((s) => s.id === (folder.size || 'portrait')) || BLOCK_SIZES[1]).ratio;
  const typeLabel = LIST_TYPES[folder.type]?.label || folder.type;
  const textColor = readableText(bgColor);

  return (
    <button
      onClick={onClick}
      className={`card-no-select group relative block rounded-2xl overflow-hidden active:scale-95 transition-transform text-left shadow-[0_1px_1px_rgba(0,0,0,0.015)] ${fill ? 'w-full h-full' : 'w-full mb-3 break-inside-avoid'}`}
      style={{ backgroundColor: coverPhoto ? '#000' : bgColor, ...(fill ? {} : { aspectRatio: ratio }) }}
    >
      {isReminder ? (
        // reminder: solid colour block, no photo / no centred emoji — date / time
        // / subheading / name laid out over the colour, no empty middle space.
        <div className="absolute inset-0 flex flex-col justify-between p-4" style={{ color: textColor }}>
          <div className="flex items-baseline gap-2">
            {folder.time && <span className="text-2xl font-extrabold lowercase leading-none">{folder.time}</span>}
            {folder.date && <span className="text-[11px] font-medium lowercase opacity-80">{folder.date}</span>}
          </div>
          <div>
            {folder.subtitle && <p className="text-[11px] font-medium lowercase opacity-80 mb-1 line-clamp-1">{folder.subtitle}</p>}
            <h3 className="text-base font-extrabold lowercase leading-tight line-clamp-2">{folder.name}</h3>
          </div>
        </div>
      ) : coverPhoto ? (
        <Image
          src={coverPhoto}
          fittingType="fill"
          className="absolute inset-0 w-full h-full opacity-80 group-active:opacity-100 transition-opacity"
        />
      ) : folder.emoji ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-4xl opacity-40">{folder.emoji}</span>
        </div>
      ) : null}

      {/* gradient overlay — only on photo covers so text stays legible; plain
          colour blocks stay full, undarkened */}
      {coverPhoto && <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent" />}

      {/* menu button — just the vertical dots, no shaded circle */}
      {onMenu && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMenu();
          }}
          className="touch-44 absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center"
        >
          <MoreVertical className="w-3.5 h-3.5" style={{ color: coverPhoto ? '#fff' : textColor }} />
        </button>
      )}

      {/* info */}
      {!isReminder && (
        <div className="absolute bottom-0 inset-x-0 p-4 pb-5" style={{ color: coverPhoto ? '#fff' : textColor }}>
          <h3 className="text-base font-extrabold lowercase leading-tight line-clamp-2">
            {folder.name}
          </h3>
          {folder.subtitle && (
            <p className="text-[11px] lowercase opacity-90 mt-0.5 line-clamp-1">{folder.subtitle}</p>
          )}
          <p className="text-[10px] lowercase opacity-70 mt-0.5">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </p>
        </div>
      )}

      {/* pin badge — type tag lives only in the edit panel now */}
      {folder.pinned && (
        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/30 backdrop-blur flex items-center justify-center">
          <Pin className="w-3 h-3 text-white fill-white" />
        </div>
      )}
    </button>
  );
}