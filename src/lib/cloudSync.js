const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };


// cloud sync layer that does NOT use Base44's user session / OAuth.
// all cloud access goes through public backend functions (service role) keyed
// by the local username + password hash. works from any hosting domain because
// there is no login redirect handshake — only background data API calls.

import {
  getFolders, saveFolders, getJournal, saveJournal, getEvents, saveEvents,
  getMapFolders, saveMapFolders, getPeriodData, savePeriod, getProfile, saveProfileRaw,
  getAlarms, saveAlarms, getDeletedLog, saveDeletedLog,
} from './store';
import { getAccount, saveAccount } from './localAuth';

let syncing = false;

// ── backend function wrappers (axios throws on non-2xx → normalise to {error}) ──

export async function accountLookupRemote(username) {
  try {
    const res = await db.functions.invoke('accountLookup', { username: username.trim().toLowerCase() });
    return (res && res.data) ? res.data : res;
  } catch (e) {
    const d = (e && e.response && e.response.data) || (e && e.data);
    if (d) return d;
    return { error: (e && e.message) || 'lookup failed' };
  }
}

export async function syncExchange(username, authHash, records) {
  try {
    const res = await db.functions.invoke('syncExchange', {
      username: username.trim().toLowerCase(),
      authHash,
      records,
    });
    return (res && res.data) ? res.data : res;
  } catch (e) {
    const d = (e && e.response && e.response.data) || (e && e.data);
    if (d) return d;
    return { error: (e && e.message) || 'sync failed' };
  }
}

export async function deleteAccountRemote(username, authHash) {
  try {
    const res = await db.functions.invoke('deleteAccountRemote', {
      username: username.trim().toLowerCase(),
      authHash,
    });
    return (res && res.data) ? res.data : res;
  } catch (e) {
    const d = (e && e.response && e.response.data) || (e && e.data);
    if (d) return d;
    return { error: (e && e.message) || 'delete failed' };
  }
}

// ── collect all local records (incl. the account record) for a push ──

function collectLocalRecords() {
  const records = [];

  getFolders().forEach(function (f) {
    records.push({ local_id: f.id, kind: 'folder', payload: f, local_updated_at: f.updated_date || f.created_date || 0 });
  });
  getJournal().forEach(function (e) {
    records.push({ local_id: e.id, kind: 'journal', payload: e, local_updated_at: e.updated_date || e.created_date || 0 });
  });
  getEvents().forEach(function (e) {
    records.push({ local_id: e.id, kind: 'event', payload: e, local_updated_at: e.created_date || 0 });
  });
  getMapFolders().forEach(function (f) {
    records.push({ local_id: f.id, kind: 'map_folder', payload: f, local_updated_at: f.updated_date || f.created_date || 0 });
  });
  getPeriodData().forEach(function (p) {
    records.push({ local_id: p.id, kind: 'period', payload: p, local_updated_at: p.created_date || 0 });
  });
  getAlarms().forEach(function (a) {
    records.push({ local_id: a.id, kind: 'alarm', payload: a, local_updated_at: a.updated_date || a.created_date || 0 });
  });
  const profile = getProfile();
  records.push({ local_id: '__profile__', kind: 'profile', payload: profile, local_updated_at: profile.updated_date || 0 });

  const account = getAccount();
  if (account) {
    records.push({
      local_id: '__account__:' + account.username,
      kind: 'account',
      payload: { username: account.username, salt: account.salt, hash: account.hash },
      local_updated_at: account.updated_date || Date.now(),
    });
  }
  return records;
}

// ── write a cloud record back to the matching local collection ──

