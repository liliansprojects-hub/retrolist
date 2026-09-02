import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, User, Lock, Mail, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { registerLocal, getAccountByUsername, isLoggedIn, setLoggedIn, clearSession } from '@/lib/localAuth';
import { accountLookupRemote, syncNow, confirmEmailRemote } from '@/lib/cloudSync';
import { useLocalAuth } from '@/lib/LocalAuthContext';

export default function Register() {
  const navigate = useNavigate();
  const { refresh } = useLocalAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // live as-you-type username availability: null = unknown/checking,
  // true = available, false = taken (locally or on the server)
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  useEffect(() => {
    if (isLoggedIn()) navigate('/', { replace: true });
  }, [navigate]);

  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (!u) { setUsernameAvailable(null); setCheckingUsername(false); return; }
    // instant local check first (no network needed for this device's own accounts)
    if (getAccountByUsername(u)) { setUsernameAvailable(false); setCheckingUsername(false); return; }
    if (!navigator.onLine) { setUsernameAvailable(null); setCheckingUsername(false); return; }
    setCheckingUsername(true);
    const t = setTimeout(async () => {
      try {
        const lookup = await accountLookupRemote(u);
        setUsernameAvailable(lookup && lookup.exists ? false : true);
      } catch {
        setUsernameAvailable(null);
      } finally {
        setCheckingUsername(false);
      }
    }, 400); // debounced so it doesn't fire a request on every keystroke
    return () => clearTimeout(t);
  }, [username]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const u = username.trim().toLowerCase();
    const em = email.trim().toLowerCase();
    if (!u || !password) { setError('enter a username and password'); return; }
    if (password.length < 4) { setError('password must be at least 4 characters'); return; }
    if (password !== confirm) { setError('passwords do not match'); return; }
    if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { setError('enter a valid email'); return; }
    if (getAccountByUsername(u)) { setError('that username is already taken on this device — sign in instead'); return; }

    setLoading(true);
    try {
      // online collision check (skipped offline; a collision surfaces on first sync)
      if (navigator.onLine) {
        const lookup = await accountLookupRemote(u);
        if (lookup && lookup.exists) { setError('username taken'); return; }
      }
      if (em) {
        // verify the email (same 4-digit code flow as recovery) before landing on the main page
        if (!navigator.onLine) { setError('go online to verify your email'); return; }
        await registerLocal(u, password, '', false); // create account, don't log in yet
        setLoggedIn(u); // temp session so sync can push the account to the cloud
        await syncNow();
        clearSession();
        const sent = await confirmEmailRemote(u, em);
        if (sent && sent.error) {
          setError(sent.error === 'account not found' ? 'could not reach your account — check your connection' : sent.error);
          return;
        }
        navigate('/verify-email', { replace: true, state: { username: u, email: em, isLocal: true } });
        return;
      }
      await registerLocal(u, password, email);
      refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError((err && err.message) || 'registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={UserPlus}
      title="create your account"
      subtitle="sign up to get started"
      footer={
        <>
          already have an account?{' '}
          <Link to="/login" className="text-primary font-medium hover:underline">
            sign in
          </Link>
        </>
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
              className="pl-10 pr-10 h-12 lowercase"
              required
            />
            {username.trim() && !checkingUsername && usernameAvailable === true && (
              <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" aria-label="username available" />
            )}
            {username.trim() && !checkingUsername && usernameAvailable === false && (
              <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-destructive" aria-label="username taken" />
            )}
          </div>
          {username.trim() && !checkingUsername && usernameAvailable === false && (
            <p className="text-xs text-destructive lowercase">that username is taken</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">email (optional, for password recovery)</Label>
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
          <Label htmlFor="confirm">confirm password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              creating account…
            </>
          ) : (
            'create account'
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}