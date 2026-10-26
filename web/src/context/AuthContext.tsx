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
import {
  applyMigration,
  probeMigration,
  syncAccountData,
  type AccountSyncResult,
  type MigrationMode,
  type MigrationProbe,
} from '../db/appDb';
import * as localDB from '../db/indexedDB';
import { conflictCount, subscribeConflicts } from '../sync/conflicts';
import { MigrationGate } from '../components/MigrationDialog';

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
  /** 最近一次成功同步的时间戳（ms）；用于设置页展示「上次同步」 */
  lastSyncAt: number | null;
  /** 「待解决」冲突条数，供设置页/角标展示 */
  conflicts: number;
  /** 首次登录待用户选择的迁移模式；null 表示不需要选 */
  migration: MigrationProbe | null;
  /** 用户选完迁移三选后调用 */
  resolveMigration: (mode: MigrationMode) => Promise<void>;
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
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [conflicts, setConflicts] = useState<number>(() => conflictCount());
  const [migration, setMigration] = useState<MigrationProbe | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const syncingRef = useRef(false);

  const absorb = useCallback((result: AccountSyncResult) => {
    setSyncResult(result);
    setSyncState(result.ok ? 'ready' : 'error');
    if (result.ok) setLastSyncAt(Date.now());
    setDataVersion((v) => v + 1);
  }, []);

  const runSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncState('syncing');
    try {
      absorb(await syncAccountData());
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
      setDataVersion((v) => v + 1);
    } finally {
      syncingRef.current = false;
    }
  }, [absorb]);

  /**
   * 登录后的入口：先看要不要弹「首次登录三选」。
   *
   * 需要选的时候**不能**直接 runSync —— 那会默认把本地数据推上云，
   * 等于替用户做了选择（选「只拉云端」的人会发现本机旧数据污染了云端）。
   */
  const startOrMigrate = useCallback(async () => {
    setSyncState('syncing');
    try {
      const probe = await probeMigration();
      if (probe.needed) {
        setMigration(probe);
        setSyncState('idle');
        return;
      }
    } catch {
      // 探针失败不阻塞登录，退回默认合并逻辑
    }
    await runSync();
  }, [runSync]);

  const resolveMigration = useCallback(
    async (mode: MigrationMode) => {
      setSyncState('syncing');
      try {
        absorb(await applyMigration(mode));
      } catch (e) {
        setSyncState('error');
        setSyncResult({
          ok: false,
          cloudCount: 0,
          pushed: 0,
          total: 0,
          settingsPushed: false,
          error: e instanceof Error ? e.message : '迁移失败',
        });
      } finally {
        setMigration(null);
      }
    },
    [absorb],
  );

  const refreshSession = useCallback(async () => {
    const { data, error } = await cloud.auth.getSession();
    if (!error && data?.user) {
      setSession({ user: data.user as User });
      await startOrMigrate();
    }
  }, [startOrMigrate]);

  const refreshData = useCallback(async () => {
    await runSync();
  }, [runSync]);

  const signOut = useCallback(async () => {
    await cloud.auth.signOut();
    setSession(null);
    setSyncState('idle');
    setSyncResult(null);
    setLastSyncAt(null);
    setMigration(null);
    setDataVersion((v) => v + 1);
  }, []);

  // 冲突条数跟着「待解决」清单走：任何地方裁决完都会通知这里
  useEffect(() => subscribeConflicts(() => setConflicts(conflictCount())), []);

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
          await startOrMigrate();
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
        if (event === 'SIGNED_IN') void startOrMigrate();
      } else {
        setSession(null);
        setSyncState('idle');
        setSyncResult(null);
        setLastSyncAt(null);
        setMigration(null);
        setDataVersion((v) => v + 1);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [startOrMigrate]);

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        syncState,
        syncResult,
        lastSyncAt,
        conflicts,
        migration,
        resolveMigration,
        dataVersion,
        refreshSession,
        refreshData,
        signOut,
      }}
    >
      {children}
      <MigrationGate migration={migration} onChoose={resolveMigration} />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
