import nodemailer from 'npm:nodemailer@6.9.14';
import { secrets } from 'base44:runtime';

// shared gmail (nodemailer) transport for the email-based auth workflows.
// credentials come from app secrets GMAIL_USER + GMAIL_APP_PASSWORD.
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  const user = secrets.get('GMAIL_USER');
  const pass = secrets.get('GMAIL_APP_PASSWORD');
  if (!user || !pass) return null;
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return _transporter;
}

export async function sendCodeEmail(to, subject, text) {
  const transporter = getTransporter();
  if (!transporter) return { sent: false, error: 'email not configured' };
  const user = secrets.get('GMAIL_USER');
  try {
    await transporter.sendMail({
      from: 'Retrolist <' + user + '>',
      to,
      subject,
      text,
    });
    return { sent: true };
  } catch (e) {
    return { sent: false, error: (e && e.message) || 'send failed' };
  }
}