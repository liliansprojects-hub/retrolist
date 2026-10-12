// Locks page zoom everywhere in the app EXCEPT inside any element marked
// data-allow-pinch (the photo crop frame, which implements its own
// pinch-to-zoom on the image and needs the gesture).
//
// The viewport meta tag + touch-action CSS are the first line of defence,
// but not every browser / wrapper / accessibility setting honours them, and
// they say nothing about Ctrl+scroll or keyboard zoom on desktop. So this
// also intercepts every zoom input directly, and if the browser zooms
// regardless, snaps it straight back.

const ALLOW = '[data-allow-pinch]';
const inAllowed = (t) => t instanceof Element && !!t.closest(ALLOW);

export function installZoomLock() {
  const cleanups = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };

  // touch: any multi-finger move is a pinch
  on(document, 'touchmove', (e) => {
    if (e.touches && e.touches.length > 1 && !inAllowed(e.target)) e.preventDefault();
  }, { passive: false });
  on(document, 'touchstart', (e) => {
    if (e.touches && e.touches.length > 1 && !inAllowed(e.target)) e.preventDefault();
  }, { passive: false });

  // Safari / iOS pinch gestures
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
    on(document, type, (e) => { if (!inAllowed(e.target)) e.preventDefault(); });
  });

  // desktop: Ctrl/Cmd + scroll wheel (also how trackpad pinch arrives)
  on(window, 'wheel', (e) => {
    if ((e.ctrlKey || e.metaKey) && !inAllowed(e.target)) e.preventDefault();
  }, { passive: false });

  // desktop: Ctrl/Cmd + + / - / 0
  on(window, 'keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (['+', '=', '-', '_', '0', 'Add', 'Subtract'].includes(e.key)) e.preventDefault();
  });

  // last resort: if the page ends up zoomed anyway (a browser or device
  // setting overriding the rules above), re-assert the viewport so the
  // browser snaps back to 1x.
  const vv = window.visualViewport;
  const meta = document.querySelector('meta[name="viewport"]');
  if (vv && meta) {
    const base = meta.getAttribute('content') || '';
    let resetting = false;
    const snapBack = () => {
      if (resetting || vv.scale <= 1.02) return;
      resetting = true;
      meta.setAttribute('content', 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no');
      setTimeout(() => { meta.setAttribute('content', base); resetting = false; }, 60);
    };
    on(vv, 'resize', snapBack);
    on(vv, 'scroll', snapBack);
  }

  return () => cleanups.forEach((fn) => fn());
}
