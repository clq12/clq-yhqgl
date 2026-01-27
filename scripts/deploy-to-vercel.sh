#!/bin/bash

# Vercel 部署触发脚本
# 用于推送代码到 GitHub，触发 Vercel 自动部署

echo "========================================="
echo "Vercel 部署触发脚本"
echo "========================================="
echo ""

# 检查 Git 状态
echo "1. 检查 Git 状态..."
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  有未提交的更改"
    echo ""
    git status --short
    echo ""
    echo "请先提交更改："
    echo "  git add ."
    echo "  git commit -m '你的提交信息'"
    echo ""
    exit 1
else
    echo "✅ 工作区干净，没有未提交的更改"
fi

echo ""
echo "2. 检查远程仓库..."
REMOTE_URL=$(git remote get-url origin)
if [ -z "$REMOTE_URL" ]; then
    echo "❌ 未配置远程仓库"
    echo ""
    echo "请先配置远程仓库："
    echo "  git remote add origin https://github.com/你的用户名/你的仓库名.git"
    echo ""
    exit 1
else
    echo "✅ 远程仓库: $REMOTE_URL"
fi

echo ""
echo "3. 检查当前分支..."
BRANCH=$(git branch --show-current)
echo "✅ 当前分支: $BRANCH"

echo ""
echo "4. 拉取最新代码..."
git pull origin $BRANCH

if [ $? -ne 0 ]; then
    echo "❌ 拉取失败，请检查网络连接或权限"
    echo ""
    exit 1
fi

echo ""
echo "5. 推送到 GitHub..."
git push origin $BRANCH

if [ $? -ne 0 ]; then
    echo "❌ 推送失败"
    echo ""
    echo "可能的原因："
    echo "1. Git 凭证未配置"
    echo "2. 没有推送权限"
    echo "3. 网络连接问题"
    echo ""
    echo "解决方案："
    echo "1. 配置 Git 凭证："
    echo "   git config --global credential.helper store"
    echo "   git push origin $BRANCH"
    echo ""
    echo "2. 使用 SSH 密钥："
    echo "   git remote set-url origin git@github.com:用户名/仓库名.git"
    echo "   git push origin $BRANCH"
    echo ""
    exit 1
fi

echo ""
echo "========================================="
echo "✅ 推送成功！"
echo "========================================="
echo ""
echo "Vercel 会在 1-2 分钟内自动部署最新代码"
echo ""
echo "你可以："
echo "1. 访问 Vercel Dashboard 查看部署状态"
echo "2. 访问应用 URL 测试新功能"
echo "3. 查看部署日志确认构建成功"
echo ""
echo "应用 URL: https://你的应用.vercel.app"
echo ""
