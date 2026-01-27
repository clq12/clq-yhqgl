# Vercel 部署问题排查和解决

## 问题：Vercel 没有检测到更新的文件

### 当前状态检查

✅ Git 状态：所有文件已提交
✅ 远程仓库：https://github.com/clq12/clq-.git
✅ 最新提交：chore: trigger redeploy for search feature

### 需要你手动执行的步骤

由于在沙箱环境中无法直接推送代码，请你在本地执行以下命令：

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 推送到 GitHub
git push origin main
```

### 推送后，Vercel 会自动部署

推送成功后，Vercel 会：
1. 检测到新的 commit
2. 自动触发构建
3. 部署最新版本
4. 生效搜索功能和定时任务

### 验证部署

推送成功后，请检查：

1. **Vercel Dashboard**
   - 访问 [Vercel Dashboard](https://vercel.com/dashboard)
   - 查看部署状态
   - 确认构建成功

2. **测试应用**
   - 访问你的应用 URL
   - 检查搜索功能是否正常
   - 测试排序和筛选

3. **配置环境变量**（如果还没配置）
   ```
   WEBDAV_URL=https://dav.jianguoyun.com/dav/
   WEBDAV_USERNAME=你的坚果云账号
   WEBDAV_PASSWORD=你的坚果云应用密码
   PUSHPLUS_TOKEN=你的PushPlus Token
   ```

4. **验证定时任务**
   - 在 Vercel Dashboard 的 Settings → Cron 中查看
   - 确认定时任务配置为每小时执行

### 最新更新内容

本次更新包含：

#### 新增功能
1. **搜索功能**
   - 支持搜索标题、描述、备注
   - 支持搜索折扣类型（折扣、减免、满减）
   - 实时搜索，无需点击按钮

2. **优化改进**
   - 修复类型兼容性问题
   - 优化搜索过滤逻辑
   - 改进用户体验

#### 文档更新
- **VERCEL_TROUBLESHOOT.md**：Vercel 部署问题排查指南

#### 配置文件
- **vercel.json**：定时任务配置（每小时执行）

### 手动触发部署的备选方案

如果推送后 Vercel 还是没有自动部署，可以：

1. **在 Vercel 控制台手动重新部署**
   - 访问 Vercel Dashboard
   - 找到你的项目
   - 点击 "Deployments" 标签
   - 点击最新部署右侧的 "..." 菜单
   - 选择 "Redeploy"

2. **使用 Vercel CLI**
   ```bash
   npm i -g vercel
   vercel login
   vercel --prod
   ```

### 环境变量配置清单

在 Vercel 项目设置中添加以下环境变量：

```bash
# WebDAV 配置
WEBDAV_URL=https://dav.jianguoyun.com/dav/
WEBDAV_USERNAME=你的坚果云账号
WEBDAV_PASSWORD=你的坚果云应用密码

# PushPlus 配置
PUSHPLUS_TOKEN=你的PushPlus Token
```

**获取方式：**
- WebDAV：在坚果云中创建应用密码
- PushPlus：在 [pushplus.plus](https://www.pushplus.plus/) 获取 Token

### 定时任务配置

Vercel Cron Jobs 已在 `vercel.json` 中配置：

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

这意味着：
- 每小时执行一次检查
- 自动发送到期提醒
- 精确到小时的提醒功能

### 测试定时任务

配置完成后，可以手动测试：

```bash
# 访问检查接口
curl https://你的应用地址/api/check-expiring
```

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

### 快速配置链接

详细配置指南：
- **[定时任务快速配置](./QUICK_START_SCHEDULE.md)** - 5分钟快速配置
- **[定时任务详细配置](./SCHEDULE_CONFIG.md)** - 完整配置指南
- **[PushPlus 配置](./PUSHPLUS_SETUP.md)** - 推送功能配置

### 总结

**你现在需要做的：**
1. 在本地执行 `git push origin main`
2. 等待 Vercel 自动部署（通常 1-2 分钟）
3. 访问应用测试搜索功能
4. 配置环境变量（如果还没配置）
5. 验证定时任务

**部署成功后的效果：**
- ✅ 可以在首页看到搜索框
- ✅ 可以实时搜索优惠券
- ✅ 每小时自动检查到期提醒
- ✅ 精确到小时的推送提醒
- ✅ AI 智能识别（默认启用）

推送完成后告诉我，我可以帮你验证部署是否成功！
