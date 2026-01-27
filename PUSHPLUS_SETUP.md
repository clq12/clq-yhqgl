# PushPlus 定时推送配置指南

## 功能说明

本应用支持通过 PushPlus 发送微信推送提醒，在优惠券到期前 7 天、3 天、1 天自动发送提醒。

## 智能提醒机制

- **精确到小时**：提醒时间精确到小时
  - 例如：优惠券7天后23点到期，会在7天前的23点发送提醒
  - 例如：优惠券3天后15点到期，会在3天前的15点发送提醒
- **智能过滤**：每个优惠券只会在对应的天数提醒一次
  - 7天到期时：发送提醒，标记为已提醒
  - 3天到期时：再次发送提醒（即使7天时已经提醒过）
  - 1天到期时：第三次发送提醒
- **自动去重**：同一优惠券不会在同一天数重复提醒
- **状态记录**：提醒记录保存在 WebDAV 服务器，多设备同步

## 提醒示例

### 示例1：精确小时提醒
- 优惠券到期时间：2026年2月3日 23:00
- 当前时间：2026年1月27日 23:00
- 提醒时机：在当前时刻发送"7天到期"提醒

### 示例2：不同时间点提醒
- 优惠券A：7天后15点到期 → 在7天前的15点提醒
- 优惠券B：7天后23点到期 → 在7天前的23点提醒
- 优惠券C：3天后9点到期 → 在3天前的9点提醒

## 如何查看提醒状态

### 方法一：通过应用界面查看（推荐）

1. 打开应用首页
2. 点击右上角的"提醒状态"按钮（铃铛图标）
3. 在弹出的对话框中可以看到：
   - 📊 所有优惠券的提醒状态
   - ✅ 哪些优惠券会收到提醒（显示"将提醒"）
   - ❌ 哪些优惠券不会收到提醒及原因（显示"已过期"、"已提醒过"等）
   - 📅 每个优惠券的剩余天数和已提醒记录

### 方法二：通过 API 接口查看

访问以下接口获取详细的提醒状态信息：

```
GET /api/remind-status
```

**返回示例**：
```json
{
  "success": true,
  "data": {
    "stats": {
      "total": 10,
      "expiring7Days": 3,
      "expiring3Days": 2,
      "expiring1Day": 1,
      "willRemind": 5,
      "alreadyReminded": 3
    },
    "statusList": [
      {
        "id": "xxx",
        "title": "优惠券A",
        "endDate": "2026-01-31T23:59:59.000Z",
        "daysRemaining": 7,
        "isReminded": false,
        "remindedDays": [],
        "willRemind": true,
        "remindDays": [7]
      }
    ]
  }
}
```

### 方法三：通过优惠券列表查看

在首页的优惠券列表中，每个优惠券卡片会显示：
- 🟢 **已提醒（X天、Y天）**：蓝色标签，显示已经提醒过的天数
- 🟡 **已提醒**：绿色标签，仅表示已提醒过，未显示具体天数
- ⚪ **未提醒**：无标签

## 定时任务配置

为了实现自动推送提醒，需要配置定时任务。建议每小时执行一次，以确保精确到小时的提醒功能正常工作。

### 快速开始

#### 方法一：cron-job.org（推荐）

