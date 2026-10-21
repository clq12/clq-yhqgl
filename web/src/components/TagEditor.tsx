import { useMemo, useState } from 'react';
import { Plus, Sparkles, X } from 'lucide-react';
import type { Coupon } from '../types/coupon';
import { detectTags, normalizeTag, normalizeTags, suggestTags } from '../rules/couponRules';

interface TagEditorProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** 用来做自动识别的文本，一般是标题；命中常用标签时给出"一键添加" */
  contextText?: string;
  /** 历史券，用来按使用频次推荐标签（自动复用核心） */
  allCoupons: Coupon[];
  /** 设置页里维护的标签库；历史不够时用它补位 */
  library?: string[];
}

/**
 * 标签编辑器。
 *
 * 复用逻辑分三层：
 * 1. 历史高频标签排前面（suggestTags），点一下就加上
 * 2. 没有历史时用常用标签补位（抖音/拼多多/淘宝/美团…）
 * 3. 标题里认出平台名时给一个「一键添加」，但**不自动加**，避免用户没注意就被打上标签
 */
export function TagEditor({ value, onChange, contextText = '', allCoupons, library }: TagEditorProps) {
  const [draft, setDraft] = useState('');

  const selected = useMemo(() => normalizeTags(value), [value]);
  const suggestions = useMemo(
    () => suggestTags(allCoupons, selected, 8, library),
    [allCoupons, selected, library],
  );
  const detected = useMemo(
    () => detectTags(contextText).filter((t) => !selected.includes(t)),
    [contextText, selected],
  );

  const add = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag) return;
    if (selected.includes(tag)) {
      setDraft('');
      return;
    }
    onChange([...selected, tag]);
    setDraft('');
  };

  const remove = (tag: string) => onChange(selected.filter((t) => t !== tag));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">标签</span>
        <span className="text-xs text-slate-400">用于按平台筛选，比如抖音 / 拼多多 / 美团</span>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700"
            >
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                className="rounded-full p-0.5 text-rose-400 transition hover:bg-rose-100 hover:text-rose-700"
                aria-label={`移除标签 ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder="输入新标签后回车"
          maxLength={24}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
        />
        <button
          type="button"
          onClick={() => add(draft)}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:border-rose-300 hover:text-rose-600 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          添加
        </button>
      </div>

      {detected.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2">
          <Sparkles className="h-3.5 w-3.5 text-amber-600" aria-hidden />
          <span className="text-xs text-amber-700">标题里有：</span>
          {detected.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => add(tag)}
              className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-xs text-amber-700 transition hover:bg-amber-100"
            >
              + {tag}
            </button>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400">常用：</span>
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => add(tag)}
              className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
