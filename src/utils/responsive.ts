import {Dimensions, Platform, StatusBar} from 'react-native';

// 设计稿基准尺寸（iPhone 11 Pro）
const DESIGN_WIDTH = 375;
const DESIGN_HEIGHT = 812;

// 获取屏幕尺寸
const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

// 判断设备类型
export const isSmallDevice = SCREEN_WIDTH < 375; // iPhone SE等小屏设备
export const isMediumDevice = SCREEN_WIDTH >= 375 && SCREEN_WIDTH < 414; // iPhone 11 Pro等
export const isLargeDevice = SCREEN_WIDTH >= 414; // iPhone 11 Pro Max等大屏设备
export const isTablet = SCREEN_WIDTH >= 768; // iPad等平板设备

// 宽度缩放比例
const widthScale = SCREEN_WIDTH / DESIGN_WIDTH;
// 高度缩放比例
const heightScale = SCREEN_HEIGHT / DESIGN_HEIGHT;

/**
 * 根据设计稿宽度进行缩放
 * @param size 设计稿中的尺寸
 * @returns 缩放后的尺寸
 */
export const scaleWidth = (size: number): number => {
  return Math.round(size * widthScale);
};

/**
 * 根据设计稿高度进行缩放
 * @param size 设计稿中的尺寸
 * @returns 缩放后的尺寸
 */
export const scaleHeight = (size: number): number => {
  return Math.round(size * heightScale);
};

/**
 * 字体大小缩放（限制最小和最大缩放比例，避免过大或过小）
 * @param size 设计稿中的字体大小
 * @returns 缩放后的字体大小
 */
export const scaleFont = (size: number): number => {
  const scale = Math.min(widthScale, heightScale);
  // 限制缩放比例在0.85-1.2之间
  const limitedScale = Math.max(0.85, Math.min(scale, 1.2));
  return Math.round(size * limitedScale);
};

/**
 * 适度缩放（介于宽度和高度缩放之间）
 * @param size 设计稿中的尺寸
 * @returns 缩放后的尺寸
 */
export const scaleModerate = (size: number, factor: number = 0.5): number => {
  return Math.round(size + (widthScale - 1) * size * factor);
};

/**
 * 获取状态栏高度
 */
export const getStatusBarHeight = (): number => {
  if (Platform.OS === 'ios') {
    // iPhone X及以上机型
    if (SCREEN_HEIGHT >= 812) {
      return 44;
    }
    return 20;
  }
  return StatusBar.currentHeight || 0;
};

/**
 * 获取底部安全区域高度
 */
export const getBottomSafeAreaHeight = (): number => {
  if (Platform.OS === 'ios' && SCREEN_HEIGHT >= 812) {
    return 34;
  }
  return 0;
};

/**
 * 获取顶部安全区域高度（状态栏 + 导航栏）
 */
export const getTopSafeAreaHeight = (): number => {
  return getStatusBarHeight() + (Platform.OS === 'ios' ? 44 : 56);
};

/**
 * 根据设备尺寸返回不同的值
 * @param small 小屏设备的值
 * @param medium 中等屏幕设备的值
 * @param large 大屏设备的值
 * @param tablet 平板设备的值
 */
export const responsiveSize = <T>(
  small: T,
  medium: T,
  large?: T,
  tablet?: T
): T => {
  if (isTablet && tablet !== undefined) {
    return tablet;
  }
  if (isLargeDevice && large !== undefined) {
    return large;
  }
  if (isMediumDevice) {
    return medium;
  }
  return small;
};

/**
 * 导出屏幕尺寸常量
 */
export const RESPONSIVE = {
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  STATUS_BAR_HEIGHT: getStatusBarHeight(),
  BOTTOM_SAFE_AREA_HEIGHT: getBottomSafeAreaHeight(),
  TOP_SAFE_AREA_HEIGHT: getTopSafeAreaHeight(),
  IS_SMALL_DEVICE: isSmallDevice,
  IS_MEDIUM_DEVICE: isMediumDevice,
  IS_LARGE_DEVICE: isLargeDevice,
  IS_TABLET: isTablet,
};

/**
 * 常用间距（已缩放）
 */
export const SPACING = {
  xs: scaleModerate(4),
  sm: scaleModerate(8),
  md: scaleModerate(12),
  lg: scaleModerate(16),
  xl: scaleModerate(20),
  xxl: scaleModerate(24),
  xxxl: scaleModerate(32),
};

/**
 * 常用字体大小（已缩放）
 */
export const FONT_SIZE = {
  xs: scaleFont(10),
  sm: scaleFont(12),
  md: scaleFont(14),
  lg: scaleFont(16),
  xl: scaleFont(18),
  xxl: scaleFont(20),
  xxxl: scaleFont(24),
  huge: scaleFont(32),
};

/**
 * 常用圆角（已缩放）
 */
export const BORDER_RADIUS = {
  xs: scaleModerate(2),
  sm: scaleModerate(4),
  md: scaleModerate(8),
  lg: scaleModerate(12),
  xl: scaleModerate(16),
  round: 9999,
};

/**
 * 根据字号计算统一的行高（全 app 共用同一比例，保证排版节奏一致）
 * @param fontSize 字号
 * @param ratio 行高倍数，默认 1.4
 */
export const lineHeight = (fontSize: number, ratio: number = 1.4): number => {
  return Math.round(fontSize * ratio);
};
