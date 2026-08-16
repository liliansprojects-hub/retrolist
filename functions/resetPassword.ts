import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { findAccount } from '../../shared/syncAuth.ts';

// verifies the 6-digit code, re-derives the password hash with the account's
// existing salt (PBKDF2-SHA256, 100k — matches the client), and updates the
// cloud account record. the client re-derives the same hash locally so the
// resetting device stays logged-in-capable without the hash crossing the wire.
async function pbkdf2(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const saltBytes = Uint8Array.from((saltHex.match(/.{2}/g) || []).map(function (h) { return parseInt(h, 16); }));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  return Array.from(new Uint8Array(bits)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

export default async function (req) {
  try {
    const body = await req.json();
    const username = (body && body.username ? body.username : '').toString().trim().toLowerCase();
    const code = (body && body.code ? body.code : '').toString().trim();
    const newPassword = (body && body.newPassword ? body.newPassword : '').toString();
    if (!username || !code || !newPassword) return Response.json({ error: 'missing fields' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const account = await findAccount(base44, username);
    if (!account || !account.payload) return Response.json({ error: 'invalid code' }, { status: 400 });

    const resets = await db.asServiceRole.entities.Note.filter({ username: username, kind: 'account_reset' });
    const reset = resets.find(function (r) {
      return r.payload && r.payload.code === code && !r.payload.used && r.payload.expires > Date.now();
    });
    if (!reset) return Response.json({ error: 'invalid or expired code' }, { status: 400 });

    const newHash = await pbkdf2(newPassword, account.payload.salt);
    await db.asServiceRole.entities.Note.update(account.id, {
      payload: { ...account.payload, hash: newHash },
      local_updated_at: Date.now(),
    });
    await db.asServiceRole.entities.Note.update(reset.id, { payload: { ...reset.payload, used: true } });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e && e.message) || 'reset failed' }, { status: 500 });
  }
}