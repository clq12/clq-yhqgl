# 推送失败快速修复指南

## 当前错误

```
HTTP代码：500
响应：{"success":false,"error":"推送发送失败"}
```

## 已完成的修复

### 1. 增强错误信息输出

**修改文件：**
- `src/lib/pushplus.ts` - 返回详细错误信息
- `src/app/api/check-expiring/route.ts` - 添加调试日志

**新增功能：**
- ✅ 返回 PushPlus API 具体错误码
- ✅ 记录推送消息长度
- ✅ 记录优惠券分组结果
- ✅ 记录每张优惠券的剩余时间

### 2. 调试日志输出

现在会输出以下日志：
```
总共找到 X 张优惠券
优惠券 "xxx": 剩余 X天 X小时
分组结果: 1天内=X张, 3天内=X张, 7天内=X张
推送消息已生成，长度: X 字符
推送成功！
```

## 立即排查步骤

### 步骤 1: 检查 GitHub Secrets（最可能的问题）

1. 访问：https://github.com/clq12/clq-/settings/secrets/actions
2. 检查 `PUSHPLUS_TOKEN` 是否正确
3. 重新复制并粘贴正确的 Token

**获取 Token：**
1. 访问：https://www.pushplus.plus/push1
2. 复制 Token

### 步骤 2: 手动触发测试

1. 访问：https://github.com/clq12/clq-/actions
2. 选择 "Check Expiring Coupons" 工作流
3. 点击 "Run workflow" 按钮
4. 选择分支，点击 "Run workflow"
5. 查看详细日志

### 步骤 3: 查看应用日志

1. 访问：https://vercel.com/dashboard
2. 进入项目页面
3. 点击 Functions 标签
4. 查看 `/api/check-expiring` 的日志

### 步骤 4: 直接测试 API

```bash
# 测试 API 是否正常
curl -X GET "https://clq-rosy.vercel.app/api/check-expiring"
```

查看返回的 `details` 字段，了解具体错误原因。

## 常见原因和解决方案

### 原因 1: PushPlus Token 错误

**症状：**
```
details: "PushPlus API 返回错误: code=xxx"
```

**解决方案：**
1. 重新获取 PushPlus Token
2. 更新 GitHub Secrets 中的 `PUSHPLUS_TOKEN`

### 原因 2: 没有需要提醒的优惠券

**症状：**
```
分组结果: 1天内=0张, 3天内=0张, 7天内=0张
```

**解决方案：**
1. 访问应用：https://clq-rosy.vercel.app
2. 添加测试优惠券（7天后到期）
3. 重新触发工作流

### 原因 3: WebDAV 配置错误

**症状：**
```
无法读取优惠券数据
```

**解决方案：**
1. 检查 WebDAV 配置
2. 更新 GitHub Secrets 中的 WebDAV 配置
3. 在应用中重新配置 WebDAV

### 原因 4: PushPlus 服务问题

**症状：**
```
details: "推送失败: network error"
```

**解决方案：**
1. 访问 PushPlus 控制台：https://www.pushplus.plus/push1
2. 检查推送历史
3. 稍后重试

## 验证修复

### 1. 查看详细日志

手动触发工作流后，查看日志应该包含：

```
Run Check expiring coupons
...
总共找到 3 张优惠券
优惠券 "测试券": 剩余 6天 5小时
分组结果: 1天内=0张, 3天内=1张, 7天内=3张
推送消息已生成，长度: 1234 字符
推送成功！
```

### 2. 检查返回结果

```json
{
  "success": true,
  "message": "检查完成，发送了 3 条提醒",
  "data": {
    "totalSent": 3,
    "within7Days": 3,
    "within3Days": 1,
    "within1Day": 0
  }
}
```

### 3. 检查微信推送

1. 查看是否收到微信推送
2. 推送内容应包含所有分组优惠券

## 下一步

1. ✅ 代码已优化，添加详细错误信息
2. ✅ 调试日志已添加
3. ✅ 排查文档已创建

**现在请：**
1. 检查并更新 GitHub Secrets 中的 `PUSHPLUS_TOKEN`
2. 手动触发工作流测试
3. 查看详细日志，确认具体错误原因
4. 根据错误原因采取相应措施

## 相关文档

- [推送失败排查指南](./PUSH_ERROR_TROUBLESHOOTING.md) - 详细的排查步骤
- [GitHub Actions 配置指南](./GITHUB_ACTIONS_SETUP.md) - 配置教程
- [PushPlus 配置指南](./PUSHPLUS_SETUP.md) - PushPlus 使用说明

## 快速联系

如果问题仍未解决，请提供：
1. GitHub Actions 执行日志
2. API 返回的完整错误信息
3. Vercel 函数日志

可以通过以下方式联系：
- GitHub Issues: https://github.com/clq12/clq-/issues
