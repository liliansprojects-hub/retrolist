import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocalAuth } from './LocalAuthContext';
import { syncNow } from './cloudSync';

const SyncContext = createContext();

// states: 'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'unauthenticated' | 'unauthorized'
export function SyncProvider({ children }) {
  const { user, loading } = useLocalAuth();
  const [syncState, setSyncState] = useState('idle');
  const [lastSync, setLastSync] = useState(null);
  const debounceRef = useRef(null);
  const periodicRef = useRef(null);

  const runSync = async () => {
    if (!navigator.onLine) { setSyncState('offline'); return; }
    if (!user) { setSyncState('unauthenticated'); return; }
    setSyncState('syncing');
    try {
      const result = await syncNow();
      if (result.status === 'ok') { setSyncState('synced'); setLastSync(Date.now()); }
      else if (result.status === 'offline') setSyncState('offline');
      else if (result.status === 'unauthenticated' || result.status === 'unauthorized') setSyncState('unauthenticated');
      else if (result.status === 'already_running') { /* keep current state */ }
      else setSyncState('error');
    } catch {
      setSyncState('error');
    }
  };

  // sync once when the user is locally logged in
  useEffect(() => {
    if (!loading && user) runSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  // online/offline events
  useEffect(() => {
    const handleOnline = () => runSync();
    const handleOffline = () => setSyncState('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (!navigator.onLine) setSyncState('offline');
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // periodic background sync
  useEffect(() => {
    if (periodicRef.current) clearInterval(periodicRef.current);
    periodicRef.current = setInterval(() => {
      if (navigator.onLine && user) runSync();
    }, 30000);
    return () => clearInterval(periodicRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // debounced sync shortly after any local data change
  useEffect(() => {
    const handleDataChanged = () => {
      if (!navigator.onLine || !user) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => runSync(), 2000);
    };
    window.addEventListener('retrolist:data-changed', handleDataChanged);
    return () => window.removeEventListener('retrolist:data-changed', handleDataChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <SyncContext.Provider value={{ syncState, lastSync, runSync }}>
      {children}
    </SyncContext.Provider>
  );
}

export const useSync = () => useContext(SyncContext);