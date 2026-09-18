import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    api
      .me()
      .then(({ user: me }) => setUser(me))
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  // The API client fires this when a token is rejected mid-session.
  useEffect(() => {
    const onSignedOut = () => setUser(null);
    window.addEventListener('relay:signed-out', onSignedOut);
    return () => window.removeEventListener('relay:signed-out', onSignedOut);
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, user: me } = await api.login(email, password);
    setToken(token);
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, login, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
