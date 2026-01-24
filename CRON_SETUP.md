# 定时任务配置指南

## 功能说明

通过配置定时任务，系统会每天早上7点自动检查即将到期的优惠券，并通过 PushPlus 发送微信推送提醒。

## 检查 API 说明

### API 地址

```
GET /api/check-expiring
```

### 功能

- ✅ 检查所有优惠券
- ✅ 筛选7天、3天、1天后到期的优惠券
- ✅ 发送 PushPlus 推送（每个天数分别推送）
- ✅ 更新提醒状态（防止重复推送）
- ✅ �推送统计信息

### 请求参数

无需参数，直接调用即可。

### 返回示例

```json
{
  "success": true,
  "message": "检查完成，发送了 2 条提醒",
  "data": {
    "results": {
      "7": 3,
      "3": 2,
      "1": 1
    },
    "totalSent": 2
  }
}
```

---

## 方式一：使用 cron-job.org（推荐）

### 为什么选择 cron-job.org？

- ✅ 免费
- ✅ 无需编程
- ✅ 界面友好
- ✅ 支持多种时区
- ✅ 提供执行日志

### 详细配置步骤

#### 1. 注册账号

1. 访问：https://cron-job.org/
2. 点击右上角 "Register"
3. 填写注册信息并完成验证

#### 2. 登录账号

使用刚才注册的账号登录。

#### 3. 创建定时任务

1. 点击左侧菜单 "Members" → "Cronjobs"
2. 点击 "Create cronjob" 按钮

#### 4. 填写配置信息

##### 基本设置

| 字段 | 填写内容 | 说明 |
|------|---------|------|
| **Title** | `优惠券到期提醒` | 任务名称，便于识别 |
| **URL** | `https://你的应用地址.vercel.app/api/check-expiring` | 你的应用地址 + API 路径 |

**重要**：将 `你的应用地址` 替换为你的实际应用地址，例如：
```
https://clq-coupon.vercel.app/api/check-expiring
```

##### 执行时间设置

**执行计划**：选择 "Minutes" 方式

| 字段 | 填写内容 | 说明 |
|------|---------|------|
| **Minutes** | `0` | 0分（即整点） |
| **Hours** | `23` | UTC 时间 23:00 |
| **Days of month** | `*` | 每天 |
| **Months** | `*` | 每月 |
| **Days of week** | `*` | 每周 |

**⚠️ 重要时区说明**：

- cron-job.org 默认使用 UTC 时间
- UTC 23:00 = 北京时间 07:00（第二天早上）
- 所以设置 `Hours: 23` 对应北京时间早上7点

**时区验证**：
```
UTC 时间 = 北京时间 - 8小时
北京 07:00 = UTC 23:00（前一天）
```

#### 5. 高级设置（可选）

| 选项 | 设置 | 说明 |
|------|------|------|
| **Timeout** | `30` 秒 | 超时时间 |
| **Save output** | ✅ 勾选 | 保存执行结果（便于查看日志） |
| **Failure notification** | ✅ 勾选 | 失败时发送通知（可选） |

#### 6. 保存并激活

1. 点击 "Save & activate" 按钮
2. 任务会立即创建并开始运行

#### 7. 验证配置

1. 在 Cronjobs 列表找到刚创建的任务
2. 点击右侧的 "Execute now" 按钮手动执行一次
3. 查看 "Execution logs" 确认执行成功
4. 检查微信是否收到推送

---

## 方式二：使用 GitHub Actions

### 适用场景

- 代码已托管在 GitHub
- 项目使用了 Vercel 部署
- 希望定时任务与代码管理在一起

### 配置步骤

#### 1. 创建 Workflow 文件

在项目根目录创建文件：

```
.github/workflows/check-expiring.yml
```

#### 2. 编写配置

```yaml
name: Check Expiring Coupons

on:
  schedule:
    # UTC 时间 23:00 = 北京时间 07:00
    - cron: '0 23 * * *'
  workflow_dispatch:  # 允许手动触发

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Call API
        run: |
          curl -X GET "https://你的应用地址.vercel.app/api/check-expiring"
```

**重要**：
- 将 `你的应用地址` 替换为你的实际地址
- cron 表达式：`0 23 * * *` 表示每天 UTC 23:00 执行

#### 3. 提交到 GitHub

```bash
git add .github/workflows/check-expiring.yml
git commit -m "添加定时任务配置"
git push origin main
```

#### 4. 验证

1. 访问 GitHub 仓库的 "Actions" 标签页
2. 查看 "Check Expiring Coupons" workflow
3. 点击 "Run workflow" 手动测试
4. 检查执行日志和微信推送

---

## 方式三：使用阿里云定时触发器

### 适用场景

- 应用部署在阿里云
- 需要更高的可靠性
- 企业级应用

### 配置步骤

#### 1. 登录阿里云函数计算控制台

访问：https://fc.console.aliyun.com/

#### 2. 创建函数

1. 选择"服务及函数"
2. 创建新服务（如：`coupon-reminder`）
3. 创建函数，选择"HTTP 函数"

#### 3. 编写函数代码

