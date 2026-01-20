// 认证服务 - 管理登录状态和 Cookie
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildGetHeaders } from '../utils/requestUtils';

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
 * 存储 Cookie（合并新旧 cookie，保留 set_identity 等自定义 cookie）
 * @param newCookies 新的 Cookie
 * @param replace 是否完全替换（用于登出等场景）
 */
export const storeCookies = async (newCookies: string, replace: boolean = false): Promise<void> => {
  try {
    if (replace) {
      // 完全替换模式（用于登出等场景）
      await AsyncStorage.setItem(STORAGE_KEYS.COOKIES, newCookies);
      return;
    }
    
    // 合并模式：保留已有的 set_identity 等自定义 cookie
    const existingCookies = await AsyncStorage.getItem(STORAGE_KEYS.COOKIES) || '';
    
    // 从已有 cookies 中提取 set_identity（如果存在）
    const setIdentityMatch = existingCookies.match(/set_identity=([^;]+)/);
    const existingSetIdentity = setIdentityMatch ? setIdentityMatch[0] : null;
    
    // 解析新的 cookies，提取有效的 cookie 键值对
    const cookieParts: string[] = [];
    
    // 提取 kbs-info
    const kbsInfoMatch = newCookies.match(/kbs-info=([^;,\s]+)/);
    if (kbsInfoMatch) {
      cookieParts.push(`kbs-info=${kbsInfoMatch[1]}`);
    }
    
    // 提取 kbs-key
    const kbsKeyMatch = newCookies.match(/kbs-key=([^;,\s]+)/);
    if (kbsKeyMatch) {
      cookieParts.push(`kbs-key=${kbsKeyMatch[1]}`);
    }
    
    // 如果新 cookies 中没有 set_identity，但已有 cookies 中有，则保留
    const newSetIdentityMatch = newCookies.match(/set_identity=([^;]+)/);
    if (newSetIdentityMatch) {
      cookieParts.push(newSetIdentityMatch[0]);
    } else if (existingSetIdentity) {
      cookieParts.push(existingSetIdentity);
    }
    
    // 组合最终的 cookies
    const finalCookies = cookieParts.length > 0 ? cookieParts.join('; ') : newCookies;
    await AsyncStorage.setItem(STORAGE_KEYS.COOKIES, finalCookies);
  } catch (error) {
    console.error('Store cookies error:', error);
    throw error;
  }
};



