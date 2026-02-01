#!/bin/bash

# 图标生成脚本 - 为 Aurelia (水母) 应用生成所有平台所需的图标
# 使用方法: ./generate-icons.sh <source-icon-1024.png>
# 
# 依赖: ImageMagick
# 安装: brew install imagemagick

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查参数
if [ $# -eq 0 ]; then
    echo -e "${RED}错误: 请提供源图标文件路径${NC}"
    echo -e "${YELLOW}使用方法: $0 <source-icon-1024.png>${NC}"
    echo ""
    echo "源图标要求:"
    echo "  - 尺寸: 1024x1024 像素"
    echo "  - 格式: PNG"
    echo "  - 建议: 透明背景或纯色背景"
    echo "  - 设计: 简洁清晰，主体占 80% 区域"
    exit 1
fi

SOURCE_ICON="$1"

# 检查源文件是否存在
if [ ! -f "$SOURCE_ICON" ]; then
    echo -e "${RED}错误: 文件不存在: $SOURCE_ICON${NC}"
    exit 1
fi

# 检查 ImageMagick 是否安装
if ! command -v convert &> /dev/null; then
    echo -e "${RED}错误: ImageMagick 未安装${NC}"
    echo -e "${YELLOW}请运行: brew install imagemagick${NC}"
    exit 1
fi

# 检查源图标尺寸
SIZE=$(identify -format "%wx%h" "$SOURCE_ICON")
if [ "$SIZE" != "1024x1024" ]; then
    echo -e "${YELLOW}警告: 源图标尺寸为 $SIZE，建议使用 1024x1024${NC}"
    read -p "是否继续? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Aurelia (水母) 图标生成工具${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "源图标: ${GREEN}$SOURCE_ICON${NC}"
echo -e "尺寸: ${GREEN}$SIZE${NC}"
echo ""

# iOS 图标目录
IOS_ICON_DIR="ios/SmthApp/Images.xcassets/AppIcon.appiconset"

# Android 图标目录
ANDROID_RES_DIR="android/app/src/main/res"

# 创建临时目录
TEMP_DIR=$(mktemp -d)
echo -e "${BLUE}临时目录: $TEMP_DIR${NC}"
echo ""

# 生成图标的函数
generate_icon() {
    local size=$1
    local output=$2
    local desc=$3
    
    echo -e "  生成 ${GREEN}${size}x${size}${NC} -> $desc"
    # 将白色背景转换为透明背景，然后调整尺寸
    convert "$SOURCE_ICON" -resize ${size}x${size} \
        -fuzz 10% -transparent white \
        "$output"
}

# ==================== iOS 图标 ====================
echo -e "${BLUE}[1/2] 生成 iOS 图标...${NC}"
echo ""

# iOS 所需的所有尺寸（适用于 iOS 12+ 和 macOS）
# 包含：通知图标、设置图标、Spotlight图标、App图标、iPad图标、Mac图标、App Store图标
IOS_SIZES=(16 20 29 32 40 58 60 64 76 80 87 114 120 128 136 152 167 180 192 256 512 1024)

for size in "${IOS_SIZES[@]}"; do
    generate_icon $size "$TEMP_DIR/${size}.png" "${size}.png"
done

# 复制到 iOS 项目
echo ""
echo -e "${BLUE}复制到 iOS 项目...${NC}"
mkdir -p "$IOS_ICON_DIR"
for size in "${IOS_SIZES[@]}"; do
    cp "$TEMP_DIR/${size}.png" "$IOS_ICON_DIR/${size}.png"
done

echo -e "${GREEN}✓ iOS 图标生成完成${NC}"
echo ""

# ==================== Android 图标 ====================
echo -e "${BLUE}[2/2] 生成 Android 图标...${NC}"
echo ""

# Android 各密度对应的尺寸
declare -A ANDROID_DENSITIES=(
    ["mdpi"]=48
    ["hdpi"]=72
    ["xhdpi"]=96
    ["xxhdpi"]=144
    ["xxxhdpi"]=192
)

for density in "${!ANDROID_DENSITIES[@]}"; do
    size=${ANDROID_DENSITIES[$density]}
    dir="$ANDROID_RES_DIR/mipmap-$density"
    
    echo -e "  ${YELLOW}mipmap-$density${NC} (${size}x${size})"
    
    mkdir -p "$dir"
    
    # 生成方形图标
    generate_icon $size "$dir/ic_launcher.png" "ic_launcher.png"
    
    # 生成圆形图标（使用圆形遮罩）
    convert "$SOURCE_ICON" -resize ${size}x${size} \
        \( +clone -threshold -1 -negate -fill white -draw "circle $((size/2)),$((size/2)) $((size/2)),0" \) \
        -alpha off -compose copy_opacity -composite \
        "$dir/ic_launcher_round.png"
    echo -e "    -> ic_launcher_round.png"
done

echo ""
echo -e "${GREEN}✓ Android 图标生成完成${NC}"
echo ""

# 清理临时文件
echo -e "${BLUE}清理临时文件...${NC}"
rm -rf "$TEMP_DIR"

# 生成摘要
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ 图标生成完成！${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "生成的文件:"
echo -e "  iOS:     ${GREEN}$IOS_ICON_DIR/${NC}"
echo -e "           ${YELLOW}${#IOS_SIZES[@]} 个尺寸${NC}"
echo ""
echo -e "  Android: ${GREEN}$ANDROID_RES_DIR/mipmap-*/${NC}"
echo -e "           ${YELLOW}${#ANDROID_DENSITIES[@]} 个密度级别 x 2 个图标${NC}"
echo ""
echo -e "${YELLOW}下一步:${NC}"
echo "  1. 检查生成的图标是否正确"
echo "  2. 重新编译项目"
echo "  3. 在真机/模拟器上测试图标显示效果"
echo ""
echo -e "${BLUE}iOS 编译:${NC}"
echo "  cd ios && pod install && cd .."
echo "  npx react-native run-ios"
echo ""
echo -e "${BLUE}Android 编译:${NC}"
echo "  npx react-native run-android"
echo ""
