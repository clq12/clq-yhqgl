# 优惠券业务规则

> 所有端必须严格遵循以下规则，确保跨端行为一致。

---

## 1. 时间规则（北京时间 UTC+8）

- 所有日期字段如无显式时区，均按北京时间解释。
- `endDate` 只存储日期部分 `YYYY-MM-DD`。
- 真正的截止时间为：`endDate + endHour:endMinute:59`（北京时间）。
- 转换为 UTC 时间戳：
  ```
  utcTimestamp = beijingTimestamp - 8h
  ```
- 计算剩余小时数：
  ```
  remainingHours = floor((utcDeadline - nowUtc) / 3600000)
  ```
- 计算剩余天数：
  ```
  remainingDays = floor(remainingHours / 24)
  ```

## 2. 状态规则

| 状态 | 判定条件 |
|------|----------|
| 已使用 | `isUsed === true` |
| 已过期 | `isUsed === false` 且 `utcDeadline < nowUtc` |
| 未使用（有效） | `isUsed === false` 且 `utcDeadline >= nowUtc` |

## 3. 提醒规则

- 提醒按 `remindDays` 配置触发，默认 `[7, 3, 1]`。
- 对每张未使用优惠券，当 `remainingHours >= 0` 且 `remainingHours < days * 24` 时触发对应天数提醒。
- 已触发过的天数记录在 `remindedDays` 中，避免同一班次重复通知。
- 提醒时间窗口：检查时刻与目标提醒时刻相差不超过 1 小时即触发（兼容定时任务不精确）。

## 4. 分类/店铺识别规则

- 优先匹配内置店铺关键词（淘宝、天猫、京东、拼多多、美团、饿了么、盒马、山姆、Costco、永辉、大润发、家乐福、沃尔玛、优衣库、ZARA、H&M、Nike、Adidas、星巴克、喜茶、奈雪、瑞幸、肯德基、麦当劳、海底捞、小龙坎、蜜雪冰城、云闪付、一鸣、古茗、立减金、小蚕、库迪等）。
- 未命中时，取标题第一个空格前的词作为店铺名。
- 还无则归为「其他」。

## 5. 统计规则

- 总优惠金额：`sum(discountAmount ?? 0)`
- 已使用金额：`sum(discountAmount ?? 0 for isUsed=true)`
- 待使用金额：总优惠金额 - 已使用金额
- 店铺排行榜按金额降序取前 10。
- 分类饼图按店铺金额聚合取前 8。

## 6. 有效性校验规则

- 标题非空，长度 1-255。
- 截止日期必须大于等于开始日期。
- `discountType=full` 时，`fullAmount > 0` 且 `discountAmount > 0`。
- `discountType=amount|percentage` 时，`discountAmount > 0`。
- `endHour` 必须在 0-23，`endMinute` 必须在 0-59。

## 标签（tags）

标签是自由文本，用来按平台/场景归类（抖音、拼多多、淘宝、美团…），不是店铺识别名单的替代品：
`extractStore` 仍然从标题猜店铺，标签是用户自己打的、可以多个、可以自定义。

双端必须一致的规则（`shared/types/{typescript,kotlin}` + `shared/data/tags.json`）：

| 规则 | 说明 |
|---|---|
| `normalizeTag(raw)` | 连续空白（含全角空格 `\u3000`）压成一个空格；去掉开头的 `#` / `＃`（可多个）；首尾去空白；超过 12 个字符截断；空串或纯空白返回 `null` |
| `normalizeTags(list)` | 逐项归一化，丢 `null`、去重、保持首次出现顺序 |
| `suggestTags(coupons, exclude, limit)` | 统计历史标签频次 → 频次降序、**同频按字符序**（不能用 locale 相关比较器，否则两端顺序不同）→ 排除 `exclude` → 不足 `limit` 时用 `defaultTags` 按默认顺序补位 |
| `detectTags(text)` | 文本包含哪个常用标签就返回哪个，按 `defaultTags` 顺序 |

`shared/data/tags.json` 是常用标签的唯一真相源，顺序即推荐顺序；`scripts/contract-check.mjs`
会校验 TS 与 Kotlin 的两份内联拷贝与它逐项、逐序一致。
