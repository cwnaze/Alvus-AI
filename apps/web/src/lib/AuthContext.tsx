import type { AuthUser } from '@alvus-ai/shared';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiLogout, fetchMe } from './api';
import { clearSession, getAccessToken, getStoredUser, setSession, setStoredUser } from './session';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  signIn: (accessToken: string, user: AuthUser) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [loading, setLoading] = useState(true);

  // Revalidate on load (not just trust the cached user) so a status change an
  // admin made in another session -- approval, rejection -- is picked up on
  // the next visit rather than only after the ~1hr token expires.
  useEffect(() => {
    let cancelled = false;
    async function revalidate() {
      if (!getAccessToken()) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const me = await fetchMe();
        if (cancelled) return;
        setStoredUser(me);
        setUser(me);
      } catch {
        if (cancelled) return;
        clearSession();
        setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    revalidate();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback((accessToken: string, freshUser: AuthUser) => {
    setSession(accessToken, freshUser);
    setUser(freshUser);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // Best-effort server-side revocation; the client-side session is
      // cleared either way so the UI never gets stuck signed in.
    }
    clearSession();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
