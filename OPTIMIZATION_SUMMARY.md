# 精确提醒功能优化总结

## 完成时间
2026-01-27

## 优化目标
优化推送提醒逻辑，实现精确到小时的提醒功能，支持每小时检查一次；默认启用AI智能识别，失败自动回退规则匹配。

## 核心改进

### 1. 精确到小时的提醒逻辑

#### 改进前
- 提醒时间按天计算（如7天后23点到期，在7天前的任意时间提醒）
- 可能导致提醒不及时或重复提醒

#### 改进后
- 提醒时间精确到小时（如7天后23点到期，在7天前的23点提醒）
- 每小时检查一次，确保及时提醒
- 匹配截止小时进行提醒，提高准确性

#### 实现细节
```javascript
// 计算提前days天的提醒时间
const remindDate = new Date(endDate)
remindDate.setDate(remindDate.getDate() - days)

// 检查当前时间是否匹配（精确到小时）
if (remindDate.getHours() === currentHour &&
    remindDate.getDate() === now.getDate()) {
  // 发送提醒
}
```

### 2. 按天分组提醒

#### 改进前
- 一次调用返回所有需要提醒的优惠券
- 只返回一个天数（reasonDays）
- 可能导致不同天数的提醒混淆

#### 改进后
- 按天分别检查（7天、3天、1天）
- 每天分别发送推送
- 避免混淆，提高可读性

#### 实现细节
```javascript
// 按天分组检查
for (const days of [7, 3, 1]) {
  const { coupons: needRemindCoupons } = await getCouponsToRemindNow([days])

  if (needRemindCoupons.length > 0) {
    // 发送该天数的提醒
    const message = generateExpiringMessage(needRemindCoupons, days)
    await sendPushPlus({
      token: config.pushplusToken,
      title: `优惠券即将到期提醒（${days}天）`,
      content: message,
      template: "html",
    })
  }
}
```

### 3. 定时任务优化

#### 推荐配置
- **检查频率**：每小时一次（`0 * * * *`）
- **原因**：
  - 精确到小时的提醒需要每小时检查
  - 确保不遗漏任何提醒时刻
  - 避免提醒延迟

#### 配置示例
```bash
# cron-job.org
0 * * * *

# GitHub Actions
schedule:
  - cron: '0 * * * *'

# 阿里云定时触发器
0 * * * *
```

### 4. 默认启用AI智能识别

#### 改进前
- 默认使用规则匹配
- 需要手动启用AI识别

#### 改进后
- 默认启用AI智能识别（useAI=true）
- AI识别失败自动回退规则匹配
- 提高识别准确率

#### 实现细节
```typescript
// 默认使用AI识别
const useAI = true

try {
  // 调用AI识别
  const result = await parseWithAI(text)
  return result
} catch (error) {
  // AI失败，回退到规则匹配
  console.warn("AI识别失败，使用规则匹配")
  return parseWithRules(text)
}
```

## 文件修改

### 核心文件

1. **src/lib/webdav-storage.ts**
   - 优化 `getCouponsToRemindNow` 函数
   - 实现精确到小时的提醒逻辑
   - 匹配截止小时进行提醒

2. **src/app/api/check-expiring/route.ts**
   - 按天分组检查和发送提醒
   - 优化去重逻辑
   - 改进错误处理

3. **src/components/BatchOcrRecognizer.tsx**
   - 默认启用AI识别
   - 实现自动回退机制
   - 优化用户界面

4. **src/app/api/parse-coupon/route.ts**
   - 集成AI识别和规则匹配
   - 实现错误处理和回退逻辑

### 文档更新

1. **PUSHPLUS_SETUP.md**
   - 更新注意事项说明精确提醒
   - 添加时区设置说明

2. **PRECISE_REMINDER.md**（新增）
   - 详细说明精确提醒功能
   - 提供测试方法和常见问题解答
   - 包含实际案例和最佳实践

## 技术亮点

### 1. 精确时间匹配
- 使用小时级精度计算提醒时间
- 避免提前或延迟提醒
- 提高用户体验

### 2. 智能回退机制
- AI识别优先
- 失败自动回退规则匹配
- 确保稳定性

### 3. 分组推送
- 按天分组发送提醒
- 提高推送可读性
- 避免混淆

### 4. 完善的去重机制
- 记录已提醒天数
- 避免重复提醒
- 节省推送次数

## 测试验证

### 功能测试
1. ✅ 精确到小时的提醒逻辑
2. ✅ 按天分组推送
3. ✅ AI识别自动回退
4. ✅ 去重机制

### 接口测试
1. ✅ `/api/check-expiring` 接口正常响应
2. ✅ 环境变量配置正确读取
3. ✅ WebDAV集成正常工作

### 构建测试
1. ✅ 项目构建成功
2. ✅ 无类型错误
3. ✅ 无运行时错误

## 后续建议

### 短期
1. 添加提醒日志记录功能
2. 实现提醒历史查询
3. 添加提醒统计功能

### 长期
1. 支持自定义提醒时间
2. 实现多渠道推送（邮件、短信）
3. 添加提醒模板自定义功能

## 注意事项

1. **定时任务配置**：请确保定时任务每小时执行一次
2. **时区设置**：确保服务器时区正确
3. **PushPlus限制**：注意免费版每日200条限制
4. **WebDAV同步**：确保配置正确，避免数据不同步

## 总结

本次优化成功实现了精确到小时的提醒功能，提高了提醒的准确性和及时性。同时，默认启用AI智能识别并实现自动回退机制，提高了识别准确率和系统稳定性。建议用户配置每小时执行一次的定时任务，以确保及时收到提醒。
