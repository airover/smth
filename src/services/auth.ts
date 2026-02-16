// 认证服务 - 管理登录状态和 Cookie
import AsyncStorage from '@react-native-async-storage/async-storage';
import CookieManager from '@react-native-cookies/cookies';
import { Platform } from 'react-native';

const STORAGE_KEYS = {
  IS_LOGGED_IN: 'isLoggedIn',
  USERNAME: 'username',
  COOKIES: 'cookies',
  M_SITE_COOKIES: 'mSiteCookies', // M站(m.newsmth.net)的独立cookie
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
    await AsyncStorage.removeItem(STORAGE_KEYS.M_SITE_COOKIES);
    // 兼容清除旧版本的 key
    await AsyncStorage.removeItem('mSiteCookiesExpiry');
    await AsyncStorage.removeItem('mSiteCookiesTimestamp');
    await AsyncStorage.removeItem('mSiteLoggedIn');
    // 退出主站时清除所有域名的系统 cookie jar（包括 wap 和 m 站）
    try {
      await CookieManager.clearAll();
      console.log('[Logout] 已清除所有系统 cookie jar');
    } catch (cookieError) {
      console.error('[Logout] 清除系统 cookie jar 失败:', cookieError);
    }
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

/**
 * 获取 M 站 Cookie
 * 从 AsyncStorage 读取手动存储的 cookie
 * 有效性通过被动探测（请求 M 站时检查响应中是否包含注销链接）来判断
 */
export const getMSiteCookies = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.M_SITE_COOKIES);
  } catch (error) {
    console.error('Get M site cookies error:', error);
    return null;
  }
};

/**
 * 检查 M 站响应 HTML 是否处于登录状态
 * 通过检测响应中是否包含注销链接 <a href="/user/logout" ...>注销(...)</a> 来判断
 * @param html M 站请求返回的 HTML 内容
 * @returns true 表示已登录，false 表示未登录或 Cookie 已过期
 */
export const isMSiteResponseLoggedIn = (html: string): boolean => {
  if (!html) return false;
  // 检查是否包含"您无权阅读此版面"提示，出现则说明Cookie已过期
  if (html.includes('您无权阅读此版面')) return false;
  // 检查是否包含注销链接，格式：<a href="/user/logout" accesskey="9">注销(username)</a>
  return html.includes('<a href="/user/logout"');
};

/**
 * 处理 M 站 Cookie 过期
 * 当被动探测发现 M 站响应中无登录态时调用，清除本地存储的过期 Cookie
 */
export const handleMSiteCookieExpired = async (): Promise<void> => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.M_SITE_COOKIES);
    if (stored) {
      console.log('[M站Cookie] 被动探测发现Cookie已过期，清除本地存储');
      await AsyncStorage.removeItem(STORAGE_KEYS.M_SITE_COOKIES);
    }
  } catch (error) {
    console.error('[M站Cookie] 清除过期Cookie失败:', error);
  }
};

/**
 * 通过 CookieManager 从系统 cookie jar 中提取并持久化 M 站 cookie
 * 在 fetch 登录成功后调用（因为 RN fetch 无法暴露 Set-Cookie header）
 */
export const extractAndStoreMSiteCookiesFromJar = async (): Promise<boolean> => {
  try {
    const cookies = await CookieManager.get('https://m.newsmth.net');
    if (!cookies || Object.keys(cookies).length === 0) {
      console.log('[CookieManager] 系统 cookie jar 中无 M 站 cookie');
      return false;
    }

    const cookieParts: string[] = [];
    for (const [name, cookie] of Object.entries(cookies) as [string, any][]) {
      cookieParts.push(`${name}=${cookie.value}`);
    }

    // 检查是否有 M 站登录相关的 cookie
    const hasLoginCookie = cookieParts.some(
      c => c.startsWith('main[UTMPUSERID]') || c.startsWith('main[UTMPKEY]')
    );

    if (hasLoginCookie) {
      const cookieStr = cookieParts.join('; ');
      await AsyncStorage.setItem(STORAGE_KEYS.M_SITE_COOKIES, cookieStr);

      console.log('[CookieManager] M 站 cookie 已从 cookie jar 提取并存储:', 
        cookieParts.map(c => c.split('=')[0]).join(', '));
      return true;
    } else {
      console.log('[CookieManager] cookie jar 中无 M 站登录 cookie, 找到的 cookie:', 
        Object.keys(cookies).join(', '));
      return false;
    }
  } catch (error) {
    console.error('[CookieManager] 提取 M 站 cookie 失败:', error);
    return false;
  }
};

