// API 服务
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'https://wap.newsmth.net';
const WAP_BASE_URL = 'https://wap.newsmth.net';

// 默认超时时间（毫秒）
const DEFAULT_TIMEOUT = 10000; // 10秒
const LOGIN_TIMEOUT = 15000; // 登录接口15秒
const SEARCH_TIMEOUT = 20000; // 搜索接口20秒

// 搜索相关常量
const DEFAULT_PAGE = 1; // 默认页码
const DEFAULT_PAGE_SIZE = 20; // 默认每页数量
const DEFAULT_SEARCH_STATUS = 0; // 默认搜索状态

// 带超时的 fetch 函数
const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeout: number = DEFAULT_TIMEOUT
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('请求超时');
    }
    throw error;
  }
};

// 存储 Cookie
const storeCookies = async (cookies: string) => {
  await AsyncStorage.setItem('cookies', cookies);
};

// 获取 Cookie
const getCookies = async (): Promise<string | null> => {
  return await AsyncStorage.getItem('cookies');
};

// 通用请求函数
const request = async (
  url: string,
  options: RequestInit = {},
): Promise<Response> => {
  const cookies = await getCookies();
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    ...options.headers,
    ...(cookies ? {Cookie: cookies} : {}),
  };

  const response = await fetchWithTimeout(`${BASE_URL}${url}`, {
    ...options,
    headers,
  });

  // 保存 Cookie
  const setCookieHeader = response.headers.get('Set-Cookie');
  if (setCookieHeader) {
    await storeCookies(setCookieHeader);
  }

  return response;
};

// 登录（使用WebView方式，这里保留作为备用）
// 注意：服务器返回 JSON 格式：{code: 1, data: {account: {...}, url: "/"}, message: "操作成功"}
export const login = async (
  username: string,
  password: string,
  captcha?: string,
  captchaParams?: {
    captcha_id?: string;
    lot_number?: string;
    captcha_output?: string;
    pass_token?: string;
    gen_time?: string;
  }
): Promise<{success: boolean; message?: string; data?: any}> => {
  try {
    const formData = new URLSearchParams();
    // 使用正确的参数名
    formData.append('username', username);
    formData.append('password', password);
    
    // 添加极验验证码参数
    if (captchaParams) {
      if (captchaParams.captcha_id) formData.append('captcha_id', captchaParams.captcha_id);
      if (captchaParams.lot_number) formData.append('lot_number', captchaParams.lot_number);
      if (captchaParams.captcha_output) formData.append('captcha_output', captchaParams.captcha_output);
      if (captchaParams.pass_token) formData.append('pass_token', captchaParams.pass_token);
      if (captchaParams.gen_time) formData.append('gen_time', captchaParams.gen_time);
      formData.append('type', '2');
      formData.append('client', 'wap');
    }
    
    // 传统验证码
    if (captcha) {
      formData.append('captcha', captcha);
    }
    
    // 添加时间戳
    formData.append('t', Date.now().toString());

    // 补全 Header，完全模拟浏览器抓包
    const cookies = await getCookies();
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'Authorization': 'Basic Og==', // 关键验证头
      'Origin': BASE_URL,
      'Referer': BASE_URL + '/login',
    };
    
    if (cookies) {
      headers.Cookie = cookies;
    }
    
    // 根据抓包数据，使用正确的正式登录接口
    const loginUrl = BASE_URL + '/wap/authorize/sign-in';
    console.log('发送登录请求到:', loginUrl);
    
    const response = await fetchWithTimeout(loginUrl, {
      method: 'POST',
      headers,
      body: formData.toString(),
      credentials: 'include',
    }, LOGIN_TIMEOUT);

    console.log('登录响应状态:', response.status);
    console.log('登录响应 Content-Type:', response.headers.get('content-type'));
    
    // 获取响应文本
    const responseText = await response.text();
    console.log('登录响应长度:', responseText.length);
    console.log('登录响应预览:', responseText.substring(0, 200));
    
    // 检查是否是 JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      // 解析 JSON
      const json = JSON.parse(responseText);
      console.log('login API response:', json);
      
      // 保存 Cookie
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        await storeCookies(setCookie);
      }
      
      // 检查响应格式: { code: 1, data: { account: {...}, url: "/" }, message: "操作成功" }
      if (json.code === 1) {
        // 登录成功
        const accountName = json.data?.account?.name || username;
        await AsyncStorage.setItem('username', accountName);
        await AsyncStorage.setItem('isLoggedIn', 'true');
        
        return {
          success: true,
          message: json.message,
          data: json.data
        };
      } else {
        // 登录失败
        return {
          success: false,
          message: json.message || '登录失败'
        };
      }
    } else {
      // 返回的是 HTML，不是 JSON
      console.error('服务器返回 HTML 而不是 JSON');
      return {
        success: false,
        message: '登录接口返回格式错误，请稍后重试'
      };
    }
  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '网络请求失败'
    };
  }
};

