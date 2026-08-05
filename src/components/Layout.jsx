import React from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { Home as HomeIcon, BookHeart, Map as MapIcon, Settings as SettingsIcon, RefreshCw, CloudOff, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSync } from '@/lib/SyncContext';

const navItems = [
  { to: '/', icon: HomeIcon, label: 'home' },
  { to: '/journal', icon: BookHeart, label: 'journal' },
  { to: '/map', icon: MapIcon, label: 'map' },
  { to: '/settings', icon: SettingsIcon, label: 'settings' },
];

export default function Layout() {
  const location = useLocation();
  const { syncState } = useSync();

  const showIndicator = syncState === 'syncing' || syncState === 'offline';

  return (
    <div className="min-h-screen bg-background text-foreground">
      {showIndicator && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/90 backdrop-blur text-[10px] text-muted-foreground lowercase animate-fade-in pointer-events-none">
          {syncState === 'syncing' ? (
            <>
              <RefreshCw className="w-3 h-3 animate-spin" />
              syncing
            </>
          ) : (
            <>
              <CloudOff className="w-3 h-3" />
              offline
            </>
          )}
        </div>
      )}
      <main className="pb-24 min-h-screen">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-background/80 backdrop-blur-xl border-t border-border">
        <div
          className="flex items-center justify-around px-2"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {navItems.map(({ to, icon: Icon, label }) => {
            const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className="touch-44 flex flex-col items-center justify-center gap-0.5 px-4 py-2 icon-no-select transition-colors"
              >
                <Icon
                  className={cn(
                    'w-5 h-5 transition-all',
                    active ? 'text-foreground scale-110' : 'text-muted-foreground'
                  )}
                  strokeWidth={active ? 2.5 : 2}
                />
                <span
                  className={cn(
                    'text-[10px] font-medium transition-colors',
                    active ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}