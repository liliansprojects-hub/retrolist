// local, offline-first account credentials.
// supports MULTIPLE accounts per device: an accounts map keyed by username, plus a
// session pointing at the currently-signed-in username. no Base44 session or OAuth —
// login works fully offline for any account already on the device. cross-device sync
// is handled separately in cloudSync.js (partitioned by username).

const ACCOUNTS_KEY = 'retrolist_accounts';
const SESSION_KEY = 'retrolist_session';
const LEGACY_ACCOUNT_KEY = 'retrolist_account';

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

const LEGACY_COLLECTIONS = ['profile', 'settings', 'folders', 'journal', 'events', 'period', 'alarms', 'map_folders', 'deleted_log'];

// one-time migration: assign pre-isolation (un-scoped) data to the first user who
// logs in, then remove the legacy keys so later accounts start with their own data.
export function migrateLegacyData(username) {
  if (!username) return;
  try {
    const flag = 'retrolist_legacy_migrated';
    if (localStorage.getItem(flag)) return;
    LEGACY_COLLECTIONS.forEach(function (c) {
      const legacy = localStorage.getItem('retrolist_' + c);
      if (legacy != null) {
        localStorage.setItem('retrolist_' + username + '__' + c, legacy);
        localStorage.removeItem('retrolist_' + c);
      }
    });
    localStorage.setItem(flag, '1');
  } catch (e) {}
}

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

// accounts map (with one-time migration from the legacy single-account key)
function getAccounts() {
  let map = read(ACCOUNTS_KEY, null);
  if (!map || typeof map !== 'object') {
    const legacy = read(LEGACY_ACCOUNT_KEY, null);
    map = (legacy && legacy.username) ? { [legacy.username]: legacy } : {};
    writeRaw(ACCOUNTS_KEY, map);
    try { localStorage.removeItem(LEGACY_ACCOUNT_KEY); } catch (e) {}
    // fix legacy session ('1') to point at the migrated account so users stay logged in
    if (legacy && legacy.username && localStorage.getItem(SESSION_KEY) === '1') {
      try { localStorage.setItem(SESSION_KEY, legacy.username); } catch (e) {}
    }
  }
  return map;
}

export function getAccountByUsername(username) {
  if (!username) return null;
  return getAccounts()[username.trim().toLowerCase()] || null;
}

export function getAccount() {
  const u = localStorage.getItem(SESSION_KEY);
  return u ? (getAccounts()[u] || null) : null;
}

export function saveAccount(account) {
  const map = getAccounts();
  map[account.username] = account;
  writeRaw(ACCOUNTS_KEY, map);
}

export function clearAccount(username) {
  const u = username || localStorage.getItem(SESSION_KEY);
  if (!u) return;
  const map = getAccounts();
  delete map[u];
  writeRaw(ACCOUNTS_KEY, map);
}

export function isLoggedIn() {
  try {
    const u = localStorage.getItem(SESSION_KEY);
    return !!u && !!getAccounts()[u];
  } catch (e) {
    return false;
  }
}

export function setLoggedIn(username) {
  try { localStorage.setItem(SESSION_KEY, username); } catch (e) {}
}

export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
}

export async function registerLocal(username, password, email) {
  const u = username.trim().toLowerCase();
  const salt = randomHex(16);
  const hash = await pbkdf2(password, salt);
  const e = (email || '').trim().toLowerCase();
  // email_confirmed always starts false when an email is given — it isn't
  // actually verified yet at this point, just supplied. it only becomes true
  // once verifyEmailRemote succeeds (see Register.jsx / EmailSection.jsx).
  const account = { username: u, salt: salt, hash: hash, email: e, email_confirmed: false, updated_date: Date.now() };
  saveAccount(account);
  setLoggedIn(u);
  return account;
}