// 获取验证码图片
export const getCaptchaImage = async (): Promise<string | null> => {
  try {
    const timestamp = new Date().getTime();
    const captchaUrl = `https://wap.newsmth.net/bbsimg/captcha.png?t=${timestamp}`;
    return captchaUrl;
  } catch (error) {
    console.error('Get captcha image error:', error);
    return null;
  }
};

// 重新导出数据获取函数（使用新的实现）
export {getTopTen, getHotPosts, getHotBoards, getBoards, getSubBoards, getBoardPosts, getPostDetail, getTopicReplies, getFavoriteBoards, getMessages, getConversationMessages, fetchUserInfo} from './dataFetcher';

// 获取收藏版面（已移至 dataFetcher，此处保留类型定义兼容性，如果需要的话可以删除）
// export const getFavoriteBoards = async (): Promise<any[]> => { ... };

// 保存收藏版面（暂不支持在线保存，此处仅作占位）
export const saveFavoriteBoard = async (_board: any) => {
  console.log('Save favorite board not implemented for online API yet');
};

// getBoardPosts 和 getPostDetail 已从 dataFetcher 导出

// 获取信箱
export const getMails = async (): Promise<any[]> => {
  try {
    const response = await request('/nForum/mail');
    await response.text();
    // TODO: 解析HTML获取信箱
    return [];
  } catch (error) {
    console.error('Get mails error:', error);
    return [];
  }
};

// 用户信息缓存（内存缓存）
let userInfoCache: {data: any; timestamp: number} | null = null;
const USER_INFO_CACHE_DURATION = 60 * 1000; // 1分钟缓存

// 用户信息持久化存储的key
const USER_INFO_STORAGE_KEY = 'userInfo';
const USER_INFO_TIMESTAMP_KEY = 'userInfoTimestamp';

