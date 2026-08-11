import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MoreVertical, Pin } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { cn } from '@/lib/utils';
import { BLOCK_SIZES } from '@/lib/store';

export default function FolderCard({ folder, onClick, onMenu }) {
  const itemCount = folder.items?.length || 0;
  const coverPhoto = folder.cover;
  const bgColor = folder.color || '#f4f4f5';

  const ratio = (BLOCK_SIZES.find((s) => s.id === (folder.size || 'portrait')) || BLOCK_SIZES[1]).ratio;
  return (
    <button
      onClick={onClick}
      className="card-no-select group relative block w-full mb-3 break-inside-avoid rounded-2xl overflow-hidden active:scale-95 transition-transform text-left shadow-[0_1px_1px_rgba(0,0,0,0.015)]"
      style={{ backgroundColor: coverPhoto ? '#000' : bgColor, aspectRatio: ratio }}
    >
      {coverPhoto ? (
        <Image
          src={coverPhoto}
          fittingType="fill"
          className="absolute inset-0 w-full h-full opacity-80 group-active:opacity-100 transition-opacity"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          {folder.emoji ? (
            <span className="text-4xl opacity-40">{folder.emoji}</span>
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-white/10" />
          )}
        </div>
      )}

      {/* gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent" />

      {/* menu button */}
      {onMenu && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMenu();
          }}
          className="touch-44 absolute top-2 right-2 w-8 h-8 rounded-full bg-black/20 backdrop-blur flex items-center justify-center"
        >
          <MoreVertical className="w-4 h-4 text-white" />
        </button>
      )}

      {/* info */}
      <div className="absolute bottom-0 inset-x-0 p-4 pb-5">
        <h3 className="text-sm font-bold text-white lowercase leading-tight line-clamp-2">
          {folder.name}
        </h3>
        <p className="text-[10px] text-white/70 lowercase mt-0.5">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </p>
      </div>

      {/* pin / type badge */}
      {folder.pinned ? (
        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/30 backdrop-blur flex items-center justify-center">
          <Pin className="w-3 h-3 text-white fill-white" />
        </div>
      ) : folder.type && folder.type !== 'list' ? (
        <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-black/30 backdrop-blur text-[9px] text-white font-medium lowercase">
          {folder.type}
        </div>
      ) : null}
    </button>
  );
}