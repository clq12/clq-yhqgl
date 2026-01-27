# GitHub Actions 定时任务配置指南

## 概述

使用 GitHub Actions 实现每天两次自动检查优惠券并发送 PushPlus 推送提醒。

## 优点

✅ **完全免费** - GitHub Actions 免费版支持
✅ **每天两次推送** - 北京时间 7:30 和 16:30
✅ **无需第三方服务** - 不依赖 cron-job.org 等外部平台
✅ **易于配置** - 只需配置 GitHub Secrets
✅ **手动触发** - 支持手动测试

## 推送时间

- **第一次推送**：北京时间 7:30（UTC 23:30，前一天）
- **第二次推送**：北京时间 16:30（UTC 8:30，当天）

## 配置步骤

### 步骤 1: 配置 GitHub Secrets

1. 访问你的 GitHub 仓库：`https://github.com/clq12/clq-`
2. 点击 **Settings** 标签
3. 在左侧菜单找到 **Secrets and variables** → **Actions**
4. 点击 **New repository secret**
5. 添加以下密钥：

#### 必需的 Secrets

| Name | Value | 说明 |
|------|-------|------|
| `WEBDAV_URL` | `https://dav.jianguoyun.com/dav/` | WebDAV 地址 |
| `WEBDAV_USERNAME` | `你的坚果云账号` | WebDAV 用户名 |
| `WEBDAV_PASSWORD` | `你的坚果云应用密码` | WebDAV 密码 |
| `PUSHPLUS_TOKEN` | `你的PushPlus Token` | PushPlus Token |

#### 如何获取这些值？

