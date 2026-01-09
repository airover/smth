#!/bin/bash

echo "📦 生成离线 bundle..."

# 生成 iOS bundle
npx react-native bundle \
  --entry-file index.js \
  --platform ios \
  --dev true \
  --bundle-output ios/main.jsbundle \
  --assets-dest ios

echo "✅ Bundle 已生成！"
echo ""
echo "现在运行: npm run ios"
echo "断开 Metro 后 App 仍可使用本地 bundle"
