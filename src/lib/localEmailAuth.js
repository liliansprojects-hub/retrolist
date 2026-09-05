// Replaces confirmEmailRemote/verifyEmailRemote/forgotPasswordRemote's role
// for actually sending and checking codes — moved off Base44 entirely per
// explicit request, after confirming the previous system accepted any
// 4-digit code as valid and wasn't reliably sending mail. These call real
// Netlify Functions (netlify/functions/send-code.js, verify-code.js), using
// the same Gmail app password already configured, just as a Netlify
// environment variable now instead of a Base44 secret.

export async function sendCode(email, purpose = 'confirm') {
  try {
    const res = await fetch('/.netlify/functions/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, purpose }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || 'failed to send code' };
    return data; // { sent: true, token }
  } catch (err) {
    return { error: (err && err.message) || 'failed to send code' };
  }
}

export async function verifyCode(token, code) {
  try {
    const res = await fetch('/.netlify/functions/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { valid: false, error: data.error || 'invalid or expired code' };
    return data; // { valid: true, email }
  } catch (err) {
    return { valid: false, error: (err && err.message) || 'verification failed' };
  }
}
