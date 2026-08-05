import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { syncNow } from './sync';

const SyncContext = createContext();

// states: 'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'unauthenticated'
export function SyncProvider({ children }) {
  const { isAuthenticated, authChecked } = useAuth();
  const [syncState, setSyncState] = useState('idle');
  const [lastSync, setLastSync] = useState(null);
  const debounceRef = useRef(null);
  const periodicRef = useRef(null);

  const runSync = async () => {
    if (!navigator.onLine) {
      setSyncState('offline');
      return;
    }
    setSyncState('syncing');
    try {
      const result = await syncNow();
      if (result.status === 'ok') {
        setSyncState('synced');
        setLastSync(Date.now());
      } else if (result.status === 'offline') {
        setSyncState('offline');
      } else if (result.status === 'unauthenticated') {
        setSyncState('unauthenticated');
      } else if (result.status === 'already_running') {
        // keep current state
      } else {
        setSyncState('error');
      }
    } catch {
      setSyncState('error');
    }
  };

  // initial sync once auth is resolved
  useEffect(() => {
    if (authChecked && isAuthenticated) {
      runSync();
    } else if (authChecked && !isAuthenticated) {
      setSyncState('unauthenticated');
    }
  }, [authChecked, isAuthenticated]);

  // listen for online/offline events
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
  }, []);

  // periodic sync every 30 seconds when online + authenticated
  useEffect(() => {
    if (periodicRef.current) clearInterval(periodicRef.current);
    periodicRef.current = setInterval(() => {
      if (navigator.onLine && isAuthenticated) runSync();
    }, 30000);
    return () => clearInterval(periodicRef.current);
  }, [isAuthenticated]);

  // trigger a debounced sync shortly after any local data change
  useEffect(() => {
    const handleDataChanged = () => {
      if (!navigator.onLine || !isAuthenticated) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => runSync(), 2000);
    };
    window.addEventListener('retrolist:data-changed', handleDataChanged);
    return () => window.removeEventListener('retrolist:data-changed', handleDataChanged);
  }, [isAuthenticated]);

  return (
    <SyncContext.Provider value={{ syncState, lastSync, runSync }}>
      {children}
    </SyncContext.Provider>
  );
}

export const useSync = () => useContext(SyncContext);