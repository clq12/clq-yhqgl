import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { cloud } from '../cloud';

interface User {
  id: string;
  name?: string;
  avatarUrl?: string;
}

interface Session {
  user: User;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const { data, error } = await cloud.auth.getSession();
    if (!error && data?.user) {
      setSession({ user: data.user as User });
    } else {
      setSession(null);
    }
  };

  const signOut = async () => {
    await cloud.auth.signOut();
    setSession(null);
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    const unsubscribe = cloud.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ? { user: newSession.user as User } : null);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
