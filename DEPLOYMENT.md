# 优惠券管理应用 - 云端部署指南

本指南将帮助您将优惠券管理应用部署到云端，实现多设备访问和数据同步。

## 📋 前置要求

1. GitHub 账号（用于代码托管）
2. Vercel 账号（推荐，免费额度充足）
3. Railway 或 Render 账号（备选方案）

---

## 🚀 方案一：使用 Vercel 部署（推荐）

### 步骤 1: 推送代码到 GitHub

```bash
# 初始化 Git 仓库（如果还没有）
git init
git add .
git commit -m "feat: 优惠券管理应用"

# 在 GitHub 创建新仓库后，关联远程仓库
git remote add origin https://github.com/你的用户名/你的仓库名.git
git branch -M main
git push -u origin main
```

### 步骤 2: 在 Vercel 导入项目

1. 访问 [Vercel](https://vercel.com)
2. 点击 "Add New..." → "Project"
3. 选择刚创建的 GitHub 仓库
4. 配置项目：
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`
   - **Build Command**: `pnpm build`
   - **Output Directory**: `.next`
5. 点击 "Deploy"

### 步骤 3: 配置数据库连接

Vercel 部署后需要配置 PostgreSQL 数据库：

#### 选项 A: 使用 Supabase（推荐，免费）

1. 访问 [Supabase](https://supabase.com) 创建账号
2. 创建新项目
3. 在项目设置中获取数据库连接字符串
4. 在 Vercel 项目设置中添加环境变量：
   - `PGDATABASE_URL`: 你的 PostgreSQL 连接字符串

#### 选项 B: 使用 Neon（推荐，免费）

1. 访问 [Neon](https://neon.tech) 创建账号
2. 创建新项目
3. 复制连接字符串
4. 在 Vercel 项目设置中添加环境变量：
   - `PGDATABASE_URL`: 你的连接字符串

#### 选项 C: 使用 Railway（一体化方案）

Railway 同时提供数据库和应用托管：

1. 访问 [Railway](https://railway.app)
2. 点击 "New Project" → "Deploy from GitHub repo"
3. 选择你的 GitHub 仓库
4. 添加 PostgreSQL 服务：
   - 点击 "+ New Service" → "Add Database"
   - 选择 "PostgreSQL"
5. Railway 会自动配置环境变量

### 步骤 4: 运行数据库迁移

部署后需要创建数据库表。可以：

#### 方式 1: 使用 Drizzle Kit

```bash
# 在本地运行，连接到云端数据库
pnpm drizzle-kit push:pg

# 或者生成迁移文件
pnpm drizzle-kit generate:pg
```

#### 方式 2: 手动创建表

在数据库管理界面（如 Supabase SQL Editor）运行：

```sql
CREATE TABLE IF NOT EXISTS coupons (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  discount_amount INTEGER,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  is_reminded BOOLEAN DEFAULT false NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS coupons_end_date_idx ON coupons(end_date);
```

### 步骤 5: 获取部署地址

Vercel 部署完成后会提供一个 HTTPS 地址，例如：
- `https://coupon-manager.vercel.app`

这就是你的应用地址，可以在任何设备上访问！

---

## 🚀 方案二：使用 Railway（一体化）

Railway 同时提供数据库和应用托管，更简单：

### 步骤 1: 推送代码到 GitHub

同方案一步骤 1。

### 步骤 2: 在 Railway 导入项目

1. 访问 [Railway](https://railway.app)
2. 点击 "New Project" → "Deploy from GitHub repo"
3. 选择你的 GitHub 仓库
4. Railway 会自动检测 Next.js 项目并配置

### 步骤 3: 添加数据库

1. 在项目中点击 "+ New Service"
2. 选择 "Add Database" → "PostgreSQL"
3. Railway 会自动配置连接

### 步骤 4: 配置环境变量

Railway 会自动添加 `DATABASE_URL` 环境变量，但我们需要重命名为 `PGDATABASE_URL`：

1. 在项目设置中找到 "Variables"
2. 添加变量：
   - 名称: `PGDATABASE_URL`
   - 值: `${DATABASE_URL}`（Railway 支持变量引用）

### 步骤 5: 部署

Railway 会自动构建和部署，完成后提供访问地址。

---

## 🚀 方案三：使用 Render（免费）

Render 提供免费的 Web 服务和 PostgreSQL 数据库。

### 步骤 1: 创建 PostgreSQL 数据库

1. 访问 [Render](https://render.com)
2. 点击 "New +" → "PostgreSQL"
3. 配置数据库（选择免费计划）
4. 创建后复制 "External Database URL"

### 步骤 2: 推送代码到 GitHub

同方案一步骤 1。

### 步骤 3: 创建 Web Service

1. 访问 Render，点击 "New +" → "Web Service"
2. 选择你的 GitHub 仓库
3. 配置：
   - **Runtime**: Node
   - **Build Command**: `pnpm build`
   - **Start Command**: `pnpm start`
4. 添加环境变量：
   - `PGDATABASE_URL`: 你的数据库连接字符串
5. 点击 "Create Web Service"

---

## 📱 部署后使用

### 多设备访问

1. **手机访问**: 在手机浏览器输入部署地址
2. **电脑访问**: 在任何电脑浏览器输入部署地址
3. **添加到主屏幕**:
   - iOS: Safari 分享按钮 → "添加到主屏幕"
   - Android: Chrome 菜单 → "添加到主屏幕"

### 数据同步

所有设备连接到同一个云端数据库，数据自动同步：
- 手机添加的优惠，电脑立刻能看到
- 电脑编辑的内容，手机也会更新

---

## 🔧 常见问题

### Q: 数据库连接失败怎么办？

**A**: 检查以下几点：
1. 环境变量 `PGDATABASE_URL` 是否正确配置
2. 数据库是否允许远程连接
3. 防火墙是否放行数据库端口

### Q: 部署后提示找不到表？

**A**: 需要运行数据库迁移创建表结构，参考步骤 4。

### Q: 如何备份数据？

**A**:
- **Supabase**: 在面板中自动备份
- **Railway**: 支持快照备份
- **Render**: 需要手动导出数据

### Q: 免费额度够用吗？

**A**: 对于个人使用，各平台的免费额度通常足够：
- **Vercel**: 100GB 带宽/月
- **Supabase**: 500MB 数据库
- **Railway**: 500 小时/月
- **Render**: 750 小时/月

---

## 💰 成本估算

| 平台 | 免费额度 | 超出费用 | 推荐指数 |
|------|---------|---------|---------|
| Vercel + Supabase | 充足 | $20/月起 | ⭐⭐⭐⭐⭐ |
| Railway | 500小时/月 | $5/月起 | ⭐⭐⭐⭐ |
| Render | 750小时/月 | $7/月起 | ⭐⭐⭐⭐ |

---

## 🎯 推荐组合

**新手友好**: Vercel + Supabase
- 部署简单，界面友好
- 免费额度充足
- 社区支持好

**一体化**: Railway
- 应用和数据库在一个平台
- 配置简单
- 自动缩放

**高级用户**: Render
- 灵活度高
- 支持多种数据库
- 性能好

---

## 📞 技术支持

如遇问题，可以查看：
- [Vercel 文档](https://vercel.com/docs)
- [Railway 文档](https://docs.railway.app)
- [Supabase 文档](https://supabase.com/docs)

祝部署顺利！🎉
