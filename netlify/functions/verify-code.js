const crypto = require('crypto');

const SECRET = process.env.GMAIL_APP_PASSWORD || '';

function hashCode(email, code, exp) {
  return crypto.createHmac('sha256', SECRET).update(`${email}:${code}:${exp}`).digest('hex');
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method not allowed' }) };
  }
  if (!SECRET) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'email not configured (missing GMAIL_APP_PASSWORD in Netlify environment settings)' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }
  const { token, code } = body;
  if (!token || !code) {
    return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'token and code required' }) };
  }

  const [payloadB64, sig] = String(token).split('.');
  if (!payloadB64 || !sig) {
    return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'invalid or expired code' }) };
  }

  // verify the token itself hasn't been tampered with before trusting
  // anything inside it (constant-time compare to avoid a timing side-channel)
  const expectedSig = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('hex');
  const sigBuf = Buffer.from(sig, 'hex');
  const expectedBuf = Buffer.from(expectedSig, 'hex');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'invalid or expired code' }) };
  }

  let payload;
  try { payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()); } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'invalid or expired code' }) };
  }
  const { email, exp, codeHash } = payload;
  if (!email || !exp || !codeHash) {
    return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'invalid or expired code' }) };
  }
  if (Date.now() > exp) {
    return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'invalid or expired code' }) };
  }

  // this is the actual check that was missing before — recompute the hash
  // from what the user typed and compare, rather than accepting anything.
  const submittedHash = hashCode(email, String(code).trim(), exp);
  const submittedBuf = Buffer.from(submittedHash, 'hex');
  const codeHashBuf = Buffer.from(codeHash, 'hex');
  const matches = submittedBuf.length === codeHashBuf.length && crypto.timingSafeEqual(submittedBuf, codeHashBuf);

  if (!matches) {
    return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'invalid or expired code' }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ valid: true, email }) };
};
