import { useMemo, useState } from 'react';
import { Clock3, Plus, Search, Ticket, X } from 'lucide-react';
import type { Coupon } from '../types/coupon';
import { useCoupons } from '../hooks/useCoupons';
import { discountLabel, statusLabel, extractStore, isExpired } from '../rules/couponRules';
import { Badge, Button, EmptyState, ListSkeleton, Tabs, type TabItem } from './ui';

interface CouponListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

type FilterKey = 'active' | 'all' | 'used' | 'expired';
type SortKey = 'deadline' | 'recent' | 'amount';

function statusOf(coupon: Coupon) {
  return statusLabel(coupon);
}

function CouponRow({
  coupon,
  active,
  onSelect,
}: {
  coupon: Coupon;
  active: boolean;
  onSelect: () => void;
}) {
  const status = statusOf(coupon);
  const store = extractStore(coupon.title);
  const hour = String(coupon.endHour ?? 23).padStart(2, '0');
  const minute = String(coupon.endMinute ?? 59).padStart(2, '0');

  return (
    <button
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={`w-full border-b border-slate-100 p-3.5 text-left transition-colors ${
        active ? 'bg-rose-50/70' : 'hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{coupon.title}</p>
          <p className="mt-1 text-xs text-slate-500">
            {store} · 到期 {coupon.endDate} {hour}:{minute}
          </p>
        </div>
        <Badge tone={status.tone}>{status.text}</Badge>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="tabular text-sm font-semibold text-rose-600">{discountLabel(coupon)}</span>
        {coupon.description && (
          <span className="truncate text-xs text-slate-400">{coupon.description}</span>
        )}
      </div>
    </button>
  );
}

export function CouponList({ selectedId, onSelect }: CouponListProps) {
  const { coupons, loading } = useCoupons();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('active');
  const [sort, setSort] = useState<SortKey>('deadline');

  const counts = useMemo(() => {
    let active = 0;
    let used = 0;
    let expired = 0;
    for (const c of coupons) {
      if (c.isUsed) used += 1;
      else if (isExpired(c)) expired += 1;
      else active += 1;
    }
    return { all: coupons.length, active, used, expired };
  }, [coupons]);

  const tabs: TabItem<FilterKey>[] = [
    { value: 'active', label: '待使用', count: counts.active },
    { value: 'all', label: '全部', count: counts.all },
    { value: 'used', label: '已使用', count: counts.used },
    { value: 'expired', label: '已过期', count: counts.expired },
  ];

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    let list = coupons.filter((c) => {
      if (filter === 'active' && (c.isUsed || isExpired(c))) return false;
      if (filter === 'used' && !c.isUsed) return false;
      if (filter === 'expired' && (c.isUsed || !isExpired(c))) return false;
      if (!keyword) return true;
      return (
        c.title.toLowerCase().includes(keyword) ||
        (c.description ?? '').toLowerCase().includes(keyword) ||
        (c.notes ?? '').toLowerCase().includes(keyword)
      );
    });

    list = [...list].sort((a, b) => {
      if (sort === 'recent') {
        return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
      }
      if (sort === 'amount') {
        return (b.discountAmount ?? 0) - (a.discountAmount ?? 0);
      }
      return a.endDate.localeCompare(b.endDate);
    });

    return list;
  }, [coupons, filter, search, sort]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-slate-100 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">优惠券列表</p>
            <p className="mt-0.5 text-xs text-slate-500">
              共 {counts.all} 张 · 待使用 {counts.active} 张
            </p>
          </div>
          <Button size="sm" onClick={() => onSelect('new')} icon={<Plus className="h-4 w-4" />}>
            添加
          </Button>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题、描述或备注"
            aria-label="搜索优惠券"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-9 text-sm placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/25"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="清除搜索"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Tabs items={tabs} value={filter} onChange={setFilter} ariaLabel="优惠券筛选" />
          <label className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
            <span className="sr-only">排序方式</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 focus:border-rose-500 focus:outline-none"
            >
              <option value="deadline">按到期时间</option>
              <option value="recent">按添加时间</option>
              <option value="amount">按优惠金额</option>
            </select>
          </label>
        </div>
      </div>

      <div className="scroll-area min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <ListSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          search ? (
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title="没有匹配的优惠券"
              description={`没有找到包含「${search}」的记录，换个关键词试试。`}
            />
          ) : (
            <EmptyState
              icon={<Ticket className="h-6 w-6" />}
              title={filter === 'active' ? '还没有待使用的优惠券' : '这里还没有记录'}
              description="添加第一张优惠券，到期前会自动提醒你。"
              action={
                <Button size="sm" onClick={() => onSelect('new')} icon={<Plus className="h-4 w-4" />}>
                  添加优惠券
                </Button>
              }
            />
          )
        ) : (
          <ul>
            {filtered.map((c) => (
              <li key={c.id}>
                <CouponRow coupon={c} active={selectedId === c.id} onSelect={() => onSelect(c.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
        <Clock3 className="mr-1 inline h-3 w-3" aria-hidden />
        截止时间按北京时间计算
      </div>
    </div>
  );
}
