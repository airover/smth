# React Native 开发环境搭建完成报告

## ✅ 已完成的安装

### 1. Node.js
- **状态**: ✅ 已安装
- **版本**: v25.2.1
- **验证**: `node --version`

### 2. npm
- **状态**: ✅ 已安装
- **版本**: 11.6.3
- **验证**: `npm --version`

### 3. npx
- **状态**: ✅ 已安装
- **位置**: `/usr/local/bin/npx`
- **说明**: React Native CLI 推荐使用 npx，无需全局安装

### 4. Watchman
- **状态**: ✅ 已安装
- **版本**: 2025.12.22.00
- **说明**: Facebook 的文件监控工具，用于监听文件变化
- **验证**: `watchman --version`

### 5. React Native CLI
- **状态**: ✅ 可用（通过 npx）
- **说明**: 使用 `npx react-native` 命令，无需全局安装
- **验证**: `npx react-native --version`

## ⚠️ 需要手动完成

### iOS 开发环境

#### Xcode
- **状态**: ❌ 未安装
- **安装步骤**:
  1. 打开 Mac App Store
  2. 搜索 "Xcode"
  3. 点击"获取"安装（约 12GB+）
  4. 安装完成后运行：
     ```bash
     sudo xcodebuild -license accept
     sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
     ```

#### CocoaPods
- **状态**: ✅ 已安装（见 iOS 环境文档）
- **版本**: 1.16.2
- **验证**: `pod --version`

### Android 开发环境

#### Java Development Kit (JDK)
- **状态**: ❌ 未安装
- **推荐版本**: JDK 17
- **安装方法**:
  ```bash
  # 方法1: 使用 Homebrew（需要管理员权限）
  brew install --cask zulu@17
  
  # 方法2: 安装 Android Studio（推荐，包含 JDK）
  # 从 https://developer.android.com/studio 下载安装
  ```
- **配置环境变量**（安装后）:
  ```bash
  # 添加到 ~/.zshrc
  export JAVA_HOME=$(/usr/libexec/java_home -v 17)
  export PATH=$JAVA_HOME/bin:$PATH
  ```

#### Android Studio
- **状态**: ❌ 未安装
- **安装步骤**:
  1. 访问 [Android Studio 官网](https://developer.android.com/studio)
  2. 下载 macOS 版本
  3. 安装并打开 Android Studio
  4. 运行 Setup Wizard，安装：
     - Android SDK
     - Android SDK Platform
     - Android Virtual Device (AVD)
- **配置环境变量**（安装后）:
  ```bash
  # 添加到 ~/.zshrc
  export ANDROID_HOME=$HOME/Library/Android/sdk
  export PATH=$PATH:$ANDROID_HOME/emulator
  export PATH=$PATH:$ANDROID_HOME/platform-tools
  export PATH=$PATH:$ANDROID_HOME/tools
  export PATH=$PATH:$ANDROID_HOME/tools/bin
  ```

## 📋 环境验证

运行以下命令检查环境：

```bash
# 运行环境检查脚本
./check_rn_env.sh

# 或手动验证
node --version
npm --version
watchman --version
npx react-native --version
```

## 🚀 创建第一个 React Native 项目

### 使用 TypeScript 模板（推荐）

```bash
# 创建新项目
npx react-native@latest init MyApp --template react-native-template-typescript

# 进入项目目录
cd MyApp

# 运行 iOS（需要 Xcode）
npx react-native run-ios

# 运行 Android（需要 Android Studio）
npx react-native run-android
```

### 使用 JavaScript 模板

```bash
# 创建新项目
npx react-native@latest init MyApp

# 进入项目目录
cd MyApp

# 运行项目
npx react-native run-ios
# 或
npx react-native run-android
```

## 📝 常用命令

### 项目初始化
```bash
# 创建新项目（TypeScript）
npx react-native@latest init ProjectName --template react-native-template-typescript

# 创建新项目（JavaScript）
npx react-native@latest init ProjectName
```

### 运行项目
```bash
# iOS 模拟器
npx react-native run-ios

# Android 模拟器
npx react-native run-android

# 指定设备
npx react-native run-ios --simulator="iPhone 15 Pro"
npx react-native run-android --deviceId=设备ID
```

### 开发工具
```bash
# 启动 Metro bundler
npx react-native start

# 清除缓存
npx react-native start --reset-cache

# 运行 Android 日志
npx react-native log-android

# 运行 iOS 日志
npx react-native log-ios
```

### 依赖管理
```bash
# 安装依赖
npm install

# 安装特定包
npm install package-name

# iOS 依赖（安装 CocoaPods 依赖）
cd ios && pod install && cd ..

# 更新依赖
npm update
```

## 🔧 环境变量配置

将以下内容添加到 `~/.zshrc`（如果还没有）：

```bash
# React Native 环境配置
# Java (Android 开发)
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH=$JAVA_HOME/bin:$PATH

# Android SDK (安装 Android Studio 后)
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin

# 重新加载配置
source ~/.zshrc
```

## 🐛 故障排除

### Metro bundler 端口被占用
```bash
# 查找占用 8081 端口的进程
lsof -ti:8081

# 杀死进程
kill -9 $(lsof -ti:8081)
```

### Watchman 问题
```bash
# 重启 Watchman
watchman shutdown-server

# 清除 Watchman 缓存
watchman watch-del-all
```

### iOS 构建问题
```bash
# 清理 iOS 构建
cd ios
rm -rf build
pod deintegrate
pod install
cd ..
```

### Android 构建问题
```bash
# 清理 Android 构建
cd android
./gradlew clean
cd ..

# 清除 Android 缓存
rm -rf ~/.gradle/caches/
```

### 清除所有缓存
```bash
# 清除 Metro bundler 缓存
npx react-native start --reset-cache

# 清除 Watchman
watchman watch-del-all

# 清除 npm 缓存
npm cache clean --force

# 重新安装依赖
rm -rf node_modules
npm install
```

## 📚 参考资源

- [React Native 官方文档](https://reactnative.dev/)
- [React Native 中文文档](https://reactnative.cn/)
- [Android Studio 下载](https://developer.android.com/studio)
- [Xcode 下载](https://developer.apple.com/xcode/)
- [React Native 社区](https://github.com/react-native-community)

## 🎯 下一步

1. **安装 Xcode**（iOS 开发）
2. **安装 Android Studio 和 JDK**（Android 开发）
3. **配置环境变量**（见上方）
4. **创建第一个项目**（见上方命令）
5. **开始开发！** 🚀