// 从服务器获取用户信息（内部函数）
const fetchUserInfoFromServer = async (): Promise<any> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      console.log('getUserInfo: No cookies found');
      return null;
    }
    
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic Og==',
      'Cookie': cookies,
    };
    
    const response = await fetchWithTimeout(`${WAP_BASE_URL}/wap/api/profile`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });
    
    const json = await response.json();
    console.log('getUserInfo API response:', JSON.stringify(json).substring(0, 200));
    
    // 检查响应格式: {code: 1, data: {account: {...}, title: "..."}}
    if (json.code === 1 && json.data?.account) {
      const account = json.data.account;
      const data = json.data;
      
      // 调试：打印头像相关字段
      console.log('Avatar fields:', {
        avatarUrl: account.avatarUrl,
        avatar: account.avatar,
        ks3Url: account.ks3Url,
        k3sUrl: account.k3sUrl,
      });
      
      // 优先使用 k3sUrl/ks3Url（云存储），其次使用 avatarUrl，最后使用 avatar 字段
      let avatar = account.k3sUrl || account.ks3Url || account.avatarUrl || '';
      
      // 如果上述字段都没有，尝试使用 avatar 字段
      if (!avatar && account.avatar) {
        // avatar 字段通常是相对路径，需要拼接完整URL
        if (account.avatar.startsWith('http')) {
          avatar = account.avatar;
        } else {
          avatar = `https://file.mysmth.net/${account.avatar}`;
        }
      }
      
      if (avatar && avatar.startsWith('http:')) {
        avatar = avatar.replace('http:', 'https:');
      }
      
      console.log('Final avatar URL:', avatar);
      
      const userInfo = {
        id: account.id,
        username: account.name,
        nickname: account.nick,
        avatar: avatar,
        level: account.level,
        levelTitle: account.levelTitle,
        title: data.title, // 用户头衔
        score: account.score,
        gender: account.gender,
        postCount: account.articleCount,
        friendCount: account.friendCount,
        fansCount: account.fansCount,
        birthday: account.birthday,
        email: account.email,
        mobile: account.mobile,
        signature: account.signature,
        city: account.city,
        loginTime: account.loginTime, // 最后登录时间戳
        createTime: account.createTime, // 注册时间戳
        isLoggedIn: true,
      };
      
      // 保存用户名到本地存储
      if (account.name) {
        await AsyncStorage.setItem('username', account.name);
      }
      
      const now = Date.now();
      
      // 更新内存缓存
      userInfoCache = {
        data: userInfo,
        timestamp: now,
      };
      
      // 持久化用户信息到AsyncStorage
      try {
        await AsyncStorage.setItem(USER_INFO_STORAGE_KEY, JSON.stringify(userInfo));
        await AsyncStorage.setItem(USER_INFO_TIMESTAMP_KEY, now.toString());
        console.log('用户信息已持久化到本地存储');
      } catch (error) {
        console.error('持久化用户信息失败:', error);
      }
      
      return userInfo;
    }
    
    // API 返回失败，尝试从本地存储获取
    console.log('getUserInfo: API returned failure, code:', json.code);
    const storedUsername = await AsyncStorage.getItem('username');
    if (storedUsername) {
      return {
        username: storedUsername,
        // 不返回 isLoggedIn 字段，让调用方保持本地状态
      };
    }
    
    return null;
  } catch (error) {
    console.error('Get user info error:', error);
    // 出错时尝试从本地存储获取
    const storedUsername = await AsyncStorage.getItem('username');
    if (storedUsername) {
      return {
        username: storedUsername,
        // 不返回 isLoggedIn 字段，让调用方保持本地状态
      };
    }
    return null;
  }
};

