import React, { useState, useRef } from 'react';
import { Check } from 'lucide-react';
import { COLORS } from '@/lib/store';
import { cn } from '@/lib/utils';

export default function ColorPicker({ value, onChange, label = 'colour' }) {
  const [customColor, setCustomColor] = useState(value || '#1a1a1a');
  const [showAll, setShowAll] = useState(false);
  const inputRef = useRef(null);

  const palette = showAll ? COLORS : COLORS.slice(0, 36);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground lowercase">{label}</span>
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-xs text-muted-foreground lowercase underline"
        >
          {showAll ? 'less' : 'more'}
        </button>
      </div>
      <div className="grid grid-cols-9 gap-2">
        {palette.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={cn(
              'w-8 h-8 rounded-full border-2 transition-transform active:scale-90 icon-no-select',
              value === c ? 'border-foreground scale-110' : 'border-transparent'
            )}
            style={{ backgroundColor: c }}
          >
            {value === c && (
              <Check
                className="w-3.5 h-3.5 mx-auto"
                style={{ color: parseInt(c.slice(1, 3), 16) > 180 ? '#000' : '#fff' }}
              />
            )}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={() => inputRef.current?.click()}
          className="touch-44 relative w-11 h-11 rounded-full border-2 border-border overflow-hidden flex items-center justify-center"
          style={{ background: `conic-gradient(red, yellow, lime, cyan, blue, magenta, red)` }}
        >
          <input
            ref={inputRef}
            type="color"
            value={customColor}
            onChange={(e) => {
              setCustomColor(e.target.value);
              onChange(e.target.value);
            }}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
          <span className="text-xs font-bold text-white drop-shadow">+</span>
        </button>
        <span className="text-xs text-muted-foreground lowercase">custom colour</span>
      </div>
    </div>
  );
}