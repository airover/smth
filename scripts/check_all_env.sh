#!/bin/bash

# 综合开发环境检查脚本（iOS + React Native）

echo "=========================================="
echo "综合开发环境检查"
echo "=========================================="
echo ""

# iOS 开发环境
echo "📱 iOS 开发环境"
echo "----------------------------------------"
if [ -d "/Applications/Xcode.app" ]; then
    if command -v xcodebuild &> /dev/null; then
        echo "✓ Xcode: $(xcodebuild -version | head -1)"
    else
        echo "⚠️  Xcode.app 存在，但命令行工具未配置"
    fi
else
    echo "❌ Xcode: 未安装"
fi

if command -v pod &> /dev/null; then
    echo "✓ CocoaPods: $(pod --version)"
else
    echo "❌ CocoaPods: 未安装"
fi

if command -v swift &> /dev/null; then
    echo "✓ Swift: $(swift --version | head -1)"
else
    echo "❌ Swift: 未安装"
fi
echo ""

# React Native 开发环境
echo "⚛️  React Native 开发环境"
echo "----------------------------------------"
if command -v node &> /dev/null; then
    echo "✓ Node.js: $(node --version)"
else
    echo "❌ Node.js: 未安装"
fi

if command -v npm &> /dev/null; then
    echo "✓ npm: $(npm --version)"
else
    echo "❌ npm: 未安装"
fi

if command -v watchman &> /dev/null; then
    echo "✓ Watchman: $(watchman --version)"
else
    echo "❌ Watchman: 未安装"
fi

if command -v npx &> /dev/null; then
    echo "✓ npx: 已安装"
else
    echo "❌ npx: 未安装"
fi
echo ""

# Android 开发环境
echo "🤖 Android 开发环境"
echo "----------------------------------------"
if command -v java &> /dev/null; then
    echo "✓ Java: $(java -version 2>&1 | head -1)"
    if [ -n "$JAVA_HOME" ]; then
        echo "  JAVA_HOME: $JAVA_HOME"
    fi
else
    echo "❌ Java/JDK: 未安装"
fi

if [ -n "$ANDROID_HOME" ]; then
    echo "✓ Android SDK: $ANDROID_HOME"
else
    echo "❌ Android SDK: 未配置"
fi

if command -v adb &> /dev/null; then
    echo "✓ ADB: $(adb --version | head -1)"
else
    echo "❌ ADB: 未安装"
fi
echo ""

# 通用工具
echo "🛠️  通用开发工具"
echo "----------------------------------------"
if command -v brew &> /dev/null; then
    echo "✓ Homebrew: $(brew --version | head -1)"
else
    echo "❌ Homebrew: 未安装"
fi

if command -v git &> /dev/null; then
    echo "✓ Git: $(git --version)"
else
    echo "❌ Git: 未安装"
fi
echo ""

echo "=========================================="
echo "检查完成"
echo "=========================================="
echo ""
echo "💡 提示:"
echo "- 运行 ./check_ios_env.sh 查看详细的 iOS 环境"
echo "- 运行 ./check_rn_env.sh 查看详细的 React Native 环境"
echo "- 查看 README_iOS_SETUP.md 了解 iOS 环境配置"
echo "- 查看 README_RN_SETUP.md 了解 React Native 环境配置"

