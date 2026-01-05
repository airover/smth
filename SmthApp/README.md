# SmthApp - 水木社区 iOS 应用

基于 React Native 开发的水木社区（www.newsmth.net）iOS 客户端应用。

## 功能特性

### 登录功能
- 支持用户名密码登录
- 使用 WebView 进行登录，自动保存 Cookie
- 登录状态持久化

### 首页 Tab
- **当日十大**：展示最热门的 10 个帖子
  - 显示帖子标题、作者、回复数、最后回复时间、所属版面
- **热门版面**：展示热门版面列表

### 版面 Tab
- **树型版面列表**：支持展开/折叠查看一二级版面
- **收藏版面**：支持收藏常用版面
- **帖子列表**：分页加载版面中的帖子
  - 显示帖子标题、作者、发帖时间
- **帖子详情**：查看帖子内容和回复
  - 帖子标题（大号字体）
  - 版面、回复数、发帖时间
  - 作者信息（头像、昵称、签名、地理位置）
  - 帖子正文（支持图片、视频）
  - 回复列表（分页加载）

### 信箱 Tab
- 展示个人收到的邮件列表
- 支持未读邮件标识
- 下拉刷新

### 设置 Tab
- 展示个人资料信息
- 清除缓存
- 退出登录

## 技术栈

- **框架**: React Native 0.83.1
- **语言**: TypeScript
- **导航**: React Navigation
- **WebView**: react-native-webview
- **存储**: @react-native-async-storage/async-storage

## 项目结构

```
SmthApp/
├── src/
│   ├── screens/          # 屏幕组件
│   │   ├── LoginScreen.tsx
│   │   ├── HomeScreen.tsx
│   │   ├── BoardScreen.tsx
│   │   ├── PostDetailScreen.tsx
│   │   ├── MailScreen.tsx
│   │   ├── SettingsScreen.tsx
│   │   └── BoardListScreen.tsx
│   ├── navigation/       # 导航配置
│   │   └── AppNavigator.tsx
│   ├── services/         # API 服务
│   │   ├── api.ts
│   │   └── webview.ts
│   ├── types/           # TypeScript 类型定义
│   │   └── index.ts
│   └── utils/           # 工具函数
│       └── htmlParser.ts
├── App.tsx              # 应用入口
└── package.json
```

## 安装和运行

### 前置要求
- Node.js >= 20
- Xcode（iOS 开发）
- CocoaPods

### 安装依赖

```bash
# 安装 npm 依赖
npm install

# iOS 依赖（需要先安装 Xcode）
cd ios
pod install
cd ..
```

### 运行项目

```bash
# 启动 Metro bundler
npm start

# 运行 iOS（需要 Xcode）
npm run ios
```

## 使用说明

### 登录
1. 启动应用后，会显示登录界面
2. 输入水木社区的用户名和密码
3. 点击登录按钮，应用会通过 WebView 进行登录
4. 登录成功后，Cookie 会自动保存，下次启动应用时自动保持登录状态

### 浏览帖子
1. 在首页可以查看"当日十大"和"热门版面"
2. 点击帖子可以查看详情
3. 在"版面"Tab 中选择版面，查看该版面的帖子列表
4. 点击帖子进入详情页，查看内容和回复

### 收藏版面
1. 在版面列表中选择喜欢的版面
2. 点击收藏按钮（⭐）可以收藏版面
3. 在收藏列表中查看所有收藏的版面

## 注意事项

1. **API 接口**：当前实现中的 API 调用需要根据实际的水木社区接口进行调整
2. **HTML 解析**：`htmlParser.ts` 中的解析逻辑需要根据实际页面结构进行完善
3. **登录方式**：目前使用 WebView 进行登录，需要根据实际登录页面调整注入的 JavaScript 代码
4. **图片和视频**：帖子详情中的图片和视频展示功能需要进一步完善

## 开发计划

- [ ] 完善 HTML 解析逻辑
- [ ] 实现图片和视频的完整展示
- [ ] 添加帖子搜索功能
- [ ] 实现发帖和回复功能
- [ ] 优化性能和用户体验
- [ ] 添加深色模式支持

## 许可证

MIT
