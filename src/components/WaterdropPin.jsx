import React from 'react';

// Flat, plain, 2D waterdrop pin: one solid colour, a white centre dot, nothing
// else (no gradient, rim, shadow or highlight). The tip is at the bottom centre
// of the box, so anchoring the box's bottom-centre on a coordinate puts the
// point of the pin exactly on that spot.
export const PIN_ASPECT = 28 / 40; // width / height of the drawing

export default function WaterdropPin({ color = '#111827', height = 40, selected = false }) {
  const width = Math.round(height * PIN_ASPECT);
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 28 40"
      style={{
        display: 'block',
        overflow: 'visible',
        transformOrigin: '50% 100%',
        transform: selected ? 'scale(1.2)' : 'none',
        transition: 'transform 0.18s ease-out',
      }}
      aria-hidden="true"
    >
      <path d="M14 39C14 39 2 23.5 2 14.5C2 7.6 7.4 2 14 2s12 5.6 12 12.5C26 23.5 14 39 14 39z" fill={color} stroke="#ffffff" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="14" cy="14.5" r="4.6" fill="#ffffff" />
    </svg>
  );
}
