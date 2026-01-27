# 推送失败排查指南

## 错误信息

```
HTTP代码：500
响应：{"success":false,"error":"推送发送失败"}
```

## 可能的原因

### 1. PushPlus Token 配置错误

**检查方法：**
1. 登录 PushPlus 控制台：https://www.pushplus.plus/push1
2. 查看 Token 是否正确
3. 检查 Token 是否过期

**解决方法：**
1. 重新生成 PushPlus Token
2. 更新 GitHub Secrets 中的 `PUSHPLUS_TOKEN`

### 2. WebDAV 配置错误

**检查方法：**
1. 访问应用：https://clq-rosy.vercel.app
2. 检查是否能正常访问优惠券列表
3. 查看控制台是否有 WebDAV 相关错误

**解决方法：**
1. 重新配置 WebDAV
2. 更新 GitHub Secrets 中的 WebDAV 配置

### 3. 没有需要提醒的优惠券

**检查方法：**
1. 查看应用日志
2. 确认是否有未使用的优惠券
3. 确认优惠券是否在 7 天内到期

**解决方法：**
1. 添加测试优惠券（7天后到期）
2. 手动触发工作流测试

### 4. PushPlus API 限流

**检查方法：**
1. 查看日志是否有"请求过于频繁"错误
2. 检查推送频率是否过高

**解决方法：**
1. 降低推送频率
2. 等待一段时间后重试

## 调试步骤

### 步骤 1: 查看详细日志

修改后的代码会输出详细的日志：

```typescript
console.log(`总共找到 ${allCoupons.length} 张优惠券`)
console.log(`优惠券 "${coupon.title}": 剩余 ${days}天 ${hours}小时`)
console.log(`分组结果: 1天内=${within1Day.length}张, 3天内=${within3Days.length}张, 7天内=${within7Days.length}张`)
console.log(`推送消息已生成，长度: ${message.length} 字符`)
```

### 步骤 2: 检查 GitHub Secrets

访问 GitHub 仓库：
1. Settings → Secrets and variables → Actions
2. 检查以下 Secrets 是否正确配置：
   - `WEBDAV_URL`
   - `WEBDAV_USERNAME`
   - `WEBDAV_PASSWORD`
   - `PUSHPLUS_TOKEN`

### 步骤 3: 手动测试推送

**方法 1: 在应用中测试**
1. 访问：https://clq-rosy.vercel.app
2. 手动触发推送功能（如果有）
3. 检查是否能收到推送

**方法 2: 使用 API 测试**
```bash
curl -X GET "https://clq-rosy.vercel.app/api/check-expiring"
```

查看返回的 `details` 字段，了解具体错误原因。

### 步骤 4: 查看 PushPlus 推送记录

1. 访问 PushPlus 控制台：https://www.pushplus.plus/push1
2. 查看推送历史
3. 检查是否有失败的推送记录

### 步骤 5: 检查应用日志

访问 Vercel 控制台：
1. 进入项目页面
2. 点击 Functions 标签
3. 查看 `/api/check-expiring` 的日志

## 常见错误和解决方案

### 错误 1: "推送发送失败" + "PushPlus API 返回错误: code=..."

**可能原因：**
- Token 无效或过期
- PushPlus 账号被限制
- 消息内容格式错误

**解决方法：**
1. 重新生成 PushPlus Token
2. 更新 GitHub Secrets
3. 检查消息内容是否符合要求

### 错误 2: "推送发送失败" + "推送失败: ..."

**可能原因：**
- 网络连接问题
- PushPlus API 服务不可用
- 超时错误

**解决方法：**
1. 检查网络连接
2. 稍后重试
3. 检查 PushPlus 服务状态

### 错误 3: 没有收到推送，但没有错误

**可能原因：**
- PushPlus 订阅设置问题
- 微信通知被屏蔽
- 推送内容太长被截断

**解决方法：**
1. 检查 PushPlus 订阅设置
2. 检查微信通知权限
3. 减少推送内容长度

## 优化建议

### 1. 添加测试优惠券

添加一些测试优惠券，确保推送功能正常：

```json
{
  "title": "测试优惠券",
  "description": "这是一个测试优惠券",
  "endDate": "2026-02-03",
  "notes": "测试备注"
}
```

### 2. 设置推送提醒

1. 登录 PushPlus 控制台
2. 进入订阅设置
3. 确保微信通知已开启
4. 设置推送提醒方式

### 3. 监控推送状态

1. 定期查看 PushPlus 推送历史
2. 检查 GitHub Actions 执行记录
3. 设置失败告警（可选）

## 相关文档

- [GitHub Actions 配置指南](./GITHUB_ACTIONS_SETUP.md)
- [PushPlus 配置指南](./PUSHPLUS_SETUP.md)
- [推送消息格式说明](./PUSH_MESSAGE_MERGED.md)

## 联系支持

如果以上方法都无法解决问题，请联系：
- GitHub Issues: https://github.com/clq12/clq-/issues
- PushPlus 客服: https://www.pushplus.plus/doc/
