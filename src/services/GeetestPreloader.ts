/**
 * Geetest SDK Preloader Service
 * 在应用启动时预加载极验 SDK，避免首次打开验证码时因网络权限导致加载失败
 */

// SDK 缓存
let cachedSdkScript: string | null = null;
let isPreloading = false;
let preloadPromise: Promise<boolean> | null = null;

// 极验 SDK 地址
const GEETEST_SDK_URL = 'https://static.geetest.com/v4/gt4.js';

/**
 * 预加载极验 SDK
 * @returns Promise<boolean> 是否预加载成功
 */
export const preloadGeetestSdk = async (): Promise<boolean> => {
  // 如果已经缓存了，直接返回成功
  if (cachedSdkScript) {
    console.log('[GeetestPreloader] SDK already cached');
    return true;
  }

  // 如果正在加载中，返回现有的 promise
  if (isPreloading && preloadPromise) {
    console.log('[GeetestPreloader] Preload already in progress');
    return preloadPromise;
  }

  isPreloading = true;
  
  preloadPromise = new Promise<boolean>(async (resolve) => {
    try {
      console.log('[GeetestPreloader] Starting to preload Geetest SDK...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时
      
      const response = await fetch(GEETEST_SDK_URL, {
        method: 'GET',
        signal: controller.signal,
        cache: 'default',
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        cachedSdkScript = await response.text();
        console.log('[GeetestPreloader] SDK preloaded successfully, size:', cachedSdkScript.length);
        resolve(true);
      } else {
        console.log('[GeetestPreloader] SDK preload failed, status:', response.status);
        resolve(false);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[GeetestPreloader] SDK preload timeout');
      } else {
        console.log('[GeetestPreloader] SDK preload error:', error.message);
      }
      resolve(false);
    } finally {
      isPreloading = false;
    }
  });

  return preloadPromise;
};

/**
 * 获取缓存的 SDK 脚本
 * @returns 缓存的脚本内容，如果没有缓存则返回 null
 */
export const getCachedSdkScript = (): string | null => {
  return cachedSdkScript;
};

/**
 * 检查 SDK 是否已缓存
 */
export const isSdkCached = (): boolean => {
  return cachedSdkScript !== null;
};

/**
 * 清除缓存（用于调试或强制重新加载）
 */
export const clearSdkCache = (): void => {
  cachedSdkScript = null;
  preloadPromise = null;
  console.log('[GeetestPreloader] Cache cleared');
};

export default {
  preloadGeetestSdk,
  getCachedSdkScript,
  isSdkCached,
  clearSdkCache,
};
