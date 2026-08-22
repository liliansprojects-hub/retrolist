import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, User, Lock, Mail, Loader2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { registerLocal, getAccountByUsername, isLoggedIn } from '@/lib/localAuth';
import { accountLookupRemote } from '@/lib/cloudSync';
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

  useEffect(() => {
    if (isLoggedIn()) navigate('/', { replace: true });
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const u = username.trim().toLowerCase();
    if (!u || !password) { setError('enter a username and password'); return; }
    if (password.length < 4) { setError('password must be at least 4 characters'); return; }
    if (password !== confirm) { setError('passwords do not match'); return; }
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('enter a valid email'); return; }
    if (getAccountByUsername(u)) { setError('that username is already taken on this device — sign in instead'); return; }

    setLoading(true);
    try {
      // online collision check (skipped offline; a collision surfaces on first sync)
      if (navigator.onLine) {
        const lookup = await accountLookupRemote(u);
        if (lookup && lookup.exists) { setError('username taken'); return; }
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
              className="pl-10 h-12 lowercase"
              required
            />
          </div>
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