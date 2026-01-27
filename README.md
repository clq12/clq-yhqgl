# 优惠券管理应用 - WebDAV 版

一个基于 Next.js 16 + shadcn/ui + WebDAV 的优惠券管理应用，无需配置数据库，数据存储在 WebDAV 服务器。

## ✨ 功能特性

- 📱 **多设备访问** - 电脑、手机随时访问
- 🔄 **数据同步** - 所有设备数据实时同步
- ⏰ **智能提醒** - 优惠券到期前自动提醒
- 📊 **统计面板** - 实时查看有效/即将到期/已过期数量
- 🎨 **精美 UI** - 现代化界面，移动端优化
- 💾 **WebDAV 存储** - 无需数据库，数据自主可控
- 🔄 **自动备份** - 每次操作自动备份数据

## 🚀 快速开始

### 本地开发

```bash
# 启动开发服务器
coze dev
```

启动后，在浏览器中打开 [http://localhost:5000](http://localhost:5000) 查看应用。

### 云端部署

应用可以部署到任何支持 Next.js 的平台：

1. **Vercel**（推荐）: https://vercel.com
2. **Railway**: https://railway.app
3. **Render**: https://render.com

#### 快速部署到 Vercel

```bash
# 使用部署脚本（推荐）
bash scripts/deploy-to-vercel.sh

# 或手动推送
git push origin main
```

推送后 Vercel 会自动部署，1-2 分钟后即可访问。

详细部署指南请查看 [DEPLOYMENT.md](./DEPLOYMENT.md)

部署问题排查请查看 [VERCEL_TROUBLESHOOT.md](./VERCEL_TROUBLESHOOT.md)

## 📖 使用指南

### 1. 配置 WebDAV

首次使用需要配置 WebDAV：

1. 打开应用首页
2. 在"配置 WebDAV"区域填写：
   - WebDAV 地址（如 `https://dav.jianguoyun.com/dav/`）
   - 用户名
   - 密码
3. 点击"保存配置"

**支持的 WebDAV 服务：**
- 坚果云（推荐，免费）
- Nextcloud / ownCloud
- 群晖 NAS
- 其他支持 WebDAV 的服务

详细配置指南请查看 [WEBDAV_GUIDE.md](./WEBDAV_GUIDE.md)

### 2. 添加优惠券

1. 点击右上角"添加"按钮
2. 填写优惠券信息（标题、描述、折扣力度、日期等）
3. 点击"保存"

### 3. 管理优惠券

- **编辑**：点击编辑图标
- **删除**：点击删除图标
- **标记提醒**：点击铃铛图标

## 🛠️ 技术栈

- **框架**: Next.js 16 (App Router)
- **UI 组件**: shadcn/ui
- **样式**: Tailwind CSS 4
- **存储**: WebDAV
- **表单**: React Hook Form + Zod
- **日期**: date-fns

## 📁 项目结构

```
src/
├── app/                          # Next.js App Router
│   ├── api/
│   │   ├── coupons/              # 优惠券 API
│   │   └── webdav/               # WebDAV 配置 API
│   ├── layout.tsx
│   └── page.tsx                  # 首页
├── components/
│   ├── ui/                       # shadcn/ui 组件
│   ├── CouponForm.tsx            # 优惠券表单
│   └── WebDAVConfig.tsx          # WebDAV 配置组件
└── lib/
    ├── webdav-client.ts          # WebDAV 客户端封装
    ├── webdav-storage.ts         # 数据存储服务
    └── config.ts                 # 配置管理
```

## 💾 数据存储

数据以 JSON 文件形式存储在 WebDAV 服务器：

```
/coupons/
├── data.json          # 主数据文件
└── backups/           # 备份目录
    └── backup-*.json  # 自动备份文件
```

## 🔧 开发指南

### 依赖管理

**必须使用 pnpm 管理依赖**

```bash
# 安装依赖
pnpm install

# 添加新依赖
pnpm add package-name
```

### 测试

```bash
# 类型检查
pnpm ts-check

# 构建
pnpm build

# 启动生产环境
pnpm start
```

## ⏰ 定时任务

应用支持定时任务自动检查即将到期的优惠券，并发送微信推送提醒。

### 快速配置

🚀 **5分钟快速配置指南**：[查看快速配置](./QUICK_START_SCHEDULE.md)

⚠️ **重要提示**：Vercel 免费版每月约 100 次执行限制，每小时检查会超出限制。

**推荐方案：**
- ✅ **cron-job.org**（完全免费，支持每小时执行）
- ⚠️ Vercel 每小时（需要付费版，$20/月）
- ✅ Vercel 每6小时（免费版，但提醒有延迟）

详细配置请查看 [Vercel Cron Jobs 配置指南](./VERCEL_CRON_GUIDE.md)。

#### 快速配置到 cron-job.org（推荐）

1. 访问 [cron-job.org](https://cron-job.org/) 并注册账号（免费）
2. 创建新的 cronjob：
   - **URL**: `https://你的应用.vercel.app/api/check-expiring`
   - **Method**: GET
   - **Execution log**: 保留最近10条
3. 时间设置：
   - Days: 选中所有天 ☑️
   - Hours: 选中所有小时（0-23）☑️
   - Minutes: 0
4. 点击 "Save" 保存

完成！cron-job.org 会每小时自动调用你的接口。

#### 其他平台

- **GitHub Actions**：适用于开源项目
- **阿里云 FC**：适用于阿里云部署
- **Vercel Cron Jobs**：详细限制说明请查看 [Vercel Cron Jobs 配置指南](./VERCEL_CRON_GUIDE.md)

### 提醒时间

系统会在以下时间点自动发送提醒：
- **7天前**：在优惠券到期时间前7天的同一小时
- **3天前**：在优惠券到期时间前3天的同一小时
- **1天前**：在优惠券到期时间前1天的同一小时

**示例**：优惠券7天后23点到期，会在7天前的23点提醒。

### 环境变量

定时任务需要配置以下环境变量：

```bash
# WebDAV 配置
WEBDAV_URL=https://dav.jianguoyun.com/dav/
WEBDAV_USERNAME=你的坚果云账号
WEBDAV_PASSWORD=你的坚果云应用密码

# PushPlus 配置
PUSHPLUS_TOKEN=你的PushPlus Token
```

## 📖 文档

### 快速开始
- **[定时任务快速配置](./QUICK_START_SCHEDULE.md)** - 5分钟快速配置定时任务

### 详细指南
- **[WEBDAV_GUIDE.md](./WEBDAV_GUIDE.md)** - WebDAV 详细使用指南
- **[PUSHPLUS_SETUP.md](./PUSHPLUS_SETUP.md)** - PushPlus 推送配置指南
- **[SCHEDULE_CONFIG.md](./SCHEDULE_CONFIG.md)** - 定时任务配置指南
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - 云端部署指南

### 功能说明
- **[PRECISE_REMINDER.md](./PRECISE_REMINDER.md)** - 精确提醒功能说明
- **[OPTIMIZATION_SUMMARY.md](./OPTIMIZATION_SUMMARY.md)** - 功能优化总结

## 🔐 安全说明

- WebDAV 配置存储在浏览器的 Cookie 中（httpOnly）
- 建议使用 HTTPS 连接 WebDAV
- 定期备份 WebDAV 中的数据文件
- 使用强密码保护 WebDAV 账号

## 🆚 WebDAV vs 数据库

### WebDAV 版本（当前）

**优点：**
- ✅ 无需配置数据库
- ✅ 数据自主可控
- ✅ 易于备份和迁移
- ✅ 完全免费

**缺点：**
- ⚠️ 并发性能较低
- ⚠️ 不适合大量数据

### 数据库版本

**优点：**
- ✅ 并发性能高
- ✅ 支持大量数据
- ✅ 支持复杂查询

**缺点：**
- ❌ 需要配置数据库
- ❌ 需要额外成本（超出免费额度）
- ❌ 配置复杂

**建议：** 个人使用推荐 WebDAV 版本，企业或团队使用推荐数据库版本。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📝 许可证

MIT License

## 💡 常见问题

### Q: 数据保存在哪里？

A: 数据保存在您配置的 WebDAV 服务器上的 `/coupons/data.json` 文件中。

### Q: 如何备份数据？

A: 登录您的 WebDAV 服务，下载 `/coupons/data.json` 文件即可。系统也会自动创建备份。

### Q: 可以迁移到其他 WebDAV 吗？

A: 可以。下载旧 WebDAV 的数据文件，上传到新 WebDAV 即可。

### Q: 支持哪些 WebDAV 服务？

A: 支持所有标准 WebDAV 协议的服务，包括坚果云、Nextcloud、群晖 NAS 等。

详细问题请查看 [WEBDAV_GUIDE.md](./WEBDAV_GUIDE.md)。

## 📞 支持

如有问题，请：
1. 查看 [WEBDAV_GUIDE.md](./WEBDAV_GUIDE.md) 使用指南
2. 查看 [DEPLOYMENT.md](./DEPLOYMENT.md) 部署指南
3. 提交 Issue
