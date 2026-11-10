// Alarm tones + vibration patterns + custom uploaded tracks. No asset files
// needed, works offline.
//
// HOW THE SOUND WORKS (and why it changed):
// The old engine synthesised tones live with WebAudio oscillators, re-triggered
// by a setInterval. That broke in the situations alarms matter most:
//   - browsers throttle/suspend timers and AudioContexts when the page isn't in
//     front, so the repeating tone stalled or never started;
//   - iOS mutes WebAudio entirely when the silent switch is on, and puts the
//     context in an "interrupted" state our resume() check never handled;
//   - the very first play from a timer (no user gesture) was blocked silently.
// Now every tone is rendered ONCE into a small WAV and played through a single
// <audio> element with native looping. Media elements keep playing in the
// background, ignore the iOS silent switch, and need no timer. The element is
// "unlocked" by the user's first tap anywhere (primeAudio), and if the browser
// still refuses a play we remember it and retry on the next tap instead of
// failing silently.
import { getCustomTracks } from '@/lib/store';

export const SOUNDS = [
  { id: 'none', label: 'off' },
  { id: 'classic', label: 'classic' },
  { id: 'chime', label: 'chime' },
  { id: 'beep', label: 'beep' },
  { id: 'marimba', label: 'marimba' },
  { id: 'digital', label: 'digital' },
];

export const VIBRATIONS = [
  { id: 'default', label: 'default', pattern: [200, 100, 200, 100, 200, 300] },
  { id: 'short', label: 'short', pattern: [100, 80] },
  { id: 'long', label: 'long', pattern: [500, 150, 500, 150, 500] },
  { id: 'ramp', label: 'ramp', pattern: [80, 40, 160, 40, 320, 40, 640] },
  { id: 'none', label: 'none', pattern: [] },
];

const PRESETS = {
  classic: { freqs: [880, 660], beats: 2, dur: 0.18, gap: 0.06, type: 'sine' },
  chime: { freqs: [1320, 1760], beats: 2, dur: 0.28, gap: 0.05, type: 'sine' },
  beep: { freqs: [1000], beats: 3, dur: 0.1, gap: 0.05, type: 'square' },
  marimba: { freqs: [523, 784, 1047], beats: 3, dur: 0.16, gap: 0.04, type: 'triangle' },
  digital: { freqs: [1200, 800], beats: 4, dur: 0.08, gap: 0.04, type: 'sawtooth' },
};

// ── custom uploaded tracks (offline data URLs) ──
export function isCustomTrack(soundId) {
  return typeof soundId === 'string' && soundId.indexOf('track:') === 0;
}
export function getTrackUrl(soundId) {
  if (!isCustomTrack(soundId)) return null;
  const id = soundId.slice(6);
  const t = getCustomTracks().find((x) => x.id === id);
  return t ? t.url : null;
}

// ── tone rendering ──
const SAMPLE_RATE = 22050;

// one full cycle of a preset: its beats, then a silent tail before it repeats
export function renderPresetSamples(p, sampleRate = SAMPLE_RATE) {
  const beatLen = p.dur + p.gap;
  const n = Math.round((p.beats * beatLen + 0.6) * sampleRate);
  const data = new Float32Array(n);
  for (let b = 0; b < p.beats; b++) {
    const f = p.freqs[b % p.freqs.length];
    const i0 = Math.round(b * beatLen * sampleRate);
    const len = Math.round(p.dur * sampleRate);
    for (let i = 0; i < len && i0 + i < n; i++) {
      const t = i / sampleRate;
      // 10ms attack, then exponential decay — same envelope the old oscillators used
      const env = t < 0.01 ? 0.8 * (t / 0.01) : 0.8 * Math.pow(0.001 / 0.8, (t - 0.01) / (p.dur - 0.01));
      const ph = (f * t) % 1;
      let s;
      if (p.type === 'square') s = (ph < 0.5 ? 1 : -1) * 0.55;
      else if (p.type === 'sawtooth') s = (2 * ph - 1) * 0.55;
      else if (p.type === 'triangle') s = 4 * Math.abs(ph - 0.5) - 1;
      else s = Math.sin(2 * Math.PI * ph);
      data[i0 + i] += s * env;
    }
  }
  // peak-normalise close to full scale — the device's volume buttons set
  // loudness. Square/saw waves get more headroom: when the device resamples
  // 22kHz audio up to its output rate, their hard edges overshoot by ~25%,
  // which would clip and sound harsh at 0.95.
  const target = p.type === 'square' || p.type === 'sawtooth' ? 0.75 : 0.95;
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[i]));
  const k = peak > 0 ? target / peak : 1;
  for (let i = 0; i < n; i++) data[i] *= k;
  return data;
}

