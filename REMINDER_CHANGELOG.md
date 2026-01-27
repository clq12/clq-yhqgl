# 提醒逻辑变更说明

## 变更概述

提醒逻辑从**单次推送**改为**重复推送**，确保用户不会错过任何提醒。

## 旧逻辑（单次推送）

```
优惠券到期前 7天、3天、1天 的同一小时提醒
提醒后记录状态，不再重复提醒
```

**示例：**
- 优惠券还有 13小时 过期 → 只收到 1条推送（1天前）
- 优惠券还有 2天 过期 → 收到 2条推送（7天前、3天前）

**问题：**
- 如果错过了某次提醒，不会再收到
- 需要维护提醒状态

## 新逻辑（重复推送）

```
每小时检查一次
根据剩余时间分组发送推送
允许重复推送，不记录提醒状态
```

**示例：**
- 优惠券还有 13小时 过期 → 收到 **3条推送**（7天内+3天内+1天内）
- 优惠券还有 2天 过期 → 收到 **2条推送**（7天内+3天内）
- 优惠券还有 5天 过期 → 收到 **1条推送**（7天内）

**优势：**
- 不会错过提醒
- 紧迫感递增（7天→3天→1天）
- 简化逻辑，无需维护提醒状态

## 代码变更

### 旧代码（已移除）

```typescript
// 使用 getCouponsToRemindNow 过滤已提醒的优惠券
const { coupons: needRemindCoupons } = await getCouponsToRemindNow([days])

// 更新提醒状态
updatedCoupons[index] = {
  ...updatedCoupons[index],
  remindedDays: [...remindedDays, days],
  isReminded: true,
}
```

### 新代码

```typescript
// 直接计算剩余天数并分组
for (const coupon of allCoupons) {
  if (coupon.isUsed) continue

  const days = getDaysRemaining(coupon)

  if (days <= 7) within7Days.push(coupon)
  if (days <= 3) within3Days.push(coupon)
  if (days <= 1) within1Day.push(coupon)
}

// 分组发送推送（允许重复）
if (within7Days.length > 0) await sendPushPlus(...)
if (within3Days.length > 0) await sendPushPlus(...)
if (within1Day.length > 0) await sendPushPlus(...)
```

## 数据结构变更

### WebDAVCoupon 类型

```typescript
export interface WebDAVCoupon {
  id: string
  title: string
  // ... 其他字段

  isReminded: boolean          // 保留（向后兼容）
  remindedDays: number[]        // 保留（不再使用）
  isUsed: boolean              // 仍用于排除已使用优惠券

  // ... 其他字段
}
```

**说明：**
- `isReminded` 和 `remindedDays` 字段保留，确保向后兼容
- 新逻辑不再使用这两个字段
- `isUsed` 仍用于排除已使用的优惠券

## 验证方法

### 1. 测试提醒

手动调用 API 查看返回结果：

```bash
curl -X GET "https://your-app.vercel.app/api/check-expiring" \
  -H "Cookie: webdav_config=..."
```

**预期响应：**

```json
{
  "success": true,
  "message": "检查完成，发送了 9 条提醒",
  "data": {
    "totalSent": 9,
    "within7Days": 5,
    "within3Days": 3,
    "within1Day": 1
  }
}
```

### 2. 查看推送

登录 PushPlus 控制台查看推送记录：
- 访问：https://www.pushplus.plus/push1
- 查看推送历史
- 确认收到多条推送

### 3. 重复测试

同一张优惠券会收到多条推送：
- 剩余时间 ≤ 7天 → 7天内推送
- 剩余时间 ≤ 3天 → 3天内推送（重复）
- 剩余时间 ≤ 1天 → 1天内推送（重复）

## 注意事项

⚠️ **重要提示：**

1. **推送频率**
   - 每小时检查一次
   - 如果优惠券在多个时间范围内，会收到多条推送
   - 这是预期行为，不是错误

2. **已使用优惠券**
   - 标记为 `isUsed` 的优惠券不会收到提醒
   - 如果收到不需要的推送，请将优惠券标记为已使用

3. **时区问题**
   - 所有时间基于服务器时区（通常为 UTC）
   - 可能与本地时间有差异

4. **旧数据兼容**
   - 旧数据中的 `isReminded` 和 `remindedDays` 字段不影响新逻辑
   - 无需迁移数据

## 切换到新逻辑

新逻辑已自动应用，无需任何操作。

如需回退到旧逻辑，请联系开发者。

## 相关文档

- [提醒逻辑详细说明](./REMINDER_LOGIC_V2.md)
- [GitHub Actions 配置指南](./GITHUB_ACTIONS_SETUP.md)
- [PushPlus 配置指南](./PUSHPLUS_SETUP.md)

## 常见问题

### Q: 为什么会收到多条推送？

A: 新逻辑允许重复推送，确保不会错过提醒。例如剩余13小时的优惠券会收到3条推送（7天+3天+1天）。

### Q: 如何停止重复推送？

A: 将优惠券标记为"已使用"，系统会自动排除已使用的优惠券。

### Q: 提醒时间准确吗？

A: 系统每小时检查一次，精确到小时。例如23点过期的优惠券，会在23点提醒。

### Q: 如何调整提醒频率？

A: 修改 GitHub Actions 工作流中的 cron 表达式。详细说明请查看 [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md)。
