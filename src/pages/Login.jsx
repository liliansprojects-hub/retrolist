import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogIn, User, Lock, Mail, Loader2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { getAccountByUsername, isLoggedIn, pbkdf2, setLoggedIn, saveAccount } from '@/lib/localAuth';
import { accountLookupRemote, syncExchange, applySyncedRecords, confirmEmailRemote } from '@/lib/cloudSync';
import { useLocalAuth } from '@/lib/LocalAuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { refresh } = useLocalAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoggedIn()) navigate('/', { replace: true });
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const u = username.trim().toLowerCase();
    const em = email.trim().toLowerCase();
    if (!u || !password) { setError('enter your username and password'); return; }
    if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { setError('enter a valid email'); return; }
    setLoading(true);
    try {
      // device already has this account → verify locally (works offline)
      const local = getAccountByUsername(u);
      if (local) {
        const hash = await pbkdf2(password, local.salt);
        if (hash !== local.hash) { setError('password incorrect'); return; }
        if (local.pending) {
          // registered with an email but never finished verifying it — this
          // account isn't real yet (see Register.jsx), so route back to
          // verification instead of letting them straight in. Resend a
          // fresh code since the original may have expired by now.
          if (!navigator.onLine) { setError('go online to finish verifying your email'); return; }
          const sent = await confirmEmailRemote(u, local.email);
          if (sent && sent.error) { setError(sent.error); return; }
          navigate('/verify-email', { replace: true, state: { username: u, email: local.email, isLocal: true } });
          return;
        }
        if (em) {
          if (!navigator.onLine) { setError('go online to verify your email'); return; }
          const sent = await confirmEmailRemote(u, em);
          if (sent && sent.error) { setError(sent.error === 'account not found' ? 'account not found — sync this device first or remove email' : sent.error); return; }
          navigate('/verify-email', { replace: true, state: { username: u, email: em, isLocal: true } });
          return;
        }
        setLoggedIn(u);
        refresh();
        navigate('/', { replace: true });
        return;
      }

      // new device → fetch salt from the cloud and pull this account's data
      if (!navigator.onLine) {
        setError('account not found on this device — go online to sign in');
        return;
      }
      const lookup = await accountLookupRemote(u);
      if (lookup && lookup.error) { setError(lookup.error); return; }
      if (!lookup || !lookup.exists) { setError('account not found'); return; }

      const hash = await pbkdf2(password, lookup.salt);
      const res = await syncExchange(u, hash, []);
      if (res && res.error) {
        setError(res.error === 'unauthorized' ? 'password incorrect' : res.error);
        return;
      }
      if (res && Array.isArray(res.records)) applySyncedRecords(res.records);
      if (em) {
        const sent = await confirmEmailRemote(u, em);
        if (sent && sent.error) { setError(sent.error); return; }
        navigate('/verify-email', { replace: true, state: { username: u, email: em, salt: lookup.salt, hash, isLocal: false } });
        return;
      }
      saveAccount({ username: u, salt: lookup.salt, hash, email: em || '', email_confirmed: !em, updated_date: Date.now() });
      setLoggedIn(u);
      refresh();
      navigate('/', { replace: true });
    } catch (err) {
      const msg = (err && err.message) || '';
      if (/not found|404|no such|does not exist/i.test(msg)) setError('account not found');
      else if (/unauthorized|wrong password|invalid/i.test(msg)) setError('password incorrect');
      else setError('sign in failed — check your connection and try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="welcome back"
      subtitle="sign in to retrolist"
      footer={
        <div className="flex flex-col gap-2">
          <Link to="/forgot-password" className="text-muted-foreground text-xs font-medium hover:underline lowercase">
            forgot password?
          </Link>
          <div>
            new here?{' '}
            <Link to="/register" className="text-primary font-medium hover:underline">
              create an account
            </Link>
          </div>
        </div>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm lowercase">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="username">username</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="username"
              autoFocus
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="pl-10 h-12 lowercase"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">email (optional — verify to sign in)</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12 lowercase"
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              signing in…
            </>
          ) : (
            'sign in'
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}