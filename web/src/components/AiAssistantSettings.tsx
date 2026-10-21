import { useState } from 'react';
import { Check, Eye, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { AiAssistant } from '../types/coupon';
import { newAssistantId } from '../ai/assistants';
import { Button } from './ui';

interface AiAssistantSettingsProps {
  assistants: AiAssistant[];
  activeId: string | null;
  onChange: (assistants: AiAssistant[], activeId: string | null) => void;
}

type Draft = {
  id: string | null; // null = 新增
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  vision: boolean;
};

const EMPTY_DRAFT: Draft = {
  id: null,
  name: '',
  provider: 'agnes',
  baseUrl: '',
  model: '',
  apiKey: '',
  vision: false,
};

/**
 * 多助手配置。
 *
 * 一个助手 = 一套 provider / key / 模型。可以配多个，选一个当默认；
 * 勾了「支持图片」的助手才会被「识图添加」选中（文本便宜的小模型通常不能识图，
 * 所以默认不勾，让用户自己去确认模型能力）。
 */
export function AiAssistantSettings({ assistants, activeId, onChange }: AiAssistantSettingsProps) {
  const [draft, setDraft] = useState<Draft | null>(null);

  const startAdd = () => setDraft({ ...EMPTY_DRAFT });
  const startEdit = (a: AiAssistant) =>
    setDraft({
      id: a.id,
      name: a.name,
      provider: a.provider,
      baseUrl: a.baseUrl ?? '',
      model: a.model ?? '',
      apiKey: a.apiKey ?? '',
      vision: a.vision,
    });

  const commit = () => {
    if (!draft) return;
    const name = draft.name.trim() || draft.provider.trim() || '未命名助手';
    const next: AiAssistant = {
      id: draft.id ?? newAssistantId(),
      name,
      provider: draft.provider.trim() || 'agnes',
      baseUrl: draft.baseUrl.trim() || null,
      model: draft.model.trim() || null,
      apiKey: draft.apiKey.trim() || null,
      vision: draft.vision,
    };
    const list = draft.id
      ? assistants.map((a) => (a.id === draft.id ? next : a))
      : [...assistants, next];
    onChange(list, activeId ?? next.id);
    setDraft(null);
  };

  const remove = (id: string) => {
    const list = assistants.filter((a) => a.id !== id);
    onChange(list, activeId === id ? (list[0]?.id ?? null) : activeId);
  };

  return (
    <div className="space-y-3">
      {assistants.length === 0 && !draft && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          还没有配置助手。加一个之后就能用文字指令和识图添加优惠券。
        </p>
      )}

      <ul className="space-y-2">
        {assistants.map((assistant) => {
          const isActive = assistant.id === activeId;
          return (
            <li
              key={assistant.id}
              className={`rounded-lg border px-3 py-2.5 ${
                isActive ? 'border-rose-300 bg-rose-50/60' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-900">{assistant.name}</span>
                    {isActive && (
                      <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        默认
                      </span>
                    )}
                    {assistant.vision && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                        <Eye className="h-2.5 w-2.5" aria-hidden />
                        识图
                      </span>
                    )}
                    {!assistant.apiKey && (
                      <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        未填 Key
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {assistant.provider}
                    {assistant.model ? ` · ${assistant.model}` : ''}
                    {assistant.baseUrl ? ` · ${assistant.baseUrl}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => onChange(assistants, assistant.id)}
                      className="rounded px-1.5 py-1 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-rose-600"
                    >
                      设为默认
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startEdit(assistant)}
                    className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label={`编辑 ${assistant.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(assistant.id)}
                    className="rounded p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`删除 ${assistant.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {draft ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-800">
              {draft.id ? '编辑助手' : '新增助手'}
            </span>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded p-1 text-slate-400 hover:bg-slate-200"
              aria-label="取消"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-slate-600">
              名称
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="例如：文本助手 / 识图助手"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
              />
            </label>
            <label className="text-xs text-slate-600">
              Provider
              <input
                value={draft.provider}
                onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
                placeholder="agnes"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
              />
            </label>
            <label className="text-xs text-slate-600">
              模型
              <input
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                placeholder="agnes-chat / gpt-4o-mini"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
              />
            </label>
            <label className="text-xs text-slate-600">
              API Key
              <input
                type="password"
                value={draft.apiKey}
                onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                placeholder="sk-…"
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
              />
            </label>
            <label className="text-xs text-slate-600 sm:col-span-2">
              Base URL
              <input
                value={draft.baseUrl}
                onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                placeholder="https://api.example.com/v1（留空用默认）"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={draft.vision}
              onChange={(e) => setDraft({ ...draft, vision: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
            />
            支持图片（识图添加会用这个助手，模型要选多模态的）
          </label>

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              取消
            </Button>
            <Button size="sm" onClick={commit} icon={<Check className="h-4 w-4" />}>
              保存助手
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={startAdd} icon={<Plus className="h-4 w-4" />}>
          添加助手
        </Button>
      )}
    </div>
  );
}
