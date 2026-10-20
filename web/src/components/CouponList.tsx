import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { Coupon } from '../types/coupon';
import { listCoupons } from '../db/indexedDB';
import { isExpired, remainingDays } from '../rules/couponRules';

interface CouponListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function CouponList({ selectedId, onSelect }: CouponListProps) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    listCoupons().then(setCoupons);
  }, []);

  const filtered = coupons
    .filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.endDate.localeCompare(b.endDate));

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">优惠券列表</h2>
          <button
            onClick={() => onSelect('new')}
            className="p-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题..."
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-gray-500 text-center text-sm">暂无优惠券</div>
        ) : (
          <ul className="divide-y">
            {filtered.map((c) => {
              const expired = isExpired(c);
              const days = remainingDays(c);
              let statusClass = 'text-green-600';
              let statusText = `剩余 ${days} 天`;
              if (c.isUsed) {
                statusClass = 'text-gray-400';
                statusText = '已使用';
              } else if (expired) {
                statusClass = 'text-red-600';
                statusText = '已过期';
              } else if (days <= 3) {
                statusClass = 'text-orange-600';
              }

              return (
                <li
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 ${selectedId === c.id ? 'bg-rose-50' : ''}`}
                >
                  <div className="font-medium text-gray-900">{c.title}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    到期：{c.endDate} {String(c.endHour ?? 23).padStart(2, '0')}:{String(c.endMinute ?? 59).padStart(2, '0')}
                  </div>
                  <div className={`text-xs mt-1 ${statusClass}`}>{statusText}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
