import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { findAccount } from '../../shared/syncAuth.ts';

// public, unauthenticated lookup — returns only the salt (not secret) so a new
// device can derive the password hash and then authenticate via syncExchange.
export default async function (req) {
  try {
    const body = await req.json();
    const username = (body && body.username ? body.username : '').toString().trim().toLowerCase();
    if (!username) return Response.json({ error: 'username required' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const account = await findAccount(base44, username);
    if (!account) return Response.json({ exists: false });
    return Response.json({ exists: true, salt: (account.payload && account.payload.salt) || null });
  } catch (e) {
    return Response.json({ error: (e && e.message) || 'lookup failed' }, { status: 500 });
  }
}