// 从 wap API 获取用户信息（带持久化缓存）
// API: POST https://wap.newsmth.net/wap/api/profile
// 响应: {code: 1, data: {account: {name, nick, avatar, ...}}}
// 缓存策略：
// 1. 优先使用内存缓存（1分钟有效期）
// 2. 内存缓存失效时，使用持久化缓存（AsyncStorage）
// 3. 持久化缓存过期时，异步更新
// 4. 无任何缓存时，同步获取
export const getUserInfo = async (): Promise<any> => {
  const now = Date.now();
  
  // 第一层：检查内存缓存（最快）
  if (userInfoCache && (now - userInfoCache.timestamp) < USER_INFO_CACHE_DURATION) {
    console.log('getUserInfo: 使用内存缓存，剩余有效期:', Math.floor((USER_INFO_CACHE_DURATION - (now - userInfoCache.timestamp)) / 1000), '秒');
    return userInfoCache.data;
  }
  
  // 第二层：检查持久化缓存
  try {
    const storedUserInfo = await AsyncStorage.getItem(USER_INFO_STORAGE_KEY);
    const storedTimestamp = await AsyncStorage.getItem(USER_INFO_TIMESTAMP_KEY);
    
    if (storedUserInfo && storedTimestamp) {
      const userInfo = JSON.parse(storedUserInfo);
      const timestamp = parseInt(storedTimestamp, 10);
      const age = now - timestamp;
      
      // 如果持久化缓存未过期（1分钟内），恢复内存缓存并返回
      if (age < USER_INFO_CACHE_DURATION) {
        console.log('getUserInfo: 使用持久化缓存，剩余有效期:', Math.floor((USER_INFO_CACHE_DURATION - age) / 1000), '秒');
        // 恢复内存缓存（使用原始时间戳）
        userInfoCache = {
          data: userInfo,
          timestamp: timestamp,
        };
        return userInfo;
      }
      
      // 持久化缓存已过期，返回旧数据并异步更新
      console.log('getUserInfo: 持久化缓存已过期（', Math.floor(age / 1000), '秒前），返回旧数据并异步更新');
      
      // 异步更新（fetchUserInfoFromServer 会自动更新内存缓存和持久化缓存，使用新的时间戳）
      fetchUserInfoFromServer().catch(error => {
        console.error('getUserInfo: 异步更新缓存失败:', error);
      });
      
      // 立即返回旧数据（不恢复内存缓存，避免使用旧时间戳）
      // 下次调用时，如果异步更新已完成，会使用新的缓存（新时间戳）
      return userInfo;
    }
  } catch (error) {
    console.error('getUserInfo: 读取持久化缓存失败:', error);
  }
  
  // 第三层：无任何缓存，同步获取
  console.log('getUserInfo: 无缓存，同步从服务器获取');
  return await fetchUserInfoFromServer();
};

// 清除用户信息缓存（用于登出等场景）
export const clearUserInfoCache = async () => {
  console.log('clearUserInfoCache: 清除用户信息缓存');
  // 清除内存缓存
  userInfoCache = null;
  // 清除持久化缓存
  try {
    await AsyncStorage.removeItem(USER_INFO_STORAGE_KEY);
    await AsyncStorage.removeItem(USER_INFO_TIMESTAMP_KEY);
    console.log('用户信息持久化缓存已清除');
  } catch (error) {
    console.error('清除用户信息持久化缓存失败:', error);
  }
};

// 搜索文章
// API: GET https://wap.newsmth.net/wap/api/search/article?t=xxx&keyword=xxx&count=20&start=0&original=true&earliest=&boards=&status=0
// 参数说明：
// - keyword: 搜索关键词（必填）
// - count: 每页数量，默认20
// - start: 起始位置，默认0（分页用：第2页start=20，第3页start=40）
// - original: 是否只搜索原创，默认true
// - earliest: 最早时间，格式：YYYY-MM-DD，默认空（不限制）
// - boards: 限定版面，多个用逗号分隔，默认空（全站搜索）
// - status: 状态，默认0
export const searchArticles = async (
  keyword: string,
  page: number = DEFAULT_PAGE,
  pageSize: number = DEFAULT_PAGE_SIZE,
  options?: {
    original?: boolean;
    earliest?: string;
    boards?: string;
    status?: number;
  }
): Promise<{
  articles: any[];
  total: number;
  hasMore: boolean;
}> => {
  try {
    const start = (page - 1) * pageSize;
    const timestamp = Date.now();
    
    const params = new URLSearchParams({
      t: timestamp.toString(),
      keyword: keyword,
      count: pageSize.toString(),
      start: start.toString(),
      original: (options?.original !== false).toString(),
      earliest: options?.earliest || '',
      boards: options?.boards || '',
      status: (options?.status ?? DEFAULT_SEARCH_STATUS).toString(),
    });
    
    const cookies = await getCookies();
    const headers: Record<string, string> = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      'access-control-allow-origin': '*',
      'authorization': 'Basic Og==',
      'cache-control': 'no-cache',
      'pragma': 'no-cache',
      'priority': 'u=1, i',
      'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'test-uin-only': '1',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
    };
    
    if (cookies) {
      headers['cookie'] = cookies;
    }
    
    const url = `${WAP_BASE_URL}/wap/api/search/article?${params.toString()}`;
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers,
    }, SEARCH_TIMEOUT);
    
    const json = await response.json();
    
    if (json.code === 1 && json.data) {
      const articles = json.data.articles || [];
      const total = json.data.total || 0;
      const hasMore = start + articles.length < total;
      
      return {
        articles,
        total,
        hasMore,
      };
    }
    
    return {
      articles: [],
      total: 0,
      hasMore: false,
    };
  } catch (error) {
    console.error('Search articles error:', error);
    throw error;
  }
};

