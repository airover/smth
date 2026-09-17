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
const FAVORITES_THRESHOLD = 111;
// iOS UIScrollView 的 onScrollEndDrag velocity 单位是 points/second。
// 与 onScroll 中按时间差计算出的速度统一单位，避免把 1.1 误当成 points/second。
const FAST_VELOCITY = 1100;

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
 * 同时判断距离 + 速度：
 * - 快速下拉松手（高速）→ 刷新（无论距离）
 * - 慢速下拉超过阈值松手 → 收藏
 */
export function usePullDownFavorites(
  onTriggerFavorites: () => void,
  onTriggerRefresh: () => void,
  enabled = true,
) {
  const [pullOffset, setPullOffset] = useState(0);
  const [state, setState] = useState<PullDownState>('idle');
  const isRefreshingRef = useRef(false);
  const velocityRef = useRef(0);
  const pullOffsetRef = useRef(0);
  // 上一帧的 {offset, time} 采样，用于在 onScroll 里自己估算速度。
  const lastSampleRef = useRef<{offset: number; time: number} | null>(null);

  const reset = useCallback(() => {
    setState('idle');
    setPullOffset(0);
    pullOffsetRef.current = 0;
    velocityRef.current = 0;
    lastSampleRef.current = null;
  }, []);

  const setRefreshing = useCallback((refreshing: boolean) => {
    isRefreshingRef.current = refreshing;
    if (!refreshing) {
      reset();
    }
  }, [reset]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!enabled || isRefreshingRef.current) return;

    const offsetY = event.nativeEvent.contentOffset.y;
    const now = Date.now();

    // iOS 的 velocity 字段在 onScroll 事件里不可靠，用相邻两帧
    // contentOffset 的差值 / 时间差保留一个兜底速度；它与松手时的
    // event.nativeEvent.velocity.y 统一为 points/second。
    const lastSample = lastSampleRef.current;
    const vy = lastSample && now > lastSample.time
      ? ((offsetY - lastSample.offset) / (now - lastSample.time)) * 1000
      : 0;
    lastSampleRef.current = {offset: offsetY, time: now};
    velocityRef.current = vy;

    if (Platform.OS === 'ios' && offsetY < 0) {
      const amount = Math.abs(offsetY);
      setPullOffset(amount);
      pullOffsetRef.current = amount;

      // 达到收藏距离后保持 ready，避免某一帧速度变快导致状态又退回刷新区。
      // 是否是快速下拉，交给松手时的原生 velocity 最终判断。
      if (amount >= FAVORITES_THRESHOLD) {
        setState('favorites-ready');
      } else if (amount >= REFRESH_THRESHOLD) {
        setState('refresh-ready');
      } else if (amount > 15) {
        setState('pulling');
      } else {
        setState('idle');
      }
    } else {
      if (state !== 'idle') {
        reset();
      }
    }
  }, [enabled, state, reset]);

  const onScrollEndDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isRefreshingRef.current) return;

    // 原生 velocity 与上面的采样速度都已经统一为 points/second。
    const nativeVelocity = event.nativeEvent.velocity?.y;
    const vy = Math.abs(
      typeof nativeVelocity === 'number' ? nativeVelocity : velocityRef.current,
    );
    const amount = pullOffsetRef.current;

    if (amount >= FAVORITES_THRESHOLD && vy < FAST_VELOCITY) {
      // 慢速 + 超过距离 → 收藏
      onTriggerFavorites();
      reset();
    } else if (amount >= REFRESH_THRESHOLD) {
      // 快速下拉或处于刷新区 → 刷新
      onTriggerRefresh();
    } else {
      reset();
    }
  }, [onTriggerFavorites, onTriggerRefresh, reset]);

  const isTriggered = state === 'favorites-ready';

  return {
    pullOffset,
    state,
    onScroll,
    onScrollEndDrag,
    setRefreshing,
    isTriggered,
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
