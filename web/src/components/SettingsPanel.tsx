import { useEffect, useState } from 'react';
import { X, TestTube } from 'lucide-react';
import { getSettings, putSettings } from '../db/appDb';
import { WebDAVClient } from '../sync/webdav';
import type { AppSettings } from '../types/coupon';

interface SettingsPanelProps {
  onClose: () => void;
}

const defaultSettings: AppSettings = {
  schemaVersion: 2,
  webdav: {
    url: '',
    username: '',
    password: '',
    rootPath: '/yhqgl/v2',
  },
  sync: { autoSync: true, syncIntervalMinutes: 15, syncOnWifiOnly: false },
  reminder: { enabled: true, remindDays: [7, 3, 1], quietStart: null, quietEnd: null },
  ai: { provider: 'agnes', apiKey: null, baseUrl: null, model: null },
};

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then((s) => s && setSettings(s));
  }, []);

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    putSettings(next);
  };

  const testConnection = async () => {
    setTestStatus('测试中...');
    try {
      const client = new WebDAVClient(settings.webdav);
      const ok = await client.mkcol(settings.webdav.rootPath.replace(/^\//, '')) && await client.exists('');
      setTestStatus(ok ? '连接成功' : '连接失败');
    } catch (e) {
      setTestStatus('连接失败：' + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">设置</h2>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="max-w-2xl space-y-8">
        <section>
          <h3 className="font-semibold text-gray-900 mb-4">WebDAV 同步</h3>
          <div className="space-y-3">
            <input
              value={settings.webdav.url}
              onChange={(e) => update({ webdav: { ...settings.webdav, url: e.target.value } })}
              placeholder="WebDAV 地址"
              className="w-full border rounded-lg px-3 py-2"
            />
            <input
              value={settings.webdav.username}
              onChange={(e) => update({ webdav: { ...settings.webdav, username: e.target.value } })}
              placeholder="用户名"
              className="w-full border rounded-lg px-3 py-2"
            />
            <input
              type="password"
              value={settings.webdav.password}
              onChange={(e) => update({ webdav: { ...settings.webdav, password: e.target.value } })}
              placeholder="密码"
              className="w-full border rounded-lg px-3 py-2"
            />
            <input
              value={settings.webdav.rootPath}
              onChange={(e) => update({ webdav: { ...settings.webdav, rootPath: e.target.value } })}
              placeholder="根目录"
              className="w-full border rounded-lg px-3 py-2"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={testConnection}
                className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                <TestTube className="w-4 h-4" /> 测试连接
              </button>
              {testStatus && <span className="text-sm text-gray-600">{testStatus}</span>}
            </div>
          </div>
        </section>

        <section>
          <h3 className="font-semibold text-gray-900 mb-4">AI 设置</h3>
          <div className="space-y-3">
            <input
              value={settings.ai.provider}
              onChange={(e) => update({ ai: { ...settings.ai, provider: e.target.value } })}
              placeholder="Provider，默认 agnes"
              className="w-full border rounded-lg px-3 py-2"
            />
            <input
              type="password"
              value={settings.ai.apiKey ?? ''}
              onChange={(e) => update({ ai: { ...settings.ai, apiKey: e.target.value || null } })}
              placeholder="API Key"
              className="w-full border rounded-lg px-3 py-2"
            />
            <input
              value={settings.ai.baseUrl ?? ''}
              onChange={(e) => update({ ai: { ...settings.ai, baseUrl: e.target.value || null } })}
              placeholder="Base URL（可选）"
              className="w-full border rounded-lg px-3 py-2"
            />
            <input
              value={settings.ai.model ?? ''}
              onChange={(e) => update({ ai: { ...settings.ai, model: e.target.value || null } })}
              placeholder="模型（可选）"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
        </section>

        <section>
          <h3 className="font-semibold text-gray-900 mb-4">同步与提醒</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.sync.autoSync}
                onChange={(e) => update({ sync: { ...settings.sync, autoSync: e.target.checked } })}
              />
              自动同步
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.reminder.enabled}
                onChange={(e) => update({ reminder: { ...settings.reminder, enabled: e.target.checked } })}
              />
              启用到期提醒
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}
