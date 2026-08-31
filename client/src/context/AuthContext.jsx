import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signup = async (payload) => {
    const { data } = await api.post('/auth/signup', payload);
    setUser(data.user);
    await refresh(); // the signup response omits joined profile/location fields — pull the full record
    return data.user;
  };

  const login = async (payload) => {
    const { data } = await api.post('/auth/login', payload);
    setUser(data.user);
    await refresh(); // same as above: fills in location, avatar, provider_id, etc.
    return data.user;
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
  };

  const switchMode = async (mode) => {
    const { data } = await api.post('/profile/mode', { mode });
    setUser((u) => ({ ...u, current_mode: data.user.current_mode }));
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, signup, login, logout, switchMode, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
