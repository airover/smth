#!/bin/bash

# iOS 开发环境检查脚本

echo "=========================================="
echo "iOS 开发环境检查"
echo "=========================================="
echo ""

# 检查 Ruby
echo "✓ Ruby:"
if command -v ruby &> /dev/null; then
    ruby --version
else
    echo "  ❌ 未安装"
fi
echo ""

# 检查 CocoaPods
echo "✓ CocoaPods:"
if command -v pod &> /dev/null; then
    pod --version
else
    echo "  ❌ 未安装"
    echo "  提示: 确保已加载 ~/.zshrc 配置或运行: source ~/.zshrc"
fi
echo ""

# 检查 Homebrew
echo "✓ Homebrew:"
if command -v brew &> /dev/null; then
    brew --version | head -1
else
    echo "  ❌ 未安装"
fi
echo ""

# 检查 Swift
echo "✓ Swift:"
if command -v swift &> /dev/null; then
    swift --version | head -1
else
    echo "  ❌ 未安装"
fi
echo ""

# 检查 Xcode
echo "✓ Xcode:"
if [ -d "/Applications/Xcode.app" ]; then
    if command -v xcodebuild &> /dev/null; then
        xcodebuild -version
        echo ""
        echo "✓ Xcode 命令行工具:"
        xcode-select -p
    else
        echo "  ⚠️  Xcode.app 存在，但命令行工具未配置"
        echo "  运行: sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer"
    fi
else
    echo "  ❌ 未安装"
    echo "  请从 App Store 安装 Xcode"
fi
echo ""

# 检查 iOS 模拟器
echo "✓ iOS 模拟器:"
if command -v xcrun &> /dev/null && xcrun simctl list devices &> /dev/null; then
    echo "  可用设备:"
    xcrun simctl list devices available | grep -E "iPhone|iPad" | head -5
else
    echo "  ⚠️  需要安装 Xcode 后才能使用模拟器"
fi
echo ""

echo "=========================================="
echo "检查完成"
echo "=========================================="

