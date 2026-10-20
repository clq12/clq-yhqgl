import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { sync } from '../sync/syncEngine';

export function SyncStatusBar() {
  const [status, setStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const doSync = async () => {
    setStatus('syncing');
    setMessage(null);
    const result = await sync();
    if (result.success) {
      setStatus('idle');
      setLastAt(result.checkpoint?.lastSyncAt || null);
    } else if (result.error?.includes('WebDAV 未配置')) {
      // WebDAV 未配置时（例如已使用云服务），不显示错误
      setStatus('idle');
      setMessage('WebDAV 未配置');
    } else {
      setStatus('error');
      setMessage(result.error || null);
    }
  };

  useEffect(() => {
    doSync();
    const id = setInterval(doSync, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <button
      onClick={doSync}
      title={message ?? '同步'}
      className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50"
    >
      <RefreshCw className={`w-4 h-4 ${status === 'syncing' ? 'animate-spin' : ''}`} />
      <span>
        {status === 'syncing' ? '同步中' : status === 'error' ? '同步失败' : '同步'}
      </span>
      {lastAt && <span className="text-gray-400">({new Date(lastAt).toLocaleTimeString()})</span>}
    </button>
  );
}
