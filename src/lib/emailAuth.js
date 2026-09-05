// client-only email verification + password-reset codes.
//
// why this exists: the previous implementation routed every step through
// Base44 custom serverless functions (base44/functions/confirmEmail,
// verifyEmail, forgotPassword, resetPassword). those never actually ran
// against this export — db.functions.invoke() either hit nothing or
// returned a response with no recognizable `error` field, and the callers
// only checked `if (res.error)` before treating the call as successful.
// that combination is exactly why ANY code appeared to "work": a failed or
// unreachable call still looked like success. see cloudSync.js's old
// *Remote helpers (removed below) for the previous shape.
//
// this file replaces all four flows with something that needs no backend
// deployment at all:
//   - the code is generated AND checked on this same device/browser --
//     every flow in this app (register -> verify, forgot -> reset) already
//     happens in one sitting in one browser, so there is nothing to keep in
//     sync across devices for this specific step.
//   - delivery goes through EmailJS (https://www.emailjs.com), a
//     client-safe email API made for exactly this (no server needed). point
//     it at a Gmail "custom SMTP" integration using the same Gmail address
//     + app password already used for GMAIL_USER/GMAIL_APP_PASSWORD. see
//     EMAIL_SETUP.md at the project root for the one-time setup steps and
//     which three values to put in .env.local.
//   - verifyCode() does a strict local match + expiry check, so a random
//     guess can never pass.
import emailjs from '@emailjs/browser';

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || '';
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || '';
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || '';

const CODES_KEY = 'retrolist_email_codes';
const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes, matches the old server-side expiry
const RESEND_COOLDOWN_MS = 20 * 1000;

function readCodes() {
  try { return JSON.parse(localStorage.getItem(CODES_KEY)) || {}; } catch (e) { return {}; }
}

function writeCodes(map) {
  try { localStorage.setItem(CODES_KEY, JSON.stringify(map)); } catch (e) { /* storage unavailable */ }
}

function keyFor(purpose, username) {
  return purpose + ':' + (username || '').trim().toLowerCase();
}

// crypto-random 4 digits (1000-9999) — Math.random() is predictable enough
// that a verification code generated with it isn't really a secret.
function genCode() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(1000 + (arr[0] % 9000));
}

export function emailDeliveryConfigured() {
  return !!(SERVICE_ID && TEMPLATE_ID && PUBLIC_KEY);
}

async function deliver(email, subject, code, intro) {
  if (!emailDeliveryConfigured()) {
    return { sent: false, error: 'email sending is not set up yet — see EMAIL_SETUP.md' };
  }
  try {
    await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      {
        to_email: email,
        subject,
        code,
        passcode: code,
        message: `${intro} ${code}. it expires in 15 minutes.`,
      },
      { publicKey: PUBLIC_KEY }
    );
    return { sent: true };
  } catch (e) {
    const msg = (e && e.text) || (e && e.message) || 'failed to send email';
    return { sent: false, error: msg };
  }
}

// purpose: 'confirm' (verifying an email on register/login/change) or
// 'reset' (forgot-password). generates+stores a fresh code, then emails it.
export async function requestCode(purpose, username, email) {
  const map = readCodes();
  const k = keyFor(purpose, username);
  const existing = map[k];
  if (existing && Date.now() - existing.sentAt < RESEND_COOLDOWN_MS) {
    return { error: 'please wait a few seconds before requesting another code' };
  }
  const code = genCode();
  map[k] = { code, email: (email || '').trim().toLowerCase(), expires: Date.now() + CODE_TTL_MS, sentAt: Date.now() };
  writeCodes(map);

  const subject = purpose === 'reset' ? 'your retrolist reset code' : 'confirm your email';
  const intro = purpose === 'reset' ? 'your password reset code is' : 'your confirmation code is';
  const result = await deliver(email, subject, code, intro);
  if (!result.sent) return { error: result.error };
  return { sent: true };
}

// strict match: wrong code, expired code, or no code ever requested all
// fail the same way. a successful check consumes the code (single use).
export function verifyCode(purpose, username, email, code) {
  const map = readCodes();
  const k = keyFor(purpose, username);
  const rec = map[k];
  const submitted = String(code || '').trim();
  if (!rec || !submitted) return { error: 'invalid or expired code' };
  if (rec.expires < Date.now()) {
    delete map[k];
    writeCodes(map);
    return { error: 'invalid or expired code' };
  }
  if (purpose === 'confirm' && email && rec.email !== email.trim().toLowerCase()) {
    return { error: 'invalid or expired code' };
  }
  if (rec.code !== submitted) return { error: 'invalid or expired code' };
  delete map[k];
  writeCodes(map);
  return { ok: true };
}
