import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { findAccount } from '../../shared/syncAuth.ts';

// verifies the 4-digit confirmation code for the proposed email and marks the
// account's email as confirmed (stored on the cloud account record).
export default async function (req) {
  try {
    const body = await req.json();
    const username = (body && body.username ? body.username : '').toString().trim().toLowerCase();
    const email = (body && body.email ? body.email : '').toString().trim().toLowerCase();
    const code = (body && body.code ? body.code : '').toString().trim();
    if (!username || !email || !code) return Response.json({ error: 'missing fields' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const account = await findAccount(base44, username);
    if (!account || !account.payload) return Response.json({ error: 'account not found' }, { status: 404 });

    const records = await db.asServiceRole.entities.Note.filter({ username: username, kind: 'email_confirm' });
    const rec = records.find(function (r) {
      return r.payload && r.payload.email === email && r.payload.code === code && r.payload.expires > Date.now();
    });
    if (!rec) return Response.json({ error: 'invalid or expired code' }, { status: 400 });

    await db.asServiceRole.entities.Note.update(account.id, {
      payload: { ...account.payload, email: email, email_confirmed: true },
      local_updated_at: Date.now(),
    });
    await db.asServiceRole.entities.Note.delete(rec.id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e && e.message) || 'verification failed' }, { status: 500 });
  }
}