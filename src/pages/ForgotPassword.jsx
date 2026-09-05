import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, ArrowLeft, Loader2, User, Lock, KeyRound } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { getAccountByUsername, pbkdf2, saveAccount, clearSession } from '@/lib/localAuth';
import { syncNow } from '@/lib/cloudSync';
import { requestCode, verifyCode } from '@/lib/emailAuth';

// two-step recovery: username + email → 4-digit code (emailed) → new password.
// runs entirely on this device — the code is generated, emailed (via
// EmailJS, see EMAIL_SETUP.md), and checked locally, and the new password
// is re-hashed and saved to this device's local account record directly
// (no Base44 function round-trip). that does mean this only works from a
// device that already has the account locally — see the "account not
// found" branch below.
export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const sendCode = async (e) => {
    e.preventDefault();
    setError('');
    const u = username.trim().toLowerCase();
    const em = email.trim().toLowerCase();
    if (!u) { setError('enter your username'); return; }
    if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { setError('enter the email on your account'); return; }
    setLoading(true);
    try {
      const local = getAccountByUsername(u);
      if (!local) {
        setError('no account found on this device — password reset works from the device you signed up on');
        setLoading(false);
        return;
      }
      if (!local.email || local.email.toLowerCase() !== em) {
        setError('email incorrect');
        setLoading(false);
        return;
      }
      const res = await requestCode('reset', u, em);
      if (res && res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setStep(2);
    } catch (err) { setError((err && err.message) || 'failed to send code'); }
    setLoading(false);
  };

  const reset = async (e) => {
    e.preventDefault();
    setError('');
    const u = username.trim().toLowerCase();
    const em = email.trim().toLowerCase();
    if (!code.trim()) { setError('enter the 4-digit code'); return; }
    if (password.length < 4) { setError('password must be at least 4 characters'); return; }
    if (password !== confirm) { setError('passwords do not match'); return; }
    setLoading(true);
    try {
      const res = verifyCode('reset', u, em, code.trim());
      if (res && res.error) { setError(res.error); setLoading(false); return; }
      const local = getAccountByUsername(u);
      if (!local) { setError('account no longer on this device'); setLoading(false); return; }
      const newHash = await pbkdf2(password, local.salt);
      saveAccount({ ...local, hash: newHash, updated_date: Date.now() });
      // best-effort push of the new hash to the cloud so other synced
      // devices pick it up next time they sync; reset itself never depends
      // on this succeeding.
      try { await syncNow(); } catch (e) { /* ignore — already saved locally */ }
      clearSession();
      navigate('/login', { replace: true });
    } catch (err) { setError((err && err.message) || 'reset failed'); setLoading(false); }
  };

  return (
    <AuthLayout
      icon={Mail}
      title="reset password"
      subtitle={step === 1 ? 'enter your username + email' : 'enter the code + new password'}
      footer={<Link to="/login" className="text-primary font-medium hover:underline"><ArrowLeft className="w-3 h-3 inline mr-1" />back to log in</Link>}
    >
      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm lowercase">{error}</div>}
      {step === 1 ? (
        <form onSubmit={sendCode} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">username</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input id="username" autoFocus placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} className="pl-10 h-12 lowercase" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">email on your account</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 h-12 lowercase" required />
            </div>
          </div>
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />sending…</>) : 'send code'}
          </Button>
        </form>
      ) : (
        <form onSubmit={reset} className="space-y-4">
          <p className="text-xs text-muted-foreground lowercase">a 4-digit code was sent to {email}</p>
          <div className="space-y-2">
            <Label htmlFor="code">code</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input id="code" autoFocus inputMode="numeric" placeholder="4-digit code" value={code} onChange={(e) => setCode(e.target.value)} className="pl-10 h-12 lowercase" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">new password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 h-12" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">confirm password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input id="confirm" type="password" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="pl-10 h-12" required />
            </div>
          </div>
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />resetting…</>) : 'reset password'}
          </Button>
          <button type="button" onClick={() => setStep(1)} className="touch-44 w-full text-xs text-muted-foreground lowercase">back</button>
        </form>
      )}
    </AuthLayout>
  );
}