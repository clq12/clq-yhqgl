# 优惠券到期提醒逻辑（重复推送）

## 提醒规则

系统会每小时检查一次，并根据剩余时间发送多条提醒消息：

### 提醒时间点

1. **7天内到期提醒**
   - 剩余时间 ≤ 7天的优惠券
   - 发送频率：每小时检查一次

2. **3天内到期提醒**
   - 剩余时间 ≤ 3天的优惠券
   - 发送频率：每小时检查一次

3. **1天内到期提醒**
   - 剩余时间 ≤ 1天的优惠券
   - 发送频率：每小时检查一次

### 重复推送示例

假设一张优惠券还有 **13小时** 过期：

- 会收到 **3条推送**：
  - "优惠券即将到期提醒（7天内）" ✓
  - "优惠券即将到期提醒（3天内）" ✓
  - "优惠券即将到期提醒（1天内）" ✓

假设一张优惠券还有 **2天** 过期：

- 会收到 **2条推送**：
  - "优惠券即将到期提醒（7天内）" ✓
  - "优惠券即将到期提醒（3天内）" ✓
  - "优惠券即将到期提醒（1天内）" ✗（超过1天）

假设一张优惠券还有 **5天** 过期：

- 会收到 **1条推送**：
  - "优惠券即将到期提醒（7天内）" ✓
  - "优惠券即将到期提醒（3天内）" ✗（超过3天）
  - "优惠券即将到期提醒（1天内）" ✗（超过1天）

## 计算规则

### 剩余天数计算

```typescript
days = Math.ceil(剩余毫秒数 / (1000 * 60 * 60 * 24))
```

- 使用 `Math.ceil` 向上取整
- 剩余 13小时 = 1天
- 剩余 2天1小时 = 3天

### 截止时间计算

- 默认截止时间：**23:00**
- 可自定义截止小时（0-23）
- 计算时考虑截止小时，精确到小时

## 检查逻辑

```
每小时检查一次（0 * * * *）

对于每张优惠券：
  ├─ 如果 isUsed = true，跳过
  ├─ 计算剩余天数
  ├─ 如果剩余天数 ≤ 7，加入"7天内"组
  ├─ 如果剩余天数 ≤ 3，加入"3天内"组
  └─ 如果剩余天数 ≤ 1，加入"1天内"组

分组发送推送：
  ├─ 7天内组 > 0 → 发送推送
  ├─ 3天内组 > 0 → 发送推送
  └─ 1天内组 > 0 → 发送推送
```

## 推送示例

### 微信推送内容示例

**7天内到期提醒：**

```
📢 优惠券即将到期提醒（7天内）

您有 3 张优惠券即将在7天内到期：

1. 满减券 - 满100减20
   截止日期：2026-01-30 23:00
   剩余时间：6天 5小时

2. 折扣券 - 全场8折
   截止日期：2026-02-05 23:00
   剩余时间：13天 2小时

3. 免减券 - 5元无门槛
   截止日期：2026-01-25 23:00
   剩余时间：1天 15小时

请及时使用，避免过期浪费！
```

## 配置要求

### GitHub Actions 配置

```yaml
name: 检查优惠券到期

on:
  schedule:
    - cron: '0 * * * *'  # 每小时执行一次

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: 检查到期提醒
        run: |
          curl -X GET "https://your-app.vercel.app/api/check-expiring"
        env:
          WEBDAV_URL: ${{ secrets.WEBDAV_URL }}
          WEBDAV_USERNAME: ${{ secrets.WEBDAV_USERNAME }}
          WEBDAV_PASSWORD: ${{ secrets.WEBDAV_PASSWORD }}
          PUSHPLUS_TOKEN: ${{ secrets.PUSHPLUS_TOKEN }}
```

### 环境变量

需要在 GitHub Secrets 中配置以下变量：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `WEBDAV_URL` | WebDAV 服务器地址 | `https://dav.jianguoyun.com/dav/` |
| `WEBDAV_USERNAME` | WebDAV 用户名 | `your-email@example.com` |
| `WEBDAV_PASSWORD` | WebDAV 密码 | `application-password` |
| `PUSHPLUS_TOKEN` | PushPlus Token | `your-pushplus-token` |

## 优势

### 1. 不会遗漏提醒
- 允许重复推送，确保用户不会错过提醒
- 即使错过了某次推送，下一次还会收到

### 2. 紧迫感递增
- 7天内：开始关注
- 3天内：尽快使用
- 1天内：紧急处理

### 3. 灵活的时间安排
- 每小时检查，精确到小时
- 考虑截止小时，更准确

## 注意事项

⚠️ **重要提示：**

1. **允许重复推送**：同一张优惠券会收到多条推送
2. **排除已使用**：已标记为 `isUsed` 的优惠券不会收到提醒
3. **频率控制**：每小时检查一次，避免推送过于频繁
4. **时区影响**：所有时间基于服务器时区（通常为 UTC）

## 自定义配置

### 修改提醒天数

如需修改提醒天数（如改为 14天、7天、3天），编辑文件：

```typescript
// src/app/api/check-expiring/route.ts

const within14Days: Coupon[] = []
const within7Days: Coupon[] = []
const within3Days: Coupon[] = []

for (const coupon of allCoupons) {
  if (days <= 14) within14Days.push(coupon)
  if (days <= 7) within7Days.push(coupon)
  if (days <= 3) within3Days.push(coupon)
}
```

### 修改检查频率

在 GitHub Actions 工作流中修改 cron 表达式：

```yaml
# 每2小时检查一次
- cron: '0 */2 * * *'

# 每30分钟检查一次
- cron: '*/30 * * * *'

# 每天8点检查一次
- cron: '0 8 * * *'
```

## 相关文档

- [PushPlus 配置指南](./PUSHPLUS_SETUP.md)
- [GitHub Actions 配置指南](./GITHUB_ACTIONS_SETUP.md)
- [WebDAV 配置指南](./README.md)
