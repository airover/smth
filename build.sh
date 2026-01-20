#!/bin/bash

echo "📦 安装依赖..."

# 检查 package-lock.json 是否存在
if [ -f "package-lock.json" ]; then
  echo "使用 npm ci 进行干净安装..."
  npm ci
else
  echo "使用 npm install 安装..."
  npm install
fi

echo "📱 安装 iOS Pods..."
cd ios && pod install --repo-update && cd ..

echo "✅ 构建准备完成！"
