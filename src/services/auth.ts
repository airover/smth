// 认证服务 - 管理登录状态和 Cookie
import AsyncStorage from '@react-native-async-storage/async-storage';
import CookieManager from '@react-native-cookies/cookies';
import { Platform } from 'react-native';
import {activateAccountCache} from './accountCache';
import {buildPostHeaders, fetchWithRetry} from '../utils/requestUtils';

const STORAGE_KEYS = {
  IS_LOGGED_IN: 'isLoggedIn',
  USERNAME: 'username',
  COOKIES: 'cookies',
  M_SITE_COOKIES: 'mSiteCookies', // 旧版全局 key，仅用于迁移
  M_SITE_ENABLED: 'mSiteEnabled', // 旧版全局 key，仅用于迁移
};

const mSiteKey = (username: string, kind: 'cookies' | 'enabled' | 'action'): string =>
  `@m_site_v2:${encodeURIComponent(username.trim().toLowerCase())}:${kind}`;
const sameMSiteAccount = (left: string | null | undefined, right: string | null | undefined): boolean =>
  !!left && !!right && left.trim().toLowerCase() === right.trim().toLowerCase();
let mSiteEpoch = 0;
let mSiteLoginController: AbortController | null = null;
let mSiteLoginPending: Promise<unknown> | null = null;
const legacyMigrationAttempted = new Set<string>();
const legacyMigrationPending = new Map<string, Promise<void>>();

export type MSiteLoginContext = {username: string; epoch: number};

const currentMSiteUsername = async (): Promise<string | null> => {
  const entries = await AsyncStorage.multiGet([STORAGE_KEYS.USERNAME, STORAGE_KEYS.IS_LOGGED_IN, STORAGE_KEYS.COOKIES]);
  return entries[1][1] === 'true' && entries[2][1] ? entries[0][1]?.trim() || null : null;
};

export const isMSiteLoginCurrent = (context: MSiteLoginContext): boolean =>
  context.epoch === mSiteEpoch;

export const invalidateMSiteLogin = (): void => {
  mSiteEpoch += 1;
  mSiteLoginController?.abort();
  resetMSiteBackoff();
};

export const getMSiteLoginContext = async (username: string): Promise<MSiteLoginContext | null> => {
  const epoch = mSiteEpoch;
  const current = await currentMSiteUsername();
  return epoch === mSiteEpoch && sameMSiteAccount(current, username)
    ? {username: current!, epoch} : null;
};

/** 新登录先等旧请求结束；旧请求的 finally 会清理原生 Cookie jar。 */
export const beginMSiteLogin = async (username: string): Promise<{context: MSiteLoginContext; controller: AbortController} | null> => {
  const previous = mSiteLoginPending;
  if (previous) await previous.catch(() => undefined);
  const context = await getMSiteLoginContext(username);
  if (!context) return null;
  await clearMSiteCookieJar();
  if (!isMSiteLoginCurrent(context)) return null;
  const controller = new AbortController();
  mSiteLoginController = controller;
  return {context, controller};
};

export const trackMSiteLogin = (promise: Promise<unknown>): void => {
  mSiteLoginPending = promise;
};

export const finishMSiteLogin = async (context: MSiteLoginContext, promise: Promise<unknown>): Promise<void> => {
  if (!isMSiteLoginCurrent(context)) await clearMSiteCookieJar();
  if (mSiteLoginPending === promise) mSiteLoginPending = null;
  mSiteLoginController = null;
};

export const getMSiteActionRequired = async (): Promise<boolean> => {
  const username = await currentMSiteUsername();
  return !!username && (await AsyncStorage.getItem(mSiteKey(username, 'action'))) === 'true';
};

export const setMSiteActionRequired = async (required: boolean, username?: string): Promise<void> => {
  const owner = username || await currentMSiteUsername();
  if (!owner) return;
  if (required) await AsyncStorage.setItem(mSiteKey(owner, 'action'), 'true');
  else await AsyncStorage.removeItem(mSiteKey(owner, 'action'));
};

export const removeMSiteAccountData = async (username: string): Promise<void> => {
  await AsyncStorage.multiRemove([
    mSiteKey(username, 'cookies'), mSiteKey(username, 'enabled'), mSiteKey(username, 'action'),
  ]);
};

let accountNameRecovery: Promise<string | null> | null = null;

