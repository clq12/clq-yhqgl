#!/bin/bash

# 一键推送脚本
# 使用方法: bash scripts/quick-push.sh "你的GitHub_Token"

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# 检查参数
if [ -z "$1" ]; then
    echo -e "${RED}❌ 错误：请提供 GitHub Token${NC}"
    echo ""
    echo "使用方法："
    echo "  bash scripts/quick-push.sh \"你的GitHub_Token\""
    echo ""
    echo "获取 Token："
    echo "  https://github.com/settings/tokens/new"
    exit 1
fi

TOKEN="$1"
BRANCH="main"

echo "🚀 开始推送..."
echo ""

# 检查是否有更改
if ! git diff-index --quiet HEAD --; then
    echo "📝 检测到更改，正在提交..."
    git add .
    git commit -m "feat: 实现优惠券到期提醒重复推送功能"
    echo -e "${GREEN}✅ 提交成功${NC}"
    echo ""
fi

# 推送
echo "📤 推送到远程仓库..."
AUTH_URL="https://${TOKEN}@github.com/clq12/clq-.git"

if git push "$AUTH_URL" "$BRANCH"; then
    echo ""
    echo -e "${GREEN}✅ 推送成功！${NC}"
else
    echo ""
    echo -e "${RED}❌ 推送失败${NC}"
    echo "请检查 Token 是否正确"
    exit 1
fi
