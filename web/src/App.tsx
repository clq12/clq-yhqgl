import { useEffect, useState } from 'react';
import { initDB } from './db/indexedDB';
import { SyncStatusBar } from './components/SyncStatusBar';
import { CouponList } from './components/CouponList';
import { CouponDetail } from './components/CouponDetail';
import { SettingsPanel } from './components/SettingsPanel';
import { AIPanel } from './components/AIPanel';
import { BarChart3, Settings as SettingsIcon } from 'lucide-react';

function App() {
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    initDB().then(() => setReady(true));
  }, []);

  if (!ready) {
    return <div className="p-8">初始化中...</div>;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between shrink-0">
        <h1 className="text-xl font-bold text-gray-900">优惠券管理</h1>
        <div className="flex items-center gap-3">
          <SyncStatusBar />
          <button
            onClick={() => { setShowStats(true); setShowSettings(false); }}
            className="p-2 rounded-lg border hover:bg-gray-50"
            title="统计"
          >
            <BarChart3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setShowSettings(true); setShowStats(false); }}
            className="p-2 rounded-lg border hover:bg-gray-50"
            title="设置"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
          <AIPanel onSelectCoupon={setSelectedId} />
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-4">
        {showSettings ? (
          <SettingsPanel onClose={() => setShowSettings(false)} />
        ) : (
          <div className="h-full flex gap-4">
            <div className="w-1/3 min-w-[320px] bg-white rounded-xl shadow-sm overflow-hidden">
              <CouponList selectedId={selectedId} onSelect={setSelectedId} />
            </div>
            <div className="flex-1 bg-white rounded-xl shadow-sm overflow-hidden">
              <CouponDetail
                couponId={selectedId}
                showStats={showStats}
                onCloseStats={() => setShowStats(false)}
                onChange={() => setSelectedId(null)}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
