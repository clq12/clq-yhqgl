# HTTP 414 错误修复说明

## 问题分析

### 错误信息

```
details: "HTTP 错误: 414"
```

### HTTP 414 错误含义

**HTTP 414 (URI Too Long)** - URL 太长

服务器拒绝处理请求，因为 URL 的长度超过了服务器的限制。

### 问题原因

1. **使用 GET 方法**：参数放在 URL 查询字符串中
2. **推送消息过长**：优惠券信息多，消息内容很长
3. **URL 长度限制**：浏览器和服务器对 URL 长度有限制（通常 2048 字符）

**示例：**
```
https://www.pushplus.plus/send?token=xxx&title=xxx&content=<很长的HTML内容>&template=html
```

当推送消息包含多张优惠券时，URL 会非常长，超过限制。

## 已完成的修复

### 修改请求方法

**修改前（GET 方法）：**
```typescript
const response = await fetch(`${url}?${params.toString()}`, {
  method: "GET",
})
```

**修改后（POST 方法）：**
```typescript
const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: params.toString(),
})
```

### 修改内容

1. ✅ 请求方法：GET → POST
2. ✅ 参数位置：URL 查询字符串 → 请求体
3. ✅ 添加 Content-Type 头：`application/x-www-form-urlencoded`

## 为什么这样修复？

### POST 方法的优势

1. **无 URL 长度限制**：参数放在请求体中，不受 URL 长度限制
2. **更安全**：参数不在 URL 中显示，不会出现在浏览器历史记录
3. **更标准**：POST 方法更适合发送大量数据

### PushPlus API 支持

根据 PushPlus 官方文档，API 同时支持 GET 和 POST 方法：
- **GET**：适合短消息
- **POST**：适合长消息（推荐）

## 验证修复

### 成功的标志

访问 `https://clq-rosy.vercel.app/api/check-expiring` 后：

**应该返回：**
```json
{
  "success": true,
  "message": "检查完成，发送了 X 条提醒",
  "data": {
    "totalSent": X,
    "within7Days": X,
    "within3Days": X,
    "within1Day": X
  }
}
```

**并且微信会收到推送消息。**

### 失败的标志

如果还是失败，查看新的错误信息：

**Token 无效：**
```
API 返回非 JSON 格式，可能是 Token 无效或 API 地址错误
```

**网络问题：**
```
HTTP 错误: 503
```

**其他错误：**
```
PushPlus API 返回错误: code=xxx
```

## 部署说明

### 1. 提交代码

```bash
git add src/lib/pushplus.ts
git commit -m "fix: 修复 HTTP 414 错误，使用 POST 方法发送推送"
git push origin main
```

### 2. Vercel 自动部署

推送代码后，Vercel 会自动部署：
1. 访问：https://vercel.com/dashboard
2. 进入项目页面
3. 查看部署状态

### 3. 等待部署完成

通常需要 1-2 分钟，部署完成后：
1. 访问：https://clq-rosy.vercel.app/api/check-expiring
2. 查看是否返回成功
3. 检查微信是否收到推送

## 测试方法

### 方法 1: 直接访问 API

1. 访问：https://clq-rosy.vercel.app/api/check-expiring
2. 查看返回结果

### 方法 2: 使用 curl

```bash
curl https://clq-rosy.vercel.app/api/check-expiring
```

### 方法 3: 手动触发 GitHub Actions

1. 访问：https://github.com/clq12/clq-/actions
2. 选择 "Check Expiring Coupons" 工作流
3. 点击 "Run workflow" 按钮
4. 查看执行日志

## 常见问题

### Q1: 为什么之前用 GET 不行？

因为推送消息太长，URL 超过了浏览器和服务器的限制（通常 2048 字符）。

### Q2: POST 方法有什么限制？

POST 方法没有 URL 长度限制，但服务器可能对请求体大小有限制。不过 PushPlus API 支持很长的消息，一般不会有限制。

### Q3: 为什么使用 `application/x-www-form-urlencoded`？

这是表单提交的标准格式，PushPlus API 接受这种格式的请求。

### Q4: 如何验证修复是否生效？

访问 API 后，如果返回成功，说明修复生效。如果微信收到推送，说明推送功能正常。

## 相关文档

- [PushPlus 官方文档](https://www.pushplus.plus/doc/)
- [HTTP 414 错误说明](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Status/414)
- [推送失败排查指南](./PUSH_ERROR_TROUBLESHOOTING.md)
- [PushPlus API 修复说明](./PUSHPLUS_API_FIX.md)

## 总结

**问题：** HTTP 414 (URI Too Long) - URL 太长

**原因：** 使用 GET 方法，参数放在 URL 中，推送消息太长

**解决方案：** 改用 POST 方法，参数放在请求体中

**优势：**
- ✅ 无 URL 长度限制
- ✅ 支持长消息
- ✅ 更安全
- ✅ 更标准

**下一步：**
1. 提交并推送代码
2. 等待 Vercel 自动部署
3. 测试 API 是否正常
4. 验证微信是否收到推送