/**
 * 清除系统 cookie jar 中的 M 站 cookie
 * 只清除 M 站特有的 cookie（main[UTMPUSERID]、main[UTMPKEY]、main[UTMPNUM]），
 * 不影响 wap 站/主站的 cookie（如 kbs-info、kbs-key、set_identity 等）
 * 
 * 注意：CookieManager.get('https://m.newsmth.net') 会因 .newsmth.net 域名通配
 * 返回所有子域名共享的 cookie，如果全部清除会导致主站登录态丢失
 */
// M 站特有的 cookie 名称前缀
const M_SITE_COOKIE_PREFIXES = ['main['];
export const clearMSiteCookieJar = async (): Promise<void> => {
  try {
    const M_SITE_URL = 'https://m.newsmth.net';
    // 获取 M 站所有 cookie（注意：可能包含 .newsmth.net 域上的共享 cookie）
    const cookies = await CookieManager.get(M_SITE_URL);
    if (!cookies || Object.keys(cookies).length === 0) {
      console.log('[CookieManager] M 站无 cookie 需要清除');
      return;
    }

    // 只清除 M 站特有的 cookie，跳过主站/wap 站共享的 cookie
    const clearedNames: string[] = [];
    const skippedNames: string[] = [];

    for (const [name, _cookie] of Object.entries(cookies) as [string, any][]) {
      // 检查是否是 M 站特有的 cookie
      const isMSiteCookie = M_SITE_COOKIE_PREFIXES.some(prefix => name.startsWith(prefix));
      if (!isMSiteCookie) {
        skippedNames.push(name);
        continue; // 跳过非 M 站 cookie，保护主站登录态
      }
      try {
        if (Platform.OS === 'ios') {
          // iOS: 使用 clearByName 彻底删除 cookie
          await CookieManager.clearByName(M_SITE_URL, name);
        } else {
          // Android: 没有 clearByName，用设置过期方式
          await CookieManager.set(M_SITE_URL, {
            name,
            value: '',
            domain: '.newsmth.net',
            path: '/',
            expires: new Date(0).toISOString(),
          });
        }
        clearedNames.push(name);
      } catch (_e) {
        // 单个 cookie 清除失败不影响整体
      }
    }

    // Android: 调用 flush 确保写入持久化
    if (Platform.OS === 'android') {
      try {
        await CookieManager.flush();
      } catch (_e) {
        // flush 失败不影响整体
      }
    }

    console.log('[CookieManager] 已彻底清除 M 站 cookie:', clearedNames.join(', '));
    if (skippedNames.length > 0) {
      console.log('[CookieManager] 跳过非 M 站 cookie（保护主站登录态）:', skippedNames.join(', '));
    }
  } catch (error) {
    console.error('[CookieManager] 清除 M 站 cookie 失败:', error);
  }
};

/**
 * 存储 M 站 Cookie
 * 从 Set-Cookie 响应头中解析出 main[UTMPUSERID]、main[UTMPKEY]、main[UTMPNUM] 等 cookie
 * @param setCookieHeader Set-Cookie 响应头的值（可能包含多个 cookie）
 */
export const storeMSiteCookies = async (setCookieHeader: string): Promise<void> => {
  try {
    if (!setCookieHeader) return;

    // 解析 Set-Cookie 中的关键 cookie
    const cookieParts: string[] = [];

    // 提取 main[UTMPUSERID]
    const utmpUserIdMatch = setCookieHeader.match(/main\[UTMPUSERID\]=([^;,\s]+)/);
    if (utmpUserIdMatch) {
      cookieParts.push(`main[UTMPUSERID]=${utmpUserIdMatch[1]}`);
    }

    // 提取 main[UTMPKEY]
    const utmpKeyMatch = setCookieHeader.match(/main\[UTMPKEY\]=([^;,\s]+)/);
    if (utmpKeyMatch) {
      cookieParts.push(`main[UTMPKEY]=${utmpKeyMatch[1]}`);
    }

    // 提取 main[UTMPNUM]
    const utmpNumMatch = setCookieHeader.match(/main\[UTMPNUM\]=([^;,\s]+)/);
    if (utmpNumMatch) {
      cookieParts.push(`main[UTMPNUM]=${utmpNumMatch[1]}`);
    }

    if (cookieParts.length > 0) {
      const mSiteCookies = cookieParts.join('; ');
      await AsyncStorage.setItem(STORAGE_KEYS.M_SITE_COOKIES, mSiteCookies);
      console.log('M站Cookie已保存:', cookieParts.map(c => c.split('=')[0]).join(', '));
    } else {
      console.log('M站登录响应中未找到有效Cookie');
    }
  } catch (error) {
    console.error('Store M site cookies error:', error);
  }
};