**WebDAV 配置（坚果云）：**
1. 访问 [坚果云](https://www.jianguoyun.com/)
2. 登录后进入 **账户信息** → **安全选项**
3. 点击 **添加应用** → 生成 **应用密码**
4. 记录：
   - WebDAV 地址：`https://dav.jianguoyun.com/dav/`
   - 用户名：你的坚果云账号
   - 密码：生成的应用密码

**PushPlus Token：**
1. 访问 [PushPlus](https://www.pushplus.plus/)
2. 登录后进入 **个人中心**
3. 复制 **Token**（一串字符）

### 步骤 2: 推送代码到 GitHub

确保 `.github/workflows/check-expiring.yml` 文件已提交并推送到 GitHub：

```bash
git add .github/workflows/check-expiring.yml
git commit -m "chore: 配置 GitHub Actions 定时任务"
git push origin main
```

### 步骤 3: 启用工作流

1. 推送代码后，访问 GitHub 仓库
2. 点击 **Actions** 标签
3. 选择 **Check Expiring Coupons** 工作流
4. 点击 **Enable workflow** 按钮启用

### 步骤 4: 手动测试（推荐）

在启用后，先手动测试一次：

1. 在 **Actions** 页面
2. 点击 **Check Expiring Coupons** 工作流
3. 点击右侧 **Run workflow** 按钮
4. 点击 **Run workflow** 确认
5. 等待执行完成（约 30-60 秒）
6. 查看执行日志

**预期结果：**
- ✅ HTTP Code: 200
- ✅ Response 显示检查结果
- ✅ 如果有到期优惠券，会收到 PushPlus 推送

### 步骤 5: 查看定时执行

配置成功后，工作流会每天自动执行两次（北京时间 7:30 和 16:30）：

1. 访问 **Actions** 页面
2. 可以看到每天的执行记录
3. 点击任意执行记录查看详细日志

## 工作流文件说明

### 当前配置

```yaml
on:
  schedule:
    - cron: '30 23 * * *'  # 北京时间7:30（UTC 23:30）
    - cron: '30 8 * * *'   # 北京时间16:30（UTC 8:30）
  workflow_dispatch:
```
name: Check Expiring Coupons

on:
  schedule:
    - cron: '30 23 * * *'  # 北京时间7:30（UTC 23:30）
    - cron: '30 8 * * *'   # 北京时间16:30（UTC 8:30）
  workflow_dispatch:      # 允许手动触发

jobs:
  check-expiring:
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Check expiring coupons
        run: |
          curl -s https://你的应用地址/api/check-expiring
```

### Cron 表达式

当前配置：
- `30 23 * * *` - 每天 UTC 23:30 执行（北京时间 7:30，前一天）
- `30 8 * * *` - 每天 UTC 8:30 执行（北京时间 16:30，当天）

**其他常用表达式：**
- `0 9,12,18 * * *` - 每天 9 点、12 点、18 点执行（UTC 时间）
- `0 0 * * *` - 每天 0 点执行（UTC 时间）
- `*/30 * * * *` - 每 30 分钟执行一次

**注意：** GitHub Actions 使用 UTC 时间，北京时间 = UTC + 8

### 时区调整

如果需要调整推送时间，需要考虑 UTC 时差：

**北京时间 → UTC 转换公式：**
- 北京时间 = UTC + 8
- UTC = 北京时间 - 8

**示例：**
- 北京时间 8:00 → UTC 0:00（前一天）
- 北京时间 12:00 → UTC 4:00
- 北京时间 20:00 → UTC 12:00

**自定义推送时间示例：**

```yaml
# 北京时间 8:00 和 20:00
schedule:
  - cron: '0 0 * * *'   # UTC 0:00（北京时间 8:00）
  - cron: '0 12 * * *'  # UTC 12:00（北京时间 20:00）
```

## 环境变量配置

工作流会使用 GitHub Secrets 中的环境变量，无需修改代码。

API 接口会自动从以下优先级读取配置：

1. 环境变量（GitHub Secrets）
2. 浏览器 Cookie

## 测试推送

### 方法 1: 手动触发工作流

1. 访问 GitHub 仓库的 **Actions** 页面
2. 点击 **Run workflow**
3. 查看执行日志

### 方法 2: 测试 API 接口

```bash
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

### 方法 3: 添加测试优惠券

1. 添加一个优惠券，设置截止时间为**当前时间 + 7 小时**
2. 手动触发工作流
3. 检查是否收到 PushPlus 推送

## 查看执行日志

1. 访问 **Actions** 页面
2. 点击任意执行记录
3. 查看详细步骤和输出

**重要日志：**
- ✅ `HTTP Code: 200` - 接口调用成功
- ✅ `✅ 检查完成` - 检查完成
- ❌ `❌ 检查失败` - 检查失败，查看错误信息

## 常见问题

### Q1: 工作流没有执行？

**排查步骤：**
1. 检查工作流是否启用（Actions 页面）
2. 检查 cron 表达式是否正确
3. 等待下一个执行时间（整点）

### Q2: 执行失败，显示 HTTP 500？

**可能原因：**
1. GitHub Secrets 未配置或配置错误
2. WebDAV 连接失败
3. 应用未部署或 URL 错误

**解决方法：**
1. 检查所有 Secrets 是否正确配置
2. 手动测试 API 接口
3. 查看应用日志

### Q3: 没有收到 PushPlus 推送？

**可能原因：**
1. 没有即将到期的优惠券
2. PUSHPLUS_TOKEN 配置错误
3. PushPlus 服务异常

**解决方法：**
1. 添加测试优惠券（7天后到期）
2. 手动触发工作流测试
3. 检查 PushPlus Token 是否正确

### Q4: 如何修改执行频率？

**编辑 `.github/workflows/check-expiring.yml`：**

```yaml
on:
  schedule:
    - cron: '0 8,20 * * *'  # 改为北京时间 16:00 和 4:00（第二天）
```

修改后提交并推送：
```bash
git add .github/workflows/check-expiring.yml
git commit -m "chore: 修改推送时间"
git push origin main
```

**注意：**
- cron 表达式使用 UTC 时间
- 北京时间 = UTC + 8
- 请根据时差调整

## 优势对比

| 特性 | GitHub Actions | cron-job.org | Vercel Cron |
|------|---------------|--------------|-------------|
| 费用 | 免费 | 免费 | 付费 |
| 执行频率 | 每天两次 | 可自定义 | 有限制 |
| 环境变量 | Secrets 支持 | URL 中 | 环境变量 |
| 日志查看 | 详细 | 简单 | 详细 |
| 手动触发 | 支持 | 支持 | 不支持 |
| 配置复杂度 | 简单 | 简单 | 简单 |

## 总结

**推荐使用 GitHub Actions**，因为：
1. ✅ 完全免费
2. ✅ 支持每小时执行
3. ✅ 配置简单
4. ✅ 日志详细
5. ✅ 支持手动测试
6. ✅ 与代码仓库集成

## 配置检查清单

- [ ] 添加 GitHub Secrets（WEBDAV_URL, WEBDAV_USERNAME, WEBDAV_PASSWORD, PUSHPLUS_TOKEN）
- [ ] 推送工作流文件到 GitHub
- [ ] 启用工作流
- [ ] 手动测试一次
- [ ] 验证 PushPlus 推送
- [ ] 查看执行日志

## 快速开始

```bash
# 1. 拉取最新代码
git pull origin main --no-rebase

# 2. 推送到 GitHub
git push origin main

# 3. 访问 GitHub 配置 Secrets
# 4. 启用工作流
# 5. 手动测试
```

---

配置完成后，系统会每天北京时间 7:30 和 16:30 自动检查并发送推送提醒！🎉
