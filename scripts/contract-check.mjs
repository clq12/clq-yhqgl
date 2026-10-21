#!/usr/bin/env node
/**
 * 双端业务规则契约检查。
 *
 * 做两件事：
 * 1) 店铺名单不得漂移 —— shared/data/stores.json 是唯一真相源，
 *    TS 与 Kotlin 里那两份内联拷贝必须和它逐项一致。
 * 2) 行为契约 —— 用 shared/data/contract-cases.json 里的固定用例，
 *    在固定的「当前时间」下算出结果写入 contract-expected.json；
 *    Android 单测拿同一份用例跑 Kotlin 实现，必须得出完全相同的结论。
 *
 * 用法：
 *   node scripts/contract-check.mjs           校验（CI 用，不一致就非 0 退出）
 *   node scripts/contract-check.mjs --write   重新生成 expected（改了规则后用）
 *
 * 注意：本脚本用 node 的 --experimental-strip-types 直接跑 TypeScript 规则，
 * 所以不要在这条链路上引入需要编译的语法（enum / 装饰器 / 参数属性）。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const STORES_JSON = resolve(root, 'shared/data/stores.json');
const TAGS_JSON = resolve(root, 'shared/data/tags.json');
const CASES_JSON = resolve(root, 'shared/data/contract-cases.json');
const EXPECTED_JSON = resolve(root, 'shared/data/contract-expected.json');
const TS_RULES = resolve(root, 'shared/types/typescript/couponRules.ts');
const KT_RULES = resolve(root, 'shared/types/kotlin/CouponRules.kt');

const write = process.argv.includes('--write');
const problems = [];

// ---------------------------------------------------------------- 1. 店铺名单
const canonical = JSON.parse(readFileSync(STORES_JSON, 'utf8')).stores;

function extractQuoted(text, startPattern) {
  const idx = text.search(startPattern);
  if (idx < 0) return null;
  // 只取到列表的收尾括号为止，否则会把后面的 " " / "其他" 一起吞进来
  let end = text.length;
  for (let i = idx; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === ']' || ch === ')') {
      end = i;
      break;
    }
  }
  const slice = text.slice(idx, end);
  const matches = slice.match(/["']([^"'\n]{1,10})["']/g) ?? [];
  return matches.map((m) => m.slice(1, -1));
}

const tsSource = readFileSync(TS_RULES, 'utf8');
const ktSource = readFileSync(KT_RULES, 'utf8');

const tsStores = extractQuoted(tsSource, /const commonStores\s*=\s*\[/);
const ktStores = extractQuoted(ktSource, /val commonStores\s*=\s*listOf\(/);

function diff(label, actual) {
  if (!actual) {
    problems.push(`[${label}] 找不到店铺名单，检查起来源是否改名`);
    return;
  }
  const a = new Set(actual);
  const c = new Set(canonical);
  const missing = canonical.filter((x) => !a.has(x));
  const extra = actual.filter((x) => !c.has(x));
  if (missing.length) problems.push(`[${label}] 缺少：${missing.join('、')}`);
  if (extra.length) problems.push(`[${label}] 多出：${extra.join('、')}`);
}

diff('TypeScript', tsStores);
diff('Kotlin', ktStores);

// ------------------------------------------------- 1b. 常用标签（顺序也有意义：推荐顺序）
const canonicalTags = JSON.parse(readFileSync(TAGS_JSON, 'utf8')).tags;

function diffOrdered(label, actual, expected) {
  if (!actual) {
    problems.push(`[${label}] 找不到常用标签名单，检查起来源是否改名`);
    return;
  }
  if (actual.join('\u0001') !== expected.join('\u0001')) {
    const missing = expected.filter((x) => !actual.includes(x));
    const extra = actual.filter((x) => !expected.includes(x));
    const detail = [
      missing.length ? `缺少：${missing.join('、')}` : '',
      extra.length ? `多出：${extra.join('、')}` : '',
      !missing.length && !extra.length ? '内容相同但顺序不同' : '',
    ]
      .filter(Boolean)
      .join('；');
    problems.push(`[${label}] 与 tags.json 不一致（${detail}）`);
  }
}

diffOrdered('TypeScript 标签', extractQuoted(tsSource, /const defaultTags\s*=\s*\[/), canonicalTags);
diffOrdered('Kotlin 标签', extractQuoted(ktSource, /val defaultTags\s*=\s*listOf\(/), canonicalTags);

// ---------------------------------------------------------------- 2. 行为契约
const casesFile = JSON.parse(readFileSync(CASES_JSON, 'utf8'));
const nowMs = Date.parse(casesFile.nowIso);
if (Number.isNaN(nowMs)) {
  problems.push(`[契约] nowIso 无法解析：${casesFile.nowIso}`);
}

const rules = await import(`file://${TS_RULES.replace(/\\/g, '/')}`);

const computed = {
  nowIso: casesFile.nowIso,
  nowMs,
  tagCases: (casesFile.tagCases ?? []).map(({ raw, note }) => ({
    raw,
    note,
    normalized: rules.normalizeTag(raw),
  })),
  suggestCase: (() => {
    const s = casesFile.suggestCase;
    if (!s) return null;
    return {
      existing: s.existing,
      exclude: s.exclude ?? [],
      limit: s.limit ?? 8,
      expected: rules.suggestTags(
        s.existing.map((tags) => ({ tags })),
        s.exclude ?? [],
        s.limit ?? 8,
      ),
    };
  })(),
  cases: casesFile.cases.map(({ name, coupon }) => ({
    name,
    deadlineMs: rules.deadlineTimestamp(coupon),
    remainingDays: rules.remainingDays(coupon, nowMs),
    expired: rules.isExpired(coupon, nowMs),
    active: rules.isActive(coupon, nowMs),
    statusText: rules.statusLabel(coupon, nowMs).text,
    statusTone: rules.statusLabel(coupon, nowMs).tone,
    discountLabel: rules.discountLabel(coupon),
    store: rules.extractStore(coupon.title),
  })),
};

if (write) {
  writeFileSync(EXPECTED_JSON, JSON.stringify(computed, null, 2) + '\n', 'utf8');
  console.log(`已写入 ${EXPECTED_JSON}（${computed.cases.length} 条用例）`);
} else if (!existsSync(EXPECTED_JSON)) {
  problems.push('[契约] 缺少 contract-expected.json，先跑一次 --write');
} else {
  const expected = JSON.parse(readFileSync(EXPECTED_JSON, 'utf8'));
  if (expected.nowMs !== computed.nowMs) {
    problems.push(`[契约] nowMs 不一致：expected=${expected.nowMs} 现在=${computed.nowMs}`);
  }
  // 标签归一化与推荐顺序：单独比对，格式和上面的一致性检查无关
  for (const key of ['tagCases', 'suggestCase']) {
    if (JSON.stringify(expected[key]) !== JSON.stringify(computed[key])) {
      problems.push(
        `[契约] ${key} 变了：expected=${JSON.stringify(expected[key])} 现在=${JSON.stringify(computed[key])}（规则改动是有意的就重跑 --write）`,
      );
    }
  }
  for (let i = 0; i < computed.cases.length; i += 1) {
    const e = expected.cases[i];
    const a = computed.cases[i];
    if (!e) {
      problems.push(`[契约] expected 缺少第 ${i + 1} 条（${a.name}）`);
      continue;
    }
    for (const key of Object.keys(a)) {
      if (JSON.stringify(a[key]) !== JSON.stringify(e[key])) {
        problems.push(
          `[契约] ${a.name} 的 ${key} 变了：expected=${JSON.stringify(e[key])} 现在=${JSON.stringify(a[key])}（规则改动是有意的就重跑 --write）`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------- 结果
if (problems.length) {
  console.error('\n契约检查未通过：');
  for (const p of problems) console.error(' - ' + p);
  process.exit(1);
}
console.log('契约检查通过：店铺名单两端一致，行为用例与 expected 吻合。');
