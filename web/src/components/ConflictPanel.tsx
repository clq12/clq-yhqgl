import { useEffect, useState } from 'react';
import { CheckCheck, RefreshCw, ShieldAlert } from 'lucide-react';
import {
  resolveConflictKeepLocal,
  resolveConflictKeepRemote,
} from '../db/appDb';
import { listConflicts, subscribeConflicts, type PendingConflict } from '../sync/conflicts';
import type { Coupon } from '../types/coupon';
import { Button, Card, useToast } from './ui';

/**
 * 「待解决」冲突列表（网页端）。
 *
 * 乐观锁命中时不会覆盖任何一边，而是把两边都摆出来让用户点一下：
 * - 以云端为准 → 本地改成云端那份（提醒状态保留本机）
 * - 用我的覆盖 → 把本机版本推上去（modified_at 推到当前时刻，否则下次还会冲突）
 *
 * 不做自动合并：字段级合并看起来聪明，实际会在「两边都改了一半」时产出
 * 谁都没写过的一条记录，事后没法解释。
 */
const FIELD_LABELS: Array<[keyof Coupon, string]> = [
  ['title', '标题'],
  ['discountType', '折扣类型'],
  ['discountAmount', '折扣值'],
  ['fullAmount', '门槛'],
  ['endDate', '截止日期'],
  ['endHour', '截止时'],
  ['endMinute', '截止分'],
  ['notes', '备注'],
];

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join('、') : '—';
  return String(value);
}

function diffRows(local: Coupon, remote: Coupon): Array<[string, string, string]> {
  const rows: Array<[string, string, string]> = [];
  for (const [key, label] of FIELD_LABELS) {
    const a = fmt(local[key]);
    const b = fmt(remote[key]);
    if (a !== b) rows.push([label, a, b]);
  }
  const tagsA = fmt(local.tags);
  const tagsB = fmt(remote.tags);
  if (tagsA !== tagsB) rows.push(['标签', tagsA, tagsB]);
  return rows;
}

export function ConflictPanel() {
  const { showToast } = useToast();
  const [items, setItems] = useState<PendingConflict[]>(() => listConflicts());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => subscribeConflicts(() => setItems(listConflicts())), []);

  if (items.length === 0) return null;

  const keep = async (item: PendingConflict, side: 'local' | 'remote') => {
    setBusy(`${item.id}:${side}`);
    try {
      if (side === 'remote') {
        await resolveConflictKeepRemote(item.remote);
        showToast('已采用云端版本', 'success');
      } else {
        await resolveConflictKeepLocal(item.local);
        showToast('已用本机版本覆盖云端', 'success');
      }
      setItems(listConflicts());
    } catch (e) {
      showToast(e instanceof Error ? e.message : '处理失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-amber-200 bg-amber-50/40 p-4">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
          <ShieldAlert className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            待解决（{items.length} 张在别的设备上被改过）
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            本机的改动没有覆盖云端，先在下面选一边，改完这张券才会继续同步。
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {items.map((item) => {
          const rows = diffRows(item.local, item.remote);
          return (
            <div key={item.id} className="rounded-lg border border-amber-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-800">{item.title}</p>
                <span className="text-[11px] text-slate-400">
                  {new Date(item.detectedAt).toLocaleString()}
                </span>
              </div>

              {rows.length === 0 ? (
                <p className="mt-1 text-xs text-slate-500">
                  内容看起来一样，只是修改时间不同 —— 随便选一个都行。
                </p>
              ) : (
                <div className="mt-2 overflow-hidden rounded border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-2 py-1 text-left font-medium">字段</th>
                        <th className="px-2 py-1 text-left font-medium">本机</th>
                        <th className="px-2 py-1 text-left font-medium">云端</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(([label, mine, theirs]) => (
                        <tr key={label} className="border-t border-slate-100">
                          <td className="px-2 py-1 text-slate-500">{label}</td>
                          <td className="px-2 py-1 text-slate-800">{mine}</td>
                          <td className="px-2 py-1 text-slate-800">{theirs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy === `${item.id}:remote`}
                  disabled={!!busy}
                  icon={<RefreshCw className="h-4 w-4" />}
                  onClick={() => void keep(item, 'remote')}
                >
                  以云端为准
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy === `${item.id}:local`}
                  disabled={!!busy}
                  icon={<CheckCheck className="h-4 w-4" />}
                  onClick={() => void keep(item, 'local')}
                >
                  用我的覆盖
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
