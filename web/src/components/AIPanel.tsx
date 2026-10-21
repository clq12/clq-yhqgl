import { useState } from 'react';
import { AlertCircle, Bot, Check, ImagePlus, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import type { AIContext, AiIntent } from '../ai/provider';
import { createProvider } from '../ai/agnesProvider';
import { deleteCouponLocal, getSettings, listCoupons, putCoupon } from '../db/appDb';
import { bumpVersion } from '../sync/syncEngine';
import type { Coupon, DiscountType } from '../types/coupon';
import { beijingNow, normalizeTags } from '../rules/couponRules';
import { activeAssistant, toContext, visionAssistants } from '../ai/assistants';
import { fileToDataUrl } from '../ai/image';
import { notifyDataChanged } from '../lib/dataBus';
import { Button, Modal, Textarea, useToast } from './ui';

interface AIPanelProps {
  onSelectCoupon?: (id: string | null) => void;
}

type Preview =
  | { kind: 'create'; coupon: Coupon }
  | { kind: 'update'; before: Coupon; after: Coupon }
  | { kind: 'delete'; coupon: Coupon }
  | { kind: 'query'; message: string };

/**
 * AI 给的 tags 可能是 "抖音,美团" 这种串，统一按中文/英文逗号与空白切开再归一化。
 * 没给就留空，不要瞎猜。
 */
function parseIntentTags(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return normalizeTags(raw.split(/[,，、\s]+/));
}

function buildCoupon(intent: AiIntent): Coupon {
  const changes = intent.changes;
  return {
    id: crypto.randomUUID(),
    title: changes.title || '未命名优惠券',
    description: changes.description || null,
    discountType: (changes.discountType as DiscountType) || null,
    discountAmount: changes.discountAmount ? Number.parseFloat(changes.discountAmount) : null,
    fullAmount: changes.fullAmount ? Number.parseFloat(changes.fullAmount) : null,
    startDate: changes.startDate || beijingNow().toISOString().slice(0, 10),
    endDate: changes.endDate || beijingNow().toISOString().slice(0, 10),
    endHour: 23,
    endMinute: 59,
    isReminded: false,
    remindedDays: [],
    isUsed: false,
    notes: changes.notes || null,
    tags: parseIntentTags(changes.tags),
    createdAt: beijingNow().toISOString(),
    updatedAt: beijingNow().toISOString(),
    version: null,
    modifiedAt: beijingNow().toISOString(),
  };
}

function applyChanges(existing: Coupon, intent: AiIntent): Coupon {
  const c = intent.changes;
  return {
    ...existing,
    title: c.title || existing.title,
    description: c.description ?? existing.description,
    discountType: (c.discountType as DiscountType) || existing.discountType,
    discountAmount: c.discountAmount ? Number.parseFloat(c.discountAmount) : existing.discountAmount,
    fullAmount: c.fullAmount ? Number.parseFloat(c.fullAmount) : existing.fullAmount,
    startDate: c.startDate || existing.startDate,
    endDate: c.endDate || existing.endDate,
    notes: c.notes ?? existing.notes,
    // AI 明确给了 tags 才覆盖，没提就保留原标签
    tags: c.tags ? parseIntentTags(c.tags) : existing.tags,
    updatedAt: beijingNow().toISOString(),
    modifiedAt: beijingNow().toISOString(),
  };
}

export function AIPanel({ onSelectCoupon }: AIPanelProps) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<AiIntent | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  // 识图：预览缩略图 + 是否正在识别
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const reset = () => {
    setInput('');
    setError(null);
    setIntent(null);
    setPreview(null);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const handleParse = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setIntent(null);
    setPreview(null);
    try {
      const [coupons, settings] = await Promise.all([listCoupons(), getSettings()]);
      const assistant = activeAssistant(settings);
      if (!assistant?.apiKey) {
        setError('请先在「设置 → AI 助手」中配置 API Key');
        return;
      }
      const context: AIContext = toContext(assistant, coupons);
      const provider = createProvider(context);
      const result = await provider.parseIntent(input, context);
      setIntent(result);

      if (result.intent === 'create') {
        setPreview({ kind: 'create', coupon: buildCoupon(result) });
      } else if (result.intent === 'update' && result.targetId) {
        const target = coupons.find((c) => c.id === result.targetId);
        if (!target) {
          setError('没有找到要修改的优惠券，请换一种描述');
          return;
        }
        setPreview({ kind: 'update', before: target, after: applyChanges(target, result) });
      } else if (result.intent === 'delete' && result.targetId) {
        const target = coupons.find((c) => c.id === result.targetId);
        if (!target) {
          setError('没有找到要删除的优惠券，请换一种描述');
          return;
        }
        setPreview({ kind: 'delete', coupon: target });
      } else {
        setPreview({ kind: 'query', message: result.reasoning });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 解析失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  /** 识图：选一张截图 → 压图 → 多模态模型 → 走和文字一样的 create 预览流程 */
  const handleImage = async (file: File) => {
    setLoading(true);
    setError(null);
    setIntent(null);
    setPreview(null);
    try {
      const [coupons, settings] = await Promise.all([listCoupons(), getSettings()]);
      const candidates = visionAssistants(settings);
      if (candidates.length === 0) {
        setError('还没有勾选「支持图片」的助手。请到「设置 → AI 助手」里给助手勾上识图，并选择多模态模型。');
        return;
      }
      const assistant = candidates.find((a) => a === activeAssistant(settings)) ?? candidates[0];
      if (!assistant.apiKey) {
        setError('该助手还没有 API Key，请先去设置里填写');
        return;
      }

      const dataUrl = await fileToDataUrl(file);
      setImagePreview(dataUrl);

      const context = toContext(assistant, coupons);
      const provider = createProvider(context);
      if (!provider.recognizeImage) {
        setError('当前助手不支持识图');
        return;
      }
      const result = await provider.recognizeImage(dataUrl, context);
      setIntent(result);
      setPreview({ kind: 'create', coupon: buildCoupon(result) });
    } catch (e) {
      setError(e instanceof Error ? e.message : '识图失败，请换一张更清晰的截图');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!preview || !intent) return;
    setExecuting(true);
    try {
      if (preview.kind === 'create') {
        const withVersion = await bumpVersion(preview.coupon);
        await putCoupon(withVersion);
        notifyDataChanged();
        onSelectCoupon?.(withVersion.id);
        showToast('已创建优惠券', 'success');
      } else if (preview.kind === 'update') {
        const withVersion = await bumpVersion(preview.after);
        await putCoupon(withVersion);
        notifyDataChanged();
        onSelectCoupon?.(withVersion.id);
        showToast('已更新优惠券', 'success');
      } else if (preview.kind === 'delete') {
        await deleteCouponLocal(preview.coupon.id);
        notifyDataChanged();
        onSelectCoupon?.(null);
        showToast('已删除优惠券', 'success');
      }
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : '执行失败');
    } finally {
      setExecuting(false);
    }
  };

  const actionable = preview && preview.kind !== 'query';

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        icon={<Sparkles className="h-4 w-4" />}
        className="hidden sm:inline-flex"
      >
        AI 助手
      </Button>
      <Button
        size="sm"
        variant="soft"
        onClick={() => setOpen(true)}
        aria-label="打开 AI 助手"
        className="sm:hidden"
      >
        <Sparkles className="h-4 w-4" />
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="AI 助手"
        description="用一句话创建、修改或删除优惠券，执行前会先给你看变更预览"
        size="lg"
        footer={
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400">AI 只生成变更草稿，确认后才会写入</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={close}>
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleExecute}
                disabled={!actionable}
                loading={executing}
                icon={<Check className="h-4 w-4" />}
              >
                确认执行
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <Textarea
            label="你想做什么？"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            placeholder="例如：帮我添加一张瑞幸 5 折券，10 月 30 日到期"
            hint="支持创建、修改、删除和查询，例如「把星巴克那张改成 12 月 31 日到期」"
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              onClick={handleParse}
              loading={loading}
              disabled={!input.trim()}
              icon={<Wand2 className="h-4 w-4" />}
            >
              解析并预览
            </Button>

            {/* 识图添加：手机上会优先调相机，桌面上就是选文件 */}
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700">
              <ImagePlus className="h-4 w-4" aria-hidden />
              识图添加
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void handleImage(file);
                }}
              />
            </label>
          </div>

          {imagePreview && (
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
              <img
                src={imagePreview}
                alt="待识别的优惠券截图"
                className="h-16 w-16 rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-700">已识别这张图</p>
                <p className="text-[11px] text-slate-400">识别结果在下面预览，确认后再保存</p>
              </div>
              <button
                type="button"
                onClick={() => setImagePreview(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                aria-label="清除图片"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {error}
            </div>
          )}

          {intent && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Bot className="h-3.5 w-3.5" aria-hidden />
                AI 理解
              </div>
              <p className="mt-1 text-sm text-slate-700">{intent.reasoning}</p>

              {preview?.kind === 'create' && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
                  <p className="font-medium text-emerald-800">将创建：{preview.coupon.title}</p>
                  <p className="mt-1 text-xs text-emerald-700">
                    到期 {preview.coupon.endDate}
                    {preview.coupon.discountAmount != null
                      ? ` · 优惠 ${preview.coupon.discountAmount}`
                      : ''}
                  </p>
                </div>
              )}

              {preview?.kind === 'update' && (
                <div className="mt-3 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm">
                  <p className="font-medium text-amber-800">将修改：{preview.before.title}</p>
                  {preview.before.title !== preview.after.title && (
                    <p className="text-xs text-amber-700">
                      标题：{preview.before.title} → {preview.after.title}
                    </p>
                  )}
                  {preview.before.endDate !== preview.after.endDate && (
                    <p className="text-xs text-amber-700">
                      到期：{preview.before.endDate} → {preview.after.endDate}
                    </p>
                  )}
                  {preview.before.discountAmount !== preview.after.discountAmount && (
                    <p className="text-xs text-amber-700">
                      优惠：{preview.before.discountAmount ?? '无'} → {preview.after.discountAmount ?? '无'}
                    </p>
                  )}
                </div>
              )}

              {preview?.kind === 'delete' && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-sm">
                  <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
                  <div>
                    <p className="font-medium text-rose-800">将删除：{preview.coupon.title}</p>
                    <p className="mt-0.5 text-xs text-rose-600">删除后无法恢复</p>
                  </div>
                </div>
              )}

              {preview?.kind === 'query' && (
                <p className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-600">{preview.message}</p>
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
