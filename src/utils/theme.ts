// 主题配置
import {AppSettings} from '../types';
import {ImageSourcePropType, Platform, StyleSheet, ViewStyle} from 'react-native';

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
  // 质感增强 token
  cardShadowColor: string;  // 卡片阴影颜色（深色/春节模式专用，浅色用黑）
  cardShadowOpacity: number;  // 卡片阴影不透明度（按主题调整）
  statusBarStyle: 'light' | 'dark';  // 状态栏前景：light=浅色文字，dark=深色文字
  chevron: string;  // 列表箭头/可点指示色（介于 border 和 secondaryText 之间）
  likePositive: string;  // 正向评分/点赞色（与 error 红区分）
  elevationBorder?: string;  // 卡片抬升描边（深色模式补一条极淡浅色边，纯阴影不可见时使用）
  headerBackgroundImage?: ImageSourcePropType;  // 顶部导航栏背景图片（可选）
  tabBarBackgroundImage?: ImageSourcePropType;  // 底部标签栏背景图片（可选）
}

// 日间主题
export const lightTheme: ThemeColors = {
  background: '#f8f9fa',
  cardBackground: '#ffffff',
  text: '#1a1a1a',
  secondaryText: '#6b6b70',  // 优化：加深以满足正文 meta 文字的对比度（约 4.7:1）
  border: 'rgba(0,0,0,0.06)',  // 轻量分隔线
  divider: 'rgba(0,0,0,0.1)',  // 主要分隔线
  primary: '#007AFF',
  error: '#FF3B30',
  placeholderBackground: '#f2f3f5',
  quoteBackground: '#f8f9fa',
  quoteBorder: '#e8eaed',
  headerBackground: '#ffffff',
  headerText: '#1a1a1a',  // 日间模式导航栏标题
  headerTint: '#007AFF',  // 日间模式导航栏按钮蓝色
  tabBarActive: '#007AFF',  // 日间模式选中标签蓝色
  tabBarBackground: '#ffffff',
  tabBarBorder: 'rgba(0,0,0,0.08)',
  tabBarInactive: '#8e8e93',
  cardShadowColor: '#000000',
  cardShadowOpacity: 0.06,
  statusBarStyle: 'dark',
  chevron: '#C7C7CC',
  likePositive: '#007AFF',
};

// 夜间主题
export const darkTheme: ThemeColors = {
  background: '#1a1a1a',
  cardBackground: '#2a2a2a',
  text: '#e0e0e0',
  secondaryText: '#9a9a9f',  // 优化：在深色卡片上提升 meta 文字可读性
  border: '#333333',  // 轻量分隔线（用于卡片内部，较柔和）
  divider: '#3a3a3a',  // 主要分隔线（用于不同帖子之间，更明显）
  primary: '#3D8BE0',
  error: '#ff453a',
  placeholderBackground: '#3a3a3a',
  quoteBackground: '#2a2a2a',
  quoteBorder: '#3a3a3a',
  headerBackground: '#1c1c1e',  // iOS 深色模式标准导航栏色
  headerText: '#e0e0e0',  // 深色模式导航栏标题浅色
  headerTint: '#3D8BE0',  // 深色模式导航栏按钮蓝色（柔和，降低刺眼感）
  tabBarActive: '#3D8BE0',  // 深色模式选中标签蓝色
  tabBarBackground: '#1c1c1e',  // iOS 深色模式标准标签栏色
  tabBarBorder: '#38383a',  // 标签栏上边线
  tabBarInactive: '#636366',  // 未选中标签稍暗，降低干扰
  cardShadowColor: '#000000',
  cardShadowOpacity: 0.45,  // 深色模式阴影更深，配合浅色描边形成立体感
  statusBarStyle: 'light',
  chevron: '#48484A',
  likePositive: '#3D8BE0',
  elevationBorder: 'rgba(255,255,255,0.06)',
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
  cardShadowColor: '#8B6914',     // 暖金色阴影，呼应金色主题
  cardShadowOpacity: 0.12,
  statusBarStyle: 'light',        // 红色导航栏上用浅色状态栏
  chevron: '#C9A227',             // muted 金色箭头
  likePositive: '#C41A16',        // 春节主题正向评分用中国红
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

/**
 * 统一的卡片立体感样式（按主题生成阴影）。
 * 浅色：柔和黑色阴影；深色：更深阴影 + 浅色 hairline 描边形成抬升感；春节：暖金阴影。
 * @param theme 当前主题
 * @param level 立体层级：1=普通卡片，2=浮起元素（如 FAB）
 */
export const getCardElevation = (
  theme: ThemeColors,
  level: 1 | 2 = 1,
): ViewStyle => {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: theme.cardShadowColor,
      shadowOffset: {width: 0, height: level === 2 ? 4 : 2},
      shadowOpacity: theme.cardShadowOpacity,
      shadowRadius: level === 2 ? 12 : 8,
      // 深色模式下纯阴影几乎不可见，补一条极淡的浅色描边作为真正的抬升提示
      ...(theme.elevationBorder
        ? {borderWidth: StyleSheet.hairlineWidth, borderColor: theme.elevationBorder}
        : null),
    },
    android: {
      elevation: level === 2 ? 6 : 2,
    },
  }) as ViewStyle;
};
