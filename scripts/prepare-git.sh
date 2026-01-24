#!/bin/bash

# 优惠券管理应用 - Git 仓库初始化脚本

echo "🚀 准备将优惠券管理应用部署到云端..."
echo ""

# 检查是否已初始化 Git
if [ -d ".git" ]; then
    echo "✅ Git 仓库已初始化"
else
    echo "📦 初始化 Git 仓库..."
    git init
fi

# 检查是否有远程仓库
if git remote get-url origin > /dev/null 2>&1; then
    echo "✅ 远程仓库已配置: $(git remote get-url origin)"
else
    echo "⚠️  尚未配置远程仓库"
    echo ""
    echo "请按以下步骤操作："
    echo "1. 在 GitHub 创建新仓库"
    echo "2. 运行以下命令关联远程仓库："
    echo "   git remote add origin https://github.com/你的用户名/你的仓库名.git"
    echo "   git branch -M main"
    echo ""
fi

# 添加文件到 Git
echo "📝 添加文件到 Git..."
git add .

# 提交
echo "💾 提交更改..."
git commit -m "feat: 优惠券管理应用 - 支持云端部署和多设备同步"

echo ""
echo "✅ 准备完成！"
echo ""
echo "下一步："
echo "1. 如果还没有远程仓库，请先在 GitHub 创建"
echo "2. 关联远程仓库: git remote add origin <你的仓库地址>"
echo "3. 推送到 GitHub: git push -u origin main"
echo ""
echo "📖 详细部署指南请查看: DEPLOYMENT.md"
