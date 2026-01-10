#!/bin/bash

echo "🧹 开始全量清理..."

# 清理 Metro bundler 缓存
echo "清理 Metro 缓存..."
rm -rf $TMPDIR/react-*
rm -rf $TMPDIR/metro-*
rm -rf $TMPDIR/haste-*

# 清理 node_modules
echo "清理 node_modules..."
rm -rf node_modules
# 保留 package-lock.json 以确保依赖版本一致性

# 清理 iOS
echo "清理 iOS..."
rm -rf ios/Pods
rm -rf ios/Podfile.lock
rm -rf ios/build
rm -rf ~/Library/Developer/Xcode/DerivedData

# 清理 Android
echo "清理 Android..."
rm -rf android/.gradle
rm -rf android/app/build
rm -rf android/build

# 清理 watchman
watchman watch-del-all 2>/dev/null

echo "✅ 清理完成！"
echo ""
echo "接下来执行："
echo "  ./build.sh"
echo "  npm run ios 或 npm run android"
