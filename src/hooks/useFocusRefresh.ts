import {useCallback, useEffect, useRef} from 'react';
import {AppState} from 'react-native';
import {useFocusEffect, useIsFocused} from '@react-navigation/native';

interface UseFocusRefreshOptions {
  /** 页面保持焦点时的静默刷新间隔。传 0 可关闭定时刷新。 */
  intervalMs: number;
  /** 是否启用刷新。 */
  enabled?: boolean;
  /** 是否跳过首次获得焦点。适用于组件自己负责首次加载的页面。 */
  skipFirstFocus?: boolean;
  /** App 从后台回到前台时，是否立即执行一次刷新检查。 */
  refreshOnAppResume?: boolean;
}

/**
 * 页面级静默刷新调度器。
 *
 * 焦点事件是主要触发点，定时器只是页面持续停留时的补充。这样即使用户
 * 频繁切换页面、每次都来不及等到定时器，也会在下一次获得焦点时重新检查。
 * Hook 自身只负责调度和去重，是否真正发请求由回调里的缓存新鲜度判断决定。
 */
export const useFocusRefresh = (
  callback: () => void | Promise<void>,
  options: UseFocusRefreshOptions,
): void => {
  const {
    intervalMs,
    enabled = true,
    skipFirstFocus = false,
    refreshOnAppResume = true,
  } = options;
  const callbackRef = useRef(callback);
  const runningRef = useRef(false);
  const hasFocusedRef = useRef(false);
  const isFocused = useIsFocused();

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const runRefresh = useCallback(() => {
    if (!enabled || !isFocused || AppState.currentState !== 'active' || runningRef.current) {
      return;
    }

    if (skipFirstFocus && !hasFocusedRef.current) {
      hasFocusedRef.current = true;
      return;
    }

    hasFocusedRef.current = true;
    runningRef.current = true;

    Promise.resolve()
      .then(() => callbackRef.current())
      .catch(error => {
        console.error('[FocusRefresh] 静默刷新失败:', error);
      })
      .finally(() => {
        runningRef.current = false;
      });
  }, [enabled, isFocused, skipFirstFocus]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        return undefined;
      }

      let disposed = false;
      const invoke = () => {
        if (!disposed) {
          runRefresh();
        }
      };

      invoke();
      const timer = intervalMs > 0 ? setInterval(invoke, intervalMs) : null;

      return () => {
        disposed = true;
        if (timer) {
          clearInterval(timer);
        }
      };
    }, [enabled, intervalMs, runRefresh]),
  );

  useEffect(() => {
    if (!enabled || !refreshOnAppResume) {
      return undefined;
    }

    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', nextState => {
      if (previousState !== 'active' && nextState === 'active' && isFocused) {
        runRefresh();
      }
      previousState = nextState;
    });

    return () => {
      subscription.remove();
    };
  }, [enabled, isFocused, refreshOnAppResume, runRefresh]);
};
