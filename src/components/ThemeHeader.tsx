import React, {createContext, useContext, useState, useCallback} from 'react';
import {View, Text, ImageBackground, StyleSheet, TouchableOpacity} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from './ThemedComponents';
import {
  SPACING,
  scaleModerate,
} from '../utils/responsive';

// 导航栏内容高度（不含状态栏）
export const NAV_BAR_HEIGHT = 44;

/**
 * 浮动导航栏的 Context
 * 有背景图主题时，headerShown: false，由 FloatingHeaderProvider 提供导航栏
 * 子页面通过此 Context 动态设置导航栏内容（替代 navigation.setOptions）
 */
interface FloatingHeaderContextType {
  setHeaderRight: (node: React.ReactNode) => void;
  setHeaderLeft: (node: React.ReactNode) => void;
  setHeaderCenter: (node: React.ReactNode) => void;
  setTitle: (title: string) => void;
}

const FloatingHeaderContext = createContext<FloatingHeaderContextType | null>(null);

/**
 * 在有背景图主题时，替代 navigation.setOptions 动态设置导航栏内容
 * 无背景图时自动回退为 navigation.setOptions
 */
export const useFloatingHeader = () => {
  const ctx = useContext(FloatingHeaderContext);
  const navigation = useNavigation();
  const theme = useTheme();
  const hasBackgroundImage = !!theme.headerBackgroundImage;

  return useCallback((options: {
    headerRight?: () => React.ReactNode;
    headerLeft?: () => React.ReactNode;
    headerTitle?: string | (() => React.ReactNode);
    title?: string;
  }) => {
    if (hasBackgroundImage && ctx) {
      // 有背景图时，通过 Context 设置浮动导航栏
      if (options.headerRight) {
        ctx.setHeaderRight(options.headerRight());
      }
      if (options.headerLeft) {
        ctx.setHeaderLeft(options.headerLeft());
      }
      if (typeof options.headerTitle === 'function') {
        ctx.setHeaderCenter(options.headerTitle());
      } else if (typeof options.headerTitle === 'string') {
        ctx.setTitle(options.headerTitle);
      }
      if (options.title) {
        ctx.setTitle(options.title);
      }
    } else {
      // 无背景图时，使用 React Navigation 的 setOptions
      navigation.setOptions(options as any);
    }
  }, [hasBackgroundImage, ctx, navigation]);
};

/**
 * 浮动导航栏包裹组件
 * 有背景图主题时，作为页面最外层包裹，提供 ThemeHeader + Context
 */
export const FloatingHeaderProvider: React.FC<{
  defaultTitle: string;
  canGoBack?: boolean;
  children: React.ReactNode;
}> = ({defaultTitle, canGoBack = false, children}) => {
  const navigation = useNavigation();
  const theme = useTheme();
  const [headerRight, setHeaderRight] = useState<React.ReactNode>(null);
  const [headerLeft, setHeaderLeft] = useState<React.ReactNode>(undefined);
  const [headerCenter, setHeaderCenter] = useState<React.ReactNode>(null);
  const [title, setTitle] = useState(defaultTitle);

  const contextValue = React.useMemo(() => ({
    setHeaderRight,
    setHeaderLeft,
    setHeaderCenter,
    setTitle,
  }), []);

  return (
    <FloatingHeaderContext.Provider value={contextValue}>
      <View style={{flex: 1, backgroundColor: theme.headerBackground}}>
        <ThemeHeader
          title={title}
          canGoBack={canGoBack}
          onGoBack={() => navigation.goBack()}
          headerLeft={headerLeft}
          headerRight={headerRight}
          headerCenter={headerCenter}
        />
        {children}
      </View>
    </FloatingHeaderContext.Provider>
  );
};

interface ThemeHeaderProps {
  title?: string;
  canGoBack?: boolean;
  onGoBack?: () => void;
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  headerCenter?: React.ReactNode; // 自定义中间区域（优先级高于 title）
}

/**
 * 获取主题 Header 总高度的 hook
 * 用于页面内容的 paddingTop
 */
export const useThemeHeaderHeight = () => {
  // ThemeHeader 现在参与正常文档流（非 absolute），不需要页面额外 paddingTop
  return 0;
};

