import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  Edit3,
  Percent,
  Plus,
  RotateCcw,
  Store,
  Ticket,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { Coupon } from '../types/coupon';
import { deleteCouponLocal, putCoupon, SyncConflictError } from '../db/appDb';
import { bumpVersion } from '../sync/syncEngine';
import { extractStore, isExpired, remainingDays, statusLabel } from '../rules/couponRules';
import { notifyDataChanged } from '../lib/dataBus';
import { useCoupons } from '../hooks/useCoupons';
import { Badge, Button, Card, EmptyState, IconButton, Modal, Skeleton, useToast } from './ui';
import { CouponForm } from './CouponForm';

interface CouponDetailProps {
  couponId: string | null;
  onClose: () => void;
  onChange: () => void;
  onSelect?: (id: string) => void;
}

function discountText(coupon: Coupon): string {
  switch (coupon.discountType) {
    case 'amount':
      return `立减 ¥${coupon.discountAmount ?? 0}`;
    case 'percentage':
      return `${coupon.discountAmount ?? 0} 折`;
    case 'full':
      return `满 ¥${coupon.fullAmount ?? 0} 减 ¥${coupon.discountAmount ?? 0}`;
    case 'group':
      return '团购券';
    default:
      return '无门槛';
  }
}

function MetaItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-3.5">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <span className="text-slate-400" aria-hidden>
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-1.5 text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function Overview({ onAdd, onSelect }: { onAdd: () => void; onSelect: (id: string) => void }) {
  const { coupons, loading } = useCoupons();
  const active = coupons.filter((c) => !c.isUsed && !isExpired(c));
  const pendingAmount = active.reduce((sum, c) => sum + (c.discountAmount ?? 0), 0);
  const usedAmount = coupons
    .filter((c) => c.isUsed)
    .reduce((sum, c) => sum + (c.discountAmount ?? 0), 0);
  const within7 = active.filter((c) => remainingDays(c) <= 7).length;
  const soon = [...active].sort((a, b) => remainingDays(a) - remainingDays(b)).slice(0, 4);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Skeleton className="h-36" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="scroll-area h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl p-4 lg:p-6">
        <div className="rounded-2xl bg-gradient-to-br from-rose-600 via-rose-500 to-orange-400 p-5 text-white lg:p-6">
          <p className="text-sm text-white/80">{greeting()}</p>
          <p className="mt-1 text-2xl font-semibold">
            {active.length > 0 ? `${active.length} 张优惠券待使用` : '目前没有待使用的优惠券'}
          </p>
          <p className="mt-1 text-sm text-white/85">
            {active.length > 0
              ? `合计可省 ¥${pendingAmount.toFixed(0)}${within7 > 0 ? `，其中 ${within7} 张 7 天内到期` : ''}`
              : '添加一张优惠券，开始记录你的每一笔优惠'}
          </p>
          <button
            onClick={onAdd}
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/95 px-3.5 text-sm font-medium text-rose-700 transition-colors hover:bg-white"
          >
            <Plus className="h-4 w-4" aria-hidden />
            添加优惠券
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card className="p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Wallet className="h-3.5 w-3.5" aria-hidden />
              待使用金额
            </div>
            <p className="tabular mt-1 text-xl font-semibold text-slate-900">¥{pendingAmount.toFixed(0)}</p>
          </Card>
          <Card className="p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
              已省金额
            </div>
            <p className="tabular mt-1 text-xl font-semibold text-emerald-600">¥{usedAmount.toFixed(0)}</p>
          </Card>
          <Card className="p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Clock3 className="h-3.5 w-3.5" aria-hidden />
              7 天内到期
            </div>
            <p className="tabular mt-1 text-xl font-semibold text-amber-600">{within7} 张</p>
          </Card>
        </div>

        <Card className="mt-4 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">即将到期</h3>
            <span className="text-xs text-slate-400">按剩余天数排序</span>
          </div>
          {soon.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">暂无即将到期的优惠券</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {soon.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => onSelect(c.id)}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{c.title}</p>
                      <p className="text-xs text-slate-400">
                        到期 {c.endDate} {String(c.endHour ?? 23).padStart(2, '0')}:
                        {String(c.endMinute ?? 59).padStart(2, '0')}
                      </p>
                    </div>
                    <Badge tone={remainingDays(c) <= 3 ? 'danger' : remainingDays(c) <= 7 ? 'warning' : 'neutral'}>
                      {remainingDays(c) <= 0 ? '今天' : `${remainingDays(c)} 天`}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

export function CouponDetail({ couponId, onClose, onChange, onSelect }: CouponDetailProps) {
  const { coupons, loading } = useCoupons();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // Esc 退回列表。桌面端常用，比找右上角按钮顺手
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (editing || confirmDelete) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, confirmDelete, onClose]);

  if (couponId === 'new') {
    return (
      <div className="scroll-area h-full overflow-y-auto p-4 lg:p-6">
        <CouponForm
          coupon={undefined}
          onCancel={() => {
            onClose();
            onChange();
          }}
          onSaved={() => {
            onClose();
            onChange();
            showToast('优惠券已创建', 'success');
          }}
        />
      </div>
    );
  }

  if (!couponId) {
    return <Overview onAdd={() => onSelect?.('new')} onSelect={(id) => onSelect?.(id)} />;
  }

  if (loading && !coupons.some((c) => c.id === couponId)) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-7 w-2/5" />
        <Skeleton className="h-4 w-1/3" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-28" />
      </div>
    );
  }

  const coupon = coupons.find((c) => c.id === couponId);

  if (!coupon) {
    return (
      <EmptyState
        icon={<Ticket className="h-6 w-6" />}
        title="优惠券不存在或已被删除"
        description="可能已在其他设备上删除，返回列表刷新即可。"
        action={
          <Button size="sm" variant="secondary" onClick={onClose}>
            返回列表
          </Button>
        }
      />
    );
  }

  const status = statusLabel(coupon);

  const handleToggleUsed = async () => {
    setBusy(true);
    try {
      const updated = await bumpVersion({ ...coupon, isUsed: !coupon.isUsed });
      await putCoupon(updated);
      notifyDataChanged();
      showToast(coupon.isUsed ? '已标记为未使用' : '已标记为已使用', 'success');
      onChange();
    } catch (e) {
      showToast(
        e instanceof SyncConflictError
          ? '这张券已在别的设备上被修改过，已为你刷新到最新状态。'
          : e instanceof Error
            ? e.message
            : '操作失败',
        'error',
      );
      if (e instanceof SyncConflictError) onChange();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await deleteCouponLocal(coupon.id);
      notifyDataChanged();
      setConfirmDelete(false);
      showToast('优惠券已删除', 'success');
      onClose();
      onChange();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '删除失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="scroll-area h-full overflow-y-auto p-4 lg:p-6">
        <CouponForm
          coupon={coupon}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            notifyDataChanged();
            showToast('修改已保存', 'success');
          }}
        />
      </div>
    );
  }

  return (
    <div className="scroll-area h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl p-4 lg:p-6">
        {/* 返回入口：之前只写了 lg:hidden，桌面宽度下被藏起来，导致详情页没有退路 */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            返回列表
          </button>
          <span className="hidden text-xs text-slate-400 lg:inline">按 Esc 也可以返回</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">{coupon.title}</h2>
              <Badge tone={status.tone}>{status.text}</Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Store className="h-4 w-4" aria-hidden />
              {extractStore(coupon.title)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing(true)}
              icon={<Edit3 className="h-4 w-4" />}
            >
              编辑
            </Button>
            <IconButton label="删除优惠券" onClick={() => setConfirmDelete(true)} className="text-rose-500 hover:bg-rose-50">
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        <Card className="mt-5 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-dashed border-slate-200 bg-gradient-to-r from-rose-50 to-white px-5 py-4">
            <div>
              <p className="text-xs text-slate-500">优惠内容</p>
              <p className="tabular mt-1 text-2xl font-bold text-rose-600">{discountText(coupon)}</p>
            </div>
            <Ticket className="h-9 w-9 text-rose-200" aria-hidden />
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <MetaItem
              icon={<Clock3 className="h-3.5 w-3.5" />}
              label="到期时间"
              value={`${coupon.endDate} ${String(coupon.endHour ?? 23).padStart(2, '0')}:${String(
                coupon.endMinute ?? 59,
              ).padStart(2, '0')}`}
            />
            <MetaItem
              icon={<CalendarDays className="h-3.5 w-3.5" />}
              label="开始日期"
              value={coupon.startDate}
            />
            <MetaItem
              icon={<Percent className="h-3.5 w-3.5" />}
              label="折扣类型"
              value={
                coupon.discountType === 'amount'
                  ? '减免金额'
                  : coupon.discountType === 'percentage'
                    ? '折扣比例'
                    : coupon.discountType === 'full'
                      ? '满减优惠'
                      : coupon.discountType === 'group'
                        ? '团购券'
                        : '未设置'
              }
            />
            <MetaItem
              icon={<Check className="h-3.5 w-3.5" />}
              label="使用状态"
              value={coupon.isUsed ? '已使用' : isExpired(coupon) ? '已过期未使用' : '待使用'}
            />
          </div>
        </Card>

        {(coupon.tags ?? []).length > 0 && (
          <Card className="mt-4 p-4">
            <h3 className="text-sm font-semibold text-slate-800">标签</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {coupon.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          </Card>
        )}

        {(coupon.description || coupon.notes) && (
          <div className="mt-4 space-y-3">
            {coupon.description && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-slate-800">描述</h3>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-600">{coupon.description}</p>
              </Card>
            )}
            {coupon.notes && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-slate-800">备注</h3>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-600">{coupon.notes}</p>
              </Card>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            onClick={handleToggleUsed}
            loading={busy}
            icon={coupon.isUsed ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          >
            {coupon.isUsed ? '标记为未使用' : '标记为已使用'}
          </Button>
          <Button variant="danger" onClick={() => setConfirmDelete(true)} icon={<Trash2 className="h-4 w-4" />}>
            删除
          </Button>
          {/* 手机上滚到最底部时，返回入口也在拇指够得着的地方 */}
          <Button
            variant="ghost"
            onClick={onClose}
            icon={<ArrowLeft className="h-4 w-4" />}
            className="lg:hidden"
          >
            返回列表
          </Button>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          创建于 {coupon.createdAt?.slice(0, 10)}
          {coupon.updatedAt ? ` · 更新于 ${coupon.updatedAt.slice(0, 10)}` : ''}
        </p>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="删除这张优惠券？"
        description="删除后将从云端和本地同时移除，且无法恢复。"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              取消
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={busy}>
              确认删除
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          即将删除：<span className="font-medium text-slate-900">{coupon.title}</span>
        </p>
      </Modal>
    </div>
  );
}
