# Git 推送脚本使用指南

## 📝 快速使用

### 方法 1: 使用环境变量（推荐）

```bash
# 1. 设置 Token 环境变量
export GITHUB_TOKEN="你的GitHub_Token"

# 2. 运行推送脚本
bash scripts/push.sh
```

### 方法 2: 交互式输入 Token

```bash
# 直接运行脚本，按提示输入 Token
bash scripts/push.sh
```

## 🔑 获取 GitHub Token

### 步骤 1: 访问 Token 生成页面

```
https://github.com/settings/tokens/new
```

### 步骤 2: 配置 Token

- **Note（名称）**: `优惠券管理应用`
- **Expiration（过期时间）**: `90 days`
- **Scopes（权限）**: ✅ `repo`

### 步骤 3: 复制 Token

点击 **Generate token** 后，**立即复制** Token（格式如：`ghp_xxxxxxxxxxxxxxxxxxxx`）

⚠️ **注意**：Token 只显示一次，务必立即复制！

## 📋 脚本功能

### 自动检测

- ✅ 检测是否有未提交的更改
- ✅ 显示更改概要
- ✅ 询问是否提交更改
- ✅ 自动添加文件并提交

### 推送方式

1. **使用环境变量**（推荐）
   ```bash
   export GITHUB_TOKEN="你的Token"
   bash scripts/push.sh
   ```

2. **交互式输入 Token**
   ```bash
   bash scripts/push.sh
   # 按提示输入 Token
   ```

3. **使用用户名 + Token**
   ```bash
   bash scripts/push.sh
   # Username: 2312506030@qq.com
   # Password: 你的Token
   ```

## 🎯 使用示例

### 示例 1: 完整流程（有更改）

```bash
bash scripts/push.sh

# 脚本输出：
# 📝 检测到未提交的更改
#
# M  src/app/api/check-expiring/route.ts
# ?? REMINDER_LOGIC_V2.md
#
# 是否先提交这些更改？(y/n): y
#
# 添加所有文件...
# 提交更改...
# ✅ 提交成功
#
# 推送到远程仓库...
# ✓ 使用环境变量 GITHUB_TOKEN
# 推送中...
# ✅ 推送成功！
```

### 示例 2: 只推送（无更改）

```bash
bash scripts/push.sh

# 脚本输出：
# ⚠️  没有未提交的更改
#
# 是否继续推送到远程？(y/n): y
#
# 推送到远程仓库...
# ✓ 使用环境变量 GITHUB_TOKEN
# 推送中...
# ✅ 推送成功！
```

### 示例 3: 交互式输入 Token

```bash
bash scripts/push.sh

# 脚本输出：
# ⚠️  未找到 GITHUB_TOKEN 环境变量
#
# 方法 1: 使用 Personal Access Token 推送（推荐，按 y 继续）: y
#
# 请输入你的 GitHub Personal Access Token
# 获取 Token: https://github.com/settings/tokens/new
# Token 格式: ghp_xxxxxxxxxxxxxxxxxxxx
#
# Token: [输入你的Token]
#
# 推送中...
# ✅ 推送成功！
```

## ⚠️ 常见问题

### Q: 提示 "Token 不能为空"

**A**: 检查 Token 是否正确输入，确保没有多余空格。

### Q: 提示 "推送失败"

**A**: 检查以下几点：
1. Token 是否有 `repo` 权限
2. Token 是否已过期
3. Token 是否正确复制

### Q: 如何永久保存 Token？

**A**: 可以在 `~/.bashrc` 或 `~/.zshrc` 中添加：

```bash
export GITHUB_TOKEN="你的Token"
```

然后执行 `source ~/.bashrc` 使配置生效。

### Q: Token 安全吗？

**A**: Token 等同于密码，请勿分享给他人。建议：
- 定期更换 Token（如每 90 天）
- 不要在公共代码库中泄露 Token
- 使用 GitHub Secrets（在 CI/CD 中）

## 🔧 脚本配置

### 修改远程仓库

编辑 `scripts/push.sh`：

```bash
# 修改这一行
REMOTE_URL="https://github.com/你的用户名/你的仓库.git"
```

### 修改分支名称

编辑 `scripts/push.sh`：

```bash
# 修改这一行
BRANCH="main"  # 或 "master"
```

## 📚 相关链接

- [GitHub Token 生成](https://github.com/settings/tokens/new)
- [GitHub SSH Keys](https://github.com/settings/keys)
- [Git 官方文档](https://git-scm.com/docs)

## 🚀 快速开始

```bash
# 1. 生成 Token
# 访问: https://github.com/settings/tokens/new

# 2. 复制 Token

# 3. 运行脚本
bash scripts/push.sh
```

就是这么简单！✨
