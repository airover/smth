#!/bin/bash

# React Native 开发环境检查脚本

echo "=========================================="
echo "React Native 开发环境检查"
echo "=========================================="
echo ""

# 检查 Node.js
echo "✓ Node.js:"
if command -v node &> /dev/null; then
    node --version
else
    echo "  ❌ 未安装"
fi
echo ""

# 检查 npm
echo "✓ npm:"
if command -v npm &> /dev/null; then
    npm --version
else
    echo "  ❌ 未安装"
fi
echo ""

# 检查 npx
echo "✓ npx:"
if command -v npx &> /dev/null; then
    echo "  ✅ 已安装: $(which npx)"
else
    echo "  ❌ 未安装"
fi
echo ""

# 检查 Watchman
echo "✓ Watchman:"
if command -v watchman &> /dev/null; then
    watchman --version
else
    echo "  ❌ 未安装"
    echo "  安装: brew install watchman"
fi
echo ""

# 检查 React Native CLI
echo "✓ React Native CLI:"
if npx react-native --version &> /dev/null; then
    echo "  ✅ 可用（通过 npx）"
    npx react-native --version 2>&1 | head -1
else
    echo "  ⚠️  将通过 npx 自动下载"
fi
echo ""

# 检查 Java/JDK
echo "✓ Java/JDK:"
if command -v java &> /dev/null; then
    java -version 2>&1 | head -1
    echo "  JAVA_HOME: ${JAVA_HOME:-未设置}"
else
    echo "  ❌ 未安装"
    echo "  安装: brew install --cask zulu@17"
    echo "  或安装 Android Studio（包含 JDK）"
fi
echo ""

# 检查 Android SDK
echo "✓ Android SDK:"
if [ -n "$ANDROID_HOME" ]; then
    echo "  ANDROID_HOME: $ANDROID_HOME"
    if [ -d "$ANDROID_HOME" ]; then
        echo "  ✅ 已配置"
    else
        echo "  ⚠️  路径不存在"
    fi
else
    echo "  ❌ 未配置"
    echo "  安装 Android Studio 后设置 ANDROID_HOME"
fi
echo ""

# 检查 ADB
echo "✓ Android Debug Bridge (ADB):"
if command -v adb &> /dev/null; then
    adb --version | head -1
else
    echo "  ❌ 未安装"
    echo "  安装 Android Studio 后可用"
fi
echo ""

# 检查 Xcode (iOS)
echo "✓ Xcode (iOS):"
if [ -d "/Applications/Xcode.app" ]; then
    if command -v xcodebuild &> /dev/null; then
        xcodebuild -version | head -1
    else
        echo "  ⚠️  Xcode.app 存在，但命令行工具未配置"
    fi
else
    echo "  ❌ 未安装"
    echo "  从 App Store 安装 Xcode"
fi
echo ""

# 检查 CocoaPods (iOS)
echo "✓ CocoaPods (iOS):"
if command -v pod &> /dev/null; then
    pod --version
else
    echo "  ⚠️  未安装（iOS 开发需要）"
    echo "  安装: gem install cocoapods"
fi
echo ""

echo "=========================================="
echo "检查完成"
echo "=========================================="
echo ""
echo "提示:"
echo "- React Native CLI 推荐使用 npx，无需全局安装"
echo "- 创建新项目: npx react-native@latest init ProjectName"
echo "- 运行 iOS: npx react-native run-ios"
echo "- 运行 Android: npx react-native run-android"