function applyRecordToLocal(kind, payload, isDeleted) {
  switch (kind) {
    case 'folder': {
      let folders = getFolders();
      if (isDeleted) {
        folders = folders.filter(function (f) { return f.id !== payload.id; });
      } else {
        const idx = folders.findIndex(function (f) { return f.id === payload.id; });
        if (idx >= 0) folders[idx] = payload;
        else folders = folders.concat([payload]);
      }
      saveFolders(folders);
      break;
    }
    case 'journal': {
      let journal = getJournal();
      if (isDeleted) {
        journal = journal.filter(function (e) { return e.id !== payload.id; });
      } else {
        const idx = journal.findIndex(function (e) { return e.id === payload.id; });
        if (idx >= 0) journal[idx] = payload;
        else journal = [payload].concat(journal);
      }
      saveJournal(journal);
      break;
    }
    case 'event': {
      let events = getEvents();
      if (isDeleted) {
        events = events.filter(function (e) { return e.id !== payload.id; });
      } else {
        const idx = events.findIndex(function (e) { return e.id === payload.id; });
        if (idx >= 0) events[idx] = payload;
        else events = events.concat([payload]);
      }
      saveEvents(events);
      break;
    }
    case 'map_folder': {
      let mf = getMapFolders();
      if (isDeleted) {
        mf = mf.filter(function (f) { return f.id !== payload.id; });
      } else {
        const idx = mf.findIndex(function (f) { return f.id === payload.id; });
        if (idx >= 0) mf[idx] = payload;
        else mf = mf.concat([payload]);
      }
      saveMapFolders(mf);
      break;
    }
    case 'period': {
      let period = getPeriodData();
      if (isDeleted) {
        period = period.filter(function (p) { return p.id !== payload.id; });
      } else {
        const idx = period.findIndex(function (p) { return p.id === payload.id; });
        if (idx >= 0) period[idx] = payload;
        else period = period.concat([payload]);
      }
      savePeriod(period);
      break;
    }
    case 'alarm': {
      let alarms = getAlarms();
      if (isDeleted) {
        alarms = alarms.filter(function (a) { return a.id !== payload.id; });
      } else {
        const idx = alarms.findIndex(function (a) { return a.id === payload.id; });
        if (idx >= 0) alarms[idx] = payload;
        else alarms = alarms.concat([payload]);
      }
      saveAlarms(alarms);
      break;
    }
    case 'profile': {
      if (!isDeleted) saveProfileRaw(payload);
      break;
    }
    case 'account': {
      if (!isDeleted && payload && payload.username) {
        saveAccount({ username: payload.username, salt: payload.salt, hash: payload.hash, updated_date: payload.updated_date || Date.now() });
      }
      break;
    }
  }
}

export function applySyncedRecords(records) {
  if (!Array.isArray(records)) return;
  let changed = false;
  for (const r of records) {
    if (!r || !r.kind) continue;
    if (r.kind === 'account') {
      applyRecordToLocal('account', r.payload, r.is_deleted);
      continue;
    }
    applyRecordToLocal(r.kind, r.payload, r.is_deleted);
    changed = true;
  }
  if (changed && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('retrolist:synced'));
  }
}

// ── main sync entry point ──

export async function syncNow() {
  if (syncing) return { status: 'already_running' };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { status: 'offline' };

  const account = getAccount();
  if (!account) return { status: 'unauthenticated' };

  syncing = true;
  try {
    const records = collectLocalRecords();
    const deletedLog = getDeletedLog();
    const deletedEntries = deletedLog.map(function (d) {
      return { local_id: d.local_id, kind: d.kind, payload: { id: d.local_id }, local_updated_at: d.at || Date.now(), is_deleted: true };
    });
    const push = records.concat(deletedEntries);

    let res;
    try {
      res = await db.functions.invoke('syncExchange', {
        username: account.username,
        authHash: account.hash,
        records: push,
      });
    } catch (e) {
      const d = (e && e.response && e.response.data) || (e && e.data);
      if (d && (d.error === 'unauthorized' || d.error === 'account not found')) {
        return { status: 'unauthorized', error: d.error };
      }
      return { status: 'error', error: (d && d.error) || (e && e.message) || 'sync failed' };
    }

    const data = (res && res.data) ? res.data : res;
    if (!data) return { status: 'error', error: 'no response' };
    if (data.error) {
      if (data.error === 'unauthorized' || data.error === 'account not found') {
        return { status: 'unauthorized', error: data.error };
      }
      return { status: 'error', error: data.error };
    }

    if (Array.isArray(data.records)) applySyncedRecords(data.records);
    saveDeletedLog([]); // deletions have been propagated to the cloud
    return { status: 'ok', pushed: data.pushed || 0, pulled: (data.records || []).length };
  } catch (e) {
    return { status: 'error', error: (e && e.message) || 'sync failed' };
  } finally {
    syncing = false;
  }
}