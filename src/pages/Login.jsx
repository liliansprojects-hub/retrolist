import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogIn, User, Lock, Loader2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { getAccountByUsername, isLoggedIn, pbkdf2, setLoggedIn, saveAccount } from '@/lib/localAuth';
import { accountLookupRemote, syncExchange, applySyncedRecords } from '@/lib/cloudSync';
import { useLocalAuth } from '@/lib/LocalAuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { refresh } = useLocalAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoggedIn()) navigate('/', { replace: true });
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const u = username.trim().toLowerCase();
    if (!u || !password) { setError('enter your username and password'); return; }
    setLoading(true);
    try {
      // device already has this account → verify locally (works offline)
      const local = getAccountByUsername(u);
      if (local) {
        const hash = await pbkdf2(password, local.salt);
        if (hash !== local.hash) { setError('Incorrect username or password.'); return; }
        setLoggedIn(u);
        refresh();
        navigate('/', { replace: true });
        return;
      }

      // new device → fetch salt from the cloud and pull this account's data
      // (requires internet for this one step, then it's offline again)
      if (!navigator.onLine) {
        setError('Account not found on this device — go online to sign in.');
        return;
      }
      const lookup = await accountLookupRemote(u);
      if (lookup && lookup.error) { setError(lookup.error); return; }
      if (!lookup || !lookup.exists) { setError('Account not found.'); return; }

      const hash = await pbkdf2(password, lookup.salt);
      const res = await syncExchange(u, hash, []);
      if (res && res.error) {
        setError(res.error === 'unauthorized' ? 'Incorrect username or password.' : res.error);
        return;
      }
      if (res && Array.isArray(res.records)) applySyncedRecords(res.records);
      saveAccount({ username: u, salt: lookup.salt, hash, updated_date: Date.now() });
      setLoggedIn(u);
      refresh();
      navigate('/', { replace: true });
    } catch (err) {
      const msg = (err && err.message) || '';
      if (/not found|404|no such|does not exist/i.test(msg)) setError('Account not found.');
      else if (/unauthorized|wrong password|invalid/i.test(msg)) setError('Incorrect username or password.');
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
        <>
          new here?{' '}
          <Link to="/register" className="text-primary font-medium hover:underline">
            create an account
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