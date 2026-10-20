import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { listCoupons } from '../db/indexedDB';
import type { Coupon } from '../types/coupon';
import { isExpired, extractStore } from '../rules/couponRules';

interface StatDashboardProps {
  onClose: () => void;
}

export function StatDashboard({ onClose }: StatDashboardProps) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  useEffect(() => {
    listCoupons().then(setCoupons);
  }, []);

  const total = coupons.reduce((sum, c) => sum + (c.discountAmount ?? 0), 0);
  const used = coupons.filter((c) => c.isUsed).reduce((sum, c) => sum + (c.discountAmount ?? 0), 0);
  const unused = total - used;
  const usedCount = coupons.filter((c) => c.isUsed).length;
  const activeCount = coupons.filter((c) => !c.isUsed && !isExpired(c)).length;
  const expiredCount = coupons.filter((c) => !c.isUsed && isExpired(c)).length;

  const storeMap = new Map<string, { amount: number; count: number; used: number }>();
  for (const c of coupons) {
    const name = extractStore(c.title);
    const prev = storeMap.get(name) ?? { amount: 0, count: 0, used: 0 };
    prev.amount += c.discountAmount ?? 0;
    prev.count += 1;
    if (c.isUsed) prev.used += 1;
    storeMap.set(name, prev);
  }
  const stores = Array.from(storeMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  return (
    <div className="h-full overflow-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">统计分析</h2>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="p-4 bg-blue-50 rounded-xl">
          <div className="text-2xl font-bold text-blue-600">¥{total.toFixed(0)}</div>
          <div className="text-sm text-gray-600">总优惠</div>
        </div>
        <div className="p-4 bg-green-50 rounded-xl">
          <div className="text-2xl font-bold text-green-600">¥{used.toFixed(0)}</div>
          <div className="text-sm text-gray-600">已使用</div>
        </div>
        <div className="p-4 bg-orange-50 rounded-xl">
          <div className="text-2xl font-bold text-orange-600">¥{unused.toFixed(0)}</div>
          <div className="text-sm text-gray-600">待使用</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="p-4 bg-gray-50 rounded-xl text-center">
          <div className="text-2xl font-bold">{usedCount}</div>
          <div className="text-sm text-gray-600">已使用</div>
        </div>
        <div className="p-4 bg-gray-50 rounded-xl text-center">
          <div className="text-2xl font-bold">{activeCount}</div>
          <div className="text-sm text-gray-600">未使用</div>
        </div>
        <div className="p-4 bg-gray-50 rounded-xl text-center">
          <div className="text-2xl font-bold">{expiredCount}</div>
          <div className="text-sm text-gray-600">已过期</div>
        </div>
      </div>

      <h3 className="font-semibold text-gray-900 mb-4">店铺排行榜 TOP 10</h3>
      <div className="space-y-2">
        {stores.map((s, idx) => (
          <div key={s.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 text-sm font-bold">
                {idx + 1}
              </span>
              <span>{s.name}（{s.count}张，已用{s.used}张）</span>
            </div>
            <span className="font-bold text-green-600">¥{s.amount.toFixed(0)}</span>
          </div>
        ))}
        {stores.length === 0 && <div className="text-gray-400 text-sm">暂无数据</div>}
      </div>
    </div>
  );
}