1. 访问 [cron-job.org](https://cron-job.org/) 并注册账号
2. 创建新的 cronjob：
   - **URL**：`https://你的应用地址/api/check-expiring`
   - **Cron 表达式**：`0 * * * *`（每小时执行）
3. 保存配置

#### 方法二：Vercel Cron Jobs

在项目根目录创建 `vercel.json`：

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

#### 方法三：GitHub Actions

创建 `.github/workflows/check-expiring.yml`：

```yaml
name: Check Expiring Coupons

on:
  schedule:
    - cron: '0 * * * *'

jobs:
  check-expiring:
    runs-on: ubuntu-latest
    steps:
      - name: Check expiring coupons
        run: |
          curl -X GET https://你的应用地址/api/check-expiring
```

### 详细配置指南

请参阅 [定时任务配置指南](./SCHEDULE_CONFIG.md) 获取详细的配置说明和常见问题解答。

### 环境变量配置

定时任务需要配置以下环境变量：

```bash
# WebDAV 配置
WEBDAV_URL=https://dav.jianguoyun.com/dav/
WEBDAV_USERNAME=你的坚果云账号
WEBDAV_PASSWORD=你的坚果云应用密码

# PushPlus 配置
PUSHPLUS_TOKEN=你的PushPlus Token
```

## 测试推送功能

### 方法一：通过应用界面测试

1. 打开"提醒状态"对话框
2. 在"测试推送"区域点击对应的按钮：
   - **测试7天提醒**：发送7天后到期的优惠券推送
   - **测试3天提醒**：发送3天后到期的优惠券推送
   - **测试1天提醒**：发送1天后到期的优惠券推送

**注意**：测试推送不会更新提醒状态，可以重复测试。

### 方法二：通过 API 接口测试

```
GET /api/test-remind?days=7
```

参数说明：
- `days`: 指定要测试的天数（1、3、7）

## 配置步骤

### 1. 获取 PushPlus Token

1. 访问 [PushPlus 官网](http://www.pushplus.plus/)
2. 微信扫码登录
3. 进入"消息推送"页面，获取您的 Token

### 2. 配置应用

1. 打开应用，进入"设置"页面
2. 点击"WebDAV 配置"
3. 在"PushPlus Token"输入框中粘贴您的 Token
4. 保存配置

### 3. 设置定时任务

由于提醒精确到小时，建议**每小时检查一次**以确保及时提醒。

#### 方式一：使用 cron-job.org（推荐）

1. 访问 [cron-job.org](https://cron-job.org/)
2. 注册并登录账号
3. 点击"Members" -> "Cronjobs" -> "Create cronjob"
4. 填写配置：
   - **Title**: 优惠券到期提醒（每小时）
   - **URL**: `https://你的应用地址.vercel.app/api/check-expiring`
   - **Execution schedule**: 每小时执行一次
     - Minutes: `0`
     - Hours: `*`
     - Days of month: `*`
     - Months: `*`
     - Days of week: `*`
   - **Save & activate**: 启用定时任务

#### 方式二：使用 GitHub Actions

在 `.github/workflows` 目录下创建 `check-expiring.yml` 文件：

```yaml
name: Check Expiring Coupons

on:
  schedule:
    - cron: '0 * * * *'  # 每小时执行一次
  workflow_dispatch:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Call API
        run: |
          curl -X GET "https://你的应用地址.vercel.app/api/check-expiring"
```

#### 方式三：使用阿里云定时触发器

1. 创建定时触发器
2. 设置触发规则：每小时执行一次（cron: `0 * * * *`）
3. 配置目标服务：调用 `/api/check-expiring` 接口

## API 接口说明

### 检查即将到期优惠券

**接口**: `GET /api/check-expiring`

**功能**:
- 检查即将到期（7天、3天、1天）的优惠券
- 发送 PushPlus 推送
- 更新提醒状态

**返回示例**:
```json
{
  "success": true,
  "message": "检查完成，发送了 3 条提醒",
  "data": {
    "totalSent": 3,
    "reasonDays": 7
  }
}
```

## 消息格式示例

推送消息包含以下信息：
- 📅 到期时间
- 💰 优惠力度
- 📝 备注（如有）
- 📱 查看详情链接

## 注意事项

1. **提醒时机**：提醒精确到小时
   - 例如：优惠券7天后23点到期，会在7天前的23点提醒
   - 建议定时任务每小时执行一次，确保及时提醒

2. **频率限制**：
   - PushPlus 免费版每天最多发送 200 条消息
   - 每个优惠券只在 7天、3天、1天各提醒一次，不会重复

3. **Token 安全**：请妥善保管您的 PushPlus Token

4. **WebDAV 同步**：提醒状态保存在 WebDAV 服务器，请确保配置正确

5. **时区设置**：系统会自动使用服务器时区，确保优惠券截止时间设置正确

## 故障排查

### 没有收到推送

1. 检查 PushPlus Token 是否正确配置
2. 确认定时任务是否正常运行
3. 查看应用日志确认 API 是否被调用
4. 检查优惠券是否确实即将到期

### 推送重复

- 系统已实现去重机制，同一优惠券不会在同一天数重复提醒
- 如果仍然出现重复，请检查 WebDAV 数据是否同步

### 推送时间不准确

- 请检查定时任务配置的时区设置
- 确保使用北京时间（UTC+8）

## 测试接口

可以通过直接访问以下链接测试推送功能：

```
https://你的应用地址.vercel.app/api/check-expiring
```

访问后会立即检查并发送提醒，无需等待定时任务触发。
