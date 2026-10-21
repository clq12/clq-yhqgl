import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  CloudOff,
  LogOut,
  RefreshCw,
  Settings as SettingsIcon,
  Ticket,
  UserRound,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast, Button, IconButton } from './components/ui';
import { initDB } from './db/indexedDB';
import { CouponList } from './components/CouponList';
import { CouponDetail } from './components/CouponDetail';
import { SettingsPanel } from './components/SettingsPanel';
import { AIPanel } from './components/AIPanel';
import { LoginScreen } from './components/LoginScreen';
import { StatDashboard } from './components/StatDashboard';

type View = 'coupons' | 'stats' | 'settings';

const NAV: { key: View; label: string; icon: typeof Ticket }[] = [
  { key: 'coupons', label: '优惠券', icon: Ticket },
  { key: 'stats', label: '统计', icon: BarChart3 },
  { key: 'settings', label: '设置', icon: SettingsIcon },
];

const VIEW_TITLE: Record<View, { title: string; description: string }> = {
  coupons: { title: '我的优惠券', description: '集中管理各类优惠券，到期前自动提醒' },
  stats: { title: '统计分析', description: '查看优惠金额、使用情况与店铺分布' },
  settings: { title: '设置', description: '同步、提醒与 AI 助手配置' },
};

function Splash({ label = '初始化中…' }: { label?: string }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-[var(--canvas)]">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-sm">
        <Ticket className="h-6 w-6" />
      </div>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

function SyncSplash() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-[var(--canvas)] px-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-sm">
        <RefreshCw className="h-7 w-7 animate-spin" />
      </div>
      <div className="space-y-1 text-center">
        <p className="text-base font-semibold text-slate-900">正在同步账号数据</p>
        <p className="text-sm text-slate-500">正在拉取该账号的优惠券记录，请稍候</p>
      </div>
    </div>
  );
}

function Sidebar({
  view,
  onChange,
  onSignOut,
  email,
}: {
  view: View;
  onChange: (v: View) => void;
  onSignOut: () => void;
  email: string;
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600 text-white">
          <Ticket className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-900">优惠券管理</p>
          <p className="text-xs text-slate-400">Coupon Manager</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3" aria-label="主导航">
        {NAV.map((item) => {
          const active = item.key === view;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              aria-current={active ? 'page' : undefined}
              className={`flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors ${
                active
                  ? 'bg-rose-50 text-rose-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-2 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <UserRound className="h-4 w-4" aria-hidden />
          </div>
          <p className="min-w-0 flex-1 truncate text-xs text-slate-600" title={email}>
            {email}
          </p>
          <IconButton label="退出登录" onClick={onSignOut} className="h-8 w-8">
            <LogOut className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
    </aside>
  );
}

function MobileNav({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      aria-label="底部导航"
    >
      {NAV.map((item) => {
        const active = item.key === view;
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
              active ? 'text-rose-600' : 'text-slate-500'
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

function CouponsView({
  selectedId,
  onSelect,
  onBack,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** 从详情退回列表：会顺带把浏览器历史里那条记录消费掉 */
  onBack: () => void;
}) {
  return (
    <div className="flex h-full min-h-0">
      <div
        className={`w-full shrink-0 border-slate-200 bg-white lg:w-[380px] lg:border-r ${
          selectedId ? 'hidden lg:block' : 'block'
        }`}
      >
        <CouponList selectedId={selectedId} onSelect={onSelect} />
      </div>
      <div className={`min-w-0 flex-1 bg-white lg:bg-transparent ${selectedId ? 'block' : 'hidden lg:block'}`}>
        <CouponDetail
          couponId={selectedId}
          onClose={onBack}
          onChange={() => onSelect(null)}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

function AppContent() {
  const { session, loading, syncState, syncResult, refreshData, signOut } = useAuth();
  const { showToast } = useToast();
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('coupons');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dismissedSyncToast, setDismissedSyncToast] = useState(false);

  /**
   * 详情页的历史记录。
   *
   * 手机上「返回」是系统手势/硬件键，不是页面按钮 —— 不压一条历史记录的话，
   * 用户按返回会直接退出整个页面。这里在打开详情时压一条，返回时消费掉它。
   */
  const detailPushedRef = useRef(false);

  useEffect(() => {
    if (selectedId && !detailPushedRef.current) {
      detailPushedRef.current = true;
      window.history.pushState({ couponDetail: true }, '');
    }
  }, [selectedId]);

  useEffect(() => {
    const onPop = () => {
      detailPushedRef.current = false;
      setSelectedId(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const backToList = useCallback(() => {
    if (detailPushedRef.current) {
      // 让 history.back() 触发 popstate，由上面的监听统一收口，避免历史记录越堆越多
      window.history.back();
    } else {
      setSelectedId(null);
    }
  }, []);

  useEffect(() => {
    initDB().then(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!session || !syncResult || dismissedSyncToast) return;
    setDismissedSyncToast(true);
    if (syncResult.ok) {
      const parts = [`已同步 ${syncResult.total} 张优惠券`];
      if (syncResult.pushed > 0) parts.push(`本地补传 ${syncResult.pushed} 张`);
      showToast(parts.join('，'), 'success');
    } else {
      showToast(syncResult.error ?? '账号数据同步失败', 'error');
    }
  }, [session, syncResult, dismissedSyncToast, showToast]);

  const email = session?.user.email || session?.user.name || session?.user.id || '';

  if (loading || !ready) return <Splash />;
  if (!session) return <LoginScreen />;
  if (syncState === 'syncing' && !syncResult) return <SyncSplash />;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshData();
      showToast('已刷新账号数据', 'success');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setSelectedId(null);
    setView('coupons');
    showToast('已退出登录', 'info');
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--canvas)]">
      <Sidebar view={view} onChange={setView} onSignOut={handleSignOut} email={email} />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-600 text-white lg:hidden">
              <Ticket className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold text-slate-900">{VIEW_TITLE[view].title}</h1>
              <p className="hidden truncate text-xs text-slate-500 sm:block">{VIEW_TITLE[view].description}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {syncState === 'error' && (
              <span
                className="hidden items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs text-rose-700 sm:inline-flex"
                title={syncResult?.error}
              >
                <CloudOff className="h-3.5 w-3.5" />
                云端同步异常
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              loading={refreshing || syncState === 'syncing'}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              刷新
            </Button>
            <AIPanel onSelectCoupon={setSelectedId} />
            <IconButton label="退出登录" onClick={handleSignOut} className="lg:hidden">
              <LogOut className="h-4 w-4" />
            </IconButton>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden pb-14 lg:pb-0">
          {view === 'coupons' && <CouponsView selectedId={selectedId} onSelect={setSelectedId} onBack={backToList} />}
          {view === 'stats' && (
            <div className="scroll-area h-full overflow-y-auto p-4 lg:p-6">
              <StatDashboard />
            </div>
          )}
          {view === 'settings' && (
            <div className="scroll-area h-full overflow-y-auto p-4 lg:p-6">
              <SettingsPanel />
            </div>
          )}
        </div>
      </main>

      <MobileNav view={view} onChange={setView} />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
