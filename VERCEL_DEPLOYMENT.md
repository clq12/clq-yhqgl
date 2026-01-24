# Vercel 部署指南

## 🚀 部署步骤

### 1. 推送代码到 Git

```bash
# 添加新创建的 vercel.json 文件
git add vercel.json

# 提交代码
git commit -m "feat: 添加Vercel Cron定时任务配置

- 配置每天UTC 23点（北京时间早上7点）执行
- 自动检查即将到期的优惠券并发送推送"

# 推送到远程仓库
git push origin main
```

### 2. 配置 Vercel 环境变量

在 Vercel 项目中配置以下环境变量：

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `WEBDAV_URL` | WebDAV服务器地址 | `https://dav.jianguoyun.com/dav/` |
| `WEBDAV_USERNAME` | WebDAV用户名 | `your-email@example.com` |
| `WEBDAV_PASSWORD` | WebDAV密码 | `app-password-generated-above` |
| `PUSHPLUS_TOKEN` | PushPlus推送Token | `your-32-char-token-here` |

**配置步骤**：
1. 进入 Vercel 项目
2. 点击 `Settings` → `Environment Variables`
3. 点击 `Add New` 添加每个变量
4. 选择环境：`Production`、`Preview`、`Development`（全部勾选）
5. 点击 `Save`

### 3. 部署到 Vercel

#### 方式A：通过 Vercel Dashboard（推荐）

1. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 `Add New` → `Project`
3. 选择你的 Git 仓库
4. 点击 `Import`
5. 点击 `Deploy`
6. 等待部署完成（约1-2分钟）

#### 方式B：通过 Vercel CLI

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 部署
vercel

# 生产环境部署
vercel --prod
```

### 4. 重新部署（如果环境变量是后添加的）

如果环境变量是在首次部署后添加的，需要重新部署：

1. 进入 Vercel 项目
2. 点击 `Deployments` 标签
3. 找到最新的部署，点击右上角 `...`
4. 选择 `Redeploy`

### 5. 验证部署

#### 测试 API 接口

访问以下URL测试（替换为你的域名）：

```bash
# 测试定时任务接口
curl https://your-app.vercel.app/api/check-expiring

# 预期返回
{
  "success": true,
  "message": "检查完成，发送了 X 条提醒",
  "data": {
    "results": {
      "7": 0,
      "3": 0,
      "1": 0
    },
    "totalSent": 0
  }
}
```

#### 测试定时任务触发

1. 进入 Vercel 项目
2. 点击 `Cron Jobs` 标签
3. 可以看到 `vercel.json` 中配置的 Cron 任务
4. 点击任务右侧的 `Run` 手动触发一次测试

### 6. 查看 Cron 日志

1. 进入 Vercel 项目
2. 点击 `Logs` 标签
3. 可以查看 Cron 任务的执行日志
4. 如果出现错误，可以在这里看到详细错误信息

## 📅 定时任务说明

### Cron 表达式

```json
{
  "schedule": "0 23 * * *"
}
```

- `0` - 分钟（第0分钟）
- `23` - 小时（UTC时间，即北京时间早上7点）
- `*` - 每月的每一天
- `*` - 每月
- `*` - 每周的每一天

**时区说明**：
- Vercel Cron 使用 **UTC 时间**
- 中国时间是 **UTC+8**
- UTC 23点 = 中国时间 次日 7点

### Cron 任务执行逻辑

每天 UTC 23点（北京时间早上7点）自动执行 `/api/check-expiring` 接口：

1. 检查剩余 7天、3天、1天 的优惠券
2. 排除已经提醒过的
3. 生成推送消息
4. 通过 PushPlus 发送微信提醒
5. 更新优惠券的提醒状态

## ⚠️ 重要注意事项

### 1. 环境变量必须配置

定时任务依赖环境变量运行，必须配置以下变量：

- ✅ `WEBDAV_URL` - WebDAV服务器地址
- ✅ `WEBDAV_USERNAME` - WebDAV用户名
- ✅ `WEBDAV_PASSWORD` - WebDAV密码
- ✅ `PUSHPLUS_TOKEN` - PushPlus推送Token

**如果没有配置环境变量，定时任务会返回 401 错误。**

### 2. Vercel 免费版限制

- Vercel 免费版支持 Cron Jobs
- 每天最多可以执行 **100 次** Cron 任务
- 超过限制后任务会被跳过
- 本项目每天执行 1 次，完全在免费额度内

### 3. 推送频率限制

- PushPlus 免费版每天最多推送 **200 条**消息
- 本项目每次最多推送 3 条（7天、3天、1天）
- 完全在免费额度内

### 4. WebDAV 连接稳定性

- 确保坚果云账号正常
- 定期检查 WebDAV 连接
- 坚果云免费版有一定的请求限制，但本项目请求量很小，不受影响

## 🔧 故障排查

### 问题1：Cron 任务没有执行

**检查步骤**：
1. 进入 Vercel 项目 → `Cron Jobs`
2. 确认任务状态为 `Active`
3. 查看 `Logs` 标签，检查是否有错误日志

**可能原因**：
- `vercel.json` 文件配置错误
- Cron 表达式语法错误
- Vercel 账号问题

### 问题2：Cron 任务返回 401 错误

**原因**：环境变量未配置或配置错误

**解决方法**：
1. 检查 Vercel 环境变量是否已配置
2. 确认环境变量名称拼写正确
3. 重新部署项目使环境变量生效

### 问题3：Cron 任务返回 500 错误

**原因**：API 接口内部错误

**解决方法**：
1. 查看 Vercel Logs 中的详细错误信息
2. 检查 WebDAV 连接是否正常
3. 检查 PushPlus Token 是否有效

### 问题4：微信没有收到推送

**检查步骤**：
1. 确认 PushPlus Token 是否正确
2. 登录 PushPlus 检查发送记录
3. 检查是否有优惠券即将到期
4. 手动访问 `/api/check-expiring` 测试

### 问题5：时区不正确

**症状**：推送时间不是早上7点

**原因**：Cron 表达式使用了错误的 UTC 时间

**解决方法**：
- 修改 `vercel.json` 中的 `schedule` 字段
- 中国时间 = UTC时间 + 8小时
- 重新部署项目

## 📊 监控和维护

### 查看 Cron 执行记录

1. 进入 Vercel 项目
2. 点击 `Cron Jobs` 标签
3. 可以看到每次执行的记录
4. 点击记录可以查看详细日志

### 查看 API 调用统计

1. 进入 Vercel 项目
2. 点击 `Analytics` 标签
3. 可以查看请求量、响应时间等统计信息

### 数据备份

优惠券数据存储在坚果云，定期自动备份：

- 备份路径：`/coupons/backups/`
- 备份文件名：`backup-YYYY-MM-DDTHH:mm:ss.sssZ.json`
- 可以在坚果云网页版查看和下载

## 🎉 完成！

现在你的优惠券管理系统已经完全部署并配置好定时任务了！

- ✅ 每天早上7点自动检查即将到期的优惠券
- ✅ 自动发送微信推送提醒
- ✅ 数据安全存储在坚果云
- ✅ 支持多设备同步

享受自动化的优惠券管理吧！🎊
