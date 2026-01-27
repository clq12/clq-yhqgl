#!/bin/bash

# 定时任务配置检查脚本
# 用于验证定时任务所需的环境变量和接口是否配置正确

echo "========================================="
echo "定时任务配置检查"
echo "========================================="
echo ""

# 检查环境变量
echo "1. 检查环境变量..."
echo ""

# 定义需要检查的环境变量
REQUIRED_VARS=(
  "WEBDAV_URL"
  "WEBDAV_USERNAME"
  "WEBDAV_PASSWORD"
  "PUSHPLUS_TOKEN"
)

ALL_SET=true

for VAR in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!VAR}" ]; then
    echo "❌ $VAR 未设置"
    ALL_SET=false
  else
    VALUE="${!VAR}"
    # 隐藏敏感信息
    if [[ "$VAR" == *"PASSWORD"* ]] || [[ "$VAR" == *"TOKEN"* ]]; then
      echo "✅ $VAR: ${VALUE:0:8}***"
    else
      echo "✅ $VAR: $VALUE"
    fi
  fi
done

echo ""
if [ "$ALL_SET" = false ]; then
  echo "⚠️  警告：部分环境变量未设置"
  echo "   请在部署平台配置以下环境变量："
  for VAR in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!VAR}" ]; then
      echo "   - $VAR"
    fi
  done
  echo ""
fi

# 检查接口
echo "2. 检查 API 接口..."
echo ""

# 检查应用是否运行
APP_URL="${APP_URL:-http://localhost:5000}"
echo "应用地址: $APP_URL"

# 测试接口
echo "测试 /api/check-expiring 接口..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/api/check-expiring")

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ 接口正常"
  RESPONSE=$(curl -s "$APP_URL/api/check-expiring")
  echo "响应: $RESPONSE"
elif [ "$HTTP_CODE" = "500" ]; then
  echo "❌ 接口返回 500 错误"
  echo "   请检查环境变量配置和 WebDAV 连接"
elif [ "$HTTP_CODE" = "401" ]; then
  echo "❌ 接口返回 401 错误"
  echo "   请检查 WebDAV 配置"
else
  echo "⚠️  接口返回状态码: $HTTP_CODE"
  echo "   请确认应用是否正常运行"
fi

echo ""
echo "========================================="
echo "检查完成"
echo "========================================="
echo ""
echo "提示："
echo "- 如果环境变量未设置，请在部署平台配置"
echo "- 如果接口无法访问，请确认应用是否正常运行"
echo "- 详细配置指南请查看 SCHEDULE_CONFIG.md"
echo ""
