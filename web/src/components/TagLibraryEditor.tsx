import { useState } from 'react';
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { normalizeTag } from '../rules/couponRules';
import {
  countCouponsUsingTag,
  removeTagFromCoupons,
  renameTagOnCoupons,
} from '../lib/tagAdmin';
import { Button } from './ui';

interface TagLibraryEditorProps {
  /** 当前生效的标签库（空配置时由父组件传入默认名单） */
  library: string[];
  /** 内置默认名单，用于「恢复默认」 */
  defaultLibrary: string[];
  onChange: (next: string[]) => void;
  /** 保存设置；改标签会连带改券，提示里要说清楚 */
  notify: (message: string, tone?: 'success' | 'error') => void;
}

/**
 * 标签库编辑器。
 *
 * 三件事：加、改名、删。改名和删除都会**连带修改已打过该标签的券**，
 * 因为标签是冗余存进每张券的，只改名单会让券上留下幽灵标签。
 */
export function TagLibraryEditor({
  library,
  defaultLibrary,
  onChange,
  notify,
}: TagLibraryEditorProps) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ from: string; value: string } | null>(null);
  const [removing, setRemoving] = useState<{ tag: string; count: number | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const add = () => {
    const tag = normalizeTag(draft);
    if (!tag) return;
    if (library.includes(tag)) {
      notify(`「${tag}」已经在列表里了`, 'error');
      setDraft('');
      return;
    }
    onChange([...library, tag]);
    setDraft('');
    notify(`已添加「${tag}」，记得点下面的保存设置`, 'success');
  };

  const confirmRename = async () => {
    if (!editing) return;
    const next = normalizeTag(editing.value);
    const from = editing.from;
    if (!next) {
      notify('标签不能为空', 'error');
      return;
    }
    if (next === from) {
      setEditing(null);
      return;
    }
    if (library.includes(next)) {
      notify(`「${next}」已经在列表里了`, 'error');
      return;
    }

    setBusy(true);
    try {
      onChange(library.map((t) => (t === from ? next : t)));
      const result = await renameTagOnCoupons(from, next);
      const skipped = result.skipped > 0 ? `，${result.skipped} 张因冲突未改` : '';
      notify(
        result.changed > 0
          ? `已改名为「${next}」，同步更新 ${result.changed} 张券${skipped}`
          : `已改名为「${next}」`,
        'success',
      );
      setEditing(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : '改名失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openRemove = async (tag: string) => {
    setRemoving({ tag, count: null });
    const count = await countCouponsUsingTag(tag).catch(() => 0);
    setRemoving((prev) => (prev && prev.tag === tag ? { tag, count } : prev));
  };

  const confirmRemove = async () => {
    if (!removing) return;
    const tag = removing.tag;
    setBusy(true);
    try {
      onChange(library.filter((t) => t !== tag));
      const result = await removeTagFromCoupons(tag);
      notify(
        result.changed > 0
          ? `已删除「${tag}」，同时从 ${result.changed} 张券上移除了它`
          : `已删除「${tag}」`,
        'success',
      );
      setRemoving(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : '删除失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {library.length === 0 && (
          <span className="text-xs text-slate-400">还没有标签，先加一个</span>
        )}
        {library.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-0.5 pl-2.5 pr-1 text-xs text-slate-700"
          >
            {tag}
            {editing?.from === tag ? null : (
              <>
                <button
                  type="button"
                  onClick={() => setEditing({ from: tag, value: tag })}
                  className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                  aria-label={`编辑 ${tag}`}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => void openRemove(tag)}
                  className="rounded-full p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`删除 ${tag}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            )}
          </span>
        ))}
      </div>

      {editing && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2">
          <span className="shrink-0 text-xs text-slate-500">把「{editing.from}」改成</span>
          <input
            value={editing.value}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void confirmRename();
              }
              if (e.key === 'Escape') setEditing(null);
            }}
            maxLength={24}
            autoFocus
            className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
          />
          <Button size="sm" onClick={() => void confirmRename()} loading={busy}>
            确定
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
            取消
          </Button>
        </div>
      )}

      {removing && (
        <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5">
          <p className="text-xs text-rose-700">
            删除「{removing.tag}」
            {removing.count === null
              ? '…'
              : removing.count > 0
                ? `，已有 ${removing.count} 张券打了这个标签，会一并移除`
                : '，目前没有券在用'}
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>
              取消
            </Button>
            <Button size="sm" onClick={() => void confirmRemove()} loading={busy}>
              确认删除
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="新增标签，例如 抖音"
          maxLength={24}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
        />
        <Button size="sm" onClick={add} disabled={!draft.trim()} icon={<Plus className="h-4 w-4" />}>
          添加
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">改名或删除会同时更新已打过该标签的优惠券</p>
        <button
          type="button"
          onClick={() => onChange([...defaultLibrary])}
          className="inline-flex items-center gap-1 text-xs text-slate-500 transition hover:text-rose-600"
        >
          <RotateCcw className="h-3 w-3" />
          恢复默认
        </button>
      </div>
    </div>
  );
}
