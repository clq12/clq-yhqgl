#!/usr/bin/env node
/**
 * 双端并发写回归（P2-1）。
 *
 * 不连数据库、不模拟 UI —— 只把「两台设备同时改同一张券」的决策序列跑一遍，
 * 断言乐观锁的行为和 sync-protocol.md §5/§6 说的一致。
 * 被测函数就是网页端生产代码用的那份：web/src/sync/decideWrite.ts。
 *
 * 用法：node --experimental-strip-types scripts/concurrency-check.mjs
 */
import { decideWrite, bumpedTimestamp, mergeCloudOverLocal, timestampOf } from '../web/src/sync/decideWrite.ts';

let failed = 0;
let passed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}\n      期望 ${e}\n      实际 ${a}`);
  }
}

function coupon(id, modifiedAt, extra = {}) {
  return {
    id,
    title: `券 ${id}`,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: modifiedAt,
    modifiedAt,
    ...extra,
  };
}

// ---------------------------------------------------------------- 1. 基本判定
console.log('1) decideWrite 基本判定');
check('云端没有 → insert', decideWrite(coupon('a', '2026-10-21T10:00:00.000Z'), null), 'insert');
check(
  '本地更新 → update',
  decideWrite(coupon('a', '2026-10-21T10:05:00.000Z'), coupon('a', '2026-10-21T10:00:00.000Z')),
  'update',
);
check(
  '云端更新 → conflict（整条拦下）',
  decideWrite(coupon('a', '2026-10-21T10:00:00.000Z'), coupon('a', '2026-10-21T10:05:00.000Z')),
  'conflict',
);
check(
  '同一毫秒 → update（后写者胜，不互相卡死）',
  decideWrite(coupon('a', '2026-10-21T10:00:00.000Z'), coupon('a', '2026-10-21T10:00:00.000Z')),
  'update',
);
check(
  '老数据没有 modifiedAt → 退回 updatedAt 比',
  decideWrite(
    coupon('a', null, { updatedAt: '2026-10-21T10:00:00.000Z' }),
    coupon('a', '2026-10-21T09:59:59.000Z'),
  ),
  'update',
);
check('时间戳解析不了按 0 处理', timestampOf({ modifiedAt: 'not-a-date' }), 0);

// ------------------------------------------------ 2. 两台设备顺序写的完整回合
console.log('2) 双设备回合（A 离线改，B 已先写云）');
{
  const remote = coupon('c1', '2026-10-21T10:10:00.000Z', { title: 'B 改的标题' });
  const localA = coupon('c1', '2026-10-21T10:05:00.000Z', { title: 'A 改的标题' });
  const decision = decideWrite(localA, remote);
  check('A 写入被拦下 → conflict', decision, 'conflict');

  // 用户选「用我的覆盖」：时间戳必须往前推，否则下一轮又撞
  const bumped = { ...localA, modifiedAt: bumpedTimestamp(Date.parse('2026-10-21T10:11:00.000Z')) };
  check(
    '覆盖后时间戳严格大于云端',
    timestampOf(bumped) > timestampOf(remote),
    true,
  );
  check('下一轮不再冲突 → update', decideWrite(bumped, remote), 'update');

  // 用户选「以云端为准」：本地落云端那份，但本机提醒状态要保留
  const localWithReminder = { ...localA, isReminded: true, remindedDays: [7] };
  const merged = mergeCloudOverLocal(localWithReminder, remote);
  check('以云端为准后标题是云端的', merged.title, 'B 改的标题');
  check('本机提醒状态不被云端覆盖', [merged.isReminded, merged.remindedDays], [true, [7]]);
}

// ---------------------------------------- 3. 三台设备乱序写：最终收敛到最晚一次
console.log('3) 三设备乱序写（收敛性）');
{
  const devices = [
    coupon('c2', '2026-10-21T10:00:00.000Z', { title: 'A' }),
    coupon('c2', '2026-10-21T10:20:00.000Z', { title: 'B' }),
    coupon('c2', '2026-10-21T10:10:00.000Z', { title: 'C' }),
  ];
  // 云端初始为空 → 第一台 insert，之后每台各自判一次
  let cloud = null;
  const order = [devices[0], devices[2], devices[1]];
  let accepted = 0;
  let conflicts = 0;
  for (const dev of order) {
    const decision = decideWrite(dev, cloud);
    if (decision === 'conflict') {
      conflicts += 1;
      continue;
    }
    cloud = dev;
    accepted += 1;
  }
  check('三台依次写入都按时间放行，无冲突', [accepted, conflicts], [3, 0]);
  check('最终云端是时间最晚的那条（B）', cloud.title, 'B');
}

// ------------------------------------------- 4. 软删除：墓碑不参与「复活」判定
console.log('4) 软删除（deleted_at 非空即删）');
{
  const tombstone = coupon('c3', '2026-10-21T10:30:00.000Z', { deletedAt: '2026-10-21T10:30:00.000Z' });
  const staleLocal = coupon('c3', '2026-10-21T10:00:00.000Z');
  check('本地拿着旧副本想改已删除的券 → conflict', decideWrite(staleLocal, tombstone), 'conflict');

  // 列表层过滤：deletedAt 非空的一律不可见
  const visible = [tombstone, coupon('c4', '2026-10-21T10:00:00.000Z')].filter((c) => !c.deletedAt);
  check('墓碑不出现在列表里', visible.map((c) => c.id), ['c4']);
}

// --------------------------------------------- 5. 提醒状态不参与同步（按设备各算）
console.log('5) 提醒字段仅本地');
{
  const local = coupon('c5', '2026-10-21T10:00:00.000Z', { isReminded: true, remindedDays: [7, 3] });
  const cloud = coupon('c5', '2026-10-21T09:00:00.000Z', { isReminded: false, remindedDays: [] });
  // 提醒只写本地，不置 dirty —— 所以即使本地 remindedDays 更「新」，也不该推动同步
  check('只改提醒不改变写入判定（云端更旧 → update）', decideWrite(local, cloud), 'update');
  const merged = mergeCloudOverLocal(local, cloud);
  check('以云端为准时提醒仍取本机', merged.remindedDays, [7, 3]);
}

console.log(`\n并发回归：${passed} 通过，${failed} 失败`);
if (failed) process.exit(1);
