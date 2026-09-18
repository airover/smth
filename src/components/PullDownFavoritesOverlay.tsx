/**
 * PullDownFavoritesOverlay - 下拉收藏入口指引
 *
 * v3: 去掉震动，简化视觉，清晰的两段式引导
 *
 * 视觉设计：
 * - 单一居中提示，随下拉距离渐显
 * - 两个阶段清晰区分：刷新区 / 收藏区
 * - 到达收藏区后图标和文字变色，无多余元素
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
} from 'react-native';
import {useRef, useState, useCallback} from 'react';
import {useTheme} from './ThemedComponents';
import {SPACING, FONT_SIZE} from '../utils/responsive';

// 手势区间
const REFRESH_THRESHOLD = 45;
const FAVORITES_THRESHOLD = 124;

export type PullDownState = 'idle' | 'pulling' | 'refresh-ready' | 'favorites-ready';

interface PullDownFavoritesOverlayProps {
  pullOffset: number;
  state: PullDownState;
}

/**
 * 下拉提示 UI - 极简风格
 */
export const PullDownFavoritesOverlay: React.FC<PullDownFavoritesOverlayProps> = ({
  pullOffset,
  state,
}) => {
  const theme = useTheme();

  if (pullOffset < 15) return null;

  const isFavReady = state === 'favorites-ready';
  const isRefreshReady = state === 'refresh-ready';

  // 整体透明度：15~50pt 区间渐显
  const opacity = Math.min(1, (pullOffset - 15) / 35);

  // 文案
  let text: string;
  if (isFavReady) {
    text = '⭐ 松手进入收藏';
  } else if (isRefreshReady) {
    text = '↑ 继续下拉进入收藏';
  } else {
    text = '↓ 下拉刷新';
  }

  // 颜色
  const textColor = isFavReady ? theme.primary : theme.secondaryText;

  return (
    <View style={[styles.container, {opacity}]}>
      <Text style={[styles.text, {color: textColor}]}>{text}</Text>
    </View>
  );
};

/**
 * Hook: 下拉手势状态管理
 * 只按松手时的下拉距离分段：
 * - 刷新区（45~110pt）→ 刷新
 * - 收藏区（≥111pt）→ 收藏
 *
 * 不使用 onScrollEndDrag 的 velocity 做二次判断。UIScrollView 在回弹边界
 * 附近的速度受采样时机影响很大，同一段手势可能被判成不同操作。
 */
export function usePullDownFavorites(
  onTriggerFavorites: () => void,
  onTriggerRefresh: () => void,
  enabled = true,
) {
  const [pullOffset, setPullOffset] = useState(0);
  const [state, setState] = useState<PullDownState>('idle');
  const isRefreshingRef = useRef(false);
  const pullOffsetRef = useRef(0);
  // iOS 的 RefreshControl 与自定义收藏手势共用同一个 UIScrollView。
  // 一旦本次手势进入收藏区，松手时原生控件仍可能派发 onRefresh，需消费掉它。
  const suppressNativeRefreshRef = useRef(false);

  const reset = useCallback(() => {
    setState('idle');
    setPullOffset(0);
    pullOffsetRef.current = 0;
  }, []);

  const onScrollBeginDrag = useCallback(() => {
    if (!enabled || isRefreshingRef.current) return;

    // 新手势开始后，上一轮收藏手势留下的“消费原生刷新”标记失效。
    suppressNativeRefreshRef.current = false;
    pullOffsetRef.current = 0;
    setState('idle');
    setPullOffset(0);
  }, [enabled]);

  const setRefreshing = useCallback((refreshing: boolean) => {
    isRefreshingRef.current = refreshing;
    if (!refreshing) {
      reset();
    }
  }, [reset]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!enabled || isRefreshingRef.current) return;

    const offsetY = event.nativeEvent.contentOffset.y;

    if (Platform.OS === 'ios' && offsetY < 0) {
      const amount = Math.abs(offsetY);
      setPullOffset(amount);
      pullOffsetRef.current = amount;

      if (amount >= FAVORITES_THRESHOLD) {
        setState('favorites-ready');
        suppressNativeRefreshRef.current = true;
      } else if (amount >= REFRESH_THRESHOLD) {
        setState('refresh-ready');
      } else if (amount > 15) {
        setState('pulling');
      } else {
        setState('idle');
      }
    } else {
      // 回弹时先隐藏提示，但不要清空 pullOffsetRef：onScrollEndDrag 可能
      // 紧接着到达，仍需依据用户刚刚松手的位置完成判定。
      if (pullOffsetRef.current > 0) {
        setState('idle');
        setPullOffset(0);
      }
    }
  }, [enabled]);

  const onScrollEndDrag = useCallback(() => {
    if (isRefreshingRef.current) return;

    const amount = pullOffsetRef.current;

    if (amount >= FAVORITES_THRESHOLD) {
      // 收藏手势优先于原生 RefreshControl；标记必须在回调前设置，
      // 因为打开抽屉会立即触发 HomeScreen 重渲染并重置视觉状态。
      suppressNativeRefreshRef.current = true;
      onTriggerFavorites();
      reset();
    } else if (amount >= REFRESH_THRESHOLD) {
      // 未进入收藏区的下拉统一触发刷新。
      onTriggerRefresh();
    } else {
      reset();
    }
  }, [onTriggerFavorites, onTriggerRefresh, reset]);

  const consumeNativeRefreshSuppression = useCallback(() => {
    if (!suppressNativeRefreshRef.current) return false;
    suppressNativeRefreshRef.current = false;
    return true;
  }, []);

  return {
    pullOffset,
    state,
    onScrollBeginDrag,
    onScroll,
    onScrollEndDrag,
    setRefreshing,
    consumeNativeRefreshSuppression,
    reset,
  };
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    alignItems: 'center',
    paddingTop: SPACING.xl,
    pointerEvents: 'none',
  },
  text: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
  },
});
