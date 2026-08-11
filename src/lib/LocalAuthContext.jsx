import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getAccount, isLoggedIn, clearSession, migrateLegacyData } from './localAuth';

const LocalAuthContext = createContext();

// local-only auth: no Base44 session, no OAuth. "logged in" = a local account
// exists AND the session flag is set. everything works offline.
export function LocalAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    const account = getAccount();
    if (account && isLoggedIn()) {
      migrateLegacyData(account.username);
      setUser({ username: account.username });
    } else {
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  return (
    <LocalAuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </LocalAuthContext.Provider>
  );
}

export const useLocalAuth = () => useContext(LocalAuthContext);