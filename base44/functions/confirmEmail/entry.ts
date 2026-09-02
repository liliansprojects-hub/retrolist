import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { findAccount } from '../../shared/syncAuth.ts';
import { secrets } from 'base44:runtime';
import { sendCodeEmail } from '../../shared/mailer.ts';

// sends a 4-digit confirmation code to the proposed email so the user can
// verify it belongs to them. the account must exist (matched by username).
export default async function (req) {
  try {
    const body = await req.json();
    const username = (body && body.username ? body.username : '').toString().trim().toLowerCase();
    const email = (body && body.email ? body.email : '').toString().trim().toLowerCase();
    if (!username || !email) return Response.json({ error: 'username and email required' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const account = await findAccount(base44, username);
    if (!account || !account.payload) return Response.json({ error: 'account not found' }, { status: 404 });

    const code = String(Math.floor(1000 + Math.random() * 9000));
    const expires = Date.now() + 15 * 60 * 1000;

    const existing = await db.asServiceRole.entities.Note.filter({ username: username, kind: 'email_confirm' });
    for (const r of existing) { try { await db.asServiceRole.entities.Note.delete(r.id); } catch (e) {} }
    await db.asServiceRole.entities.Note.create({
      local_id: '__emailconfirm__:' + username,
      kind: 'email_confirm',
      username: username,
      payload: { email: email, code: code, expires: expires },
      local_updated_at: Date.now(),
      is_deleted: false,
    });

    const mail = await sendCodeEmail(email, 'confirm your email', 'your confirmation code is ' + code + '. it expires in 15 minutes.');
    if (mail && mail.error) return Response.json({ error: mail.error }, { status: 500 });
    return Response.json({ sent: true });
  } catch (e) {
    return Response.json({ error: (e && e.message) || 'failed to send code' }, { status: 500 });
  }
}