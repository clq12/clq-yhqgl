# PushPlus API 修复说明

## 问题分析

### 错误信息

```
details: "推送失败： 意外令牌 '<', \"<html>\r\n<h\"...JSON不成立"
```

### 问题原因

1. **使用 HTTP 协议**：原来使用 `http://www.pushplus.plus/send`
2. **API 返回 HTML**：Token 无效时，PushPlus API 返回错误页面（HTML 格式）而不是 JSON
3. **JSON 解析失败**：尝试将 HTML 解析为 JSON，导致错误

### 根本原因

- PushPlus API 可能更倾向于使用 HTTPS
- Token 无效时，API 返回 HTML 错误页面
- 代码没有检查响应类型，直接尝试解析 JSON

## 已完成的修复

### 1. 修改 API 地址

**修改前：**
```typescript
const url = "http://www.pushplus.plus/send"
```

**修改后：**
```typescript
const url = "https://www.pushplus.plus/send"
```

### 2. 添加响应检查

**新增检查：**
- ✅ 检查 HTTP 状态码
- ✅ 检查 Content-Type 是否为 JSON
- ✅ 打印错误响应内容（前 200 字符）
- ✅ 返回更详细的错误信息

**代码示例：**
```typescript
// 检查响应状态
if (!response.ok) {
  const errorText = await response.text()
  return {
    success: false,
    error: `HTTP 错误: ${response.status}`
  }
}

// 检查响应类型
const contentType = response.headers.get("content-type")
if (!contentType || !contentType.includes("application/json")) {
  const errorText = await response.text()
  return {
    success: false,
    error: `API 返回非 JSON 格式，可能是 Token 无效或 API 地址错误`
  }
}
```

## 立即排查步骤

### 步骤 1: 验证 PushPlus Token（最重要）

1. 访问 PushPlus 控制台：https://www.pushplus.plus/push1
2. 查看并复制你的 Token
3. 访问 GitHub Secrets：https://github.com/clq12/clq-/settings/secrets/actions
4. 更新 `PUSHPLUS_TOKEN` 的值

**Token 格式示例：**
```
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**注意：**
- Token 通常是一串字符
- 不要包含 "token=" 前缀
- 不要包含引号

### 步骤 2: 测试 Token 是否有效

**方法 1: 使用浏览器测试**
1. 访问：`https://www.pushplus.plus/send?token=你的Token&title=测试&content=测试消息`
2. 如果返回 JSON，说明 Token 有效
3. 如果返回 HTML，说明 Token 无效

**方法 2: 使用 curl 测试**
```bash
curl "https://www.pushplus.plus/send?token=你的Token&title=测试&content=测试消息"
```

### 步骤 3: 手动触发工作流

1. 访问：https://github.com/clq12/clq-/actions
2. 选择 "Check Expiring Coupons" 工作流
3. 点击 "Run workflow" 按钮
4. 查看详细日志

### 步骤 4: 查看新的错误信息

修改后，错误信息会更清楚：

**如果是 Token 无效：**
```
API 返回非 JSON 格式，可能是 Token 无效或 API 地址错误
```

**如果是网络问题：**
```
HTTP 错误: 500
```

**如果是 PushPlus API 错误：**
```
PushPlus API 返回错误: code=xxx
```

## 常见问题

### Q1: 如何获取正确的 Token？

**步骤：**
1. 访问：https://www.pushplus.plus/push1
2. 登录账号
3. 在页面顶部找到 "Token" 字段
4. 复制 Token（不要复制 "token=" 前缀）
5. 粘贴到 GitHub Secrets 的 `PUSHPLUS_TOKEN` 中

### Q2: Token 复制后还是报错？

**检查：**
1. Token 是否包含多余空格？
2. Token 是否完整复制？
3. Token 是否过期？（某些 Token 有有效期）

**解决方法：**
1. 删除 Token 的前导和后导空格
2. 重新复制完整 Token
3. 如果过期，重新生成 Token

### Q3: 为什么原来用 HTTP 不行？

**原因：**
1. PushPlus API 可能强制使用 HTTPS
2. HTTP 请求可能被重定向到 HTTPS
3. 重定向后 Token 可能失效

**解决方法：**
使用 HTTPS 协议访问 API

## 验证修复

### 成功的标志

手动触发工作流后，应该看到：

```
总共找到 X 张优惠券
分组结果: 1天内=X张, 3天内=X张, 7天内=X张
推送消息已生成，长度: X 字符
推送成功！
```

并且微信会收到推送消息。

### 失败的标志

如果还是失败，查看错误信息：

**Token 无效：**
```
API 返回非 JSON 格式，可能是 Token 无效或 API 地址错误
```

**网络问题：**
```
HTTP 错误: 503
```

## 下一步

1. ✅ 代码已修复（使用 HTTPS）
2. ✅ 错误处理已增强
3. ✅ 错误信息更清楚

**请立即：**
1. 验证并更新 GitHub Secrets 中的 `PUSHPLUS_TOKEN`
2. 使用浏览器或 curl 测试 Token 是否有效
3. 手动触发工作流测试
4. 查看新的错误信息，确认问题原因

## 相关文档

- [PushPlus 官方文档](https://www.pushplus.plus/doc/)
- [推送失败排查指南](./PUSH_ERROR_TROUBLESHOOTING.md)
- [推送错误快速修复](./PUSH_ERROR_FIX.md)
