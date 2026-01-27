# 推送合并优化说明

## 概述

将原本的3条独立推送合并为1条推送，按紧急程度排序显示。

## 修改内容

### 1. 推送逻辑变更

**修改前：**
- 每小时检查一次
- 分开发送3条推送（7天、3天、1天）
- 用户可能收到3条消息

**修改后：**
- 每小时检查一次
- 合并发送1条推送
- 按紧急程度排序（1天→3天→7天）

### 2. 消息格式变更

**修改前：**
```
推送1：🔔 优惠券即将到期提醒（7天内）
推送2：🔔 优惠券即将到期提醒（3天内）
推送3：🔔 优惠券即将到期提醒（1天内）
```

**修改后：**
```
🔔 优惠券即将到期提醒

🚨 1天内到期（X张）
⚠️ 3天内到期（Y张）
📢 7天内到期（Z张）

📱 查看优惠券详情 → https://clq-rosy.vercel.app
```

### 3. 颜色标识

- 🚨 **1天内**：红色 (#e11d48) - 最紧急
- ⚠️ **3天内**：橙色 (#f97316) - 较紧急
- 📢 **7天内**：黄色 (#eab308) - 一般提醒

### 4. 底部链接更新

- 链接：https://clq-rosy.vercel.app
- 文字："📱 查看优惠券详情"

## 技术实现

### 修改的文件

1. **`/src/app/api/check-expiring/route.ts`**
   - 合并3次推送为1次
   - 调用新的 `generateGroupedExpiringMessage` 函数

2. **`/src/lib/pushplus.ts`**
   - 新增 `generateGroupedExpiringMessage` 函数
   - 支持分组显示（1天、3天、7天）
   - 更新底部链接为 https://clq-rosy.vercel.app

### 代码示例

```typescript
// 新的推送逻辑
const totalCount = within1Day.length + within3Days.length + within7Days.length

if (totalCount > 0) {
  const message = generateGroupedExpiringMessage({
    within1Day,
    within3Days,
    within7Days,
  })

  await sendPushPlus({
    token: config.pushplusToken,
    title: "优惠券即将到期提醒",
    content: message,
    template: "html",
  })
}
```

## 优势

### 1. 用户体验提升
- ✅ 减少推送数量，避免打扰
- ✅ 信息集中，一目了然
- ✅ 按紧急程度排序，优先处理重要信息

### 2. 开发维护简化
- ✅ 减少 PushPlus 调用次数
- ✅ 统一的消息格式
- ✅ 更容易维护和扩展

### 3. 视觉效果优化
- ✅ 使用不同颜色区分紧急程度
- ✅ 分组显示，层次清晰
- ✅ 响应式设计，移动端友好

## 推送示例

### 完整推送

```
🔔 优惠券即将到期提醒

今天是 2026/01/27，您共有 6 张优惠券即将到期

🚨 1天内到期（1张）

1. 免减券 - 5元无门槛
   ⏰ 剩余时间：13小时
   📅 到期时间：2026/01/27
   📝 备注：新用户专享

⚠️ 3天内到期（2张）

1. 满减券 - 满200减50
   ⏰ 剩余时间：2天5小时
   📅 到期时间：2026/01/29
   📝 备注：仅限线下门店

2. 折扣券 - 服饰类目7折
   ⏰ 剩余时间：1天18小时
   📅 到期时间：2026/01/28
   📝 备注：无

📢 7天内到期（3张）

1. 满减券 - 满100减20
   ⏰ 剩余时间：6天15小时
   📅 到期时间：2026/02/02
   📝 备注：限生鲜类目使用

2. 折扣券 - 全场8折
   ⏰ 剩余时间：5天8小时
   📅 到期时间：2026/02/01
   📝 备注：无

3. 满减券 - 满300减80
   ⏰ 剩余时间：4天12小时
   📅 到期时间：2026/01/31
   📝 备注：无

请及时使用优惠券，避免过期浪费

📱 查看优惠券详情
```

## 测试方法

### 本地测试

```bash
# 1. 设置环境变量
export WEBDAV_URL="https://dav.jianguoyun.com/dav/"
export WEBDAV_USERNAME="你的账号"
export WEBDAV_PASSWORD="你的密码"
export PUSHPLUS_TOKEN="你的Token"

# 2. 调用 API
curl http://localhost:5000/api/check-expiring
```

### 预期响应

```json
{
  "success": true,
  "message": "检查完成，发送了 6 条提醒",
  "data": {
    "totalSent": 6,
    "within7Days": 3,
    "within3Days": 2,
    "within1Day": 1
  }
}
```

## 注意事项

1. **分组逻辑**
   - 同一优惠券可能出现在多个组中
   - 例如：剩余13小时的优惠券会出现在所有3组中

2. **显示顺序**
   - 固定为：1天 → 3天 → 7天
   - 每组内按优惠券原始顺序显示

3. **推送频率**
   - 仍为每小时检查一次
   - 但只发送1条推送

## 相关文档

- [推送消息格式说明](./PUSH_MESSAGE_MERGED.md)
- [提醒逻辑说明](./REMINDER_LOGIC_V2.md)
- [PushPlus 配置指南](./PUSHPLUS_SETUP.md)
- [GitHub Actions 配置指南](./GITHUB_ACTIONS_SETUP.md)

## 变更记录

### 2026-01-27

**修改内容：**
- ✅ 将3条推送合并为1条
- ✅ 按紧急程度排序（1天→3天→7天）
- ✅ 使用不同颜色区分
- ✅ 更新底部链接为 https://clq-rosy.vercel.app

**影响范围：**
- `/src/app/api/check-expiring/route.ts` - 推送逻辑
- `/src/lib/pushplus.ts` - 消息生成函数
- `README.md` - 文档更新
- `REMINDER_LOGIC_V2.md` - 提醒逻辑说明
