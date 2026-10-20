import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { sync } from '../sync/syncEngine';

export function SyncStatusBar() {
  const [status, setStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [lastAt, setLastAt] = useState<string | null>(null);

  const doSync = async () => {
    setStatus('syncing');
    const result = await sync();
    if (result.success) {
      setStatus('idle');
      setLastAt(result.checkpoint?.lastSyncAt || null);
    } else {
      setStatus('error');
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
