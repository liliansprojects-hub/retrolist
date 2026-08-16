import React, { createContext, useContext, useEffect, useState } from 'react';
import { getProfile, saveProfile } from './store';

// ── color helpers ──
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHslString(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = ((b - r) / d + 2);
    else h = ((r - g) / d + 4);
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
function mix(a, b, t) {
  // t = weight of b
  return { r: Math.round(a.r * (1 - t) + b.r * t), g: Math.round(a.g * (1 - t) + b.g * t), b: Math.round(a.b * (1 - t) + b.b * t) };
}
function luminance({ r, g, b }) {
  const a = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function contrast(c1, c2) {
  const l1 = luminance(c1), l2 = luminance(c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function hsl(c) { return rgbToHslString(c.r, c.g, c.b); }

// derive a full token palette from an accent hex, for the given mode
function deriveTokens(accentHex, isDark) {
  const accent = hexToRgb(accentHex || '#1a1a1a');
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 10, g: 10, b: 12 };

  let bg, fg;
  if (isDark) {
    bg = mix(black, accent, 0.14);
    fg = mix(accent, white, 0.78);
    // ensure readability on dark bg
    let tries = 0;
    while (contrast(fg, bg) < 4.5 && tries < 12) { fg = mix(fg, white, 0.12); tries++; }
  } else {
    bg = mix(white, accent, 0.035);
    fg = { ...accent };
    // ensure readability on light bg — darken if too light
    let tries = 0;
    while (contrast(fg, bg) < 4.5 && tries < 12) { fg = mix(fg, black, 0.12); tries++; }
  }

  const card = isDark ? mix(bg, accent, 0.04) : mix(white, accent, 0.02);
  const cardFg = fg;
  const popover = card;
  const popoverFg = fg;
  const primary = fg;
  const primaryFg = bg;
  const secondary = mix(bg, fg, isDark ? 0.1 : 0.06);
  const secondaryFg = fg;
  const muted = mix(bg, fg, isDark ? 0.08 : 0.05);
  const mutedFg = mix(fg, bg, 0.4);
  const accentTok = fg;
  const accentFg = bg;
  const border = mix(bg, fg, isDark ? 0.16 : 0.1);
  const input = border;
  const ring = fg;

  return {
    '--background': hsl(bg),
    '--foreground': hsl(fg),
    '--card': hsl(card),
    '--card-foreground': hsl(cardFg),
    '--popover': hsl(popover),
    '--popover-foreground': hsl(popoverFg),
    '--primary': hsl(primary),
    '--primary-foreground': hsl(primaryFg),
    '--secondary': hsl(secondary),
    '--secondary-foreground': hsl(secondaryFg),
    '--muted': hsl(muted),
    '--muted-foreground': hsl(mutedFg),
    '--accent': hsl(accentTok),
    '--accent-foreground': hsl(accentFg),
    '--border': hsl(border),
    '--input': hsl(input),
    '--ring': hsl(ring),
  };
}

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => getProfile().theme || 'system');
  const [accent, setAccent] = useState(() => getProfile().accent || '#1a1a1a');
  const [font, setFont] = useState(() => getProfile().font || 'nunito');
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const isDark = theme === 'dark' || (theme === 'system' && systemDark);

  // apply theme class + accent-derived tokens together
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    const tokens = deriveTokens(accent, isDark);
    Object.entries(tokens).forEach(([k, v]) => root.style.setProperty(k, v));
  }, [isDark, accent]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--font-body', `var(--font-${font})`);
    root.style.setProperty('--font-heading', `var(--font-${font})`);
  }, [font]);

  const changeTheme = (t) => { setTheme(t); saveProfile({ theme: t }); };
  const changeAccent = (c) => { setAccent(c); saveProfile({ accent: c }); };
  const changeFont = (f) => { setFont(f); saveProfile({ font: f }); };

  return (
    <ThemeContext.Provider value={{ theme, isDark, accent, font, changeTheme, changeAccent, changeFont, systemDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);