export function encodeWav(samples, sampleRate = SAMPLE_RATE) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

const urlCache = {};
export function presetUrl(id) {
  const key = PRESETS[id] ? id : 'classic';
  if (!urlCache[key]) urlCache[key] = URL.createObjectURL(encodeWav(renderPresetSamples(PRESETS[key])));
  return urlCache[key];
}
function silentUrl() {
  if (!urlCache.__silent) urlCache.__silent = URL.createObjectURL(encodeWav(new Float32Array(Math.round(SAMPLE_RATE * 0.12))));
  return urlCache.__silent;
}
export const PRESET_IDS = Object.keys(PRESETS);

// ── playback ──
let el = null;
let mode = 'idle'; // 'idle' | 'priming' | 'alarm'
let primed = false;
let wanted = null; // sound id currently supposed to be ringing
let pendingSound = null; // a play the browser refused — retried on the next tap

function getEl() {
  if (typeof Audio === 'undefined') return null;
  if (!el) {
    el = new Audio();
    el.preload = 'auto';
    try { el.setAttribute('playsinline', ''); } catch {}
  }
  return el;
}

export const isSoundBlocked = () => !!pendingSound;

export function startSound(soundId) {
  stopSound();
  if (!soundId || soundId === 'none') return Promise.resolve(true);
  const a = getEl();
  const src = isCustomTrack(soundId) ? getTrackUrl(soundId) : presetUrl(soundId);
  if (!a || !src) return Promise.resolve(false);
  wanted = soundId;
  mode = 'alarm';
  a.src = src;
  a.loop = true;
  a.volume = 1;
  try {
    if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'alarm', artist: 'retrolist' });
    }
  } catch {}
  return Promise.resolve(a.play()).then(
    () => { if (wanted === soundId) pendingSound = null; return true; },
    () => {
      // blocked (no tap yet) — remember it, retry on the next tap
      if (wanted === soundId) {
        pendingSound = soundId;
        try { window.dispatchEvent(new Event('retrolist:sound-blocked')); } catch {}
      }
      return false;
    },
  );
}

export function stopSound() {
  wanted = null;
  pendingSound = null;
  const a = el;
  if (a) {
    try { a.pause(); a.currentTime = 0; } catch {}
  }
  if (mode === 'alarm') mode = 'idle';
}

// call from inside a tap: retries an alarm sound the browser refused earlier
export function retryBlockedSound() {
  if (!pendingSound) return Promise.resolve(false);
  return startSound(pendingSound);
}

// Unlock audio with the user's first tap so a later, timer-driven alarm is
// allowed to play. Plays a short silent clip through the same element the
// alarm will use (browsers — iOS especially — unlock per element).
export function primeAudio() {
  if (pendingSound) { retryBlockedSound(); return; }
  if (primed || mode !== 'idle') return;
  const a = getEl();
  if (!a) return;
  mode = 'priming';
  a.src = silentUrl();
  a.loop = false;
  Promise.resolve(a.play()).then(
    () => { if (mode === 'priming') { try { a.pause(); a.currentTime = 0; } catch {} mode = 'idle'; } primed = true; },
    () => { if (mode === 'priming') mode = 'idle'; },
  );
}

// any tap/key press keeps trying until audio is unlocked, and rescues a blocked alarm
if (typeof window !== 'undefined') {
  const unlock = () => { try { primeAudio(); } catch {} };
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach((t) => window.addEventListener(t, unlock, { capture: true, passive: true }));
}

// ── vibration ──
let vibrateTimer = null;

// iOS Safari/PWAs have no Vibration API at all — only the notification's own
// system alert can buzz there. Callers use this to say so honestly.
export const vibrationSupported = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export function startVibrate(pattern) {
  stopVibrate();
  if (!vibrationSupported() || !pattern || !pattern.length) return false;
  let ok = true;
  try { ok = navigator.vibrate(pattern) !== false; } catch { ok = false; }
  const total = pattern.reduce((x, y) => x + y, 0) + 200;
  vibrateTimer = setInterval(() => { try { navigator.vibrate(pattern); } catch {} }, Math.max(400, total));
  return ok;
}

export function stopVibrate() {
  if (vibrateTimer) { clearInterval(vibrateTimer); vibrateTimer = null; }
  if (vibrationSupported()) { try { navigator.vibrate(0); } catch {} }
}

export function preview(soundId, pattern) {
  startSound(soundId);
  startVibrate(pattern);
  setTimeout(() => { stopSound(); stopVibrate(); }, 1800);
}

export function stopAll() {
  stopSound();
  stopVibrate();
}