/**
 * 主题顶部导航栏组件
 * 参考 UserProfileScreen 的设计风格：
 * - 当主题有背景图片时，使用 ImageBackground 包裹，按钮使用圆角半透明白色背景
 * - 当没有背景图片时，使用普通纯色背景
 */
const ThemeHeader: React.FC<ThemeHeaderProps> = ({
  title,
  canGoBack = false,
  onGoBack,
  headerLeft,
  headerRight,
  headerCenter,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const statusBarHeight = insets.top;
  const hasBackgroundImage = !!theme.headerBackgroundImage;

  // 默认返回按钮
  const defaultBackButton = canGoBack ? (
    <TouchableOpacity
      onPress={onGoBack}
      style={hasBackgroundImage ? styles.themedButton : styles.normalBackButton}
    >
      <Svg width={hasBackgroundImage ? 22 : 28} height={hasBackgroundImage ? 22 : 28} viewBox="0 0 24 24" fill="none">
        <Path
          d="M15 18L9 12L15 6"
          stroke={hasBackgroundImage ? '#FFFFFF' : theme.headerTint}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </TouchableOpacity>
  ) : null;

  const leftContent = headerLeft !== undefined ? headerLeft : defaultBackButton;

  const navBarContent = (
    <>
      {/* 状态栏占位 */}
      <View style={{height: statusBarHeight}} />
      {/* 导航栏内容 */}
      <View style={styles.navBar}>
        <View style={styles.navBarLeft}>
          {leftContent}
        </View>
        <View style={styles.navBarCenter}>
          {headerCenter || (
            <Text
              style={[
                styles.navBarTitle,
                {color: theme.headerText},
                hasBackgroundImage && styles.navBarTitleWithBg,
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
          )}
        </View>
        <View style={styles.navBarRight}>
          {headerRight}
        </View>
      </View>
    </>
  );

  if (hasBackgroundImage) {
    const totalHeight = statusBarHeight + NAV_BAR_HEIGHT;
    return (
      <View style={{width: '100%', height: totalHeight}}>
        <ImageBackground
          source={theme.headerBackgroundImage!}
          style={{width: '100%', height: totalHeight}}
          resizeMode="cover"
        >
          {navBarContent}
        </ImageBackground>
      </View>
    );
  }

  return (
    <View style={{backgroundColor: theme.headerBackground}}>
      <View style={{height: statusBarHeight}} />
      <View style={styles.navBar}>
        <View style={styles.navBarLeft}>
          {leftContent}
        </View>
        <View style={styles.navBarCenter}>
          {headerCenter || (
            <Text
              style={[styles.navBarTitle, {color: theme.headerText}]}
              numberOfLines={1}
            >
              {title}
            </Text>
          )}
        </View>
        <View style={styles.navBarRight}>
          {headerRight}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  navBar: {
    height: NAV_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  navBarLeft: {
    minWidth: 60,
    alignItems: 'flex-start',
  },
  navBarCenter: {
    flex: 1,
    alignItems: 'center',
  },
  navBarTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  navBarTitleWithBg: {
    textShadowColor: 'rgba(255, 255, 255, 0.5)',
    textShadowOffset: {width: 0, height: 0},
    textShadowRadius: 4,
  },
  navBarRight: {
    minWidth: 60,
    alignItems: 'flex-end',
  },
  // 有背景图时的按钮（透明背景，不遮挡背景图）
  themedButton: {
    width: scaleModerate(36),
    height: scaleModerate(36),
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 无背景图时的普通返回按钮
  normalBackButton: {
    marginLeft: -4,
    padding: 4,
    paddingRight: 12,
  },
  // 导出用的圆角按钮行容器
  themedButtonRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  themedButtonSpacer: {
    width: SPACING.sm,
  },
});

/**
 * 主题化导航栏按钮组件
 * 有背景图时自动使用圆角半透明白色按钮，无背景图时使用普通样式
 */
export const ThemedHeaderButton: React.FC<{
  onPress: () => void;
  children: React.ReactNode;
  style?: any;
}> = ({onPress, children, style}) => {
  const theme = useTheme();
  const hasBackgroundImage = !!theme.headerBackgroundImage;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[hasBackgroundImage ? styles.themedButton : {padding: 4}, style]}
    >
      {children}
    </TouchableOpacity>
  );
};

// 导出样式常量，供外部屏幕使用
export const themedHeaderStyles = styles;

export default ThemeHeader;
