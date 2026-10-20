import { useMemo } from 'react';
import { AlertTriangle, Clock3, Store, Ticket, TrendingUp, Wallet } from 'lucide-react';
import { useCoupons } from '../hooks/useCoupons';
import { extractStore, isExpired, remainingDays } from '../rules/couponRules';
import { Badge, Card, EmptyState, Skeleton } from './ui';

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone: 'brand' | 'emerald' | 'amber' | 'slate';
}) {
  const tones = {
    brand: 'bg-rose-50 text-rose-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-100 text-slate-500',
  } as const;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="tabular mt-1 text-2xl font-semibold text-slate-900">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`} aria-hidden>
          {icon}
        </div>
      </div>
    </Card>
  );
}

export function StatDashboard() {
  const { coupons, loading } = useCoupons();

  const stats = useMemo(() => {
    let total = 0;
    let used = 0;
    let active = 0;
    let expired = 0;
    const storeMap = new Map<string, { amount: number; count: number; used: number }>();

    for (const c of coupons) {
      const amount = c.discountAmount ?? 0;
      total += amount;
      if (c.isUsed) used += amount;
      if (c.isUsed) {
        // used count handled below
      } else if (isExpired(c)) {
        expired += 1;
      } else {
        active += 1;
      }

      const name = extractStore(c.title);
      const prev = storeMap.get(name) ?? { amount: 0, count: 0, used: 0 };
      prev.amount += amount;
      prev.count += 1;
      if (c.isUsed) prev.used += 1;
      storeMap.set(name, prev);
    }

    const stores = Array.from(storeMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    const soon = coupons
      .filter((c) => !c.isUsed && !isExpired(c))
      .map((c) => ({ coupon: c, days: remainingDays(c) }))
      .sort((a, b) => a.days - b.days)
      .slice(0, 5);

    return {
      total,
      used,
      unused: Math.max(total - used, 0),
      active,
      expired,
      usedCount: coupons.filter((c) => c.isUsed).length,
      stores,
      soon,
    };
  }, [coupons]);

  const maxStore = stats.stores[0]?.amount || 1;

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px]" />
          ))}
        </div>
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  if (coupons.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp className="h-6 w-6" />}
        title="还没有统计数据"
        description="添加优惠券后，这里会展示优惠金额、使用情况与店铺分布。"
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<Wallet className="h-5 w-5" />}
          label="优惠总额"
          value={`¥${stats.total.toFixed(0)}`}
          hint={`共 ${coupons.length} 张优惠券`}
          tone="brand"
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="已使用"
          value={`¥${stats.used.toFixed(0)}`}
          hint={`${stats.usedCount} 张已核销`}
          tone="emerald"
        />
        <KpiCard
          icon={<Ticket className="h-5 w-5" />}
          label="待使用"
          value={`¥${stats.unused.toFixed(0)}`}
          hint={`${stats.active} 张仍有效`}
          tone="amber"
        />
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="已过期"
          value={`${stats.expired}`}
          hint="未使用且已过截止时间"
          tone="slate"
        />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">状态分布</h3>
          <span className="text-xs text-slate-400">共 {coupons.length} 张</span>
        </div>
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="bg-emerald-500"
            style={{ width: `${(stats.usedCount / coupons.length) * 100}%` }}
            aria-hidden
          />
          <div
            className="bg-amber-400"
            style={{ width: `${(stats.active / coupons.length) * 100}%` }}
            aria-hidden
          />
          <div
            className="bg-slate-300"
            style={{ width: `${(stats.expired / coupons.length) * 100}%` }}
            aria-hidden
          />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden /> 已使用 {stats.usedCount}
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full bg-amber-400" aria-hidden /> 待使用 {stats.active}
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full bg-slate-300" aria-hidden /> 已过期 {stats.expired}
          </span>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center gap-1.5">
            <Store className="h-4 w-4 text-slate-400" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-800">店铺排行 TOP {stats.stores.length}</h3>
          </div>
          <ul className="mt-3 space-y-2.5">
            {stats.stores.map((s, index) => (
              <li key={s.name}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="tabular flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 text-[11px] font-semibold text-slate-500">
                      {index + 1}
                    </span>
                    <span className="truncate text-slate-700">{s.name}</span>
                    <span className="shrink-0 text-xs text-slate-400">{s.count} 张</span>
                  </span>
                  <span className="tabular shrink-0 font-medium text-slate-900">¥{s.amount.toFixed(0)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-rose-500"
                    style={{ width: `${Math.max((s.amount / maxStore) * 100, 4)}%` }}
                    aria-hidden
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-1.5">
            <Clock3 className="h-4 w-4 text-slate-400" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-800">即将到期</h3>
          </div>
          {stats.soon.length === 0 ? (
            <p className="mt-6 text-sm text-slate-400">暂无即将到期的优惠券</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {stats.soon.map(({ coupon, days }) => (
                <li key={coupon.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{coupon.title}</p>
                    <p className="text-xs text-slate-400">到期 {coupon.endDate}</p>
                  </div>
                  <Badge tone={days <= 3 ? 'danger' : days <= 7 ? 'warning' : 'neutral'}>
                    {days <= 0 ? '今天' : `${days} 天`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
