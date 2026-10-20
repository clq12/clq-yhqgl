import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cloud } from '../cloud';
import { syncAccountData, type AccountSyncResult } from '../db/appDb';
import * as localDB from '../db/indexedDB';

export interface User {
  id: string;
  name?: string;
  avatarUrl?: string;
  email?: string;
}

export interface Session {
  user: User;
}

export type SyncState = 'idle' | 'syncing' | 'ready' | 'error';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  syncState: SyncState;
  syncResult: AccountSyncResult | null;
  dataVersion: number;
  refreshSession: () => Promise<void>;
  refreshData: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncResult, setSyncResult] = useState<AccountSyncResult | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const syncingRef = useRef(false);

  const runSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncState('syncing');
    try {
      const result = await syncAccountData();
      setSyncResult(result);
      setSyncState(result.ok ? 'ready' : 'error');
    } catch (e) {
      setSyncResult({
        ok: false,
        cloudCount: 0,
        pushed: 0,
        total: 0,
        settingsPushed: false,
        error: e instanceof Error ? e.message : '同步失败',
      });
      setSyncState('error');
    } finally {
      syncingRef.current = false;
      setDataVersion((v) => v + 1);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const { data, error } = await cloud.auth.getSession();
    if (!error && data?.user) {
      setSession({ user: data.user as User });
      await runSync();
    }
  }, [runSync]);

  const refreshData = useCallback(async () => {
    await runSync();
  }, [runSync]);

  const signOut = useCallback(async () => {
    await cloud.auth.signOut();
    setSession(null);
    setSyncState('idle');
    setSyncResult(null);
    setDataVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        // 开发预览：?demo=1 使用本地示例数据，跳过云端登录
        if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo')) {
          const existing = await localDB.listCoupons();
          if (existing.length === 0) {
            const { createDemoCoupons } = await import('../lib/demoData');
            await localDB.putCoupons(createDemoCoupons());
          }
          if (cancelled) return;
          setSession({ user: { id: 'demo', name: '演示账号', email: 'demo@example.com' } });
          setSyncResult({
            ok: true,
            cloudCount: 8,
            pushed: 0,
            total: 8,
            settingsPushed: false,
          });
          setSyncState('ready');
          return;
        }

        const { data, error } = await cloud.auth.getSession();
        if (cancelled) return;
        if (!error && data?.user) {
          setSession({ user: data.user as User });
          await runSync();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    bootstrap();

    const unsubscribe = cloud.auth.onAuthStateChange((event, newSession) => {
      if (cancelled) return;
      if (newSession?.user) {
        setSession({ user: newSession.user as User });
        if (event === 'SIGNED_IN') void runSync();
      } else {
        setSession(null);
        setSyncState('idle');
        setSyncResult(null);
        setDataVersion((v) => v + 1);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [runSync]);

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        syncState,
        syncResult,
        dataVersion,
        refreshSession,
        refreshData,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
