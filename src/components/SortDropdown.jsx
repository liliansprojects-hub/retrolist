import React, { useState } from 'react';
import { ArrowDownUp, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { id: 'newest', label: 'newest' },
  { id: 'oldest', label: 'oldest' },
  { id: 'alpha', label: 'a–z' },
  { id: 'custom', label: 'reorder' },
];

// rounded dropdown that holds the sort options; sits on the same line as the
// list-type label in the folder header.
export default function SortDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = OPTIONS.find((o) => o.id === value) || OPTIONS[0];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 pl-2.5 pr-2 h-6 rounded-full bg-muted text-[10px] font-medium lowercase"
      >
        <ArrowDownUp className="w-3 h-3" /> {current.label}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 min-w-[120px] rounded-2xl border border-border bg-popover shadow-lg overflow-hidden animate-fade-in">
            {OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => { onChange(o.id); setOpen(false); }}
                className={cn(
                  'touch-44 w-full flex items-center justify-between gap-2 px-3 py-2 text-xs lowercase',
                  value === o.id ? 'text-foreground font-semibold' : 'text-muted-foreground'
                )}
              >
                {o.label}
                {value === o.id && <Check className="w-3 h-3" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}