// 搜索版面
export const searchBoards = async (
  keyword: string
): Promise<any[]> => {
  try {
    const timestamp = Date.now();
    const params = new URLSearchParams({
      t: timestamp.toString(),
      keyword: keyword,
    });
    
    const cookies = await getCookies();
    const headers: Record<string, string> = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      'access-control-allow-origin': '*',
      'authorization': 'Basic Og==',
      'cache-control': 'no-cache',
      'pragma': 'no-cache',
      'priority': 'u=1, i',
      'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'test-uin-only': '1',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
    };
    
    if (cookies) {
      headers['cookie'] = cookies;
    }
    
    const url = `${WAP_BASE_URL}/wap/api/search/board?${params.toString()}`;
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers,
    }, SEARCH_TIMEOUT);
    
    const json = await response.json();
    
    if (json.code === 1 && json.data) {
      return json.data || [];
    }
    
    return [];
  } catch (error) {
    console.error('Search boards error:', error);
    throw error;
  }
};

// 搜索用户
export const searchAccounts = async (
  keyword: string,
  page: number = DEFAULT_PAGE,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<{
  accounts: any[];
  total: number;
  hasMore: boolean;
}> => {
  try {
    const start = (page - 1) * pageSize;
    const timestamp = Date.now();
    
    const params = new URLSearchParams({
      t: timestamp.toString(),
      keyword: keyword,
      count: pageSize.toString(),
      start: start.toString(),
    });
    
    const cookies = await getCookies();
    const headers: Record<string, string> = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      'access-control-allow-origin': '*',
      'authorization': 'Basic Og==',
      'cache-control': 'no-cache',
      'pragma': 'no-cache',
      'priority': 'u=1, i',
      'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'test-uin-only': '1',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
    };
    
    if (cookies) {
      headers['cookie'] = cookies;
    }
    
    const url = `${WAP_BASE_URL}/wap/api/search/account?${params.toString()}`;
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers,
    }, SEARCH_TIMEOUT);
    
    const json = await response.json();
    
    if (json.code === 1 && json.data) {
      const accounts = json.data.accounts || [];
      const total = json.data.total || 0;
      const hasMore = start + accounts.length < total;
      
      return {
        accounts,
        total,
        hasMore,
      };
    }
    
    return {
      accounts: [],
      total: 0,
      hasMore: false,
    };
  } catch (error) {
    console.error('Search accounts error:', error);
    throw error;
  }
};

// 检查登录状态
// 通过调用 profile API 来验证当前 Cookie 是否有效
export const checkLoginStatus = async (): Promise<boolean> => {
  try {
    const userInfo = await getUserInfo();
    return userInfo !== null && userInfo.isLoggedIn === true;
  } catch (error) {
    console.error('Check login status error:', error);
    return false;
  }
};

// 登出
export const logout = async () => {
  const {clearCache} = require('./cacheManager');
  
  // 清除所有AsyncStorage中的登录数据
  await AsyncStorage.removeItem('cookies');
  await AsyncStorage.removeItem('username');
  await AsyncStorage.removeItem('isLoggedIn');
  
  // 清除所有内存缓存
  clearCache();
  
  // 清除用户信息缓存（包括持久化缓存）
  await clearUserInfoCache();
  
  console.log('Logout completed, all data cleared');
};

