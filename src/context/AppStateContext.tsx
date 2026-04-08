import React, {createContext, useContext, useState, useEffect, useRef, useCallback} from 'react';
import {AppState, InteractionManager} from 'react-native';

interface AppStateContextType {
  /** 当前 App 是否处于前台活跃状态 */
  isAppActive: boolean;
  /** App 从后台切回前台的时间戳，可用于判断是否需要刷新 */
  lastResumeTime: number;
}

const AppStateContext = createContext<AppStateContextType>({
  isAppActive: true,
  lastResumeTime: 0,
});

/**
 * 全局 AppState 管理 Provider
 * 
 * 核心优化：当 App 从后台切回前台时，使用 InteractionManager.runAfterInteractions
 * 延迟通知子组件，确保 UI 动画和渲染先完成，避免切回前台时界面卡顿。
 */
export const AppStateProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [isAppActive, setIsAppActive] = useState(true);
  const [lastResumeTime, setLastResumeTime] = useState(0);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextAppState;

      if (
        prevState.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // 从后台切回前台：延迟通知子组件，确保 UI 先恢复
        console.log('[AppState] 从后台切回前台，等待 UI 恢复后通知子组件');
        InteractionManager.runAfterInteractions(() => {
          setIsAppActive(true);
          setLastResumeTime(Date.now());
          console.log('[AppState] UI 恢复完成，通知子组件刷新');
        });
      } else if (nextAppState.match(/inactive|background/)) {
        // 切到后台
        setIsAppActive(false);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <AppStateContext.Provider value={{isAppActive, lastResumeTime}}>
      {children}
    </AppStateContext.Provider>
  );
};

/**
 * 获取全局 AppState 状态
 */
export const useAppState = () => useContext(AppStateContext);

/**
 * 便捷 Hook：在 App 从后台切回前台时执行回调
 * 回调会在 InteractionManager.runAfterInteractions 之后执行，确保 UI 已恢复
 * 
 * @param callback 切回前台时执行的回调函数
 * @param deps 依赖数组
 */
export const useOnAppResume = (callback: () => void, deps: any[] = []) => {
  const {lastResumeTime} = useAppState();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // 跳过首次渲染，只在真正从后台切回时触发
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (lastResumeTime > 0) {
      callback();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResumeTime, ...deps]);
};
