import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Loader2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { verifyEmailRemote, confirmEmailRemote } from '@/lib/cloudSync';
import { setLoggedIn, saveAccount, getAccountByUsername, isLoggedIn } from '@/lib/localAuth';
import { useLocalAuth } from '@/lib/LocalAuthContext';

// email confirmation step shown after a correct password on login (only when
// the user entered an email). the code was emailed by confirmEmail; verifying
// it here completes the sign-in and lands on the main page.
export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useLocalAuth();
  const state = location.state || {};
  const { username, email, salt, hash, isLocal } = state;
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => { if (isLoggedIn()) navigate('/', { replace: true }); }, [navigate]);

  if (!username || !email) return <Navigate to="/login" replace />;

  const finishLogin = () => {
    if (!isLocal && salt && hash) {
      saveAccount({ username, salt, hash, email, email_confirmed: true, updated_date: Date.now() });
    } else {
      const acc = getAccountByUsername(username);
      if (acc) saveAccount({ ...acc, email, email_confirmed: true, updated_date: Date.now() });
    }
    setLoggedIn(username);
    refresh();
    navigate('/', { replace: true });
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    if (!code.trim()) { setError('enter the code'); return; }
    setLoading(true);
    try {
      const res = await verifyEmailRemote(username, email, code.trim());
      if (res && res.error) { setError(res.error === 'invalid or expired code' ? 'wrong or expired code' : res.error); return; }
      finishLogin();
    } catch (err) {
      setError((err && err.message) || 'verification failed');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError('');
    setResending(true);
    try {
      const res = await confirmEmailRemote(username, email);
      if (res && res.error) setError(res.error);
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout
      icon={Mail}
      title="verify your email"
      subtitle={`we sent a code to ${email}`}
      footer={
        <button onClick={resend} disabled={resending} className="text-muted-foreground text-xs font-medium hover:underline lowercase disabled:opacity-40">
          {resending ? 'sending…' : 'resend code'}
        </button>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm lowercase">
          {error}
        </div>
      )}

      <form onSubmit={handleVerify} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code">confirmation code</Label>
          <Input
            id="code"
            autoFocus
            inputMode="numeric"
            maxLength={4}
            placeholder="1234"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="h-12 text-lg tracking-[0.5em]"
          />
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              verifying…
            </>
          ) : (
            'verify & sign in'
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}