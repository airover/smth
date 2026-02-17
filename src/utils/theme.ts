// 主题配置
import {AppSettings} from '../types';
import {ImageSourcePropType} from 'react-native';

// 导出主题颜色接口
export interface ThemeColors {
  background: string;
  cardBackground: string;
  text: string;
  secondaryText: string;
  border: string;  // 轻量分隔线（用于卡片内部）
  divider: string;  // 主要分隔线（用于内容之间）
  primary: string;
  error: string;
  placeholderBackground: string;
  quoteBackground: string;
  quoteBorder: string;
  headerBackground: string;  // 顶部导航栏背景
  headerText: string;  // 导航栏标题文字颜色
  headerTint: string;  // 导航栏按钮/返回箭头颜色
  tabBarActive: string;  // 底部标签栏选中颜色
  tabBarBackground: string;  // 底部标签栏背景
  tabBarBorder: string;  // 底部标签栏上边线
  tabBarInactive: string;  // 底部标签栏未选中颜色
  headerBackgroundImage?: ImageSourcePropType;  // 顶部导航栏背景图片（可选）
  tabBarBackgroundImage?: ImageSourcePropType;  // 底部标签栏背景图片（可选）
}

// 日间主题
export const lightTheme: ThemeColors = {
  background: '#f5f5f5',
  cardBackground: '#fff',
  text: '#000',
  secondaryText: '#666',
  border: '#e0e0e0',  // 轻量分隔线
  divider: '#d0d0d0',  // 主要分隔线（稍深）
  primary: '#007AFF',
  error: '#FF3B30',
  placeholderBackground: '#f0f0f0',
  quoteBackground: '#f8f9fa',
  quoteBorder: '#dee2e6',
  headerBackground: '#fff',
  headerText: '#000',  // 日间模式导航栏标题黑色
  headerTint: '#007AFF',  // 日间模式导航栏按钮蓝色
  tabBarActive: '#007AFF',  // 日间模式选中标签蓝色
  tabBarBackground: '#fff',
  tabBarBorder: '#e0e0e0',
  tabBarInactive: '#999',
};

// 夜间主题
export const darkTheme: ThemeColors = {
  background: '#1a1a1a',
  cardBackground: '#2a2a2a',
  text: '#e0e0e0',
  secondaryText: '#8e8e93',  // 优化：稍微柔和，减少与主文字的对比刺眼感
  border: '#333333',  // 轻量分隔线（用于卡片内部，较柔和）
  divider: '#3a3a3a',  // 主要分隔线（用于不同帖子之间，更明显）
  primary: '#0a84ff',
  error: '#ff453a',
  placeholderBackground: '#3a3a3a',
  quoteBackground: '#2a2a2a',
  quoteBorder: '#3a3a3a',
  headerBackground: '#1c1c1e',  // iOS 深色模式标准导航栏色
  headerText: '#e0e0e0',  // 深色模式导航栏标题浅色
  headerTint: '#0a84ff',  // 深色模式导航栏按钮蓝色
  tabBarActive: '#0a84ff',  // 深色模式选中标签蓝色
  tabBarBackground: '#1c1c1e',  // iOS 深色模式标准标签栏色
  tabBarBorder: '#38383a',  // 标签栏上边线
  tabBarInactive: '#636366',  // 未选中标签稍暗，降低干扰
};

// 🐴 马年新春主题 - 中国红与金色为主调
export const springTheme: ThemeColors = {
  background: '#FFF8F0',           // 暖白色背景，如宣纸色
  cardBackground: '#FFFDF7',       // 略带暖调的卡片白
  text: '#2D1810',                 // 深褐色文字，沉稳典雅
  secondaryText: '#8B6914',        // 金褐色次要文字
  border: '#F0D4A8',              // 浅金色分隔线
  divider: '#E8C896',             // 金色主分隔线
  primary: '#C41A16',             // 中国红 - 主色调
  error: '#B8252A',               // 深红色错误提示
  placeholderBackground: '#FFF0E0', // 暖杏色占位背景
  quoteBackground: '#FFF5E6',     // 淡金色引用背景
  quoteBorder: '#E8B84B',         // 金色引用边框
  headerBackground: '#C41A16',    // 中国红导航栏
  headerText: '#FFFFFF',          // 白色导航栏标题
  headerTint: '#FFD700',          // 金色导航栏按钮/返回箭头
  tabBarActive: '#FFFFFF',        // 白色选中标签，更明亮醒目
  tabBarBackground: '#C41A16',    // 中国红标签栏
  tabBarBorder: '#A01510',        // 深红色标签栏边线
  tabBarInactive: '#FFE4B5',      // 淡金色未选中标签，在红色背景上更清晰
  headerBackgroundImage: require('../assets/images/spring/header_bg.png'),
  tabBarBackgroundImage: require('../assets/images/spring/tabbar_bg.png'),
};

// 根据设置获取主题
export const getTheme = (themeMode: AppSettings['themeMode']): ThemeColors => {
  if (themeMode === 'dark') {
    return darkTheme;
  }
  if (themeMode === 'spring') {
    return springTheme;
  }
  // TODO: 实现auto模式，根据系统设置返回对应主题
  // 目前auto模式默认使用日间主题
  return lightTheme;
};

// 字体大小配置
export const getFontSizes = (fontSize: AppSettings['fontSize']) => {
  const baseSizes = {
    small: {
      content: 16,
      quote: 14,
      lineHeight: 26,
      quoteLineHeight: 22,
    },
    medium: {
      content: 18,
      quote: 16,
      lineHeight: 30,
      quoteLineHeight: 26,
    },
    large: {
      content: 20,
      quote: 18,
      lineHeight: 34,
      quoteLineHeight: 30,
    },
  };

  return baseSizes[fontSize] || baseSizes.medium;
};
