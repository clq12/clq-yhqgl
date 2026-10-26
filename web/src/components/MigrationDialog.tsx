import { useState } from 'react';
import { AlertTriangle, CloudDownload, HardDriveUpload, Trash2 } from 'lucide-react';
import type { MigrationMode, MigrationProbe } from '../db/appDb';
import { Button, Card } from './ui';

/**
 * 首次登录的「数据怎么合」三选一。
 *
 * 为什么必须问一次：本机可能已经攒了几十张券（游客模式），而账号里也有数据。
 * 默认策略无论选哪边都会有人被坑：
 * - 默认上传 → 已在别处用过账号的人，云端会被这台机器的旧数据污染；
 * - 默认只拉 → 只用这台机器的人会以为券全丢了。
 * 所以第一次登录必须显式选一次，选完记住（LAST_USER_KEY），以后不再打扰。
 */
export function MigrationGate({
  migration,
  onChoose,
}: {
  migration: MigrationProbe | null;
  onChoose: (mode: MigrationMode) => Promise<void>;
}) {
  const [busy, setBusy] = useState<MigrationMode | null>(null);

  if (!migration) return null;

  const choose = async (mode: MigrationMode) => {
    setBusy(mode);
    try {
      await onChoose(mode);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-lg p-5">
        <h2 className="text-base font-semibold text-slate-900">这台设备上还有旧数据</h2>
        <p className="mt-1.5 text-sm text-slate-600">
          本机有 <span className="font-medium text-slate-900">{migration.localCount}</span> 张券，
          云端账号里有 <span className="font-medium text-slate-900">{migration.cloudCount}</span> 张。
          先选一个处理方式，选完就会按这个方式合并（之后登录不再询问）。
        </p>

        <div className="mt-4 space-y-2">
          <Option
            icon={<HardDriveUpload className="h-4 w-4" />}
            title="上传本机数据"
            desc="把本机的券补传到云端。适合「这台电脑是我唯一的数据来源」。"
            loading={busy === 'upload'}
            disabled={!!busy}
            onClick={() => void choose('upload')}
          />
          <Option
            icon={<CloudDownload className="h-4 w-4" />}
            title="只拉云端数据"
            desc="丢弃本机这份列表，以云端为准。本机文件不会被删，只是不再显示。"
            loading={busy === 'pull'}
            disabled={!!busy || migration.cloudCount === 0}
            hint={migration.cloudCount === 0 ? '云端还没有数据，选了等于清空本机列表' : undefined}
            onClick={() => void choose('pull')}
          />
          <Option
            icon={<Trash2 className="h-4 w-4" />}
            title="先清空本机再拉云端"
            desc="本机的券全部删掉再拉云端。本机数据重复/混乱时用这个。"
            loading={busy === 'clear-pull'}
            disabled={!!busy}
            danger
            onClick={() => void choose('clear-pull')}
          />
        </div>

        <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          提醒状态（哪张券提醒过）存在本机、不参与同步，三种方式都不会丢。
        </p>
      </Card>
    </div>
  );
}

function Option({
  icon,
  title,
  desc,
  hint,
  loading,
  disabled,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  hint?: string;
  loading: boolean;
  disabled: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        danger ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className={danger ? 'mt-0.5 text-rose-500' : 'mt-0.5 text-slate-400'}>{icon}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800">{title}</p>
            <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
            {hint && <p className="mt-1 text-xs text-amber-600">{hint}</p>}
          </div>
        </div>
        <Button
          variant={danger ? 'danger' : 'secondary'}
          size="sm"
          loading={loading}
          disabled={disabled}
          onClick={onClick}
        >
          选这个
        </Button>
      </div>
    </div>
  );
}
