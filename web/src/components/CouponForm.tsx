import { useState } from 'react';
import { AlertCircle, Save, X } from 'lucide-react';
import type { Coupon, DiscountType } from '../types/coupon';
import { beijingNow } from '../rules/couponRules';
import { putCoupon, SyncConflictError } from '../db/appDb';
import { bumpVersion } from '../sync/syncEngine';
import { notifyDataChanged } from '../lib/dataBus';
import { Button, Card, Input, Select, Textarea, useToast } from './ui';

interface CouponFormProps {
  coupon?: Coupon;
  onCancel: () => void;
  onSaved: (coupon: Coupon) => void;
}

type Errors = Partial<Record<'title' | 'endDate' | 'discountAmount' | 'fullAmount', string>>;

function todayISO(): string {
  return beijingNow().toISOString().slice(0, 10);
}

function plusDaysISO(days: number): string {
  const d = beijingNow();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function CouponForm({ coupon, onCancel, onSaved }: CouponFormProps) {
  const isEdit = !!coupon;
  const { showToast } = useToast();

  const [title, setTitle] = useState(coupon?.title ?? '');
  const [description, setDescription] = useState(coupon?.description ?? '');
  const [discountType, setDiscountType] = useState<DiscountType | ''>(coupon?.discountType ?? '');
  const [discountAmount, setDiscountAmount] = useState(
    coupon?.discountAmount != null ? String(coupon.discountAmount) : '',
  );
  const [fullAmount, setFullAmount] = useState(
    coupon?.fullAmount != null ? String(coupon.fullAmount) : '',
  );
  const [startDate, setStartDate] = useState(coupon?.startDate ?? todayISO());
  const [endDate, setEndDate] = useState(coupon?.endDate ?? plusDaysISO(30));
  const [endHour, setEndHour] = useState(coupon?.endHour ?? 23);
  const [endMinute, setEndMinute] = useState(coupon?.endMinute ?? 59);
  const [notes, setNotes] = useState(coupon?.notes ?? '');

  const [errors, setErrors] = useState<Errors>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const validate = (): Errors => {
    const next: Errors = {};
    if (!title.trim()) next.title = '请填写优惠券标题';
    if (endDate < startDate) next.endDate = '截止日期不能早于开始日期';

    const needsAmount = discountType === 'amount' || discountType === 'percentage' || discountType === 'full';
    if (needsAmount) {
      const value = Number.parseFloat(discountAmount);
      if (!Number.isFinite(value) || value <= 0) next.discountAmount = '请填写大于 0 的数值';
    }
    if (discountType === 'full') {
      const value = Number.parseFloat(fullAmount);
      if (!Number.isFinite(value) || value <= 0) next.fullAmount = '请填写大于 0 的满减门槛';
    }
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setSummary('请检查标红的字段后再保存');
      return;
    }
    setSummary(null);
    setSaving(true);

    const payload: Coupon = {
      id: coupon?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim() || null,
      discountType: (discountType as DiscountType) || null,
      discountAmount:
        discountType && discountType !== 'group' ? Number.parseFloat(discountAmount) || null : null,
      fullAmount: discountType === 'full' ? Number.parseFloat(fullAmount) || null : null,
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

    try {
      const withVersion = await bumpVersion(payload);
      await putCoupon(withVersion);
      notifyDataChanged();
      onSaved(withVersion);
    } catch (err) {
      const message =
        err instanceof SyncConflictError
          ? '这张券已在别的设备上被修改过。请返回列表刷新后重新编辑，避免覆盖那边的改动。'
          : err instanceof Error
            ? err.message
            : '保存失败';
      setSummary(message);
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const needsAmount = discountType === 'amount' || discountType === 'percentage' || discountType === 'full';

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-4" noValidate>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {isEdit ? '编辑优惠券' : '添加优惠券'}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {isEdit ? '修改后会自动同步到云端' : '填写优惠信息，保存后即可在列表中看到'}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} icon={<X className="h-4 w-4" />}>
          取消
        </Button>
      </div>

      {summary && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {summary}
        </div>
      )}

      <Card className="space-y-4 p-4">
        <Input
          label="标题"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：瑞幸咖啡 5 折券"
          error={errors.title}
          maxLength={255}
          autoFocus
        />

        <Textarea
          label="描述"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="补充使用范围、限制条件等（可选）"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="折扣类型"
            value={discountType}
            onChange={(e) => setDiscountType(e.target.value as DiscountType | '')}
          >
            <option value="">不设置折扣</option>
            <option value="amount">减免金额</option>
            <option value="percentage">折扣比例</option>
            <option value="full">满减优惠</option>
            <option value="group">团购券</option>
          </Select>

          {needsAmount ? (
            <Input
              label={discountType === 'percentage' ? '折扣比例（如 5 表示 5 折）' : '减免金额（元）'}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
              error={errors.discountAmount}
            />
          ) : (
            <div className="hidden sm:block" />
          )}
        </div>

        {discountType === 'full' && (
          <Input
            label="满减门槛（元）"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={fullAmount}
            onChange={(e) => setFullAmount(e.target.value)}
            error={errors.fullAmount}
            hint="消费满该金额后可减"
          />
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="开始日期"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Input
            label="截止日期"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            error={errors.endDate}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:max-w-xs">
          <Input
            label="截止时"
            type="number"
            min={0}
            max={23}
            value={endHour}
            onChange={(e) => setEndHour(Math.min(23, Math.max(0, Number(e.target.value) || 0)))}
          />
          <Input
            label="截止分"
            type="number"
            min={0}
            max={59}
            value={endMinute}
            onChange={(e) => setEndMinute(Math.min(59, Math.max(0, Number(e.target.value) || 0)))}
          />
        </div>

        <Textarea
          label="备注"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="例如：需要会员日使用（可选）"
        />
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" loading={saving} icon={<Save className="h-4 w-4" />}>
          {isEdit ? '保存修改' : '创建优惠券'}
        </Button>
      </div>
    </form>
  );
}
