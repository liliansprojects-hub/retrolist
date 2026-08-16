import React from 'react';
import { ArrowDownUp, Clock, ArrowUp, ArrowDownAZ, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { id: 'newest', label: 'newest', icon: Clock },
  { id: 'oldest', label: 'oldest', icon: ArrowUp },
  { id: 'alpha', label: 'a–z', icon: ArrowDownAZ },
  { id: 'custom', label: 'reorder', icon: GripVertical },
];

export default function SortBar({ value, onChange }) {
  return (
    <div className="flex items-center gap-1.5 mb-3 overflow-x-auto no-scrollbar">
      <ArrowDownUp className="w-3 h-3 text-muted-foreground shrink-0" />
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'touch-44 shrink-0 flex items-center gap-1 px-2.5 h-7 rounded-full text-[10px] font-medium lowercase transition-colors',
            value === o.id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
          )}
        >
          <o.icon className="w-3 h-3" /> {o.label}
        </button>
      ))}
    </div>
  );
}