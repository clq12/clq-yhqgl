import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Cloud,
  HardDrive,
  LogOut,
  RefreshCw,
  Save,
  ShieldCheck,
  TestTube,
  UserRound,
} from 'lucide-react';
import { getSettings, putSettings } from '../db/appDb';
import { WebDAVClient } from '../sync/webdav';
import type { AppSettings } from '../types/coupon';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Input, Skeleton, useToast } from './ui';

const defaultSettings: AppSettings = {
  schemaVersion: 2,
  webdav: { url: '', username: '', password: '', rootPath: '/yhqgl/v2' },
  sync: { autoSync: true, syncIntervalMinutes: 15, syncOnWifiOnly: false },
  reminder: { enabled: true, remindDays: [7, 3, 1], quietStart: null, quietEnd: null },
  ai: { provider: 'agnes', apiKey: null, baseUrl: null, model: null },
};

function Section({
  icon,
  title,
  description,
  children,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            {icon}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </Card>
  );
}

export function SettingsPanel() {
  const { session, syncState, syncResult, refreshData, signOut } = useAuth();
  const { showToast } = useToast();

  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [initial, setInitial] = useState<AppSettings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      if (s) {
        setSettings(s);
        setInitial(s);
      }
      setLoaded(true);
    });
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(initial),
    [settings, initial],
  );

  const update = (patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await putSettings(settings);
      setInitial(settings);
      showToast('设置已保存', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestStatus('测试中…');
    try {
      const client = new WebDAVClient(settings.webdav);
      const root = settings.webdav.rootPath.replace(/^\//, '');
      const ok = (await client.mkcol(root)) && (await client.exists(''));
      setTestStatus(ok ? '连接成功' : '连接失败，请检查地址与账号');
    } catch (e) {
      setTestStatus('连接失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setTesting(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshData();
      showToast('已重新拉取账号数据', 'success');
    } finally {
      setRefreshing(false);
    }
  };

  const email = session?.user.email || session?.user.name || session?.user.id || '已登录';

  if (!loaded) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-56" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-4">
      <Section
        icon={<UserRound className="h-4 w-4" />}
        title="账号与同步"
        description="登录后数据保存在云端，换设备用同一账号即可访问"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">{email}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
              {syncState === 'ready'
                ? `云端已有 ${syncResult?.cloudCount ?? 0} 条记录`
                : syncState === 'error'
                  ? '云端同步异常'
                  : '正在检查云端状态'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              loading={refreshing || syncState === 'syncing'}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              重新同步
            </Button>
            <Button variant="ghost" size="sm" onClick={() => signOut()} icon={<LogOut className="h-4 w-4" />}>
              退出
            </Button>
          </div>
        </div>
      </Section>

      <Section
        icon={<Cloud className="h-4 w-4" />}
        title="WebDAV 同步（可选）"
        description="用于与安卓端或其他支持 WebDAV 的工具同步"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="WebDAV 地址"
            value={settings.webdav.url}
            onChange={(e) => update({ webdav: { ...settings.webdav, url: e.target.value } })}
            placeholder="https://dav.example.com/remote.php/dav"
          />
          <Input
            label="根目录"
            value={settings.webdav.rootPath}
            onChange={(e) => update({ webdav: { ...settings.webdav, rootPath: e.target.value } })}
            placeholder="/yhqgl/v2"
          />
          <Input
            label="用户名"
            value={settings.webdav.username}
            onChange={(e) => update({ webdav: { ...settings.webdav, username: e.target.value } })}
            autoComplete="username"
          />
          <Input
            label="密码"
            type="password"
            value={settings.webdav.password}
            onChange={(e) => update({ webdav: { ...settings.webdav, password: e.target.value } })}
            autoComplete="current-password"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTest}
            loading={testing}
            icon={<TestTube className="h-4 w-4" />}
          >
            测试连接
          </Button>
          {testStatus && <span className="text-xs text-slate-500">{testStatus}</span>}
        </div>
      </Section>

      <Section
        icon={<Bot className="h-4 w-4" />}
        title="AI 助手"
        description="使用你自己的 API Key，仅保存在本地与账号设置中"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Provider"
            value={settings.ai.provider}
            onChange={(e) => update({ ai: { ...settings.ai, provider: e.target.value } })}
            placeholder="agnes"
          />
          <Input
            label="模型"
            value={settings.ai.model ?? ''}
            onChange={(e) => update({ ai: { ...settings.ai, model: e.target.value || null } })}
            placeholder="agnes-chat"
          />
          <Input
            label="API Key"
            type="password"
            value={settings.ai.apiKey ?? ''}
            onChange={(e) => update({ ai: { ...settings.ai, apiKey: e.target.value || null } })}
            placeholder="sk-…"
            autoComplete="off"
          />
          <Input
            label="Base URL"
            value={settings.ai.baseUrl ?? ''}
            onChange={(e) => update({ ai: { ...settings.ai, baseUrl: e.target.value || null } })}
            placeholder="https://api.example.com/v1"
          />
        </div>
      </Section>

      <Section
        icon={<HardDrive className="h-4 w-4" />}
        title="同步与提醒"
        description="控制自动同步频率与到期提醒"
      >
        <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
          <span className="text-sm text-slate-700">自动同步</span>
          <input
            type="checkbox"
            checked={settings.sync.autoSync}
            onChange={(e) => update({ sync: { ...settings.sync, autoSync: e.target.checked } })}
            className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
          <span className="text-sm text-slate-700">启用到期提醒</span>
          <input
            type="checkbox"
            checked={settings.reminder.enabled}
            onChange={(e) => update({ reminder: { ...settings.reminder, enabled: e.target.checked } })}
            className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
          />
        </label>
      </Section>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <span className="text-xs text-slate-400">{dirty ? '修改后记得保存' : '设置已是最新'}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSettings(defaultSettings);
              setTestStatus(null);
            }}
          >
            恢复默认
          </Button>
          <Button size="sm" onClick={handleSave} loading={saving} icon={<Save className="h-4 w-4" />}>
            保存设置
          </Button>
        </div>
      </div>
    </div>
  );
}
