# PushPlus 定时推送配置指南

## 功能说明

本应用支持通过 PushPlus 发送微信推送提醒，在优惠券到期前 7 天、3 天、1 天自动发送提醒。

## 智能提醒机制

- **智能过滤**：每个优惠券只会在对应的天数提醒一次
  - 7天到期时：发送提醒，标记为已提醒
  - 3天到期时：再次发送提醒（即使7天时已经提醒过）
  - 1天到期时：第三次发送提醒
- **自动去重**：同一优惠券不会在同一天数重复提醒
- **状态记录**：提醒记录保存在 WebDAV 服务器，多设备同步

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

#### 方式一：使用 cron-job.org（推荐）

1. 访问 [cron-job.org](https://cron-job.org/)
2. 注册并登录账号
3. 点击"Members" -> "Cronjobs" -> "Create cronjob"
4. 填写配置：
   - **Title**: 优惠券到期提醒
   - **URL**: `https://你的应用地址.vercel.app/api/check-expiring`
   - **Execution schedule**: 每天早上 7 点执行
     - Minutes: `0`
     - Hours: `7`
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
    - cron: '0 23 * * *'  # UTC 23:00 = 北京时间 7:00
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
2. 设置触发规则：每天早上 7 点
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

## 消息格式示例

推送消息包含以下信息：
- 📅 到期时间
- 💰 优惠力度
- 📝 备注（如有）
- 📱 查看详情链接

## 注意事项

1. **时区设置**：定时任务请确保使用北京时间（UTC+8）
2. **频率限制**：PushPlus 免费版每天最多发送 200 条消息
3. **Token 安全**：请妥善保管您的 PushPlus Token
4. **WebDAV 同步**：提醒状态保存在 WebDAV 服务器，请确保配置正确

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
