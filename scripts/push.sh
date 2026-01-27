#!/bin/bash

# Git 推送脚本
# 用于推送代码到 GitHub

set -e  # 遇到错误立即退出

echo "=========================================="
echo "       Git 推送脚本"
echo "=========================================="
echo ""

# 配置
REMOTE_URL="https://github.com/clq12/clq-.git"
BRANCH="main"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查是否有未提交的更改
if git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}⚠️  没有未提交的更改${NC}"
    echo ""

    # 询问是否继续推送
    read -p "是否继续推送到远程？(y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "已取消推送"
        exit 0
    fi
else
    echo -e "${GREEN}📝 检测到未提交的更改${NC}"
    echo ""

    # 显示更改概要
    git status --short
    echo ""

    # 询问是否提交
    read -p "是否先提交这些更改？(y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # 提交
        echo ""
        echo "添加所有文件..."
        git add .

        echo ""
        read -p "请输入提交信息 (默认: feat: 实现优惠券到期提醒重复推送功能): " commit_msg
        commit_msg=${commit_msg:-"feat: 实现优惠券到期提醒重复推送功能"}

        echo ""
        echo "提交更改..."
        git commit -m "$commit_msg"
        echo ""
        echo -e "${GREEN}✅ 提交成功${NC}"
    else
        echo -e "${YELLOW}⚠️  跳过提交，直接推送${NC}"
    fi
fi

echo ""
echo "=========================================="
echo "       推送到远程仓库"
echo "=========================================="
echo ""

# 检查 GITHUB_TOKEN 环境变量
if [ -n "$GITHUB_TOKEN" ]; then
    echo -e "${GREEN}✓ 使用环境变量 GITHUB_TOKEN${NC}"

    # 使用 Token 推送
    AUTH_URL="https://${GITHUB_TOKEN}@github.com/clq12/clq-.git"

    echo "推送中..."
    if git push "$AUTH_URL" "$BRANCH"; then
        echo ""
        echo -e "${GREEN}✅ 推送成功！${NC}"
    else
        echo ""
        echo -e "${RED}❌ 推送失败${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  未找到 GITHUB_TOKEN 环境变量${NC}"
    echo ""

    # 方法 1: 使用 Token 推送（推荐）
    read -p "方法 1: 使用 Personal Access Token 推送（推荐，按 y 继续）: " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo "请输入你的 GitHub Personal Access Token"
        echo "获取 Token: https://github.com/settings/tokens/new"
        echo "Token 格式: ghp_xxxxxxxxxxxxxxxxxxxx"
        echo ""
        read -sp "Token: " token
        echo ""

        if [ -z "$token" ]; then
            echo -e "${RED}❌ Token 不能为空${NC}"
            exit 1
        fi

        # 使用 Token 推送
        AUTH_URL="https://${token}@github.com/clq12/clq-.git"

        echo ""
        echo "推送中..."
        if git push "$AUTH_URL" "$BRANCH"; then
            echo ""
            echo -e "${GREEN}✅ 推送成功！${NC}"
        else
            echo ""
            echo -e "${RED}❌ 推送失败${NC}"
            echo "请检查："
            echo "  1. Token 是否正确"
            echo "  2. Token 是否有 repo 权限"
            echo "  3. Token 是否已过期"
            exit 1
        fi
    else
        # 方法 2: 使用用户名 + Token
        echo ""
        echo "方法 2: 使用用户名 + Token"
        echo "将提示输入用户名和密码"
        echo "  - Username: 2312506030@qq.com"
        echo "  - Password: 你的 Personal Access Token"
        echo ""

        read -p "继续使用此方法？(y/n): " -n 1 -r
        echo ""

        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "推送中..."
            if git push origin main; then
                echo ""
                echo -e "${GREEN}✅ 推送成功！${NC}"
            else
                echo ""
                echo -e "${RED}❌ 推送失败${NC}"
                exit 1
            fi
        else
            echo "已取消推送"
            exit 0
        fi
    fi
fi

echo ""
echo "=========================================="
echo -e "${GREEN}       完成！${NC}"
echo "=========================================="
