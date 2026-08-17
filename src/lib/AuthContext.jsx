import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const authed = await db.auth.isAuthenticated();
        if (!active) return;
        setIsAuthenticated(!!authed);
        if (authed) {
          try { setUser(await db.auth.me()); } catch {}
        }
      } catch {
        // offline / no session — stay logged out locally
      } finally {
        if (active) {
          setIsLoadingAuth(false);
          setIsLoadingPublicSettings(false);
          setAuthChecked(true);
        }
      }
    })();
    return () => { active = false; };
  }, []);

  const checkUserAuth = async () => {
    try {
      const u = await db.auth.me();
      setUser(u);
      setIsAuthenticated(!!u);
    } catch {}
    setAuthChecked(true);
    setIsLoadingAuth(false);
  };

  const checkAppState = async () => {
    await checkUserAuth();
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    if (shouldRedirect) {
      try { db.auth.redirectToLogin(window.location.href); } catch {}
    }
  };

  const navigateToLogin = () => {
    try { db.auth.redirectToLogin(window.location.href); } catch {}
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};