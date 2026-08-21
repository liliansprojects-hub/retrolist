import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, ArrowLeft, Loader2, User, Lock, KeyRound } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { getAccountByUsername, pbkdf2, saveAccount, clearSession } from '@/lib/localAuth';
import { forgotPasswordRemote, resetPasswordRemote } from '@/lib/cloudSync';

// two-step recovery: username + email → 4-digit code (emailed) → new password.
// the email must match the account's registered email before a code is sent.
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
    if (!u) { setError('enter your username'); return; }
    if (!email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('enter the email on your account'); return; }
    if (!navigator.onLine) { setError('go online to reset your password'); return; }
    setLoading(true);
    try {
      const res = await forgotPasswordRemote(u, email.trim());
      if (res && res.error) {
        const friendly = res.error === 'email does not match this username' ? 'Email incorrect.' : res.error;
        setError(friendly);
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
    if (!code.trim()) { setError('enter the 4-digit code'); return; }
    if (password.length < 4) { setError('password must be at least 4 characters'); return; }
    if (password !== confirm) { setError('passwords do not match'); return; }
    setLoading(true);
    try {
      const res = await resetPasswordRemote(u, code.trim(), password);
      if (res && res.error) { setError(res.error); setLoading(false); return; }
      const local = getAccountByUsername(u);
      if (local) {
        const newHash = await pbkdf2(password, local.salt);
        saveAccount({ ...local, hash: newHash, updated_date: Date.now() });
      }
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