import React, { useState } from 'react';
import { Mail, AlertCircle, Loader2, Check } from 'lucide-react';
import { getAccount, saveAccount } from '@/lib/localAuth';
import { confirmEmailRemote, verifyEmailRemote } from '@/lib/cloudSync';

// recovery email management: shows the account's email + confirmation status.
// if missing or unconfirmed, a subtle red notice prompts the user to add/confirm.
// adding/changing emails a 4-digit code (via Resend) which must be entered to confirm.
export default function EmailSection() {
  const [acc, setAcc] = useState(getAccount());
  const [email, setEmail] = useState(acc?.email || '');
  const [step, setStep] = useState(0); // 0 idle, 1 awaiting code
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const confirmed = !!acc?.email_confirmed && !!acc?.email;
  const needsEmail = !acc?.email || !acc?.email_confirmed;

  const sendCode = async () => {
    setErr('');
    if (!navigator.onLine) { setErr('go online to confirm your email'); return; }
    if (!email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setErr('enter a valid email'); return; }
    setBusy(true);
    try {
      const res = await confirmEmailRemote(acc.username, email.trim());
      if (res && res.error) { setErr(res.error); setBusy(false); return; }
      setStep(1);
    } catch (e) { setErr((e && e.message) || 'failed to send'); }
    setBusy(false);
  };

  const confirm = async () => {
    setErr('');
    setBusy(true);
    try {
      const res = await verifyEmailRemote(acc.username, email.trim(), code.trim());
      if (res && res.error) { setErr(res.error); setBusy(false); return; }
      const updated = { ...acc, email: email.trim().toLowerCase(), email_confirmed: true, updated_date: Date.now() };
      saveAccount(updated);
      setAcc(updated);
      setStep(0);
      setCode('');
    } catch (e) { setErr((e && e.message) || 'failed'); }
    setBusy(false);
  };

  return (
    <div className="rounded-2xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium lowercase">recovery email</p>
        {confirmed ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground lowercase"><Check className="w-3 h-3" /> confirmed</span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-destructive/80 lowercase"><AlertCircle className="w-3 h-3" /> needed</span>
        )}
      </div>
      {needsEmail && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-destructive/5 border border-destructive/20">
          <AlertCircle className="w-3.5 h-3.5 text-destructive/80 shrink-0 mt-0.5" />
          <p className="text-[11px] text-destructive/80 lowercase">add + confirm your email so you can recover your password if you forget it.</p>
        </div>
      )}
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none lowercase selectable"
      />
      {err && <p className="text-[11px] text-destructive lowercase">{err}</p>}
      {step === 1 && (
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="4-digit code"
          inputMode="numeric"
          className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none lowercase"
        />
      )}
      <div className="flex gap-2">
        {step === 1 ? (
          <>
            <button onClick={sendCode} disabled={busy} className="touch-44 flex-1 py-2.5 rounded-xl bg-muted text-xs font-medium lowercase">resend</button>
            <button onClick={confirm} disabled={busy || !code.trim()} className="touch-44 flex-1 py-2.5 rounded-xl bg-foreground text-background text-xs font-medium lowercase disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : 'confirm'}
            </button>
          </>
        ) : (
          <button onClick={sendCode} disabled={busy} className="touch-44 flex-1 py-2.5 rounded-xl bg-foreground text-background text-xs font-medium lowercase disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : (acc?.email ? 'update & send code' : 'send code')}
          </button>
        )}
      </div>
    </div>
  );
}