import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Share2, Moon, Sun, Monitor, Type, AlertCircle, LogOut, ChevronRight, Play, Bell, Check, FolderOpen, FileText, Trash2,
} from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { useLocalAuth } from '@/lib/LocalAuthContext';
import { getProfile, saveProfile, deleteAccount, createShare, getSettings, saveSettings, resetAllData } from '@/lib/store';
import { deleteAccountRemote } from '@/lib/cloudSync';
import { getAccount, clearAccount, pbkdf2 } from '@/lib/localAuth';
import ColorPicker from '@/components/ColorPicker';
import ImageUpload from '@/components/ImageUpload';
import ShareDialog from '@/components/ShareDialog';
import EmailSection from '@/components/EmailSection';
import { getAllPhotos, getAllFiles } from '@/lib/store';
import { cn } from '@/lib/utils';
import { SOUNDS, VIBRATIONS, preview } from '@/lib/alarmAudio';

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
  const [settings, setSettings] = useState(getSettings());
  const [notifStatus, setNotifStatus] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delStep, setDelStep] = useState(0);
  const [delPassword, setDelPassword] = useState('');
  const [delConfirm, setDelConfirm] = useState(false);
  const [delError, setDelError] = useState('');
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

  const updateSettings = (s) => {
    saveSettings(s);
    setSettings(getSettings());
  };

  const enableNotif = async () => {
    if (!('Notification' in window)) return;
    try { setNotifStatus(await Notification.requestPermission()); } catch {}
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
      clearAccount();
    } catch {}
    logout();
    window.location.href = '/login';
  };

  const verifyAndDelete = async () => {
    setDelError('');
    const acc = getAccount();
    if (acc) {
      try {
        const hash = await pbkdf2(delPassword, acc.salt);
        if (hash !== acc.hash) { setDelError('Incorrect password.'); return; }
      } catch { setDelError('Could not verify password.'); return; }
    }
    if (!delConfirm) { setDelError('Please confirm you understand this is permanent.'); return; }
    await handleDeleteAccount();
  };

  const themeOptions = [
    { id: 'system', label: 'auto', icon: Monitor },
    { id: 'light', label: 'light', icon: Sun },
    { id: 'dark', label: 'dark', icon: Moon },
  ];

  return (
    <div className="safe-top px-6 sm:px-8 pb-4 min-h-screen">
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
            controlsOutside
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

      {/* journal */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase mb-3">journal</h2>
        <div className="rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium lowercase">period tracking</p>
              <p className="text-xs text-muted-foreground lowercase mt-0.5">show period tracking in your journal</p>
            </div>
            <button
              onClick={() => updateSettings({ periodTracking: !settings.periodTracking })}
              className={cn('touch-44 relative w-10 h-6 rounded-full transition-colors', settings.periodTracking ? 'bg-foreground' : 'bg-muted')}
            >
              <span className={cn('absolute top-1 w-4 h-4 rounded-full bg-background transition-all', settings.periodTracking ? 'left-5' : 'left-1')} />
            </button>
          </div>
        </div>
      </section>

      {/* alarms */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase mb-3">alarms</h2>
        <div className="rounded-2xl border border-border p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground lowercase block mb-1.5">default sound</label>
            <div className="flex gap-2">
              <select
                value={settings.defaultSound}
                onChange={(e) => updateSettings({ defaultSound: e.target.value })}
                className="flex-1 px-3 py-2.5 rounded-xl bg-muted text-sm outline-none"
              >
                {SOUNDS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <button
                onClick={() => { const v = VIBRATIONS.find((x) => x.id === settings.defaultVibration) || VIBRATIONS[0]; preview(settings.defaultSound || 'classic', v.pattern); }}
                className="touch-44 px-3 rounded-xl bg-muted flex items-center gap-1 text-xs font-medium lowercase"
              >
                <Play className="w-3.5 h-3.5" /> test
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground lowercase block mb-1.5">default vibration</label>
            <select
              value={settings.defaultVibration}
              onChange={(e) => updateSettings({ defaultVibration: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none"
            >
              {VIBRATIONS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground lowercase block mb-1.5">default snooze</label>
            <div className="flex gap-2">
              {[1, 5, 10].map((m) => (
                <button
                  key={m}
                  onClick={() => updateSettings({ defaultSnooze: m })}
                  className={cn('touch-44 flex-1 py-2.5 rounded-xl text-sm font-medium lowercase', Number(settings.defaultSnooze) === m ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground lowercase block mb-1.5">time format</label>
            <div className="flex gap-2">
              {['24h', '12h'].map((f) => (
                <button
                  key={f}
                  onClick={() => updateSettings({ clockFormat: f })}
                  className={cn('touch-44 flex-1 py-2.5 rounded-xl text-sm font-medium lowercase', settings.clockFormat === f ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium lowercase">notifications</p>
              <p className="text-xs text-muted-foreground lowercase mt-0.5">{notifStatus === 'granted' ? 'allowed' : notifStatus === 'denied' ? 'blocked' : notifStatus === 'unsupported' ? 'unsupported' : 'ask once'}</p>
            </div>
            {notifStatus !== 'granted' && notifStatus !== 'unsupported' && (
              <button onClick={enableNotif} className="touch-44 flex items-center gap-1.5 px-3 h-9 rounded-full bg-muted text-xs font-medium lowercase">
                <Bell className="w-3.5 h-3.5" /> enable
              </button>
            )}
          </div>
        </div>
      </section>

      {/* my files */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase mb-3">my files</h2>
        <button
          onClick={() => navigate('/my-files')}
          className="touch-44 w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border border-border hover:bg-muted text-sm font-medium lowercase"
        >
          <span className="flex items-center gap-3">
            <FolderOpen className="w-4 h-4 text-muted-foreground" /> all photos & files
          </span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
        <button
          onClick={() => navigate('/recently-deleted')}
          className="touch-44 w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border border-border hover:bg-muted text-sm font-medium lowercase"
        >
          <span className="flex items-center gap-3">
            <Trash2 className="w-4 h-4 text-muted-foreground" /> recently deleted
          </span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
        {(getAllPhotos().length > 0 || getAllFiles().length > 0) && (
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {getAllPhotos().slice(0, 8).map((p, i) => (
              <img key={i} src={p.url} alt="" className="w-full aspect-square object-cover rounded-lg" />
            ))}
            {getAllPhotos().length < 8 && getAllFiles().slice(0, 8 - getAllPhotos().length).map((f, i) => (
              <div key={'f' + i} className="w-full aspect-square rounded-lg bg-muted flex items-center justify-center">
                <FileText className="w-4 h-4 text-muted-foreground" />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* recovery email */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase mb-3">recovery email</h2>
        <EmailSection />
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
            onClick={() => { if (confirm('delete all files and folders? your account stays.')) { resetAllData(); navigate('/'); } }}
            className="touch-44 w-full flex items-center justify-between px-4 py-3.5 text-sm font-medium lowercase hover:bg-muted"
          >
            <span className="flex items-center gap-3">
              <Trash2 className="w-4 h-4 text-muted-foreground" /> reset all data
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

      {/* delete confirmation (two-step: warning → password + confirm) */}
      {deleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={() => { setDeleteOpen(false); setDelStep(0); setDelPassword(''); setDelConfirm(false); setDelError(''); }}
        >
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />
          <div
            className="relative w-full max-w-lg bg-card rounded-t-3xl sm:rounded-3xl border border-border p-5 pb-8 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {delStep === 0 ? (
              <>
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
                    onClick={() => { setDeleteOpen(false); setDelStep(0); }}
                    className="touch-44 flex-1 py-3 rounded-2xl bg-muted text-muted-foreground text-sm font-medium lowercase"
                  >
                    cancel
                  </button>
                  <button
                    onClick={() => setDelStep(1)}
                    className="touch-44 flex-1 py-3 rounded-2xl bg-foreground text-background text-sm font-medium lowercase"
                  >
                    continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col items-center text-center mb-4">
                  <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
                    <AlertCircle className="w-6 h-6 text-destructive" />
                  </div>
                  <h3 className="text-base font-semibold lowercase">confirm deletion</h3>
                  <p className="text-xs text-muted-foreground lowercase mt-1.5 max-w-xs">
                    enter your password and confirm to delete forever.
                  </p>
                </div>
                {delError && (
                  <div className="mb-3 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs lowercase">{delError}</div>
                )}
                <input
                  type="password"
                  value={delPassword}
                  onChange={(e) => setDelPassword(e.target.value)}
                  placeholder="password"
                  className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none mb-3"
                />
                <label className="flex items-center gap-2 mb-4 text-xs lowercase text-muted-foreground">
                  <button
                    onClick={() => setDelConfirm((c) => !c)}
                    className={cn('touch-44 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0', delConfirm ? 'bg-foreground border-foreground' : 'border-border')}
                  >
                    {delConfirm && <Check className="w-3 h-3 text-background" />}
                  </button>
                  i understand this is permanent and cannot be undone
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDelStep(0)}
                    className="touch-44 flex-1 py-3 rounded-2xl bg-muted text-muted-foreground text-sm font-medium lowercase"
                  >
                    back
                  </button>
                  <button
                    onClick={verifyAndDelete}
                    disabled={deleting || !delPassword || !delConfirm}
                    className="touch-44 flex-1 py-3 rounded-2xl bg-destructive text-destructive-foreground text-sm font-medium lowercase disabled:opacity-50"
                  >
                    {deleting ? 'deleting…' : 'delete forever'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}