# 定时任务配置指南

## 概述

优惠券管理应用支持通过定时任务自动检查即将到期的优惠券，并发送微信推送提醒。建议每小时执行一次，以确保精确到小时的提醒功能正常工作。

## 提醒机制

### 提醒时机

系统会在以下时间点自动发送提醒：
- **7天前**：在优惠券到期时间前7天的**同一小时**
- **3天前**：在优惠券到期时间前3天的**同一小时**
- **1天前**：在优惠券到期时间前1天的**同一小时**

### 示例

**案例：晚上23点到期的优惠券**
- 到期时间：2026年2月3日 23:00
- 提醒时间：
  - 7天前：2026年1月27日 23:00
  - 3天前：2026年1月31日 23:00
  - 1天前：2026年2月2日 23:00

## 定时任务配置

### 1. cron-job.org（推荐）

#### 配置步骤

1. 访问 [cron-job.org](https://cron-job.org/) 并注册账号
2. 登录后，点击 "Cronjobs" → "Add cronjob"
3. 填写以下信息：
   - **Title**：优惠券到期提醒
   - **URL**：`https://你的应用地址/api/check-expiring`
   - **Method**：GET
   - **Days**：选中所有天
   - **Hours**：选中所有小时（每小时执行）
   - **Minutes**：0（整点执行）
   - **Execution log**：保留最近10条
4. 保存配置

#### Cron 表达式

```bash
# 每小时执行一次
0 * * * *
```

### 2. GitHub Actions

#### 配置文件

创建 `.github/workflows/check-expiring.yml`：

```yaml
name: Check Expiring Coupons

on:
  schedule:
    - cron: '0 * * * *'  # 每小时执行一次（UTC时间）

jobs:
  check-expiring:
    runs-on: ubuntu-latest
    steps:
      - name: Check expiring coupons
        run: |
          curl -X GET \
            https://你的应用地址/api/check-expiring
```

#### 重要提示

- GitHub Actions 使用 UTC 时间
- 如果你的应用使用北京时间（UTC+8），需要调整 cron 表达式
- 例如：北京时间每小时 = UTC 每天16:00（0 * * * * 在UTC是每小时，不需要调整）

### 3. 阿里云定时触发器

#### 配置步骤

1. 登录阿里云控制台
2. 进入"函数计算 FC"服务
3. 创建或选择函数
4. 配置定时触发器：
   - **触发方式**：定时触发
   - **Cron 表达式**：`0 * * * *`
   - **运行时**：Node.js
5. 函数代码：

```javascript
exports.handler = async (event, context) => {
  const https = require('https');

  return new Promise((resolve, reject) => {
    const req = https.get('https://你的应用地址/api/check-expiring', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log('Response:', data);
        resolve({ statusCode: 200, body: data });
      });
    });

    req.on('error', reject);
  });
};
```

### 4. Vercel Cron Jobs

#### 配置步骤

1. 在项目根目录创建 `vercel.json`：

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

2. 部署到 Vercel 后，自动启用定时任务

3. 在 Vercel 控制台查看执行日志

### 5. Linux Crontab

#### 配置步骤

1. SSH 登录到服务器
2. 编辑 crontab：

```bash
crontab -e
```

3. 添加以下内容：

```bash
# 每小时执行一次
0 * * * * curl -X GET https://你的应用地址/api/check-expiring
```

4. 保存并退出

## 环境变量配置

### 推荐方式（定时任务）

为了确保定时任务正常工作，请在部署平台配置以下环境变量：

```bash
# WebDAV 配置
WEBDAV_URL=https://dav.jianguoyun.com/dav/
WEBDAV_USERNAME=你的坚果云账号
WEBDAV_PASSWORD=你的坚果云应用密码

# PushPlus 配置
PUSHPLUS_TOKEN=你的PushPlus Token
```

### 配置优先级

1. **环境变量**（定时任务必需）
2. **浏览器 Cookie**（用户界面配置）

## 测试定时任务

### 1. 手动测试

```bash
curl -X GET https://你的应用地址/api/check-expiring
```

预期响应：

```json
{
  "success": true,
  "message": "检查完成，发送了 2 条提醒",
  "data": {
    "totalSent": 2
  }
}
```

### 2. 使用测试数据

1. 添加一个测试优惠券，设置截止时间为**当前时间的下一个整点**
   - 例如：当前时间是 10:30，设置截止时间为 17:30（7小时后）
2. 立即调用 `/api/check-expiring` 接口
3. 检查是否收到推送

### 3. 查看执行日志

根据不同的平台，查看执行日志：

- **cron-job.org**：在网站上查看 Execution log
- **GitHub Actions**：在 Actions 页面查看
- **阿里云 FC**：在函数日志中查看
- **Vercel**：在 Functions 日志中查看
- **Linux Crontab**：查看系统日志 `/var/log/cron`

## 常见问题

### Q1: 定时任务执行了，但没有收到推送？

**可能原因：**
1. 环境变量配置错误
2. PushPlus Token 无效
3. 没有符合条件的优惠券

**排查步骤：**
1. 检查环境变量是否正确配置
2. 手动调用 API 测试：`curl https://你的应用地址/api/check-expiring`
3. 查看 API 返回的错误信息
4. 检查优惠券是否真的即将到期

### Q2: 提醒时间不准确？

**可能原因：**
1. 定时任务频率太低（如每天一次）
2. 时区设置错误

**解决方案：**
1. 设置定时任务每小时执行一次
2. 确保服务器时区正确（建议使用 UTC）
3. 设置优惠券截止时间时使用 24小时制（如 23:00）

### Q3: 收到重复提醒？

**正常现象：**
- 同一优惠券会在 7天、3天、1天各提醒一次
- 不会在同一天数重复提醒

**异常情况：**
- 如果在同一天数收到多次提醒，请检查 WebDAV 数据是否同步

### Q4: 如何停止定时任务？

根据不同平台：

- **cron-job.org**：删除或禁用 cronjob
- **GitHub Actions**：删除 workflow 文件或禁用
- **阿里云 FC**：删除定时触发器
- **Vercel**：从 vercel.json 中删除配置
- **Linux Crontab**：编辑 crontab，删除对应行

## 最佳实践

1. **设置合适的频率**：建议每小时执行一次
2. **保留执行日志**：便于排查问题
3. **监控执行状态**：定期检查定时任务是否正常运行
4. **定期测试**：手动调用 API 验证功能
5. **备份数据**：定期备份 WebDAV 上的优惠券数据

## 推荐配置

### 最小化配置（每小时提醒）

```bash
# Cron 表达式
0 * * * *

# 执行频率
每小时一次

# 优点
- 精确到小时
- 及时提醒
- 不会遗漏
```

### 节省配置（每2小时提醒）

```bash
# Cron 表达式
0 */2 * * *

# 执行频率
每2小时一次

# 优点
- 节省资源
- 仍然比较及时

# 缺点
- 可能有1-2小时延迟
```

## 技术细节

### API 接口

**URL**：`/api/check-expiring`

**方法**：GET

**环境变量要求**：
- `WEBDAV_URL`
- `WEBDAV_USERNAME`
- `WEBDAV_PASSWORD`
- `PUSHPLUS_TOKEN`

**返回格式**：

```json
{
  "success": true,
  "message": "检查完成，发送了 2 条提醒",
  "data": {
    "totalSent": 2
  }
}
```

### 提醒逻辑

1. 获取所有未使用的优惠券
2. 计算每个优惠券的截止时间（精确到小时）
3. 检查当前时间是否匹配提前7天、3天、1天的提醒时间点
4. 如果匹配，发送推送并标记提醒状态

### 去重机制

- 每个优惠券在 7天、3天、1天各只提醒一次
- 提醒后会标记 `remindedDays` 字段
- 下次检查时会跳过已提醒的天数

## 总结

配置定时任务后，系统会自动检查即将到期的优惠券并发送微信推送提醒。建议每小时执行一次，以确保精确到小时的提醒功能正常工作。如果遇到问题，请参考本文档的常见问题部分进行排查。
