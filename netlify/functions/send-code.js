const nodemailer = require('nodemailer');
const crypto = require('crypto');

// This replaces Base44's confirmEmail/forgotPassword functions for the code
// generation + email-sending step, per explicit instruction to move this off
// Base44 entirely — the previous system was found to accept ANY 4-digit code
// as valid (no real verification was happening) and wasn't reliably sending
// mail. This runs as a genuine Node.js serverless function on Netlify's own
// infrastructure, using the same Gmail app password.
//
// Design: stateless, no database. The 4-digit code is never sent back to the
// client in readable form — only a one-way HMAC hash of it, inside a signed
// token. verify-code.js recomputes the same hash from what the user types
// and compares. This means nothing needs to be persisted anywhere between
// "send" and "verify" — the token IS the state, carried by the client.

const SECRET = process.env.GMAIL_APP_PASSWORD || '';

function hashCode(email, code, exp) {
  return crypto.createHmac('sha256', SECRET).update(`${email}:${code}:${exp}`).digest('hex');
}

function makeToken(email, exp, codeHash) {
  const payload = Buffer.from(JSON.stringify({ email, exp, codeHash })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method not allowed' }) };
  }
  if (!SECRET) {
    // GMAIL_APP_PASSWORD isn't set in Netlify's environment settings yet —
    // this is a Netlify environment variable, not a Base44 secret, and is
    // separate from anything configured on Base44's side.
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'email not configured (missing GMAIL_APP_PASSWORD in Netlify environment settings)' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }
  const email = (body.email || '').trim().toLowerCase();
  const purpose = body.purpose === 'reset' ? 'reset' : 'confirm'; // only changes the email wording
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'valid email required' }) };
  }

  const code = String(Math.floor(1000 + Math.random() * 9000)); // real 4-digit code, generated fresh every time
  const exp = Date.now() + 15 * 60 * 1000; // 15 minutes, matching the original design
  const codeHash = hashCode(email, code, exp);
  const token = makeToken(email, exp, codeHash);

  const gmailUser = process.env.GMAIL_USER;
  if (!gmailUser) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'email not configured (missing GMAIL_USER in Netlify environment settings)' }) };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: SECRET },
    });
    const subject = purpose === 'reset' ? 'your retrolist reset code' : 'confirm your email';
    const text = purpose === 'reset'
      ? `your password reset code is ${code}. it expires in 15 minutes.`
      : `your confirmation code is ${code}. it expires in 15 minutes.`;
    await transporter.sendMail({ from: `Retrolist <${gmailUser}>`, to: email, subject, text });
  } catch (err) {
    // surface the REAL underlying error (auth failure, connection refused,
    // etc.) rather than a generic message — this is what actually lets you
    // tell a bad app password apart from a network problem apart from a
    // bounced address.
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(err && err.message || err) }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ sent: true, token }) };
};
