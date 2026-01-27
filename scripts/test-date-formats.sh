#!/bin/bash

# 测试新的日期格式识别

echo "========================================="
echo "测试日期格式识别"
echo "========================================="
echo ""

# 测试数据
test_texts=(
  "华莱士串 1.30过期"
  "华莱士串 这个月30过期"
  "华莱士串 3天后过期"
  "华莱士串 下个月5号过期"
)

echo "测试文本："
for i in "${!test_texts[@]}"; do
  echo "$((i+1)). ${test_texts[$i]}"
done

echo ""
echo "========================================="
echo "测试 API"
echo "========================================="

# 测试 API（需要先启动服务）
if curl -s http://localhost:5000 > /dev/null 2>&1; then
  echo "✅ 服务正在运行"
  echo ""

  for text in "${test_texts[@]}"; do
    echo "测试: $text"
    response=$(curl -s -X POST http://localhost:5000/api/parse-coupon \
      -H "Content-Type: application/json" \
      -d "{\"text\": \"$text\", \"useAI\": false}")
    echo "响应: $response"
    echo ""
  done
else
  echo "❌ 服务未运行"
  echo ""
  echo "请先启动服务："
  echo "  coze dev"
  echo ""
  echo "或手动测试："
  echo "  1. 访问应用 http://localhost:5000"
  echo "  2. 点击'批量OCR'按钮"
  echo "  3. 粘贴测试文本"
  echo "  4. 查看识别结果"
fi

echo ""
echo "========================================="
echo "测试完成"
echo "========================================="
echo ""
echo "测试文本："
for i in "${!test_texts[@]}"; do
  echo "$((i+1)). ${test_texts[$i]}"
done
echo ""
echo "预期结果："
echo "- 每行应该被识别为一个独立的优惠券"
echo "- 日期应该正确提取"
echo "- 标题应该正确提取（华莱士串）"
