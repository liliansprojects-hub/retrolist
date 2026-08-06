// local, offline-first account credentials.
// username + salted/hashed password (PBKDF2 via Web Crypto) stored in localStorage.
// no Base44 session or OAuth — login works fully offline on a device that has
// the account. cross-device sync is handled separately in cloudSync.js.

const ACCOUNT_KEY = 'retrolist_account';
const SESSION_KEY = 'retrolist_session';

const read = function (key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
};

const writeRaw = function (key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error('storage write failed', e);
  }
};

export function randomHex(bytes) {
  const n = bytes || 16;
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a)
    .map(function (b) { return b.toString(16).padStart(2, '0'); })
    .join('');
}

// PBKDF2-SHA256, 100k iterations, 256-bit output → hex string
export async function pbkdf2(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const saltBytes = Uint8Array.from(
    (saltHex.match(/.{2}/g) || []).map(function (h) { return parseInt(h, 16); })
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits))
    .map(function (b) { return b.toString(16).padStart(2, '0'); })
    .join('');
}

export function getAccount() {
  return read(ACCOUNT_KEY, null);
}

export function saveAccount(account) {
  writeRaw(ACCOUNT_KEY, account);
}

export function clearAccount() {
  try { localStorage.removeItem(ACCOUNT_KEY); } catch (e) {}
}

export function isLoggedIn() {
  try {
    return localStorage.getItem(SESSION_KEY) === '1' && !!getAccount();
  } catch (e) {
    return false;
  }
}

export function setLoggedIn() {
  try { localStorage.setItem(SESSION_KEY, '1'); } catch (e) {}
}

export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
}

export async function registerLocal(username, password) {
  const u = username.trim().toLowerCase();
  const salt = randomHex(16);
  const hash = await pbkdf2(password, salt);
  const account = { username: u, salt: salt, hash: hash, updated_date: Date.now() };
  saveAccount(account);
  setLoggedIn();
  return account;
}