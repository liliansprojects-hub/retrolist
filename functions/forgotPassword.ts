import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { findAccount } from '../../shared/syncAuth.ts';
import { secrets } from 'base44:runtime';
import { sendCodeEmail } from '../../shared/mailer.ts';

// verifies the email matches the account's registered email, then emails a
// 4-digit reset code. returns an error if the email doesn't match (so the user
// is told, rather than silently failing).
export default async function (req) {
  try {
    const body = await req.json();
    const username = (body && body.username ? body.username : '').toString().trim().toLowerCase();
    const email = (body && body.email ? body.email : '').toString().trim().toLowerCase();
    if (!username || !email) return Response.json({ error: 'username and email required' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const account = await findAccount(base44, username);
    if (!account || !account.payload || !account.payload.email) {
      return Response.json({ error: 'email does not match this username' }, { status: 400 });
    }
    if (account.payload.email !== email) {
      return Response.json({ error: 'email does not match this username' }, { status: 400 });
    }

    const code = String(Math.floor(1000 + Math.random() * 9000));
    const expires = Date.now() + 15 * 60 * 1000;

    const existing = await db.asServiceRole.entities.Note.filter({ username: username, kind: 'account_reset' });
    for (const r of existing) { try { await db.asServiceRole.entities.Note.delete(r.id); } catch (e) {} }
    await db.asServiceRole.entities.Note.create({
      local_id: '__reset__:' + username,
      kind: 'account_reset',
      username: username,
      payload: { code: code, expires: expires, used: false },
      local_updated_at: Date.now(),
      is_deleted: false,
    });

    const mail = await sendCodeEmail(email, 'your retrolist reset code', 'your password reset code is ' + code + '. it expires in 15 minutes.');
    if (mail && mail.error) return Response.json({ error: 'email could not be sent' }, { status: 500 });
    return Response.json({ sent: true });
  } catch (e) {
    return Response.json({ error: 'failed to send code' }, { status: 500 });
  }
}