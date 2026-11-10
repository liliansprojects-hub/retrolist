import React, { useId } from 'react';

// Classic waterdrop / teardrop map pin. The tip is at the bottom centre of the
// box, so anchoring the box's bottom-centre on a coordinate puts the point of
// the pin exactly on that spot.
export const PIN_ASPECT = 32 / 44; // width / height of the drawing

function mix(hex, target, amount) {
  const h = String(hex || '#111827').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  const ch = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0);
  const out = ch.map((c) => Math.round(c + (target - c) * amount));
  return '#' + out.map((c) => c.toString(16).padStart(2, '0')).join('');
}

export default function WaterdropPin({ color = '#111827', height = 40, selected = false }) {
  const gid = 'wdp' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const width = Math.round(height * PIN_ASPECT);
  const light = mix(color, 255, 0.28);
  const dark = mix(color, 0, 0.22);
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 32 44"
      style={{
        display: 'block',
        overflow: 'visible',
        filter: 'drop-shadow(0 3px 3px rgba(0,0,0,0.38))',
        transformOrigin: '50% 100%',
        transform: selected ? 'scale(1.22)' : 'none',
        transition: 'transform 0.18s ease-out',
        animation: selected ? 'retroPinDrop 0.35s ease-out' : 'none',
      }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={color} />
        </linearGradient>
      </defs>
      {/* the drop */}
      <path
        d="M16 1.5C8.5 1.5 2.5 7.5 2.5 14.9c0 5.1 2.8 9.4 6 13.2C11.6 31.9 15 37.6 16 42.6c1-5 4.4-10.7 7.5-14.5 3.2-3.8 6-8.1 6-13.2C29.5 7.5 23.5 1.5 16 1.5z"
        fill={`url(#${gid})`}
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* thin darker rim just inside the white outline gives it body */}
      <path
        d="M16 3C9.3 3 4 8.3 4 14.9c0 4.6 2.6 8.6 5.7 12.3 3 3.6 5.2 7.2 6.3 10.6 1.1-3.4 3.3-7 6.3-10.6 3.1-3.7 5.7-7.7 5.7-12.3C28 8.3 22.7 3 16 3z"
        fill="none"
        stroke={dark}
        strokeOpacity="0.35"
        strokeWidth="1"
      />
      {/* centre dot */}
      <circle cx="16" cy="14.8" r="5.4" fill="#ffffff" />
      <circle cx="16" cy="14.8" r="2.4" fill={color} fillOpacity="0.9" />
      {/* soft highlight */}
      <ellipse cx="11.2" cy="8.6" rx="3.2" ry="1.9" fill="#ffffff" fillOpacity="0.32" transform="rotate(-32 11.2 8.6)" />
    </svg>
  );
}
