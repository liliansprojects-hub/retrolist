// Remembers roughly where the person is, so a typed address / place name is searched NEAR them
// first. Without this a free-text search is answered with whatever the whole world matches best
// first — an unspecific "high street" or "township highway 202" lands in Ohio, whoever asked.
//
// What is kept (localStorage, this device only): the last known position, and the country code of
// that position (looked up once). Updated every time the map's "my location" button succeeds, and
// quietly on page open if the browser has already been granted location permission (no prompt).

const KEY = 'rl-user-bias';

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng)) return v;
  } catch { /* storage blocked or corrupt — treated as "no bias" */ }
  return null;
}

function write(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

// { lat, lng, cc } | null — synchronous, never prompts for anything
export function getUserBias() {
  return read();
}

const kmApart = (a, b) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

export function rememberUserPosition(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const prev = read();
  const moved = !prev || kmApart(prev, { lat, lng }) > 25;
  write({ lat, lng, cc: moved ? '' : prev.cc || '', ts: Date.now() });
  // one small reverse lookup per new area, to learn the country code (best effort, never awaited)
  if (moved || !prev.cc) {
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=3&lat=${lat}&lon=${lng}`)
      .then((r) => r.json())
      .then((j) => {
        const cc = String(j?.address?.country_code || '').toLowerCase();
        const cur = read();
        if (cc && cur && Math.abs(cur.lat - lat) < 0.001) write({ ...cur, cc });
      })
      .catch(() => { /* offline — the box search below still works without a country code */ });
  }
}

// Refresh the remembered position without ever showing a permission prompt: only runs when the
// browser has ALREADY granted location access (which it has, since "my location" works).
export async function primeUserBias() {
  try {
    if (!navigator.geolocation || !navigator.permissions) return;
    const st = await navigator.permissions.query({ name: 'geolocation' });
    if (st.state !== 'granted') return;
    navigator.geolocation.getCurrentPosition(
      (pos) => rememberUserPosition(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 10 * 60 * 1000 },
    );
  } catch { /* permissions API unavailable — the last remembered position is still used */ }
}
