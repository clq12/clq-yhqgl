import { useEffect, useState } from 'react';
import { deleteCouponLocal, getCoupon, putCoupon } from '../db/appDb';
import { bumpVersion, sync } from '../sync/syncEngine';
import type { Coupon } from '../types/coupon';
import { StatDashboard } from './StatDashboard';
import { CouponForm } from './CouponForm';
import { isExpired, remainingDays, validateCoupon } from '../rules/couponRules';
import { Trash2, Check, RotateCcw, Edit3 } from 'lucide-react';

interface CouponDetailProps {
  couponId: string | null;
  showStats: boolean;
  onCloseStats: () => void;
  onChange: () => void;
}

export function CouponDetail({ couponId, showStats, onCloseStats, onChange }: CouponDetailProps) {
  const [coupon, setCoupon] = useState<Coupon | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (couponId && couponId !== 'new') {
      getCoupon(couponId).then(setCoupon);
      setEditing(false);
    } else if (couponId === 'new') {
      setCoupon(undefined);
      setEditing(true);
    } else {
      setCoupon(undefined);
      setEditing(false);
    }
  }, [couponId]);

  if (showStats) {
    return <StatDashboard onClose={onCloseStats} />;
  }

  if (editing) {
    return (
      <CouponForm
        coupon={coupon}
        onSave={async (c) => {
          const validation = validateCoupon(c);
          if (!validation.ok) {
            setMessage(validation.error);
            return;
          }
          const withVersion = await bumpVersion(c);
          await putCoupon(withVersion);
          await sync();
          setEditing(false);
          onChange();
        }}
        onCancel={() => {
          setEditing(false);
          if (couponId === 'new') onChange();
        }}
      />
    );
  }

  if (!coupon) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        选择左侧优惠券查看详情，或点击右上角添加
      </div>
    );
  }

  const expired = isExpired(coupon);
  const days = remainingDays(coupon);

  return (
    <div className="h-full overflow-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{coupon.title}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border hover:bg-gray-50"
          >
            <Edit3 className="w-4 h-4" /> 编辑
          </button>
          <button
            onClick={async () => {
              if (!confirm('确定删除？')) return;
              await deleteCouponLocal(coupon.id);
              await sync();
              onChange();
            }}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" /> 删除
          </button>
        </div>
      </div>

      {message && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{message}</div>}

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-500">状态</div>
          <div className="font-medium">
            {coupon.isUsed ? '已使用' : expired ? '已过期' : `剩余 ${days} 天`}
          </div>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-500">到期时间</div>
          <div className="font-medium">
            {coupon.endDate} {String(coupon.endHour ?? 23).padStart(2, '0')}:{String(coupon.endMinute ?? 59).padStart(2, '0')}
          </div>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-500">折扣</div>
          <div className="font-medium">
            {coupon.discountType === 'amount' && `减 ¥${coupon.discountAmount}`}
            {coupon.discountType === 'percentage' && `${coupon.discountAmount} 折`}
            {coupon.discountType === 'full' && `满 ¥${coupon.fullAmount} 减 ¥${coupon.discountAmount}`}
            {coupon.discountType === 'group' && '团购券'}
            {!coupon.discountType && '无'}
          </div>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-500">开始日期</div>
          <div className="font-medium">{coupon.startDate}</div>
        </div>
      </div>

      {coupon.description && (
        <div className="mb-6">
          <h3 className="font-medium text-gray-700 mb-2">描述</h3>
          <p className="text-gray-600 whitespace-pre-wrap">{coupon.description}</p>
        </div>
      )}

      {coupon.notes && (
        <div className="mb-6">
          <h3 className="font-medium text-gray-700 mb-2">备注</h3>
          <p className="text-gray-600 whitespace-pre-wrap">{coupon.notes}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={async () => {
            const updated = await bumpVersion({ ...coupon, isUsed: !coupon.isUsed });
            await putCoupon(updated);
            await sync();
            setCoupon(updated);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700"
        >
          {coupon.isUsed ? <RotateCcw className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          {coupon.isUsed ? '标记未使用' : '标记已使用'}
        </button>
      </div>
    </div>
  );
}
