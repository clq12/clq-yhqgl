# 🚀 快速开始推送代码

我已经为你创建了两个推送脚本，选择一个使用即可！

---

## 方法 1: 快速推送（推荐新手）

### 步骤 1: 获取 GitHub Token

1. 访问：https://github.com/settings/tokens/new
2. 配置：
   - **Note**: `优惠券管理应用`
   - **Expiration**: `90 days`
   - **Scopes**: ✅ `repo`
3. 点击 **Generate token**
4. **复制 Token**（格式：`ghp_xxxxxxxxxxxxxxxxxxxx`）

### 步骤 2: 推送代码

```bash
# 替换为你的实际 Token
bash scripts/quick-push.sh "ghp_1234567890abcdefghij"
```

**就这么简单！** ✨

---

## 方法 2: 完整交互式（推荐熟练用户）

### 步骤 1: 获取 GitHub Token

同上

### 步骤 2: 推送代码

```bash
# 设置环境变量
export GITHUB_TOKEN="你的GitHub_Token"

# 运行脚本
bash scripts/push.sh
```

脚本会：
- ✅ 检测是否有未提交的更改
- ✅ 询问是否提交
- ✅ 可以自定义提交信息
- ✅ 自动推送到远程

---

## 🎯 推荐使用

**如果你是第一次使用：**
- 使用 **方法 1**（quick-push.sh），简单快捷

**如果你需要更多控制：**
- 使用 **方法 2**（push.sh），支持自定义提交信息

---

## ⚠️ 重要提示

1. **Token 只显示一次**，务必立即复制
2. **不要分享 Token** 给他人
3. **定期更换 Token**（每 90 天）
4. **Token 格式**：`ghp_xxxxxxxxxxxxxxxxxxxx`

---

## 📚 详细文档

- [完整使用指南](./scripts/PUSH_GUIDE.md)
- [脚本功能对比](./scripts/README.md)

---

## 🎉 现在就开始吧！

```bash
# 1. 获取 Token
# 访问: https://github.com/settings/tokens/new

# 2. 推送代码
bash scripts/quick-push.sh "你的Token"
```

**就这么简单！** 🚀
