import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../api/client.js';
import { supabase } from '../lib/supabaseClient.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      return data.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Supabase hydrates any existing session from the browser's local
    // storage asynchronously -- wait for that before asking our own API for
    // the profile, otherwise /auth/me fires before a token is attached and
    // looks like a logged-out flash on every page load/refresh.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) refresh();
      else setLoading(false);
    });

    // Keeps `user` in sync with Supabase's own session lifecycle from here
    // on: a token refresh, a sign-out (including one that happened in
    // another tab), a session Supabase itself invalidated.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        refresh();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [refresh]);

  const signup = async ({ firstName, lastName, email, password }) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      if (/already registered|already exists|user already/i.test(error.message)) {
        throw new Error(
          'An account with this email already exists. Try logging in, or use "Forgot password?" if you don\'t remember your password.'
        );
      }
      throw new Error(error.message);
    }
    if (!data.session) {
      // Shouldn't happen with email confirmation turned off in the Supabase
      // project settings, but guard anyway rather than silently leaving
      // someone signed-up-but-not-logged-in.
      throw new Error('Could not start your session. Please try logging in.');
    }
    // Supabase Auth now owns the credential; this just creates the app-side
    // profile row (users/profiles/user_settings) the rest of the app has
    // always kept per user.
    await api.post('/auth/bootstrap', { firstName, lastName });
    return refresh();
  };

  const login = async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return refresh();
  };

  const logout = async () => {
    await supabase.auth.signOut();
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
