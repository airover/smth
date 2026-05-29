// 主题化的通用组件
import React, {useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  Animated,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSettings} from '../context/SettingsContext';
import {getTheme, getCardElevation, ThemeColors} from '../utils/theme';
import {SPACING, FONT_SIZE, BORDER_RADIUS, lineHeight} from '../utils/responsive';

// 导出 useTheme Hook，方便直接获取主题
export const useTheme = () => {
  const {settings} = useSettings();
  return getTheme(settings.themeMode);
};

// 主题化的 SafeAreaView
export const ThemedSafeAreaView: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}> = ({children, style}) => {
  const theme = useTheme();
  
  return (
    <SafeAreaView style={[{flex: 1, backgroundColor: theme.background}, style]}>
      {children}
    </SafeAreaView>
  );
};

// 主题化的 View
export const ThemedView: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  card?: boolean; // 是否是卡片样式
}> = ({children, style, card = false}) => {
  const theme = useTheme();
  
  const defaultStyle = card 
    ? {backgroundColor: theme.cardBackground}
    : {backgroundColor: theme.background};
  
  return (
    <View style={[defaultStyle, style]}>
      {children}
    </View>
  );
};

// 主题化的 Text
export const ThemedText: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  secondary?: boolean; // 是否是次要文字
  primary?: boolean; // 是否使用主色调
}> = ({children, style, secondary = false, primary = false}) => {
  const theme = useTheme();
  
  const defaultStyle = {
    color: primary ? theme.primary : (secondary ? theme.secondaryText : theme.text)
  };
  
  return (
    <Text style={[defaultStyle, style]}>
      {children}
    </Text>
  );
};

// 主题化的 ActivityIndicator
export const ThemedActivityIndicator: React.FC<{
  size?: 'small' | 'large';
  style?: StyleProp<ViewStyle>;
}> = ({size = 'large', style}) => {
  const theme = useTheme();
  
  return <ActivityIndicator size={size} color={theme.primary} style={style} />;
};

// 获取主题样式的 Hook
export const useThemedStyles = <T extends StyleSheet.NamedStyles<T>>(
  stylesFn: (theme: ThemeColors) => T
) => {
  const theme = useTheme();
  return stylesFn(theme);
};

// ==================== 骨架屏 ====================

// 单个骨架灰条（带 shimmer 呼吸动画）
const SkeletonBar: React.FC<{
  width: number | string;
  height: number;
  style?: StyleProp<ViewStyle>;
}> = ({width, height, style}) => {
  const theme = useTheme();
  const shimmer = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {toValue: 1, duration: 700, useNativeDriver: true}),
        Animated.timing(shimmer, {toValue: 0.5, duration: 700, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius: BORDER_RADIUS.sm,
          backgroundColor: theme.placeholderBackground,
          opacity: shimmer,
        },
        style,
      ]}
    />
  );
};

/**
 * 卡片骨架屏——用于替代初始加载时的居中 spinner，消除布局抖动。
 * @param lines 正文灰条行数
 * @param showAvatar 是否显示左侧圆形头像占位
 */
export const SkeletonCard: React.FC<{
  lines?: number;
  showAvatar?: boolean;
  style?: StyleProp<ViewStyle>;
}> = ({lines = 2, showAvatar = false, style}) => {
  const theme = useTheme();
  return (
    <View
      style={[
        skeletonStyles.card,
        {backgroundColor: theme.cardBackground},
        getCardElevation(theme),
        style,
      ]}
    >
      <View style={skeletonStyles.titleRow}>
        {showAvatar && (
          <SkeletonBar width={40} height={40} style={{borderRadius: 20, marginRight: SPACING.md}} />
        )}
        <View style={{flex: 1}}>
          <SkeletonBar width={'70%'} height={FONT_SIZE.lg} />
          <SkeletonBar width={'40%'} height={FONT_SIZE.sm} style={{marginTop: SPACING.sm}} />
        </View>
      </View>
      {Array.from({length: lines}).map((_, i) => (
        <SkeletonBar
          key={i}
          width={i === lines - 1 ? '60%' : '100%'}
          height={FONT_SIZE.md}
          style={{marginTop: SPACING.md}}
        />
      ))}
    </View>
  );
};

/** 渲染 N 个骨架卡片 */
export const SkeletonList: React.FC<{count?: number; lines?: number; showAvatar?: boolean}> = ({
  count = 6,
  lines = 2,
  showAvatar = false,
}) => (
  <View style={{padding: SPACING.lg}}>
    {Array.from({length: count}).map((_, i) => (
      <SkeletonCard key={i} lines={lines} showAvatar={showAvatar} style={{marginBottom: SPACING.lg}} />
    ))}
  </View>
);

// ==================== 空状态 ====================

/**
 * 统一的空状态——图标 + 文案 + 可选的主色 CTA 按钮，替代灰字死胡同。
 */
export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}> = ({icon, title, subtitle, actionLabel, onAction, style}) => {
  const theme = useTheme();
  return (
    <View style={[emptyStyles.container, style]}>
      {!!icon && (
        <View style={[emptyStyles.iconCircle, {backgroundColor: theme.placeholderBackground}]}>
          {icon}
        </View>
      )}
      <Text style={[emptyStyles.title, {color: theme.text}]}>{title}</Text>
      {!!subtitle && (
        <Text style={[emptyStyles.subtitle, {color: theme.secondaryText}]}>{subtitle}</Text>
      )}
      {!!actionLabel && !!onAction && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onAction}
          style={[emptyStyles.cta, {backgroundColor: theme.primary}]}
        >
          <Text style={emptyStyles.ctaText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ==================== 列表底部加载/到底提示 ====================

export const ListFooterLoading: React.FC<{
  loading: boolean;
  hasMore: boolean;
  emptyHint?: string;
}> = ({loading, hasMore, emptyHint = '没有更多了'}) => {
  const theme = useTheme();
  if (loading) {
    return (
      <View style={footerStyles.container}>
        <ActivityIndicator size="small" color={theme.primary} />
        <Text style={[footerStyles.text, {color: theme.secondaryText}]}>加载中...</Text>
      </View>
    );
  }
  if (!hasMore) {
    return (
      <View style={footerStyles.container}>
        <Text style={[footerStyles.text, {color: theme.secondaryText}]}>{emptyHint}</Text>
      </View>
    );
  }
  return null;
};

const skeletonStyles = StyleSheet.create({
  card: {
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

const emptyStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxl,
    paddingHorizontal: SPACING.xl,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    lineHeight: lineHeight(FONT_SIZE.md),
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  cta: {
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
  },
  ctaText: {
    color: '#fff',
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
});

const footerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.sm,
  },
  text: {
    fontSize: FONT_SIZE.sm,
  },
});
