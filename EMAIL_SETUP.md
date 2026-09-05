# Email verification / password-reset setup

The register-verify and forgot-password flows (`src/lib/emailAuth.js`) no
longer call Base44 custom functions. They run entirely in the browser and
send mail through [EmailJS](https://www.emailjs.com), using the same Gmail
address + app password that `GMAIL_USER` / `GMAIL_APP_PASSWORD` referred to
before. This is a one-time, ~5 minute setup, done once in the EmailJS
dashboard (free tier is plenty for this app's volume):

1. **Create a free EmailJS account** at https://www.emailjs.com.

2. **Add an email service** → *Email Services* → *Add New Service* →
   choose **Gmail**, but instead of the "Connect Account" OAuth button, pick
   **"Custom SMTP"** for the option that takes raw credentials, and enter:
   - SMTP server: `smtp.gmail.com`
   - Port: `587` (STARTTLS) — `465` (SSL) also works
   - Username: your Gmail address (the same one `GMAIL_USER` held)
   - Password: the Gmail **app password** (the same 16-character value
     `GMAIL_APP_PASSWORD` held — not your normal Gmail password; generate
     one at https://myaccount.google.com/apppasswords if you don't still
     have it)
   - Copy the **Service ID** it gives you (e.g. `service_abc1234`).

3. **Add an email template** → *Email Templates* → *Create New Template*.
   Use these variables in the template body (they're the exact keys this
   code sends): `{{to_email}}`, `{{subject}}`, `{{code}}`, `{{message}}`.
   A minimal template:
   - To: `{{to_email}}`
   - Subject: `{{subject}}`
   - Body: `{{message}}`
   Copy the **Template ID**.

4. **Get your Public Key** → *Account* → *General* → copy the **Public
   Key**. (This is safe to ship in client code — EmailJS is designed for
   this; it rate-limits and domain-restricts on their end, not via secrecy
   of this key.)

5. **Add the three values to `.env.local`** at the project root (create the
   file if it doesn't exist — it's already git-ignored):

   ```bash
   VITE_EMAILJS_SERVICE_ID=service_abc1234
   VITE_EMAILJS_TEMPLATE_ID=template_xyz5678
   VITE_EMAILJS_PUBLIC_KEY=your_public_key_here
   ```

6. Restart `npm run dev` (Vite only reads `.env.local` at startup).

Until these three variables are set, `requestCode()` returns a clear
`'email sending is not set up yet — see EMAIL_SETUP.md'` error instead of
silently pretending to succeed — so a missing config is loud, not a blank
"no email arrived" mystery.

## What changed and why

- `base44/functions/{confirmEmail,verifyEmail,forgotPassword,resetPassword}`
  and `base44/shared/mailer.ts` are no longer called by the frontend. They
  depended on Base44 custom functions being deployed and on
  `GMAIL_USER`/`GMAIL_APP_PASSWORD` being set as Base44 app secrets — two
  extra deploy steps outside this repo that weren't happening, so
  `db.functions.invoke(...)` was either hitting nothing or returning a
  response with no `error` field, and the old client code only checked
  `if (res.error)` before treating that as success. That's why entering
  *any* 4-digit code appeared to work: an unreachable/failed call still
  looked successful.
- The new flow (`src/lib/emailAuth.js`) generates and checks the code
  entirely in this browser (every one of these flows — register→verify,
  forgot→reset — happens in a single browser sitting anyway), so there's no
  server round trip to fail silently, and `verifyCode()` does a strict
  match + expiry check that has no "ambiguous success" path.
