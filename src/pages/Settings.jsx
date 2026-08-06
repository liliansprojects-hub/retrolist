import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Share2, Moon, Sun, Monitor, Type, AlertCircle, LogOut, ChevronRight,
} from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { useLocalAuth } from '@/lib/LocalAuthContext';
import { getProfile, saveProfile, deleteAccount, createShare } from '@/lib/store';
import { deleteAccountRemote } from '@/lib/cloudSync';
import { getAccount } from '@/lib/localAuth';
import ColorPicker from '@/components/ColorPicker';
import ImageUpload from '@/components/ImageUpload';
import ShareDialog from '@/components/ShareDialog';
import { cn } from '@/lib/utils';

const FONTS = [
  { id: 'nunito', label: 'nunito', style: { fontFamily: 'Nunito, sans-serif' } },
  { id: 'quicksand', label: 'quicksand', style: { fontFamily: 'Quicksand, sans-serif' } },
  { id: 'inter', label: 'inter', style: { fontFamily: 'Inter, sans-serif' } },
];

export default function Settings() {
  const { theme, changeTheme, accent, changeAccent, font, changeFont } = useTheme();
  const { logout } = useLocalAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(getProfile());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    const handler = () => setProfile(getProfile());
    window.addEventListener('retrolist:synced', handler);
    return () => window.removeEventListener('retrolist:synced', handler);
  }, []);

  const update = (data) => {
    saveProfile(data);
    setProfile(getProfile());
  };

  const handleShareApp = () => {
    setShareOpen(true);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const account = getAccount();
      if (account) {
        await deleteAccountRemote(account.username, account.hash);
      }
    } catch (e) {
      console.error('cloud delete failed, continuing with local delete', e);
    }
    try {
      deleteAccount();
    } catch {}
    logout();
    window.location.href = '/login';
  };

  const themeOptions = [
    { id: 'system', label: 'auto', icon: Monitor },
    { id: 'light', label: 'light', icon: Sun },
    { id: 'dark', label: 'dark', icon: Moon },
  ];

  return (
    <div className="safe-top px-4 pb-4 min-h-screen">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold lowercase tracking-tight">settings</h1>
        <p className="text-sm text-muted-foreground lowercase mt-0.5">make it yours</p>
      </header>

      {/* profile */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase mb-3">profile</h2>
        <div className="rounded-2xl border border-border p-4 space-y-3">
          <ImageUpload
            value={profile.avatar}
            onChange={(p) => update({ avatar: p })}
            label="avatar"
            aspect={1}
            round
            maxSize={400}
            className="w-20 h-20 rounded-full mx-auto"
          />
          <div>
            <label className="text-xs font-medium text-muted-foreground lowercase block mb-1.5">name</label>
            <input
              value={profile.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="your name"
              className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none focus:ring-1 focus:ring-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground lowercase block mb-1.5">bio</label>
            <textarea
              value={profile.bio}
              onChange={(e) => update({ bio: e.target.value })}
              placeholder="about you"
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none focus:ring-1 focus:ring-foreground resize-none selectable"
            />
          </div>
          <button
            onClick={handleShareApp}
            className="touch-44 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-foreground text-background text-sm font-medium lowercase"
          >
            <Share2 className="w-4 h-4" /> share app
          </button>
        </div>
      </section>

      {/* appearance */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase mb-3">appearance</h2>
        <div className="rounded-2xl border border-border p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground lowercase block mb-2">theme</label>
            <div className="flex gap-2">
              {themeOptions.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => changeTheme(id)}
                  className={cn(
                    'touch-44 flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium lowercase transition-colors',
                    theme === id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground lowercase block mb-2">font</label>
            <div className="flex gap-2">
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => changeFont(f.id)}
                  style={f.style}
                  className={cn(
                    'touch-44 flex-1 py-3 rounded-xl text-sm font-medium lowercase transition-colors',
                    font === f.id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <ColorPicker value={accent} onChange={changeAccent} label="accent colour" />
        </div>
      </section>

      {/* account */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase mb-3">account</h2>
        <div className="rounded-2xl border border-border overflow-hidden">
          <button
            onClick={() => logout()}
            className="touch-44 w-full flex items-center justify-between px-4 py-3.5 text-sm font-medium lowercase hover:bg-muted"
          >
            <span className="flex items-center gap-3">
              <LogOut className="w-4 h-4 text-muted-foreground" /> log out
            </span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="border-t border-border" />
          <button
            onClick={() => setDeleteOpen(true)}
            className="touch-44 w-full flex items-center justify-between px-4 py-3.5 text-sm font-medium lowercase text-destructive hover:bg-muted"
          >
            <span className="flex items-center gap-3">
              <AlertCircle className="w-4 h-4" /> delete account
            </span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      <p className="text-center text-xs text-muted-foreground/40 lowercase py-4">
        retrolist ✶ made with love
      </p>

      {/* share app dialog */}
      <ShareDialog
        open={shareOpen}
        directUrl={typeof window !== 'undefined' ? window.location.origin : ''}
        title="share app"
        onClose={() => setShareOpen(false)}
      />

      {/* delete confirmation */}
      {deleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={() => setDeleteOpen(false)}
        >
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />
          <div
            className="relative w-full max-w-lg bg-card rounded-t-3xl sm:rounded-3xl border border-border p-5 pb-8 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <h3 className="text-base font-semibold lowercase">delete account?</h3>
              <p className="text-xs text-muted-foreground lowercase mt-1.5 max-w-xs">
                this action is permanent. all your folders, lists, journal entries, and places will be permanently deleted. this cannot be undone.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteOpen(false)}
                className="touch-44 flex-1 py-3 rounded-2xl bg-muted text-muted-foreground text-sm font-medium lowercase"
              >
                cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="touch-44 flex-1 py-3 rounded-2xl bg-destructive text-destructive-foreground text-sm font-medium lowercase disabled:opacity-50"
              >
                {deleting ? 'deleting…' : 'delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}