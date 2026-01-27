# 定时任务快速配置

## 🚀 5分钟快速配置

### 方案一：Vercel（最简单）

如果你的应用部署在 Vercel，只需两步：

1. **更新 vercel.json**

   项目已包含 `vercel.json`，配置为每小时执行一次：
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

2. **配置环境变量**

   在 Vercel 项目设置中添加以下环境变量：
   ```
   WEBDAV_URL=https://dav.jianguoyun.com/dav/
   WEBDAV_USERNAME=你的账号
   WEBDAV_PASSWORD=你的密码
   PUSHPLUS_TOKEN=你的Token
   ```

3. **重新部署**

   完成！Vercel 会自动启用定时任务。

### 方案二：cron-job.org（适用于任何平台）

**步骤：**

1. 访问 [cron-job.org](https://cron-job.org/) 并注册账号（免费）

2. 登录后点击 "Cronjobs" → "Add cronjob"

3. 填写配置：
   - **Title**: 优惠券到期提醒
   - **URL**: `https://你的应用地址/api/check-expiring`
   - **Method**: GET
   - **Execution log**: 保留最近10条

4. 时间设置：
   - Days: 选中所有天 ☑️
   - Hours: 选中所有小时（0-23）☑️
   - Minutes: 0

5. 点击 "Save" 保存

**完成！** cron-job.org 会每小时自动调用你的接口。

### 方案三：GitHub Actions（适用于开源项目）

1. **复制工作流文件**

   项目已包含 `.github/workflows/check-expiring.yml`，修改 URL：
   ```yaml
   run: |
     curl -X GET https://你的应用地址/api/check-expiring
   ```

2. **配置环境变量**

   在 GitHub 仓库设置中添加：
   - Settings → Secrets and variables → Actions → New repository secret
   - 添加以下密钥：
     - `WEBDAV_URL`
     - `WEBDAV_USERNAME`
     - `WEBDAV_PASSWORD`
     - `PUSHPLUS_TOKEN`

3. **推送到 GitHub**

   推送代码后，GitHub Actions 会自动启动定时任务。

## 🧪 测试配置

### 方法1：浏览器测试

直接访问：`https://你的应用地址/api/check-expiring`

预期响应：
```json
{
  "success": true,
  "message": "检查完成，发送了 0 条提醒",
  "data": {
    "totalSent": 0
  }
}
```

### 方法2：命令行测试

```bash
curl https://你的应用地址/api/check-expiring
```

### 方法3：使用测试数据

1. 添加一个测试优惠券，设置截止时间为**当前时间 + 7小时**
2. 立即调用 `/api/check-expiring` 接口
3. 检查是否收到推送

## ⚙️ 验证环境变量

```bash
# 使用项目提供的脚本
bash scripts/check-schedule.sh

# 或手动检查
echo $WEBDAV_URL
echo $WEBDAV_USERNAME
echo $WEBDAV_PASSWORD
echo $PUSHPLUS_TOKEN
```

## 📋 配置清单

部署前请确认：

- [ ] 应用已部署并可访问
- [ ] WebDAV 配置正确（URL、用户名、密码）
- [ ] PushPlus Token 已配置
- [ ] 定时任务已设置（每小时执行）
- [ ] 测试接口调用成功
- [ ] 收到测试推送（可选）

## ❓ 常见问题

### Q: 定时任务执行了，但没有收到推送？

**排查步骤：**

1. 检查环境变量是否正确配置
2. 手动调用 API 测试：`curl https://你的应用地址/api/check-expiring`
3. 查看返回的错误信息
4. 确认是否有符合条件的优惠券

### Q: Vercel Cron Jobs 不工作？

**可能原因：**

1. `vercel.json` 文件格式错误
2. 环境变量未配置
3. 部署后未重新启用 Cron Jobs

**解决方案：**

1. 检查 `vercel.json` 格式是否正确
2. 在 Vercel 项目设置中配置环境变量
3. 在 Vercel 控制台的 Settings → Cron 中查看状态

### Q: cron-job.org 提示错误？

**常见错误：**

- **404**: URL 不正确
- **500**: 应用错误，检查环境变量
- **401**: WebDAV 认证失败

**解决方案：**

1. 确认 URL 正确（包含 `https://`）
2. 检查应用是否正常运行
3. 验证 WebDAV 配置

### Q: GitHub Actions 失败？

**排查步骤：**

1. 查看 Actions 运行日志
2. 检查 URL 是否正确
3. 确认环境变量已配置（Secrets）

## 📚 详细文档

- [定时任务配置指南](./SCHEDULE_CONFIG.md) - 完整配置说明
- [PushPlus 配置指南](./PUSHPLUS_SETUP.md) - 推送功能配置
- [精确提醒说明](./PRECISE_REMINDER.md) - 提醒机制详解

## 🎯 推荐配置

### 最小化配置

| 项目 | 配置 |
|------|------|
| 执行频率 | 每小时一次 |
| Cron 表达式 | `0 * * * *` |
| 环境变量 | 4个（WEBDAV_URL, WEBDAV_USERNAME, WEBDAV_PASSWORD, PUSHPLUS_TOKEN） |
| 测试 | 手动调用 API |

### 适合场景

- **个人使用**: cron-job.org（免费、简单）
- **团队使用**: Vercel Cron Jobs（集成度高）
- **开源项目**: GitHub Actions（公开透明）

## 💡 最佳实践

1. **定时任务频率**：建议每小时执行一次
2. **环境变量**：使用环境变量配置，不要硬编码
3. **监控日志**：定期查看定时任务执行日志
4. **测试验证**：配置后立即测试接口
5. **备份数据**：定期备份 WebDAV 中的数据

## 🆘 获取帮助

如果遇到问题：

1. 查看详细文档：[SCHEDULE_CONFIG.md](./SCHEDULE_CONFIG.md)
2. 检查应用日志
3. 验证环境变量配置
4. 测试 API 接口

---

**配置完成后，系统会自动每小时检查优惠券并发送推送提醒！** 🎉