```javascript
module.exports.handler = function (request, response, context) {
  const https = require('https');

  const options = {
    hostname: '你的应用地址.vercel.app',
    port: 443,
    path: '/api/check-expiring',
    method: 'GET'
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      response.send(data);
    });
  });

  req.on('error', (error) => {
    response.send(JSON.stringify({ error: error.message }));
  });

  req.end();
};
```

#### 4. 配置定时触发器

1. 在函数详情页，点击"触发器管理"
2. 创建触发器，选择"定时触发器"
3. 配置：
   - **触发器名称**：`daily-check`
   - **触发方式**：`Cron 表达式`
   - **Cron 表达式**：`0 0 7 * * *`（北京时间每天7点）
4. 保存

---

## 方式四：使用 Vercel Cron Jobs

### 适用场景

- 项目部署在 Vercel
- 使用 Vercel 的 Serverless Functions

### 配置步骤

#### 1. 创建 Vercel Cron 配置文件

在项目根目录创建 `vercel.json`：

```json
{
  "crons": [
    {
      "path": "/api/check-expiring",
      "schedule": "0 23 * * *"
    }
  ]
}
```

**重要**：
- Vercel Cron 也使用 UTC 时间
- `0 23 * * *` = 北京时间 07:00

#### 2. 部署到 Vercel

```bash
vercel --prod
```

#### 3. 验证

1. 访问 Vercel Dashboard
2. 选择项目
3. 查看 "Cron Jobs" 标签
4. 检查执行日志

---

## 验证定时任务配置

### 方法一：手动测试

直接在浏览器或使用 curl 访问：

```bash
curl https://你的应用地址.vercel.app/api/check-expiring
```

**预期结果**：
- 成功：返回 JSON，包含检查统计
- 失败：返回错误信息（如"请先配置 WebDAV"）

### 方法二：检查推送

1. 在应用中添加一个测试优惠券（设置到期时间为7天后）
2. 手动调用 API 或等待定时任务执行
3. 检查微信是否收到推送

### 方法三：查看日志

#### cron-job.org

1. 登录 cron-job.org
2. 进入 "Members" → "Cronjobs"
3. 点击任务名称
4. 查看 "Execution logs"

#### GitHub Actions

1. 访问 GitHub 仓库
2. 点击 "Actions" 标签
3. 查看 workflow 运行记录

---

## 常见问题

### Q1: 为什么设置 23:00 而不是 07:00？

**A**: 因为大多数定时服务使用 UTC 时间，而北京时间是 UTC+8。

```
北京时间 = UTC 时间 + 8小时
UTC 时间 = 北京时间 - 8小时

北京 07:00 = UTC 23:00（前一天）
```

### Q2: 怎么知道定时任务是否执行成功？

**A**:
1. 检查定时服务的执行日志
2. 查看微信是否收到推送
3. 在应用中查看"提醒状态"，确认已提醒的优惠券

### Q3: 可以修改推送时间吗？

**A**: 可以。修改 cron 表达式：

| 北京时间 | UTC 时间 | Cron 表达式 |
|---------|---------|------------|
| 06:00 | 22:00 | `0 22 * * *` |
| 07:00 | 23:00 | `0 23 * * *` |
| 08:00 | 00:00 | `0 0 * * *` |
| 09:00 | 01:00 | `0 1 * * *` |

### Q4: 推送失败了怎么办？

**A**:
1. 检查 WebDAV 配置是否正确
2. 检查 PushPlus Token 是否配置
3. 查看定时任务的错误日志
4. 手动调用 API 测试：`curl https://你的应用地址.vercel.app/api/check-expiring`

### Q5: 可以一天推送多次吗？

**A**: 可以。修改 cron 表达式，例如一天推送3次：

```yaml
# GitHub Actions 示例
on:
  schedule:
    - cron: '0 23 * * *'  # 07:00
    - cron: '0 1 * * *'   # 09:00
    - cron: '0 5 * * *'   # 13:00
```

### Q6: 如何暂停定时任务？

**A**:
- **cron-job.org**: 在任务列表点击 "Activate/Deactivate" 按钮
- **GitHub Actions**: 注释或删除 `.github/workflows/check-expiring.yml` 文件
- **Vercel Cron**: 删除 `vercel.json` 中的配置

### Q7: PushPlus 免费版有次数限制吗？

**A**: PushPlus 免费版每天最多发送 200 条消息。如果优惠券很多，可能需要考虑升级到付费版。

---

## 推荐配置

### 个人用户（推荐 cron-job.org）

- ✅ 免费
- ✅ 简单易用
- ✅ 可视化管理
- ✅ 提供执行日志

### 开发者（推荐 GitHub Actions）

- ✅ 与代码管理集成
- ✅ 便于版本控制
- ✅ 免费且稳定
- ✅ 支持手动触发

### 企业用户（推荐阿里云或 AWS Lambda）

- ✅ 高可靠性
- ✅ 企业级支持
- ✅ 更灵活的配置
- ✅ 完善的监控

---

## 总结

1. **首次配置**：使用 cron-job.org 最简单
2. **开发者**：GitHub Actions 更适合
3. **企业应用**：使用云服务的定时触发器
4. **验证配置**：手动调用 API 确认功能正常
5. **监控运行**：定期检查执行日志和推送情况

配置完成后，系统会自动每天早上7点检查并发送提醒，再也不用担心错过优惠券了！
