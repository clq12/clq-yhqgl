# Git 推送脚本

本目录包含两个 Git 推送脚本，用于将代码推送到 GitHub。

## 📁 脚本列表

### 1. `push.sh` - 完整交互式脚本（推荐）

**功能特点：**
- ✅ 自动检测未提交的更改
- ✅ 询问是否提交更改
- ✅ 支持自定义提交信息
- ✅ 多种认证方式（环境变量/交互式/用户名+密码）
- ✅ 详细的错误提示
- ✅ 美观的彩色输出

**使用方法：**

```bash
# 方法 1: 使用环境变量（推荐）
export GITHUB_TOKEN="你的GitHub_Token"
bash scripts/push.sh

# 方法 2: 交互式输入 Token
bash scripts/push.sh
```

**详细文档：** [PUSH_GUIDE.md](./PUSH_GUIDE.md)

---

### 2. `quick-push.sh` - 快速推送脚本

**功能特点：**
- ✅ 一键推送，简单快捷
- ✅ 自动提交未提交的更改
- ✅ 固定提交信息
- ✅ 最小化交互

**使用方法：**

```bash
bash scripts/quick-push.sh "你的GitHub_Token"
```

**示例：**

```bash
# 替换为你的实际 Token
bash scripts/quick-push.sh "ghp_1234567890abcdefghij"
```

---

## 🔑 获取 GitHub Token

### 快速步骤

1. 访问：https://github.com/settings/tokens/new
2. 配置 Token：
   - **Note**: `优惠券管理应用`
   - **Expiration**: `90 days`
   - **Scopes**: ✅ `repo`
3. 点击 **Generate token**
4. **复制 Token**（格式如：`ghp_xxxxxxxxxxxxxxxxxxxx`）

⚠️ **注意**：Token 只显示一次，务必立即复制！

---

## 🎯 选择合适的脚本

| 场景 | 推荐脚本 | 原因 |
|------|---------|------|
| 首次使用 | `push.sh` | 有详细的交互提示 |
| 需要自定义提交信息 | `push.sh` | 可以输入自定义提交信息 |
| 快速推送 | `quick-push.sh` | 一键完成，无需交互 |
| 自动化脚本 | `quick-push.sh` | 可以直接传入 Token |
| 调试推送问题 | `push.sh` | 有详细的错误提示 |

---

## 📖 使用示例

### 示例 1: 首次使用 push.sh

```bash
# 设置环境变量
export GITHUB_TOKEN="ghp_1234567890abcdefghij"

# 运行脚本
bash scripts/push.sh

# 脚本会：
# 1. 检测是否有未提交的更改
# 2. 询问是否提交
# 3. 如果提交，询问提交信息
# 4. 使用 Token 推送
```

### 示例 2: 使用 quick-push.sh 快速推送

```bash
# 直接运行，传入 Token
bash scripts/quick-push.sh "ghp_1234567890abcdefghij"

# 脚本会：
# 1. 自动检测并提交更改
# 2. 使用固定提交信息推送
# 3. 显示成功/失败结果
```

### 示例 3: 在 CI/CD 中使用

```bash
# 在 GitHub Actions 中
- name: 推送到主分支
  run: bash scripts/quick-push.sh "${{ secrets.GITHUB_TOKEN }}"

# 或在 Shell 脚本中
export GITHUB_TOKEN="你的Token"
bash scripts/push.sh
```

---

## ⚠️ 常见问题

### Q: 脚本没有执行权限？

**A:** 添加执行权限：
```bash
chmod +x scripts/push.sh
chmod +x scripts/quick-push.sh
```

### Q: 提示 "Token 不能为空"？

**A:** 检查以下几点：
1. Token 是否正确传入
2. Token 是否有空格（如有，用引号包裹）
3. Token 是否复制完整

### Q: 提示 "推送失败"？

**A:** 检查以下几点：
1. Token 是否有 `repo` 权限
2. Token 是否已过期
3. 网络连接是否正常
4. 远程仓库 URL 是否正确

### Q: 如何永久保存 Token？

**A:** 在 `~/.bashrc` 或 `~/.zshrc` 中添加：
```bash
export GITHUB_TOKEN="你的Token"
```
然后执行 `source ~/.bashrc`

---

## 🔧 脚本配置

### 修改远程仓库

编辑脚本文件，修改这一行：
```bash
REMOTE_URL="https://github.com/你的用户名/你的仓库.git"
```

或修改认证 URL 部分：
```bash
AUTH_URL="https://${TOKEN}@github.com/你的用户名/你的仓库.git"
```

### 修改分支名称

编辑脚本文件，修改这一行：
```bash
BRANCH="main"  # 或 "master"
```

---

## 📚 相关文档

- [详细使用指南](./PUSH_GUIDE.md)
- [GitHub Token 生成](https://github.com/settings/tokens/new)
- [Git 官方文档](https://git-scm.com/docs)

---

## 🚀 快速开始

### 方法 1: 使用 push.sh（推荐）

```bash
# 1. 获取 Token
# 访问: https://github.com/settings/tokens/new

# 2. 设置环境变量
export GITHUB_TOKEN="你的Token"

# 3. 运行脚本
bash scripts/push.sh
```

### 方法 2: 使用 quick-push.sh（快速）

```bash
# 1. 获取 Token
# 访问: https://github.com/settings/tokens/new

# 2. 直接运行
bash scripts/quick-push.sh "你的Token"
```

---

## ✨ 特性对比

| 功能 | push.sh | quick-push.sh |
|------|---------|---------------|
| 自动检测更改 | ✅ | ✅ |
| 自动提交更改 | ✅（可选） | ✅（自动） |
| 自定义提交信息 | ✅ | ❌ |
| 交互式输入 Token | ✅ | ❌ |
| 环境变量支持 | ✅ | ❌ |
| 用户名+密码方式 | ✅ | ❌ |
| 详细错误提示 | ✅ | ✅ |
| 彩色输出 | ✅ | ✅ |
| 适合自动化 | ⚠️ | ✅ |

---

## 📝 提示

- ⚠️ 不要在公共代码库中泄露 Token
- ⚠️ 定期更换 Token（如每 90 天）
- ⚠️ 使用 GitHub Secrets 在 CI/CD 中存储 Token
- ✅ 推荐使用 `push.sh` 进行日常操作
- ✅ 推荐使用 `quick-push.sh` 进行自动化推送

---

**开始使用吧！** 🎉
