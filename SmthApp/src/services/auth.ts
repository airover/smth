// 认证服务 - 管理登录状态和 Cookie
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  IS_LOGGED_IN: 'isLoggedIn',
  USERNAME: 'username',
  COOKIES: 'cookies',
};

/**
 * 检查是否已登录
 */
export const checkIsLoggedIn = async (): Promise<boolean> => {
  try {
    const isLoggedIn = await AsyncStorage.getItem(STORAGE_KEYS.IS_LOGGED_IN);
    const cookies = await AsyncStorage.getItem(STORAGE_KEYS.COOKIES);
    
    // 需要同时有登录标记和 Cookie
    return isLoggedIn === 'true' && cookies !== null && cookies.length > 0;
  } catch (error) {
    console.error('Check login status error:', error);
    return false;
  }
};

/**
 * 设置登录状态
 */
export const setLoggedIn = async (username: string, cookies: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.IS_LOGGED_IN, 'true');
    await AsyncStorage.setItem(STORAGE_KEYS.USERNAME, username);
    await AsyncStorage.setItem(STORAGE_KEYS.COOKIES, cookies);
  } catch (error) {
    console.error('Set logged in error:', error);
    throw error;
  }
};

/**
 * 登出
 */
export const logout = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.IS_LOGGED_IN);
    await AsyncStorage.removeItem(STORAGE_KEYS.USERNAME);
    await AsyncStorage.removeItem(STORAGE_KEYS.COOKIES);
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
};

/**
 * 获取当前用户名
 */
export const getCurrentUsername = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.USERNAME);
  } catch (error) {
    console.error('Get username error:', error);
    return null;
  }
};

/**
 * 获取 Cookie
 */
export const getCookies = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.COOKIES);
  } catch (error) {
    console.error('Get cookies error:', error);
    return null;
  }
};

/**
 * 验证 Cookie 是否有效（通过访问需要登录的页面）
 */
export const validateCookies = async (): Promise<boolean> => {
  try {
    const cookies = await getCookies();
    if (!cookies) {
      return false;
    }

    // 尝试访问用户页面验证 Cookie
    const response = await fetch('https://wap.newsmth.net/user', {
      method: 'GET',
      headers: {
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      },
    });

    const text = await response.text();
    // 检查是否包含登录相关的元素（需要根据实际页面调整）
    const isLoggedIn = !text.includes('登录') || text.includes('退出');
    
    if (!isLoggedIn) {
      // Cookie 无效，清除登录状态
      await logout();
    }
    
    return isLoggedIn;
  } catch (error) {
    console.error('Validate cookies error:', error);
    return false;
  }
};