/** WebView 的 document.cookie 可能看不到 HttpOnly 认证 Cookie。 */
export const getWapAuthCookiesFromJar = async (): Promise<string | null> => {
  try {
    const jar = await CookieManager.get('https://wap.newsmth.net');
    const info = jar['kbs-info']?.value;
    const key = jar['kbs-key']?.value;
    return info && key ? `kbs-info=${info}; kbs-key=${key}` : null;
  } catch (error) {
    console.error('[Auth] 读取主站 Cookie jar 失败:', error);
    return null;
  }
};

/** 仅向服务端确认当前 Cookie 对应的用户名，不修改本地登录状态。 */
export const fetchAuthenticatedUsername = async (cookies?: string): Promise<string | null> => {
  const credential = cookies || await AsyncStorage.getItem(STORAGE_KEYS.COOKIES);
  if (!credential) return null;
  try {
    const response = await fetchWithRetry('https://wap.newsmth.net/wap/api/profile', {
      method: 'POST',
      headers: buildPostHeaders(credential, 'application/x-www-form-urlencoded'),
      credentials: 'include',
    }, 10000, 0);
    const json = await response.json();
    return json.code === 1 && (json.kbsCode === 0 || json.kbsCode === undefined)
      ? json.data?.account?.name?.trim() || null : null;
  } catch (error) {
    console.error('[Auth] 确认账号身份失败:', error);
    return null;
  }
};

/** Cookie 有效而用户名缺失时，使用服务端资料恢复账号身份。 */
export const recoverAuthenticatedUsername = async (): Promise<string | null> => {
  if (accountNameRecovery) return accountNameRecovery;
  const pending = (async () => {
    const state = await AsyncStorage.multiGet([STORAGE_KEYS.COOKIES, STORAGE_KEYS.USERNAME, STORAGE_KEYS.IS_LOGGED_IN]);
    const cookies = state[0][1];
    if (!cookies || state[1][1] || state[2][1] !== 'true') return null;
    try {
      const name = await fetchAuthenticatedUsername(cookies);
      if (!name) return null;
      // 请求期间若发生登出或换账号，不得把旧 Cookie 对应身份写回来。
      const current = await AsyncStorage.multiGet([STORAGE_KEYS.COOKIES, STORAGE_KEYS.USERNAME, STORAGE_KEYS.IS_LOGGED_IN]);
      if (current[0][1] !== cookies || current[1][1] || current[2][1] !== 'true') return null;
      await AsyncStorage.setItem(STORAGE_KEYS.USERNAME, name);
      activateAccountCache(name);
      return name;
    } catch (error) {
      console.error('[Auth] 恢复账号身份失败:', error);
      return null;
    }
  })().finally(() => {
    if (accountNameRecovery === pending) accountNameRecovery = null;
  });
  accountNameRecovery = pending;
  return pending;
};

/**
 * 检查是否已登录
 */
