# Vercel Cron Jobs 配置指南

## Vercel Cron Jobs 限制

**免费版限制：**
- ✅ 支持**多个** cron 任务（不是只有1个）
- ✅ 每个任务可以设置不同的时间
- ✅ 最小间隔：每小时执行一次
- ⚠️ 注意：免费版每月有执行次数限制（通常足够使用）

**付费版（Pro）：**
- 更多的执行次数
- 更短的间隔限制
- 更高的可靠性

## 当前配置

### 方案 1：每小时检查（推荐）

```json
{
  "crons": [
    {
      "path": "/api/check-expiring",
      "schedule": "0 * * * *"
    }
  ]
}
```

**优点：**
- ✅ 确保精确到小时的提醒不会遗漏
- ✅ 简单，只有一个任务
- ✅ 适合我们的精确提醒需求

**工作原理：**
- 每小时检查一次（0分、1分、2分...）
- 自动判断当前时刻是否需要提醒（7天、3天、1天前）
- 匹配截止小时进行提醒

**示例：**
- 优惠券 7天后23点到期 → 在7天前的23点提醒
- 系统会在 7天前的 23:00 执行检查并发送提醒

---

## 其他配置方案

### 方案 2：只在特定时间点检查

如果你只想在每天的关键时间点检查：

```json
{
  "crons": [
    {
      "path": "/api/check-expiring",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/check-expiring",
      "schedule": "0 12 * * *"
    },
    {
      "path": "/api/check-expiring",
      "schedule": "0 18 * * *"
    },
    {
      "path": "/api/check-expiring",
      "schedule": "0 20 * * *"
    }
  ]
}
```

**说明：**
- 每天早上 9 点检查一次
- 每天中午 12 点检查一次
- 每天下午 6 点检查一次
- 每天晚上 8 点检查一次

**缺点：**
- ❌ 可能错过某些小时的提醒
- ❌ 不适合精确到小时的提醒需求

**适用场景：**
- 不需要精确到小时的提醒
- 想要减少调用次数

---

### 方案 3：混合方案（不推荐）

每小时检查 + 特定时间额外检查：

```json
{
  "crons": [
    {
      "path": "/api/check-expiring",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/check-expiring",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/check-expiring",
      "schedule": "0 20 * * *"
    }
  ]
}
```

**缺点：**
- ❌ 会导致重复检查（9点和20点会检查两次）
- ❌ 浪费执行次数
- ❌ 没有实际意义

---

## Vercel Cron Jobs 语法

### Cron 表达式格式

```
分钟 小时 日期 月份 星期
```

### 常用示例

```json
{
  "crons": [
    {
      "path": "/api/check-expiring",
      "schedule": "0 * * * *"        // 每小时（在0分）
    },
    {
      "path": "/api/check-expiring",
      "schedule": "*/30 * * * *"     // 每30分钟
    },
    {
      "path": "/api/check-expiring",
      "schedule": "0 0 * * *"        // 每天0点
    },
    {
      "path": "/api/check-expiring",
      "schedule": "0 9 * * *"        // 每天早上9点
    },
    {
      "path": "/api/check-expiring",
      "schedule": "0 */6 * * *"      // 每6小时
    },
    {
      "path": "/api/check-expiring",
      "schedule": "0 0,12 * * *"     // 每天0点和12点
    }
  ]
}
```

---

## 如何在 Vercel 配置多个 Cron

### 方法 1：使用 vercel.json（推荐）

在项目根目录创建或编辑 `vercel.json`：

```json
{
  "crons": [
    {
      "path": "/api/check-expiring",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/check-expiring",
      "schedule": "0 9 * * *"
    }
  ]
}
```

### 方法 2：在 Vercel Dashboard 配置

1. 访问 Vercel Dashboard
2. 找到你的项目
3. 点击 Settings → Cron Jobs
4. 点击 "Add Cron Job"
5. 填写：
   - **Path**: `/api/check-expiring`
   - **Schedule**: 选择 cron 表达式
