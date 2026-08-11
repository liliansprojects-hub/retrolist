// builds a small circular accent-coloured icon for browser notifications,
// cached per colour so repeated alarms don't re-render the canvas.
const cache = new Map();

export function getAccentIcon(color) {
  if (!color) return undefined;
  if (cache.has(color)) return cache.get(color);
  try {
    const size = 96;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    // accent circle background
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    // white bell mark
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(36, 30);
    ctx.lineTo(36, 58);
    ctx.quadraticCurveTo(36, 66, 48, 66);
    ctx.quadraticCurveTo(60, 66, 60, 58);
    ctx.lineTo(60, 30);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(48, 72, 5, 0, Math.PI * 2);
    ctx.fill();
    const url = c.toDataURL('image/png');
    cache.set(color, url);
    return url;
  } catch {
    return undefined;
  }
}