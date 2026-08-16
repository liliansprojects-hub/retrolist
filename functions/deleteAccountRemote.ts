import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { verifyAccount } from '../../shared/syncAuth.ts';

// permanently deletes all cloud records for a username after verifying the
// password hash. called from the "delete account" flow.
export default async function (req) {
  try {
    const body = await req.json();
    const username = (body && body.username ? body.username : '').toString().trim().toLowerCase();
    const authHash = (body && body.authHash ? body.authHash : '').toString();
    if (!username || !authHash) {
      return Response.json({ error: 'username and authHash required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const v = await verifyAccount(base44, username, authHash);
    if (!v.ok) return Response.json({ error: 'unauthorized' }, { status: 401 });

    const all = await db.asServiceRole.entities.Note.filter({ username: username });
    if (all && all.length) {
      await db.asServiceRole.entities.Note.deleteMany({
        id: { $in: all.map(function (r) { return r.id; }) },
      });
    }
    return Response.json({ status: 'ok', deleted: all ? all.length : 0 });
  } catch (e) {
    return Response.json({ error: (e && e.message) || 'delete failed' }, { status: 500 });
  }
}