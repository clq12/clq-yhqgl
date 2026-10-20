import { useState } from 'react';
import { X } from 'lucide-react';
import type { Coupon, DiscountType } from '../types/coupon';
import { beijingNow } from '../rules/couponRules';

interface CouponFormProps {
  coupon?: Coupon;
  onSave: (coupon: Coupon) => void;
  onCancel: () => void;
}

export function CouponForm({ coupon, onSave, onCancel }: CouponFormProps) {
  const isEdit = !!coupon;
  const [title, setTitle] = useState(coupon?.title ?? '');
  const [description, setDescription] = useState(coupon?.description ?? '');
  const [discountType, setDiscountType] = useState<DiscountType | ''>(coupon?.discountType ?? '');
  const [discountAmount, setDiscountAmount] = useState(coupon?.discountAmount?.toString() ?? '');
  const [fullAmount, setFullAmount] = useState(coupon?.fullAmount?.toString() ?? '');
  const [startDate, setStartDate] = useState(coupon?.startDate ?? beijingNow().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(
    coupon?.endDate ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  );
  const [endHour, setEndHour] = useState(coupon?.endHour ?? 23);
  const [endMinute, setEndMinute] = useState(coupon?.endMinute ?? 59);
  const [notes, setNotes] = useState(coupon?.notes ?? '');

  const handleSubmit = () => {
    const payload: Coupon = {
      id: coupon?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim() || null,
      discountType: (discountType as DiscountType) || null,
      discountAmount: discountType && discountType !== 'group' ? parseFloat(discountAmount) || null : null,
      fullAmount: discountType === 'full' ? parseFloat(fullAmount) || null : null,
      startDate,
      endDate,
      endHour,
      endMinute,
      isReminded: coupon?.isReminded ?? false,
      remindedDays: coupon?.remindedDays ?? [],
      isUsed: coupon?.isUsed ?? false,
      notes: notes.trim() || null,
      createdAt: coupon?.createdAt ?? beijingNow().toISOString(),
      updatedAt: beijingNow().toISOString(),
      version: coupon?.version ?? null,
      modifiedAt: beijingNow().toISOString(),
    };
    onSave(payload);
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">{isEdit ? '编辑优惠券' : '添加优惠券'}</h2>
        <button onClick={onCancel} className="p-2 rounded-lg hover:bg-gray-100">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4 max-w-2xl">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">标题 *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">折扣类型</label>
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as DiscountType | '')}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="">不设置</option>
              <option value="amount">减免金额</option>
              <option value="percentage">折扣比例</option>
              <option value="full">满减优惠</option>
              <option value="group">团购券</option>
            </select>
          </div>
          {discountType === 'full' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">满金额</label>
              <input
                type="number"
                value={fullAmount}
                onChange={(e) => setFullAmount(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
          )}
        </div>

        {discountType && discountType !== 'group' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {discountType === 'percentage' ? '折扣比例' : '减免金额'}
            </label>
            <input
              type="number"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">截止日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">截止时</label>
            <input
              type="number"
              min={0}
              max={23}
              value={endHour}
              onChange={(e) => setEndHour(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">截止分</label>
            <input
              type="number"
              min={0}
              max={59}
              value={endMinute}
              onChange={(e) => setEndMinute(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button onClick={onCancel} className="flex-1 py-2 border rounded-lg hover:bg-gray-50">取消</button>
          <button onClick={handleSubmit} className="flex-1 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
