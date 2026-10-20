import { useState } from 'react';
import { Bot, X, Check, AlertCircle, Loader2 } from 'lucide-react';
import type { AIContext, AiIntent } from '../ai/provider';
import { createProvider } from '../ai/agnesProvider';
import { listCoupons, putCoupon, deleteCouponLocal, getSettings } from '../db/indexedDB';
import { bumpVersion, sync } from '../sync/syncEngine';
import type { Coupon, DiscountType } from '../types/coupon';
import { beijingNow } from '../rules/couponRules';

interface AIPanelProps {
  onSelectCoupon?: (id: string | null) => void;
}

export function AIPanel({ onSelectCoupon }: AIPanelProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<AiIntent | null>(null);
  const [preview, setPreview] = useState<{ action: string; target: Coupon | null } | null>(null);

  const reset = () => {
    setInput('');
    setError(null);
    setIntent(null);
    setPreview(null);
  };

  const handleSubmit = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setIntent(null);
    setPreview(null);
    try {
      const coupons = await listCoupons();
      const settings = (await getSettings()) ?? undefined;
      const context: AIContext = {
        coupons,
        provider: settings?.ai.provider || 'agnes',
        apiKey: settings?.ai.apiKey || null,
        baseUrl: settings?.ai.baseUrl || null,
        model: settings?.ai.model || null,
      };
      const provider = createProvider(context);
      const result = await provider.parseIntent(input, context);
      setIntent(result);
      buildPreview(result, coupons);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 解析失败');
    } finally {
      setLoading(false);
    }
  };

  const buildPreview = (intent: AiIntent, coupons: Coupon[]) => {
    if (intent.intent === 'create') {
      const draft: Coupon = {
        id: crypto.randomUUID(),
        title: intent.changes.title || '未命名',
        description: intent.changes.description || null,
        discountType: (intent.changes.discountType as DiscountType) || null,
        discountAmount: intent.changes.discountAmount ? parseFloat(intent.changes.discountAmount) : null,
        fullAmount: intent.changes.fullAmount ? parseFloat(intent.changes.fullAmount) : null,
        startDate: intent.changes.startDate || beijingNow().toISOString().slice(0, 10),
        endDate: intent.changes.endDate || beijingNow().toISOString().slice(0, 10),
        endHour: 23,
        endMinute: 59,
        isReminded: false,
        remindedDays: [],
        isUsed: false,
        notes: intent.changes.notes || null,
        createdAt: beijingNow().toISOString(),
        updatedAt: beijingNow().toISOString(),
        version: null,
        modifiedAt: beijingNow().toISOString(),
      };
      setPreview({ action: '创建优惠券', target: draft });
    } else if (intent.intent === 'update' && intent.targetId) {
      const target = coupons.find((c) => c.id === intent.targetId) || null;
      if (target) {
        setPreview({
          action: '更新优惠券',
          target: { ...target, title: intent.changes.title || target.title },
        });
      } else {
        setError('找不到要更新的优惠券');
      }
    } else if (intent.intent === 'delete' && intent.targetId) {
      const target = coupons.find((c) => c.id === intent.targetId) || null;
      setPreview({ action: '删除优惠券', target });
    } else {
      setPreview({ action: '查询/对话', target: null });
    }
  };

  const execute = async () => {
    if (!intent) return;
    try {
      if (intent.intent === 'create' && preview?.target) {
        const withVersion = await bumpVersion(preview.target);
        await putCoupon(withVersion);
        await sync();
        onSelectCoupon?.(withVersion.id);
      } else if (intent.intent === 'update' && intent.targetId && preview?.target) {
        const existing = (await listCoupons()).find((c) => c.id === intent.targetId);
        if (!existing) throw new Error('目标不存在');
        const updated = await bumpVersion({ ...existing, ...preview.target });
        await putCoupon(updated);
        await sync();
        onSelectCoupon?.(updated.id);
      } else if (intent.intent === 'delete' && intent.targetId) {
        await deleteCouponLocal(intent.targetId);
        await sync();
        onSelectCoupon?.(null);
      }
      setOpen(false);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : '执行失败');
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700"
      >
        <Bot className="w-4 h-4" />
        AI 助手
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-[640px] max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold text-lg">AI 助手</h2>
              <button onClick={() => { setOpen(false); reset(); }}>
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto space-y-4">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="例如：帮我添加一张瑞幸 5 折券，10 月 30 日到期"
                className="w-full h-24 border rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full py-2 bg-rose-600 text-white rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                {loading ? '解析中...' : '解析命令'}
              </button>

              {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              {intent && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="font-medium text-gray-900">AI 理解：{intent.reasoning}</div>
                  {preview && preview.action !== '查询/对话' && (
                    <>
                      <div className="text-sm text-gray-600">拟执行操作：<span className="font-semibold">{preview.action}</span></div>
                      {preview.target && (
                        <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                          <div>标题：{preview.target.title}</div>
                          <div>到期：{preview.target.endDate} {String(preview.target.endHour ?? 23).padStart(2, '0')}:{String(preview.target.endMinute ?? 59).padStart(2, '0')}</div>
                          {preview.target.discountType && (
                            <div>折扣：{preview.target.discountType} {preview.target.discountAmount}</div>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => { setIntent(null); setPreview(null); }}
                          className="flex-1 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
                        >
                          取消
                        </button>
                        <button
                          onClick={execute}
                          className="flex-1 py-2 bg-green-600 text-white rounded-lg flex items-center justify-center gap-1 hover:bg-green-700"
                        >
                          <Check className="w-4 h-4" /> 确认执行
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