export const checkIsLoggedIn = async (): Promise<boolean> => {
  try {
    const isLoggedIn = await AsyncStorage.getItem(STORAGE_KEYS.IS_LOGGED_IN);
    const cookies = await AsyncStorage.getItem(STORAGE_KEYS.COOKIES);
    if (isLoggedIn !== 'true' || !cookies) return false;
    const username = (await AsyncStorage.getItem(STORAGE_KEYS.USERNAME))?.trim();
    if (username) {
      activateAccountCache(username);
    } else {
      // 本地 Cookie 可让用户立即进入；身份恢复在后台进行，不阻塞启动。
      void recoverAuthenticatedUsername();
    }
    return true;
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
    if (!username.trim() || !cookies) throw new Error('MISSING_ACCOUNT_IDENTITY');
    const authCookies = cookies.split(';').map(part => part.trim())
      .filter(part => /^kbs-(info|key)=/.test(part));
    if (!authCookies.some(part => part.startsWith('kbs-info='))
      || !authCookies.some(part => part.startsWith('kbs-key='))) {
      throw new Error('MISSING_AUTH_COOKIES');
    }
    const previous = await currentMSiteUsername();
    if (!sameMSiteAccount(previous, username)) {
      invalidateMSiteLogin();
      await clearMSiteCookieJar();
    }
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.USERNAME, username.trim()],
      [STORAGE_KEYS.COOKIES, authCookies.join('; ')],
      [STORAGE_KEYS.IS_LOGGED_IN, 'true'],
    ]);
    activateAccountCache(username);
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
    invalidateMSiteLogin();
    await handleMSiteCookieExpired();
    await AsyncStorage.removeItem(STORAGE_KEYS.IS_LOGGED_IN);
    await AsyncStorage.removeItem(STORAGE_KEYS.USERNAME);
    await AsyncStorage.removeItem(STORAGE_KEYS.COOKIES);
    activateAccountCache(null);
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
export const storeCookies = async (newCookies: string, replace: boolean = false, preserveSetIdentity: boolean = true): Promise<void> => {
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
    } else if (preserveSetIdentity && existingSetIdentity) {
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

// ==================== M 站账号状态 ====================

const migrateLegacyMSiteState = async (username: string): Promise<void> => {
  const identity = username.toLowerCase();
  const pending = legacyMigrationPending.get(identity);
  if (pending) return pending;
  if (legacyMigrationAttempted.has(identity)) return;
  legacyMigrationAttempted.add(identity);
  const migration = (async () => {
    const existing = await AsyncStorage.multiGet([mSiteKey(username, 'cookies'), mSiteKey(username, 'enabled')]);
    if (existing.some(([, value]) => value !== null)) return;
    const [legacyCookies, legacyEnabled] = await AsyncStorage.multiGet([
      STORAGE_KEYS.M_SITE_COOKIES, STORAGE_KEYS.M_SITE_ENABLED,
    ]).then(entries => entries.map(entry => entry[1]));
    if (!legacyCookies || !isValidMSiteCookies(legacyCookies)) return;
    const epoch = mSiteEpoch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch('https://m.newsmth.net/favor', {
        headers: {'Cookie': legacyCookies}, credentials: 'omit', signal: controller.signal,
      } as any);
      if (!response.ok) return;
      const html = await response.text();
      if (epoch !== mSiteEpoch || !sameMSiteAccount(await currentMSiteUsername(), username)
        || getMSiteResponseStatus(html, username) !== 'matched') return;
      await AsyncStorage.setItem(mSiteKey(username, 'cookies'), legacyCookies);
      if (legacyEnabled === 'true' && await AsyncStorage.getItem(mSiteKey(username, 'enabled')) === null) {
        await AsyncStorage.setItem(mSiteKey(username, 'enabled'), 'true');
      }
      await AsyncStorage.multiRemove([STORAGE_KEYS.M_SITE_COOKIES, STORAGE_KEYS.M_SITE_ENABLED]);
    } catch (error) {
      console.log('[M站] 旧会话归属暂无法确认，保留待下次启动重试');
    } finally {
      clearTimeout(timer);
    }
  })();
  legacyMigrationPending.set(identity, migration);
  try {
    await migration;
  } finally {
    legacyMigrationPending.delete(identity);
  }
};

/**
 * 检查当前账号是否启用了 M 站登录
 * 用户在设置中开启 M 站登录开关时设为 true，关闭时设为 false
 * 心跳保活和静默登录会先检查此开关，避免用户关闭后仍自动登录
 */
export const isMSiteEnabled = async (): Promise<boolean> => {
  try {
    const username = await currentMSiteUsername();
    if (!username) return false;
    await migrateLegacyMSiteState(username);
    const enabled = await AsyncStorage.getItem(mSiteKey(username, 'enabled'));
    return enabled === 'true';
  } catch (error) {
    console.error('[M站开关] 读取失败:', error);
    return false;
  }
};

/**
 * 设置当前账号的 M 站登录功能开关
 * @param enabled true=启用, false=禁用
 */
export const setMSiteEnabled = async (enabled: boolean, expectedUsername?: string): Promise<void> => {
  try {
    if (!enabled) invalidateMSiteLogin();
    const username = await currentMSiteUsername();
    if (!username || (expectedUsername && !sameMSiteAccount(username, expectedUsername))) return;
    if (enabled) {
      await AsyncStorage.setItem(mSiteKey(username, 'enabled'), 'true');
      await setMSiteActionRequired(false, username);
    } else {
      await AsyncStorage.multiSet([[mSiteKey(username, 'enabled'), 'false']]);
      await AsyncStorage.removeItem(mSiteKey(username, 'action'));
    }
    console.log('[M站开关]', enabled ? '已启用' : '已禁用');
  } catch (error) {
    console.error('[M站开关] 设置失败:', error);
  }
};