6. 点击 "Save"
7. 可以继续添加多个 cron 任务

---

## 常见问题

### Q: Vercel Cron Jobs 只能设置1个吗？

**A: 不是的。** Vercel 支持多个 cron 任务，但可能有以下限制：

1. **免费版限制**：
   - 免费版支持多个 cron 任务
   - 但每月有执行次数限制（约 100 次/月）
   - 超过后会被限流

2. **最小间隔**：
   - 免费版最小间隔为 1 小时
   - 不能设置为每分钟或每 30 分钟

### Q: 每小时检查会不会次数太多？

**A: 不会。**

- 每小时 1 次检查 = 每天 24 次检查
- 免费版限制约 100 次/月
- 24 次/天 × 30 天 = 720 次/月
- **超过免费版限制！**

### 解决方案

**选项 1：使用付费版**
- Vercel Pro 计划：$20/月
- 支持更多执行次数
- 适合生产环境

**选项 2：降低检查频率**
```json
{
  "crons": [
    {
      "path": "/api/check-expiring",
      "schedule": "0 */6 * * *"  // 每6小时检查一次
    }
  ]
}
```

**选项 3：使用其他平台**
- GitHub Actions（免费）
- cron-job.org（免费）
- 阿里云定时触发器（付费）

---

## 推荐配置方案

### 方案 A：免费版 + 降低频率（推荐个人用户）

```json
{
  "crons": [
    {
      "path": "/api/check-expiring",
      "schedule": "0 */6 * * *"  // 每6小时检查一次
    }
  ]
}
```

**优点：**
- 每天检查 4 次（0点、6点、12点、18点）
- 每月约 120 次（接近免费版限制）
- 免费使用

**缺点：**
- 提醒可能有 1-5 小时的延迟

---

### 方案 B：付费版 + 每小时检查（推荐商业用户）

```json
{
  "crons": [
    {
      "path": "/api/check-expiring",
      "schedule": "0 * * * *"  // 每小时检查一次
    }
  ]
}
```

**优点：**
- 精确到小时的提醒
- 及时提醒，不遗漏

**缺点：**
- 需要 Vercel Pro 计划（$20/月）

---

### 方案 C：使用 cron-job.org（完全免费）

如果不想使用 Vercel Cron Jobs，可以使用 cron-job.org：

1. 访问 [cron-job.org](https://cron-job.org/)
2. 创建新的 cronjob
3. 配置：
   - URL: `https://你的应用.vercel.app/api/check-expiring`
   - Cron: `0 * * * *`（每小时）
4. 保存配置

**优点：**
- 完全免费
- 支持每小时执行
- 无执行次数限制

**缺点：**
- 需要额外的服务
- 依赖第三方平台

---

## 当前项目的最佳配置

**推荐：使用 cron-job.org（完全免费）**

```json
{
  "crons": []
}
```

**原因：**
1. ✅ 完全免费
2. ✅ 支持每小时执行
3. ✅ 无执行次数限制
4. ✅ 精确到小时的提醒
5. ✅ 不依赖 Vercel Cron Jobs

**配置步骤：**
1. 访问 [cron-job.org](https://cron-job.org/)
2. 创建新的 cronjob
3. URL: `https://你的应用.vercel.app/api/check-expiring`
4. Cron: `0 * * * *`（每小时）
5. 保存配置

---

## 总结

| 方案 | 费用 | 执行频率 | 提醒精度 | 推荐度 |
|------|------|----------|----------|--------|
| Vercel 每小时 | $20/月 | 每小时 | 精确 | ⭐⭐⭐ |
| Vercel 每6小时 | 免费 | 每6小时 | 延迟1-5小时 | ⭐⭐ |
| cron-job.org | 免费 | 每小时 | 精确 | ⭐⭐⭐⭐⭐ |
| GitHub Actions | 免费 | 每小时 | 精确 | ⭐⭐⭐⭐ |

**推荐使用 cron-job.org**，完全免费且支持每小时执行！
