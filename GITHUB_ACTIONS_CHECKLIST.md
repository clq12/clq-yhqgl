# GitHub Actions 快速配置清单

## 配置前准备

- [ ] 确保代码已推送到 GitHub
- [ ] 确保应用已部署到 Vercel
- [ ] 准备好 WebDAV 配置信息
- [ ] 准备好 PushPlus Token

## 配置步骤

### 步骤 1: 添加 GitHub Secrets

访问：`https://github.com/clq12/clq-/settings/secrets/actions`

添加以下 4 个 Secrets：

1. **WEBDAV_URL**
   - Name: `WEBDAV_URL`
   - Value: `https://dav.jianguoyun.com/dav/`

2. **WEBDAV_USERNAME**
   - Name: `WEBDAV_USERNAME`
   - Value: 你的坚果云账号

3. **WEBDAV_PASSWORD**
   - Name: `WEBDAV_PASSWORD`
   - Value: 你的坚果云应用密码（不是登录密码）

4. **PUSHPLUS_TOKEN**
   - Name: `PUSHPLUS_TOKEN`
   - Value: 你的 PushPlus Token

**完成后点击 "Add secret"**

### 步骤 2: 启用工作流

1. 访问：`https://github.com/clq12/clq-/actions`
2. 点击 "Check Expiring Coupons" 工作流
3. 点击右上角 "Enable workflow" 按钮

### 步骤 3: 手动测试

1. 在工作流页面，点击 "Run workflow"
2. 选择分支：`main`
3. 点击绿色 "Run workflow" 按钮
4. 等待执行完成（30-60秒）

**预期结果：**
- ✅ 显示绿色勾号（成功）
- ✅ 日志显示 "HTTP Code: 200"
- ✅ 如果有到期优惠券，会收到微信推送

### 步骤 4: 验证定时执行

工作流会在每小时自动执行一次（UTC 时间整点）。

查看执行记录：
- 访问 Actions 页面
- 可以看到每小时的执行记录
- 点击任意记录查看详细日志

## 配置检查

- [ ] 4 个 Secrets 都已添加
- [ ] 工作流已启用
- [ ] 手动测试成功
- [ ] 收到测试推送（如果有到期优惠券）

## 常见问题快速解决

### Q: Secrets 添加后还是失败？

**检查：**
1. Secrets 的 Name 是否完全正确（区分大小写）
2. Value 是否正确（不要有多余的空格）
3. 重新运行工作流测试

### Q: 手动测试成功，但没有推送？

**原因：** 没有即将到期的优惠券

**解决：**
1. 添加一个测试优惠券（7天后到期）
2. 重新手动触发工作流
3. 检查是否收到推送

### Q: 如何修改执行时间？

编辑 `.github/workflows/check-expiring.yml`，修改 cron 表达式：

```yaml
schedule:
  - cron: '0 */6 * * *'  # 改为每 6 小时
```

### Q: 如何查看历史执行记录？

访问 Actions 页面，可以看到所有执行记录。

## 需要帮助？

详细文档：[GitHub Actions 配置指南](./GITHUB_ACTIONS_SETUP.md)

## 推荐配置

| 配置项 | 推荐值 | 说明 |
|--------|--------|------|
| 执行频率 | 每小时 | `0 * * * *` |
| 超时时间 | 5 分钟 | 避免长时间运行 |
| 手动触发 | 启用 | 方便测试 |
| 失败通知 | 启用 | GitHub 会通知 |

---

配置完成后，系统会每小时自动检查并发送推送提醒！🎉