/**
 * 获取 M 站 Cookie
 * 从当前账号的 AsyncStorage 命名空间读取 cookie
 * 有效性通过被动探测（请求 M 站时检查响应中是否包含注销链接）来判断
 */
export const getMSiteCookies = async (): Promise<string | null> => {
  try {
    const username = await currentMSiteUsername();
    if (!username) return null;
    await migrateLegacyMSiteState(username);
    const key = mSiteKey(username, 'cookies');
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return null;
    if (isValidMSiteCookies(stored)) return stored;
    // 兼容已保存的 guest/deleted 等无效旧值。
    if (await AsyncStorage.getItem(key) === stored) {
      await AsyncStorage.removeItem(key);
    }
    return null;
  } catch (error) {
    console.error('Get M site cookies error:', error);
    return null;
  }
};

/**
 * 检查 M 站响应 HTML 是否处于登录状态
 * 通过检测响应中是否包含注销链接 <a href="/user/logout" ...>注销(...)</a> 来判断
 * @param html M 站请求返回的 HTML 内容
 * @returns 仅账号匹配时为 true
 */
export const getMSiteResponseStatus = (html: string, expectedUsername: string):
  'matched' | 'mismatch' | 'anonymous' | 'unknown' => {
  if (!html) return 'unknown';
  if (html.includes('您无权阅读此版面')) return 'anonymous';
  const link = html.match(/<a\b[^>]*href\s*=\s*["'][^"']*\/user\/logout(?:[?/#][^"']*)?["'][^>]*>([\s\S]*?)<\/a>/i);
  if (!link) return /id=["']loginForm["']|\/user\/login/.test(html) ? 'anonymous' : 'unknown';
  const label = link[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim();
  const name = label.match(/注销\s*[（(]\s*([^（）()]+?)\s*[）)]/);
  if (!name) return 'unknown';
  return sameMSiteAccount(name[1], expectedUsername) ? 'matched' : 'mismatch';
};

export const isMSiteResponseLoggedIn = (html: string, expectedUsername?: string): boolean =>
  !!expectedUsername && getMSiteResponseStatus(html, expectedUsername) === 'matched';

const M_SITE_AUTH_NAMES = ['main[UTMPUSERID]', 'main[UTMPKEY]', 'main[UTMPNUM]'] as const;
const invalidMSiteValue = (value: string | undefined): boolean =>
  !value || value.toLowerCase() === 'deleted' || value.toLowerCase() === 'guest';

const isValidMSiteCookies = (cookies: string): boolean => {
  const values = new Map<string, string>();
  for (const part of cookies.split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0) values.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  return M_SITE_AUTH_NAMES.every(name => !invalidMSiteValue(values.get(name)));
};

/**
 * 处理 M 站 Cookie 过期
 * 当被动探测发现 M 站响应中无登录态时调用，清除本地存储的过期 Cookie
 */
export const handleMSiteCookieExpired = async (expectedCookies?: string | null): Promise<void> => {
  try {
    const username = await currentMSiteUsername();
    if (!username) return;
    const key = mSiteKey(username, 'cookies');
    const stored = await AsyncStorage.getItem(key);
    if (stored && (!expectedCookies || stored === expectedCookies)) {
      console.log('[M站Cookie] 被动探测发现Cookie已过期，清除本地存储');
      await AsyncStorage.removeItem(key);
    }
  } catch (error) {
    console.error('[M站Cookie] 清除过期Cookie失败:', error);
  }
};

/**
 * 通过 CookieManager 从系统 cookie jar 中提取并持久化 M 站 cookie
 * 在 fetch 登录成功后调用（因为 RN fetch 无法暴露 Set-Cookie header）
 */
export const extractAndStoreMSiteCookiesFromJar = async (context: MSiteLoginContext): Promise<boolean> => {
  try {
    if (!isMSiteLoginCurrent(context)) return false;
    const cookies = await CookieManager.get('https://m.newsmth.net');
    if (!cookies || Object.keys(cookies).length === 0) {
      console.log('[CookieManager] 系统 cookie jar 中无 M 站 cookie');
      return false;
    }

    const cookieStr = M_SITE_AUTH_NAMES.map(name => `${name}=${(cookies[name] as any)?.value || ''}`).join('; ');
    if (isValidMSiteCookies(cookieStr) && isMSiteLoginCurrent(context)) {
      const key = mSiteKey(context.username, 'cookies');
      await AsyncStorage.setItem(key, cookieStr);
      if (!isMSiteLoginCurrent(context)) {
        await AsyncStorage.removeItem(key);
        return false;
      }

      console.log('[CookieManager] M 站认证 cookie 已从 cookie jar 提取并存储');
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
export const storeMSiteCookies = async (setCookieHeader: string, context: MSiteLoginContext): Promise<boolean> => {
  try {
    if (!setCookieHeader || !isMSiteLoginCurrent(context)) return false;
    const values = new Map<string, string>();
    // Expires 中也有逗号；只在下一段确实是新 cookie 时切分。
    for (const entry of setCookieHeader.split(/,\s*(?=[^;,\s]+=)/)) {
      const match = entry.match(/^\s*(main\[(?:UTMPUSERID|UTMPKEY|UTMPNUM)\])=([^;,\s]*)/);
      if (!match) continue;
      const expires = entry.match(/(?:^|;)\s*expires=([^;]+)/i);
      const maxAge = entry.match(/(?:^|;)\s*max-age=([^;]+)/i);
      const expired = (expires && Number.isFinite(Date.parse(expires[1])) && Date.parse(expires[1]) <= Date.now())
        || (maxAge && Number(maxAge[1]) <= 0);
      values.set(match[1], expired ? '' : match[2]);
    }
    const mSiteCookies = M_SITE_AUTH_NAMES.map(name => `${name}=${values.get(name) || ''}`).join('; ');
    if (!isValidMSiteCookies(mSiteCookies)) {
      console.log('[M站登录] Set-Cookie 未提供有效认证 Cookie（可能是删除旧会话）');
      return false;
    }
    if (!isMSiteLoginCurrent(context)) return false;
    const key = mSiteKey(context.username, 'cookies');
    await AsyncStorage.setItem(key, mSiteCookies);
    if (!isMSiteLoginCurrent(context)) {
      await AsyncStorage.removeItem(key);
      return false;
    }
    console.log('[M站登录] 有效认证 Cookie 已保存');
    return true;
  } catch (error) {
    console.error('Store M site cookies error:', error);
    return false;
  }
};

// ==================== M 站心跳保活 ====================

const M_SITE_KEEPALIVE_INTERVAL = 1 * 60 * 1000; // 1分钟心跳间隔
const M_SITE_FIRST_HEARTBEAT_DELAY = 1 * 60 * 1000; // 首次心跳延迟1分钟
const M_SITE_BACKOFF_BASE = 1 * 60 * 1000; // 退避基数1分钟
const M_SITE_BACKOFF_MAX = 8 * 60 * 1000; // 最大退避8分钟
let mSiteKeepAliveTimer: ReturnType<typeof setInterval> | null = null;
let mSiteFirstHeartbeatTimer: ReturnType<typeof setTimeout> | null = null;
let mSiteConsecutiveFailures = 0; // 连续静默登录失败次数
let mSiteLastReLoginAttempt = 0; // 上次尝试静默登录的时间戳
let mSiteReLoginLock = false; // 防止并发重登录

/**
 * 检查是否在退避冷却期内
 * 连续失败后逐渐增大重试间隔，避免频繁骚扰极验服务
 */
const isInBackoffPeriod = (): boolean => {
  if (mSiteConsecutiveFailures === 0) return false;
  const backoffMs = Math.min(
    M_SITE_BACKOFF_BASE * Math.pow(2, mSiteConsecutiveFailures - 1),
    M_SITE_BACKOFF_MAX,
  );
  const elapsed = Date.now() - mSiteLastReLoginAttempt;
  if (elapsed < backoffMs) {
    console.log(`[M站心跳] 退避冷却中（${Math.round((backoffMs - elapsed) / 1000)}s 后再试，连续失败${mSiteConsecutiveFailures}次）`);
    return true;
  }
  return false;
};

/**
 * 重置退避状态（登录成功或用户手动操作后调用）
 */
export const resetMSiteBackoff = (): void => {
  mSiteConsecutiveFailures = 0;
  mSiteLastReLoginAttempt = 0;
};

/**
 * M 站心跳保活 - 定期请求 M 站页面以防止 session 过期
 * 仅在前台运行时有效，App 退到后台后定时器会被系统挂起
 */
const doMSiteKeepAlive = async (): Promise<void> => {
  try {
    // 先检查全局开关，用户关闭了 M 站登录则跳过一切操作
    const enabled = await isMSiteEnabled();
    if (!enabled) {
      console.log('[M站心跳] M 站登录未启用，跳过心跳');
      return;
    }

    const username = await currentMSiteUsername();
    if (!username) return;
    const context = await getMSiteLoginContext(username);
    if (!context) return;
    const cookies = await getMSiteCookies();
    if (!cookies) {
      // 没有 M 站 cookie（可能被被动探测清除），尝试静默登录恢复
      console.log('[M站心跳] 无 M 站 Cookie，尝试静默自动登录...');
      await silentMSiteReLogin();
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('https://m.newsmth.net/favor', {
      method: 'GET',
      headers: {
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': 'https://m.newsmth.net/favor',
      },
      credentials: 'include',
      signal: controller.signal,
    } as any);

    clearTimeout(timeoutId);
    if (!response.ok) return;
    const html = await response.text();
    
    if (!isMSiteLoginCurrent(context)) return;
    const status = getMSiteResponseStatus(html, username);
    if (status === 'matched') {
      await setMSiteActionRequired(false, username);
      // session 有效，重置退避计数
      if (mSiteConsecutiveFailures > 0) {
        console.log('[M站心跳] ✅ session 恢复有效，重置退避计数');
        resetMSiteBackoff();
      }
    } else if (status === 'anonymous' || status === 'mismatch') {
      console.log('[M站心跳] ⚠️ session 已过期，尝试静默自动登录...');
      await handleMSiteCookieExpired(cookies);
      await silentMSiteReLogin();
    } else {
      console.log('[M站心跳] 无法确认响应账号，保留 Cookie，下次再检查');
    }
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      console.log('[M站心跳] 请求超时，跳过');
    } else {
      // 网络错误不处理，下次心跳再试
      console.log('[M站心跳] 请求失败（可能网络问题），跳过:', error?.message || error);
    }
  }
};

/**
 * 静默自动重新登录 M 站
 * 1. 通过隐藏 WebView 静默完成极验无感验证，获取验证码参数
 * 2. 带验证码参数调用 loginMSite（和手动登录完全一致）
 * 3. 如果极验判定需要人机交互（滑块等），超时后静默放弃，不打扰用户
 * 
 * 特性：
 * - 指数退避：连续失败后间隔 1min → 2min → 4min → 8min(max)
 * - 防并发锁：同一时间只允许一个静默登录流程
 * - 静默放弃：任何失败都不弹窗不通知用户
 */
const silentMSiteReLogin = async (): Promise<void> => {
  // 防并发：如果已有一个登录流程在进行中，直接返回
  if (mSiteReLoginLock) {
    console.log('[M站静默登录] 已有登录流程进行中，跳过');
    return;
  }

  // 退避检查
  if (isInBackoffPeriod()) {
    return;
  }

  mSiteReLoginLock = true;
  mSiteLastReLoginAttempt = Date.now();

  try {
    // 延迟导入避免循环依赖（auth.ts ↔ api.ts）
    const { loginMSite } = require('./api');
    const { getSavedCredentials } = require('../utils/storage');
    const { requestSilentCaptcha } = require('./silentCaptchaEvent');

    const credentials = await getSavedCredentials();
    if (!credentials.username || !credentials.password) {
      console.log('[M站静默登录] 无保存的凭据，放弃自动登录');
      const currentUsername = await currentMSiteUsername();
      if (currentUsername) await setMSiteActionRequired(true, currentUsername);
      return;
    }
    const currentUsername = await currentMSiteUsername();
    if (!currentUsername || !sameMSiteAccount(credentials.username, currentUsername)) {
      console.log('[M站静默登录] 保存的密码不属于当前账号，停止自动登录');
      if (currentUsername) await setMSiteActionRequired(true, currentUsername);
      return;
    }
    if (await getMSiteActionRequired()) return;
    const context = await getMSiteLoginContext(currentUsername);
    if (!context) return;

    // 第一步：通过隐藏 WebView 静默完成极验无感验证
    console.log('[M站静默登录] 请求静默极验验证...');
    const captchaResult = await requestSilentCaptcha(15000);
    if (!isMSiteLoginCurrent(context)) return;

    if (!captchaResult.success || !captchaResult.captchaParams) {
      // 极验需要人机交互或超时，记录失败并退避
      mSiteConsecutiveFailures++;
      console.log(`[M站静默登录] 极验验证未通过（连续第${mSiteConsecutiveFailures}次失败），静默放弃:`, captchaResult.error);
      return;
    }

    // 第二步：带验证码参数登录（和手动登录完全一致）
    console.log('[M站静默登录] 极验验证通过，带参数登录...');
    const result = await loginMSite(
      credentials.username,
      credentials.password,
      captchaResult.captchaParams,
    );

    if (result.success) {
      console.log('[M站静默登录] ✅ 自动登录成功');
      resetMSiteBackoff();
    } else {
      if (result.reason === 'credentials') {
        await setMSiteActionRequired(true, currentUsername);
        console.log('[M站静默登录] 凭据失效，等待用户手动处理');
        return;
      }
      mSiteConsecutiveFailures++;
      if (result.reason === 'unknown' && mSiteConsecutiveFailures >= 3) {
        await setMSiteActionRequired(true, currentUsername);
        console.log('[M站静默登录] 连续登录失败，等待用户手动处理');
        return;
      }
      console.log(`[M站静默登录] ❌ 登录失败（连续第${mSiteConsecutiveFailures}次），静默放弃:`, result.message);
    }
  } catch (error) {
    mSiteConsecutiveFailures++;
    console.log(`[M站静默登录] 异常（连续第${mSiteConsecutiveFailures}次失败），静默放弃:`, (error as any)?.message || error);
  } finally {
    mSiteReLoginLock = false;
  }
};

/**
 * 被动探测触发的静默重登录
 * 当 dataFetcher 请求 M 站时发现 Cookie 已过期，调用此函数尝试恢复
 * 和心跳触发的逻辑一致（含退避保护），不会重复触发
 */
export const triggerSilentMSiteReLogin = async (): Promise<void> => {
  // 先检查全局开关
  const enabled = await isMSiteEnabled();
  if (!enabled) return;
  if (await getMSiteActionRequired()) return;
  // 如果本地还有 cookie，说明只是回前台的常规检查，跳过重登录，等心跳自然验证
  const cookies = await getMSiteCookies();
  if (cookies) {
    console.log('[M站静默登录] 本地 Cookie 仍存在，跳过重登录，等待心跳验证');
    return;
  }
  await silentMSiteReLogin();
};

/**
 * 启动 M 站心跳保活定时器
 * 应在用户登录后调用，会自动检查是否有 M 站 Cookie
 * 首次心跳延迟3分钟执行（刚登录完无需立即检查）
 */
export const startMSiteKeepAlive = (): void => {
  // 避免重复启动
  if (mSiteKeepAliveTimer || mSiteFirstHeartbeatTimer) {
    console.log('[M站心跳] 定时器已存在，跳过重复启动');
    return;
  }

  console.log('[M站心跳] 启动心跳保活，首次延迟', M_SITE_FIRST_HEARTBEAT_DELAY / 1000, '秒，间隔:', M_SITE_KEEPALIVE_INTERVAL / 1000, '秒');
  
  // 首次延迟执行，之后按固定间隔
  mSiteFirstHeartbeatTimer = setTimeout(() => {
    mSiteFirstHeartbeatTimer = null;
    doMSiteKeepAlive();
    mSiteKeepAliveTimer = setInterval(doMSiteKeepAlive, M_SITE_KEEPALIVE_INTERVAL);
  }, M_SITE_FIRST_HEARTBEAT_DELAY);
};

/**
 * 停止 M 站心跳保活定时器
 * 应在用户登出或 App 销毁时调用
 */
export const stopMSiteKeepAlive = (): void => {
  if (mSiteFirstHeartbeatTimer) {
    clearTimeout(mSiteFirstHeartbeatTimer);
    mSiteFirstHeartbeatTimer = null;
  }
  if (mSiteKeepAliveTimer) {
    clearInterval(mSiteKeepAliveTimer);
    mSiteKeepAliveTimer = null;
    console.log('[M站心跳] 已停止心跳保活');
  }
  // 停止时重置退避状态
  resetMSiteBackoff();
  invalidateMSiteLogin();
};
