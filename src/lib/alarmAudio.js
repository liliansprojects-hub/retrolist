// web-audio alarm tones + vibration patterns + custom uploaded tracks — no asset files needed, works offline.
// gain is near full so the device's hardware volume controls loudness.
import { getCustomTracks } from '@/lib/store';

export const SOUNDS = [
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

let audioCtx = null;
let loopTimer = null;
let vibrateTimer = null;
let trackEl = null;

function ctx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    try { audioCtx.resume(); } catch {}
  }
  return audioCtx;
}

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

function playOnce(c, soundId) {
  const p = PRESETS[soundId] || PRESETS.classic;
  let t = c.currentTime;
  for (let b = 0; b < p.beats; b++) {
    const f = p.freqs[b % p.freqs.length];
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = p.type;
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.8, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + p.dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + p.dur + 0.02);
    t += p.dur + p.gap;
  }
}

function startTrack(url) {
  stopTrack();
  if (!url) return;
  try {
    trackEl = new Audio(url);
    trackEl.loop = true;
    trackEl.play().catch(() => {});
  } catch {}
}
function stopTrack() {
  if (trackEl) {
    try { trackEl.pause(); trackEl.currentTime = 0; } catch {}
    trackEl = null;
  }
}

export function startSound(soundId) {
  stopSound();
  if (isCustomTrack(soundId)) { startTrack(getTrackUrl(soundId)); return; }
  const c = ctx();
  if (!c) return;
  try { playOnce(c, soundId); } catch {}
  const p = PRESETS[soundId] || PRESETS.classic;
  const cycle = p.beats * (p.dur + p.gap) + 0.6;
  loopTimer = setInterval(() => { try { playOnce(c, soundId); } catch {} }, Math.max(800, cycle * 1000));
}

export function stopSound() {
  if (loopTimer) { clearInterval(loopTimer); loopTimer = null; }
  stopTrack();
}

export function startVibrate(pattern) {
  stopVibrate();
  if (!navigator.vibrate || !pattern || !pattern.length) return;
  try { navigator.vibrate(pattern); } catch {}
  const total = pattern.reduce((a, b) => a + b, 0) + 200;
  vibrateTimer = setInterval(() => { try { navigator.vibrate(pattern); } catch {} }, Math.max(400, total));
}

export function stopVibrate() {
  if (vibrateTimer) { clearInterval(vibrateTimer); vibrateTimer = null; }
  if (navigator.vibrate) { try { navigator.vibrate(0); } catch {} }
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