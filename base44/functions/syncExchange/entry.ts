const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { findAccount } from '../../shared/syncAuth.ts';

// single round-trip push + pull, keyed by username + password hash.
// no Base44 user session or OAuth — runs as service role, partitioned by username.
export default async function (req) {
  try {
    const body = await req.json();
    const username = (body && body.username ? body.username : '').toString().trim().toLowerCase();
    const authHash = (body && body.authHash ? body.authHash : '').toString();
    const records = Array.isArray(body && body.records) ? body.records : [];
    if (!username || !authHash) {
      return Response.json({ error: 'username and authHash required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // resolve / create the account record
    let account = await findAccount(base44, username);
    if (!account) {
      // first push from a freshly-registered device: create the account from
      // the account record included in the pushed records.
      const acctRec = records.find(function (r) { return r && r.kind === 'account'; });
      if (!acctRec || !acctRec.payload || acctRec.payload.hash !== authHash) {
        return Response.json({ error: 'account not found' }, { status: 404 });
      }
      account = await db.asServiceRole.entities.Note.create({
        local_id: '__account__:' + username,
        kind: 'account',
        username: username,
        payload: {
          username: username,
          salt: acctRec.payload.salt,
          hash: acctRec.payload.hash,
        },
        local_updated_at: acctRec.local_updated_at || Date.now(),
        is_deleted: false,
      });
    } else {
      if (account.payload && account.payload.hash !== authHash) {
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      }
    }

    // index existing cloud records for this username
    const cloudAll = await db.asServiceRole.entities.Note.filter({ username: username });
    const cloudMap = new Map();
    cloudAll.forEach(function (r) { cloudMap.set(r.local_id, r); });

    let pushed = 0;
    for (const rec of records) {
      if (!rec || rec.kind === 'account' || !rec.local_id) continue;
      const existing = cloudMap.get(rec.local_id);
      const ts = rec.local_updated_at || 0;
      if (!existing) {
        await db.asServiceRole.entities.Note.create({
          local_id: rec.local_id,
          kind: rec.kind,
          username: username,
          payload: rec.payload,
          local_updated_at: ts,
          is_deleted: !!rec.is_deleted,
        });
        pushed++;
      } else if (ts > (existing.local_updated_at || 0)) {
        await db.asServiceRole.entities.Note.update(existing.id, {
          payload: rec.payload,
          local_updated_at: ts,
          is_deleted: !!rec.is_deleted,
        });
        pushed++;
      }
    }

    // pull the full merged set back
    const remote = await db.asServiceRole.entities.Note.filter({ username: username });
    const out = remote.map(function (r) {
      return {
        local_id: r.local_id,
        kind: r.kind,
        payload: r.payload,
        local_updated_at: r.local_updated_at,
        is_deleted: r.is_deleted,
      };
    });
    return Response.json({ status: 'ok', pushed: pushed, records: out });
  } catch (e) {
    return Response.json({ error: (e && e.message) || 'sync failed' }, { status: 500 });
  }
}