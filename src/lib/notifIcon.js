// Themed notification artwork. Notifications show a retrolist-styled bell
// in the person's own accent colour, with no app logo and no browser logo.
//
//  - getAccentIcon(color): the large icon, an accent-coloured circle with a
//    bell in a contrasting colour (PNG data URL, cached per colour)
//  - BADGE: the small monochrome status-bar icon. Android needs one, otherwise
//    it falls back to the browser's own logo.
//  - syncNotificationTheme(accent): hands the icon to the service worker so
//    notifications pushed while the app is CLOSED look the same.
export const BADGE = '/notif-badge.png';

const cache = new Map();

function readableOn(hex) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  if (!Number.isFinite(n)) return '#ffffff';
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.45 ? '#141414' : '#ffffff';
}

function drawBell(ctx, s, color) {
  // drawn on a 96-unit grid, scaled to the canvas
  const k = s / 96;
  ctx.save();
  ctx.scale(k, k);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(48, 22, 4, 0, Math.PI * 2); // knob
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(30, 62);
  ctx.bezierCurveTo(32, 54, 32, 46, 32, 42);
  ctx.bezierCurveTo(32, 32, 39, 25, 48, 25);
  ctx.bezierCurveTo(57, 25, 64, 32, 64, 42);
  ctx.bezierCurveTo(64, 46, 64, 54, 66, 62);
  ctx.lineTo(70, 66);
  ctx.lineTo(26, 66);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(48, 72, 5.5, 0, Math.PI * 2); // clapper
  ctx.fill();
  ctx.restore();
}

export function getAccentIcon(color) {
  if (!color || typeof document === 'undefined') return undefined;
  if (cache.has(color)) return cache.get(color);
  try {
    const size = 192;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    drawBell(ctx, size, readableOn(color));
    const url = c.toDataURL('image/png');
    cache.set(color, url);
    return url;
  } catch {
    return undefined;
  }
}

// Send the current theme to the service worker (it stores it, so pushes that
// arrive while the app is closed use the same artwork). Safe to call often.
export async function syncNotificationTheme(accent) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const icon = getAccentIcon(accent || '#1a1a1a');
  if (!icon) return;
  try {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
    const target = (reg && reg.active) || navigator.serviceWorker.controller;
    if (target) target.postMessage({ type: 'NOTIF_THEME', icon, accent });
  } catch { /* ignore */ }
}

// Show a notification in the retrolist style, through the service worker
// (Android doesn't allow `new Notification()` at all). `url` is where tapping
// it takes you inside the app.
export async function showThemedNotification(title, { body = '', tag, url = '/', accent, kind = 'reminder', ...rest } = {}) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const options = {
    body,
    icon: getAccentIcon(accent || '#1a1a1a'),
    badge: BADGE,
    tag,
    renotify: !!tag,
    data: { kind, url },
    ...rest,
  };
  try {
    if ('serviceWorker' in navigator) {
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('sw')), 3000))]);
      await reg.showNotification(title, options);
      return true;
    }
  } catch { /* fall through */ }
  try { new Notification(title, options); return true; } catch { return false; }
}
