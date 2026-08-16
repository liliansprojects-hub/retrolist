// cloud sync layer — pushes local localStorage data to the cloud Note entity
// and pulls remote changes back, running automatically when online + authenticated

import {
  getFolders, saveFolders,
  getJournal, saveJournal,
  getEvents, saveEvents,
  getMapFolders, saveMapFolders,
  getPeriodData, savePeriod,
  getProfile, saveProfileRaw,
  getDeletedLog, saveDeletedLog,
} from './store';

let syncing = false;

// ── collect all local records into a flat list for sync comparison ──
function collectLocalRecords() {
  const records = [];

  getFolders().forEach((f) =>
    records.push({
      local_id: f.id,
      kind: 'folder',
      payload: f,
      local_updated_at: f.updated_date || f.created_date || 0,
    })
  );

  getJournal().forEach((e) =>
    records.push({
      local_id: e.id,
      kind: 'journal',
      payload: e,
      local_updated_at: e.updated_date || e.created_date || 0,
    })
  );

  getEvents().forEach((e) =>
    records.push({
      local_id: e.id,
      kind: 'event',
      payload: e,
      local_updated_at: e.created_date || 0,
    })
  );

  getMapFolders().forEach((f) =>
    records.push({
      local_id: f.id,
      kind: 'map_folder',
      payload: f,
      local_updated_at: f.updated_date || f.created_date || 0,
    })
  );

  getPeriodData().forEach((p) =>
    records.push({
      local_id: p.id,
      kind: 'period',
      payload: p,
      local_updated_at: p.created_date || 0,
    })
  );

  const profile = getProfile();
  records.push({
    local_id: '__profile__',
    kind: 'profile',
    payload: profile,
    local_updated_at: profile.updated_date || 0,
  });

  return records;
}

// ── write a cloud record back to the matching local storage collection ──
function applyRecordToLocal(kind, payload, isDeleted) {
  switch (kind) {
    case 'folder': {
      let folders = getFolders();
      if (isDeleted) {
        folders = folders.filter((f) => f.id !== payload.id);
      } else {
        const idx = folders.findIndex((f) => f.id === payload.id);
        if (idx >= 0) folders[idx] = payload;
        else folders = [...folders, payload];
      }
      saveFolders(folders);
      break;
    }
    case 'journal': {
      let journal = getJournal();
      if (isDeleted) {
        journal = journal.filter((e) => e.id !== payload.id);
      } else {
        const idx = journal.findIndex((e) => e.id === payload.id);
        if (idx >= 0) journal[idx] = payload;
        else journal = [payload, ...journal];
      }
      saveJournal(journal);
      break;
    }
    case 'event': {
      let events = getEvents();
      if (isDeleted) {
        events = events.filter((e) => e.id !== payload.id);
      } else {
        const idx = events.findIndex((e) => e.id === payload.id);
        if (idx >= 0) events[idx] = payload;
        else events = [...events, payload];
      }
      saveEvents(events);
      break;
    }
    case 'map_folder': {
      let mf = getMapFolders();
      if (isDeleted) {
        mf = mf.filter((f) => f.id !== payload.id);
      } else {
        const idx = mf.findIndex((f) => f.id === payload.id);
        if (idx >= 0) mf[idx] = payload;
        else mf = [...mf, payload];
      }
      saveMapFolders(mf);
      break;
    }
    case 'period': {
      let period = getPeriodData();
      if (isDeleted) {
        period = period.filter((p) => p.id !== payload.id);
      } else {
        const idx = period.findIndex((p) => p.id === payload.id);
        if (idx >= 0) period[idx] = payload;
        else period = [...period, payload];
      }
      savePeriod(period);
      break;
    }
    case 'profile': {
      if (!isDeleted) saveProfileRaw(payload);
      break;
    }
  }
}

// ── main sync entry point: push local → cloud, pull cloud → local ──
export async function syncNow() {
  if (syncing) return { status: 'already_running' };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { status: 'offline' };

  try {
    const authed = await db.auth.isAuthenticated();
    if (!authed) return { status: 'unauthenticated' };
  } catch {
    return { status: 'unauthenticated' };
  }

  syncing = true;
  try {
    const localRecords = collectLocalRecords();
    const deletedLog = getDeletedLog();

    let cloudRecords = [];
    try {
      cloudRecords = await db.entities.Note.list('-updated_date', 5000);
    } catch (e) {
      return { status: 'error', error: e?.message || 'fetch failed' };
    }

    const cloudMap = new Map();
    cloudRecords.forEach((r) => cloudMap.set(r.local_id, r));
    const localMap = new Map();
    localRecords.forEach((r) => localMap.set(r.local_id, r));

    // records deleted locally but not yet propagated to cloud — must NOT be re-added by pull
    const deletedIds = new Set(deletedLog.map((d) => d.local_id));

    let pushed = 0;
    let pulled = 0;

    // push: create or update cloud records from local
    for (const local of localRecords) {
      const cloud = cloudMap.get(local.local_id);
      if (!cloud) {
        try {
          await db.entities.Note.create({
            local_id: local.local_id,
            kind: local.kind,
            payload: local.payload,
            local_updated_at: local.local_updated_at,
            is_deleted: false,
          });
          pushed++;
        } catch (e) {
          console.error('sync push create failed', local.local_id, e);
        }
      } else if (local.local_updated_at > (cloud.local_updated_at || 0) && !cloud.is_deleted) {
        try {
          await db.entities.Note.update(cloud.id, {
            payload: local.payload,
            local_updated_at: local.local_updated_at,
            is_deleted: false,
          });
          pushed++;
        } catch (e) {
          console.error('sync push update failed', local.local_id, e);
        }
      }
    }

    // pull: add or update local records from cloud
    // skip records that were deleted locally — they're pending cloud deletion, not re-adding
    let pulledData = false;
    for (const cloud of cloudRecords) {
      if (deletedIds.has(cloud.local_id)) continue;
      const local = localMap.get(cloud.local_id);
      if (!local && !cloud.is_deleted) {
        applyRecordToLocal(cloud.kind, cloud.payload, false);
        pulled++;
        pulledData = true;
      } else if (local && !cloud.is_deleted && (cloud.local_updated_at || 0) > local.local_updated_at) {
        applyRecordToLocal(cloud.kind, cloud.payload, false);
        pulled++;
        pulledData = true;
      } else if (cloud.is_deleted && local) {
        applyRecordToLocal(cloud.kind, { id: cloud.local_id }, true);
        pulled++;
        pulledData = true;
      }
    }

    // propagate local deletes to cloud — keep failed entries for retry on next sync
    const remainingLog = [];
    for (const del of deletedLog) {
      const cloud = cloudMap.get(del.local_id);
      if (!cloud || cloud.is_deleted) continue; // nothing to propagate
      try {
        await db.entities.Note.update(cloud.id, { is_deleted: true });
      } catch (e) {
        console.error('sync delete failed', del.local_id, e);
        remainingLog.push(del); // retry next sync
      }
    }
    saveDeletedLog(remainingLog);

    if (pulledData && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('retrolist:synced'));
    }

    return { status: 'ok', pushed, pulled };
  } catch (e) {
    return { status: 'error', error: e?.message || 'sync failed' };
  } finally {
    syncing = false;
  }
}

// ── purge all cloud records for this user (called on account deletion) ──
export async function purgeCloudData() {
  try {
    const records = await db.entities.Note.list('-updated_date', 5000);
    if (records.length > 0) {
      await db.entities.Note.deleteMany({ id: { $in: records.map((r) => r.id) } });
    }
  } catch (e) {
    console.error('purge cloud data failed', e);
  }
}