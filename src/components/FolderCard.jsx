import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MoreVertical } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { cn } from '@/lib/utils';

export default function FolderCard({ folder, onClick, onMenu }) {
  const itemCount = folder.items?.length || 0;
  const coverPhoto = folder.cover;
  const bgColor = folder.color || '#f4f4f5';

  return (
    <button
      onClick={onClick}
      className="card-no-select group relative aspect-[3/4] rounded-2xl overflow-hidden active:scale-95 transition-transform text-left"
      style={{ backgroundColor: coverPhoto ? '#000' : bgColor }}
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
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

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
      <div className="absolute bottom-0 inset-x-0 p-3">
        <h3 className="text-sm font-bold text-white lowercase leading-tight line-clamp-2 drop-shadow">
          {folder.name}
        </h3>
        <p className="text-[10px] text-white/70 lowercase mt-0.5">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </p>
      </div>

      {/* type badge */}
      {folder.type && folder.type !== 'list' && (
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/30 backdrop-blur text-[9px] text-white font-medium lowercase">
          {folder.type}
        </div>
      )}
    </button>
  );
}