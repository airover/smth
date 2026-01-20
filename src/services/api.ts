// API 服务
// 职责：认证（登录/登出）、用户信息、搜索、帖子操作（删帖/收藏/点赞）
// 缓存：getUserInfo 使用 cacheManager 统一管理
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchWithRetry,
  DEFAULT_TIMEOUT,
  LOGIN_TIMEOUT,
  SEARCH_TIMEOUT,
  logRequest,
  safeJsonParse,
  buildGetHeaders,
  buildPostHeaders,
  buildDeleteHeaders,
  buildLoginHeaders,
} from '../utils/requestUtils';
import {getCookies, storeCookies} from './auth';
import {setCache, getCacheWithTimestamp, clearCache as clearCacheManager} from './cacheManager';

const BASE_URL = 'https://wap.newsmth.net';
const WAP_BASE_URL = 'https://wap.newsmth.net';

// 搜索相关常量
const DEFAULT_PAGE = 1; // 默认页码
const DEFAULT_PAGE_SIZE = 20; // 默认每页数量
const DEFAULT_SEARCH_STATUS = 0; // 默认搜索状态

// storeCookies 已移至 auth.ts 统一管理

// 更新 set_identity cookie
const updateSetIdentityCookie = async (userInfo: any) => {
  try {
    if (!userInfo || !userInfo.rawAccount) return;
    
    const account = userInfo.rawAccount;
    const identity = {
      birthday: account.birthday,
      friendCount: account.friendCount,
      gender: account.gender,
      avatarUrl: account.avatarUrl,
      level: account.level,
      suicide: account.suicide || false,
      isFans: account.isFans || false,
      mobile: account.mobile,
      articleCount: account.articleCount,
      fansCount: account.fansCount,
      avatar: account.avatar,
      levelTitle: account.levelTitle,
      type: account.type || 0,
      nick: account.nick,
      score: account.score,
      loginTime: account.loginTime,
      createTime: account.createTime,
      isBlack: account.isBlack || false,
      name: account.name,
      id: account.id,
      k3sUrl: account.k3sUrl,
      title: userInfo.title
    };
    
    // 序列化并编码，模拟 curl 格式
    const jsonStr = JSON.stringify(identity);
    const encoded = encodeURIComponent(jsonStr)
      .replace(/%7B/g, '{')
      .replace(/%7D/g, '}')
      .replace(/%3A/g, ':')
      .replace(/%2F/g, '/');
      
    const setIdentityCookie = `set_identity=${encoded}`;
    
    // 获取当前 cookies
    let currentCookies = await getCookies() || '';
    
    // 检查是否已存在 set_identity
    if (currentCookies.includes('set_identity=')) {
      // 替换现有的 set_identity
      // 正则匹配 set_identity=...; 或者 set_identity=... 到字符串结束
      currentCookies = currentCookies.replace(/set_identity=[^;]+(;|$)/, `${setIdentityCookie}$1`);
    } else {
      // 追加 set_identity
      if (currentCookies && !currentCookies.endsWith(';')) {
        currentCookies += '; ';
      }
      currentCookies += setIdentityCookie;
    }
    
    // 保存更新后的 cookies
    await storeCookies(currentCookies);
    console.log('已更新并持久化 set_identity cookie');
    
  } catch (error) {
    console.error('更新 set_identity cookie 失败:', error);
  }
};

// getCookies 已移至 auth.ts 统一管理

// 通用请求函数
const request = async (
  url: string,
  options: RequestInit = {},
): Promise<Response> => {
  const cookies = await getCookies();
  const headers = {
    ...buildGetHeaders(cookies),
    ...options.headers,
  };

  const response = await fetchWithRetry(`${BASE_URL}${url}`, {
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
    const headers = buildLoginHeaders(cookies);
    
    // 根据抓包数据，使用正确的正式登录接口
    const loginUrl = BASE_URL + '/wap/authorize/sign-in';
    console.log('发送登录请求到:', loginUrl);
    
    const response = await fetchWithRetry(loginUrl, {
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
        
        // 登录成功后立即获取用户信息，以便构造 set_identity cookie
        // 不等待它完成，让它在后台执行
        getUserInfo().catch(e => console.error('登录后获取用户信息失败:', e));
        
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



// 重新导出数据获取函数（使用新的实现）
export {getTopTen, getHotPosts, getHotBoards, getBoards, getSubBoards, getBoardPosts, getPostDetail, getTopicReplies, getFavoriteBoards, getMessages, getConversationMessages, markMessageAsRead, sendMessage, addFriend, removeFriend, checkIsHerBlack, addBlack, removeBlack, getFriendsList, getFansList, getBlackList, fetchUserInfo} from './dataFetcher';

// 获取收藏版面（已移至 dataFetcher，此处保留类型定义兼容性，如果需要的话可以删除）
// export const getFavoriteBoards = async (): Promise<any[]> => { ... };



// getBoardPosts 和 getPostDetail 已从 dataFetcher 导出

// 用户信息缓存配置
const USER_INFO_CACHE_DURATION = 60 * 1000; // 1分钟缓存
// 用户信息持久化存储的key（用于 AsyncStorage 备份）
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
    
    const headers = buildPostHeaders(cookies, 'application/x-www-form-urlencoded');
    
    const response = await fetchWithRetry(`${WAP_BASE_URL}/wap/api/profile`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });
    
    const json = await response.json();
    console.log('getUserInfo API response:', json);
    
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
        rawAccount: account, // 保存原始数据，用于构造 set_identity cookie
      };
      
      // 保存用户名到本地存储
      if (account.name) {
        await AsyncStorage.setItem('username', account.name);
      }
      
      // 使用 cacheManager 统一管理缓存
      setCache('userInfo', undefined, userInfo, USER_INFO_CACHE_DURATION);
      
      // 同时持久化到 AsyncStorage（用于离线场景和 App 重启后恢复）
      try {
        await AsyncStorage.setItem(USER_INFO_STORAGE_KEY, JSON.stringify(userInfo));
        await AsyncStorage.setItem(USER_INFO_TIMESTAMP_KEY, Date.now().toString());
        console.log('用户信息已持久化到本地存储');
        
        // 更新 set_identity cookie
        await updateSetIdentityCookie(userInfo);
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
// 缓存策略（使用 cacheManager 统一管理）：
// 1. 优先使用 cacheManager 内存缓存（1分钟有效期）
// 2. 内存缓存失效时，使用 AsyncStorage 持久化缓存
// 3. 持久化缓存过期时，异步更新
// 4. 无任何缓存时，同步获取
// 5. forceRefresh=true 时，跳过缓存直接从服务器获取（用于下拉刷新）
export const getUserInfo = async (forceRefresh: boolean = false): Promise<any> => {
  const now = Date.now();
  
  // 如果强制刷新，跳过所有缓存，直接从服务器获取
  if (forceRefresh) {
    console.log('getUserInfo: 强制刷新，跳过缓存直接从服务器获取');
    return await fetchUserInfoFromServer();
  }
  
  // 第一层：检查 cacheManager 内存缓存（最快）
  const cachedData = getCacheWithTimestamp<any>('userInfo');
  if (cachedData && (now - cachedData.timestamp) < USER_INFO_CACHE_DURATION) {
    console.log('getUserInfo: 使用 cacheManager 内存缓存，剩余有效期:', Math.floor((USER_INFO_CACHE_DURATION - (now - cachedData.timestamp)) / 1000), '秒');
    return cachedData.data;
  }
  
  // 第二层：检查 AsyncStorage 持久化缓存
  try {
    const storedUserInfo = await AsyncStorage.getItem(USER_INFO_STORAGE_KEY);
    const storedTimestamp = await AsyncStorage.getItem(USER_INFO_TIMESTAMP_KEY);
    
    if (storedUserInfo && storedTimestamp) {
      const userInfo = JSON.parse(storedUserInfo);
      const timestamp = parseInt(storedTimestamp, 10);
      const age = now - timestamp;
      
      // 如果持久化缓存未过期（1分钟内），恢复到 cacheManager 并返回
      if (age < USER_INFO_CACHE_DURATION) {
        console.log('getUserInfo: 使用持久化缓存，剩余有效期:', Math.floor((USER_INFO_CACHE_DURATION - age) / 1000), '秒');
        // 恢复到 cacheManager（保持原始时间戳行为）
        setCache('userInfo', undefined, userInfo, USER_INFO_CACHE_DURATION);
        return userInfo;
      }
      
      // 持久化缓存已过期，返回旧数据并异步更新
      console.log('getUserInfo: 持久化缓存已过期（', Math.floor(age / 1000), '秒前），返回旧数据并异步更新');
      
      // 异步更新
      fetchUserInfoFromServer().catch(error => {
        console.error('getUserInfo: 异步更新缓存失败:', error);
      });
      
      // 立即返回旧数据
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
  // 清除 cacheManager 中的用户信息缓存
  clearCacheManager('userInfo');
  // 清除 AsyncStorage 持久化缓存
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
    const headers = buildGetHeaders(cookies);
    
    const url = `${WAP_BASE_URL}/wap/api/search/article?${params.toString()}`;
    const response = await fetchWithRetry(url, {
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
    const headers = buildGetHeaders(cookies);
    
    const url = `${WAP_BASE_URL}/wap/api/search/board?${params.toString()}`;
    const response = await fetchWithRetry(url, {
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
    const headers = buildGetHeaders(cookies);
    
    const url = `${WAP_BASE_URL}/wap/api/search/account?${params.toString()}`;
    const response = await fetchWithRetry(url, {
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

// 删除帖子
// API: DELETE https://wap.newsmth.net/wap/api/topic/delete/article/{postId}
export const deletePost = async (postId: string, title?: string, board?: string): Promise<{success: boolean; message?: string}> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      return {
        success: false,
        message: '未登录，无法删除帖子'
      };
    }
    
    // 构造动态 referer，格式：https://wap.newsmth.net/article/{postId}?title={title}&from=board
    let referer = `https://wap.newsmth.net/article/${postId}`;
    if (title || board) {
      const params = new URLSearchParams();
      if (title) params.append('title', title);
      if (board) params.append('from', 'board');
      referer += `?${params.toString()}`;
    }
    
    // 检查并补充 set_identity
    let finalCookies = cookies;
    if (!cookies.includes('set_identity=')) {
      try {
        // 获取用户信息（利用缓存）
        const userInfo = await getUserInfo();
        if (userInfo && userInfo.rawAccount) {
          const account = userInfo.rawAccount;
          const identity = {
            birthday: account.birthday,
            friendCount: account.friendCount,
            gender: account.gender,
            avatarUrl: account.avatarUrl,
            level: account.level,
            suicide: account.suicide || false,
            isFans: account.isFans || false,
            mobile: account.mobile,
            articleCount: account.articleCount,
            fansCount: account.fansCount,
            avatar: account.avatar,
            levelTitle: account.levelTitle,
            type: account.type || 0,
            nick: account.nick,
            score: account.score,
            loginTime: account.loginTime,
            createTime: account.createTime,
            isBlack: account.isBlack || false,
            name: account.name,
            id: account.id,
            k3sUrl: account.k3sUrl,
            title: userInfo.title
          };
          
          // 序列化
          const jsonStr = JSON.stringify(identity);
          
          // 模拟 curl 的编码方式：保留 { } : / ，编码 " , 和中文
          // 先 encodeURIComponent 整个字符串，然后把 %7B 换回 {，%7D 换回 }，%3A 换回 :，%2F 换回 /
          const encoded = encodeURIComponent(jsonStr)
            .replace(/%7B/g, '{')
            .replace(/%7D/g, '}')
            .replace(/%3A/g, ':')
            .replace(/%2F/g, '/');
            
          finalCookies = `${cookies}; set_identity=${encoded}`;
          console.log('已自动构造并添加 set_identity cookie');
        }
      } catch (e) {
        console.warn('尝试构造 set_identity 失败:', e);
      }
    }
    
    const headers = buildDeleteHeaders(finalCookies, referer, {
      'content-length': '0',
      'x-requested-with': 'XMLHttpRequest',
    });
    
    const url = `${WAP_BASE_URL}/wap/api/topic/delete/article/${postId}`;
    console.log('删除帖子 URL:', url);
    console.log('删除帖子 Headers:', JSON.stringify(headers, null, 2));
    
    const response = await fetchWithRetry(url, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    });
    
    const json = await response.json();
    console.log('删除帖子响应:', json);
    
    if (json.code === 1) {
      return {
        success: true,
        message: json.message || '删除成功'
      };
    } else {
      return {
        success: false,
        message: json.message || '删除失败'
      };
    }
  } catch (error) {
    console.error('Delete post error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '删除失败'
    };
  }
};

// 登出
export const logout = async () => {
  // 清除所有AsyncStorage中的登录数据
  await AsyncStorage.removeItem('cookies');
  await AsyncStorage.removeItem('username');
  await AsyncStorage.removeItem('isLoggedIn');
  
  // 清除所有内存缓存（使用已导入的 clearCacheManager）
  clearCacheManager();
  
  // 清除用户信息缓存（包括持久化缓存）
  await clearUserInfoCache();
  
  console.log('Logout completed, all data cleared');
};

// 我的文章/回复数据类型
export interface MyArticle {
  id: string;
  title: string;
  board: string;
  boardName: string;
  author: string;
  time: number;
  replyCount?: number;
  content?: string;
  topicId?: string;  // 所属主题ID（用于回复时跳转到帖子详情）
}

// 获取我的文章/回复
// API: GET https://wap.newsmth.net/wap/api/profile/myarticle?t=xxx&type=0&page=1&sort=DESC
// 参数说明：
// - type: 0=帖子, 1=回复
// - page: 页码
// - sort: 排序方式，DESC=倒序，ASC=正序
export const getMyArticles = async (
  type: 0 | 1 = 0,  // 0=帖子, 1=回复
  page: number = 1,
  sort: 'DESC' | 'ASC' = 'DESC'
): Promise<{
  articles: MyArticle[];
  total: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
}> => {
  try {
    const timestamp = Date.now();
    const cookies = await getCookies();
    
    if (!cookies) {
      console.log('getMyArticles: No cookies found');
      return {
        articles: [],
        total: 0,
        hasMore: false,
        page,
        pageSize: 20,
      };
    }
    
    const params = new URLSearchParams({
      t: timestamp.toString(),
      type: type.toString(),
      page: page.toString(),
      sort: sort,
    });
    
    const headers = buildGetHeaders(cookies, 'https://wap.newsmth.net/myArticle');
    
    const url = `${WAP_BASE_URL}/wap/api/profile/myarticle?${params.toString()}`;
    console.log('getMyArticles URL:', url);
    
    const response = await fetchWithRetry(url, {
      method: 'GET',
      headers,
    }, DEFAULT_TIMEOUT);
    
    const json = await response.json();
    console.log('getMyArticles response:', JSON.stringify(json).substring(0, 500));
    
    if (json.code === 1 && json.data) {
      const articles = (json.data.articles || []).map((article: any) => {
        // 处理 board 字段：如果是对象则提取 name 字段，否则直接使用
        const boardObj = article.board;
        const isObject = typeof boardObj === 'object' && boardObj !== null;
        const boardValue = isObject ? (boardObj.name || boardObj.id || '') : (boardObj || '');
        const boardNameValue = isObject 
          ? (boardObj.title || boardObj.name || boardObj.id || '') 
          : (article.boardName || boardObj || '');
        
        // 处理内容字段：帖子用 content，回复用 body
        const contentValue = article.content || article.body || '';
        
        // 处理时间字段：帖子用 time，回复用 postTime
        const timeValue = article.time || article.postTime;
        
        return {
          id: article.id,
          title: article.title || article.subject,
          board: boardValue,
          boardName: boardNameValue,
          author: article.author,
          time: timeValue,
          replyCount: article.replyCount,
          content: contentValue,
          topicId: article.topicId,
        };
      });
      
      const pager = json.data.pager || {};
      const totalPages = pager.total || 0; // 总页数
      const pageSize = pager.size || 20;
      const currentPage = pager.page || page;
      const itemsCount = pager.items || 0; // 当前页实际帖子/回复数
      
      // 判断是否还有更多：当前页 < 总页数
      const hasMore = currentPage < totalPages;
      
      return {
        articles,
        total: itemsCount, // 直接使用当前页的帖子/回复数
        hasMore,
        page: currentPage,
        pageSize,
      };
    }
    
    return {
      articles: [],
      total: 0,
      hasMore: false,
      page,
      pageSize: 20,
    };
  } catch (error) {
    console.error('getMyArticles error:', error);
    throw error;
  }
};

// 获取我喜欢的文章列表
// API: GET https://wap.newsmth.net/wap/api/profile/mylikes?t=xxx&type=2&page=1&sort=DESC
// 参数说明：
// - type: 2=喜欢的文章
// - page: 页码
// - sort: 排序方式，DESC=倒序，ASC=正序
export const getMyLikes = async (
  page: number = 1,
  sort: 'DESC' | 'ASC' = 'DESC'
): Promise<{
  articles: MyArticle[];
  total: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
}> => {
  try {
    const timestamp = Date.now();
    const cookies = await getCookies();
    
    if (!cookies) {
      console.log('getMyLikes: No cookies found');
      return {
        articles: [],
        total: 0,
        hasMore: false,
        page,
        pageSize: 20,
      };
    }
    
    const params = new URLSearchParams({
      t: timestamp.toString(),
      type: '2',
      page: page.toString(),
      sort: sort,
    });
    
    const headers = buildGetHeaders(cookies, 'https://wap.newsmth.net/myArticle');
    
    const url = `${WAP_BASE_URL}/wap/api/profile/mylikes?${params.toString()}`;
    console.log('getMyLikes URL:', url);
    
    const response = await fetchWithRetry(url, {
      method: 'GET',
      headers,
    }, DEFAULT_TIMEOUT);
    
    const json = await response.json();
    console.log('getMyLikes response:', JSON.stringify(json).substring(0, 500));
    
    if (json.code === 1 && json.data && json.data.likes) {
      const articles = (json.data.likes || []).map((like: any) => {
        const article = like.article || {};
        const board = article.board || {};
        
        return {
          id: article.id || like.articleId,
          title: article.subject || '无标题',
          board: board.name || board.id || '',
          boardName: board.title || board.name || '',
          author: article.account?.name || '',
          time: like.time || article.postTime,
          replyCount: 0, // 喜欢列表不显示回复数
          content: like.body || article.body || '',
          topicId: article.topicId,
        };
      });
      
      const pager = json.data.pager || {};
      const totalPages = pager.total || 0; // 总页数
      const pageSize = pager.size || 20;
      const currentPage = pager.page || page;
      const itemsCount = pager.items || 0; // 当前页实际条目数
      
      // 判断是否还有更多：当前页 < 总页数
      const hasMore = currentPage < totalPages;
      
      return {
        articles,
        total: itemsCount,
        hasMore,
        page: currentPage,
        pageSize,
      };
    }
    
    return {
      articles: [],
      total: 0,
      hasMore: false,
      page,
      pageSize: 20,
    };
  } catch (error) {
    console.error('getMyLikes error:', error);
    throw error;
  }
};

// 收藏文章
// API: POST https://wap.newsmth.net/wap/api/profile/addFavTopic
// 参数：id=帖子ID&t=时间戳
export const addFavoriteTopic = async (
  topicId: string
): Promise<{success: boolean; message?: string}> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      return {
        success: false,
        message: '未登录，无法收藏'
      };
    }
    
    const timestamp = Date.now();
    const formData = new URLSearchParams();
    formData.append('id', topicId);
    formData.append('t', timestamp.toString());
    
    const headers = buildPostHeaders(
      cookies,
      'application/x-www-form-urlencoded',
      `https://wap.newsmth.net/article/${topicId}?from=board`
    );
    
    const url = `${WAP_BASE_URL}/wap/api/profile/addFavTopic`;
    console.log('收藏文章 URL:', url);
    console.log('收藏文章参数:', formData.toString());
    
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: formData.toString(),
      credentials: 'include',
    }, DEFAULT_TIMEOUT);
    
    const json = await response.json();
    console.log('收藏文章响应:', json);
    
    if (json.code === 1) {
      return {
        success: true,
        message: json.message || '收藏成功'
      };
    } else {
      return {
        success: false,
        message: json.message || '收藏失败'
      };
    }
  } catch (error) {
    console.error('Add favorite topic error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '收藏失败'
    };
  }
};

// 标记收藏文章为已读
// API: POST https://wap.newsmth.net/wap/api/profile/favTopic/read/{topicId}
// 参数：readOrder=已读位置&t=时间戳
export const markFavoriteTopicRead = async (
  topicId: string,
  readOrder: number
): Promise<{success: boolean; message?: string}> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      return {
        success: false,
        message: '未登录，无法操作'
      };
    }
    
    const timestamp = Date.now();
    const formData = new URLSearchParams();
    formData.append('readOrder', readOrder.toString());
    formData.append('t', timestamp.toString());
    
    const headers = buildPostHeaders(
      cookies,
      'application/x-www-form-urlencoded',
      `https://wap.newsmth.net/article/${topicId}?from=board`
    );
    
    const url = `${WAP_BASE_URL}/wap/api/profile/favTopic/read/${topicId}`;
    console.log('标记已读 URL:', url);
    console.log('标记已读参数:', formData.toString());
    
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: formData.toString(),
      credentials: 'include',
    }, DEFAULT_TIMEOUT);
    
    const json = await response.json();
    console.log('标记已读响应:', json);
    
    if (json.code === 1) {
      return {
        success: true,
        message: json.message || '已标记为已读'
      };
    } else {
      return {
        success: false,
        message: json.message || '操作失败'
      };
    }
  } catch (error) {
    console.error('Mark favorite topic read error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '操作失败'
    };
  }
};

// 取消收藏文章
// API: DELETE https://wap.newsmth.net/wap/api/profile/favTopic/topicid/{topicId}
export const removeFavoriteTopic = async (
  topicId: string
): Promise<{success: boolean; message?: string}> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      return {
        success: false,
        message: '未登录，无法操作'
      };
    }
    
    const headers = buildDeleteHeaders(
      cookies,
      `https://wap.newsmth.net/article/${topicId}?from=board`,
      {
        'content-length': '0',
        'content-type': 'application/x-www-form-urlencoded',
      }
    );
    
    const url = `${WAP_BASE_URL}/wap/api/profile/favTopic/topicid/${topicId}`;
    console.log('取消收藏 URL:', url);
    
    const response = await fetchWithRetry(url, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    }, DEFAULT_TIMEOUT);
    
    const json = await response.json();
    console.log('取消收藏响应:', json);
    
    if (json.code === 1) {
      return {
        success: true,
        message: json.message || '已取消收藏'
      };
    } else {
      return {
        success: false,
        message: json.message || '操作失败'
      };
    }
  } catch (error) {
    console.error('Remove favorite topic error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '操作失败'
    };
  }
};



// 点赞/扔鸡蛋（新版API）
// API: POST https://wap.newsmth.net/wap/api/topic/addLike
export const addLike = async (
  topicId: string,
  boardName: string,
  score: number,
  comment: string,
  captchaParams?: {
    captcha_id: string;
    lot_number: string;
    captcha_output: string;
    pass_token: string;
    gen_time: string;
  }
): Promise<{success: boolean; message?: string; data?: any}> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      return {
        success: false,
        message: '未登录，无法操作'
      };
    }
    
    const timestamp = Date.now();
    const formData = new URLSearchParams();
    formData.append('boardName', boardName);
    formData.append('body', comment);
    
    // 添加验证码参数（如果有）
    if (captchaParams) {
      formData.append('captcha_id', captchaParams.captcha_id);
      formData.append('captcha_output', captchaParams.captcha_output);
    }
    
    formData.append('client', 'wap');
    
    // 继续添加验证码参数
    if (captchaParams) {
      formData.append('gen_time', captchaParams.gen_time);
    }
    
    formData.append('id', topicId);
    
    // 继续添加验证码参数
    if (captchaParams) {
      formData.append('lot_number', captchaParams.lot_number);
      formData.append('pass_token', captchaParams.pass_token);
    }
    
    formData.append('score', score.toString());
    formData.append('t', timestamp.toString());
    
    const headers = buildPostHeaders(
      cookies,
      'application/x-www-form-urlencoded',
      `https://wap.newsmth.net/article/${topicId}?title=${encodeURIComponent(boardName)}&from=board`
    );
    
    const url = `${WAP_BASE_URL}/wap/api/topic/addLike`;
    console.log('点赞/扔鸡蛋 URL:', url);
    console.log('点赞/扔鸡蛋参数:', {topicId, boardName, score, comment});
    console.log('点赞/扔鸡蛋验证码参数:', captchaParams);
    console.log('点赞/扔鸡蛋请求体:', formData.toString());
    console.log('点赞/扔鸡蛋headers:', headers);
    
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: formData.toString(),
      credentials: 'include',
    }, DEFAULT_TIMEOUT);
    
    const json = await response.json();
    console.log('点赞/扔鸡蛋响应:', json);
    
    // 检查 code 和 kbsCode
    if (json.code === 1 && (json.kbsCode === 0 || json.kbsCode === undefined)) {
      return {
        success: true,
        message: json.message || '操作成功',
        data: json.data
      };
    } else {
      return {
        success: false,
        message: json.message || '操作失败'
      };
    }
  } catch (error) {
    console.error('Add like error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '操作失败'
    };
  }
};

// 获取帖子读写权限
// API: GET https://wap.newsmth.net/wap/api/detail/rw/permissions?t=xxx&topicId=xxx
// 响应: {
//   code: 1,
//   data: {
//     read: { facet: "VIEW", hasPerm: true },
//     write: { cause: "本版发文需要 10积分", facet: "POST", hasPerm: false }
//   }
// }
export interface PostPermissions {
  read: {
    facet: string;
    hasPerm: boolean;
    cause?: string;
  };
  write: {
    facet: string;
    hasPerm: boolean;
    cause?: string;
  };
}

export const getPostPermissions = async (
  topicId: string
): Promise<{success: boolean; data?: PostPermissions; message?: string}> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      return {
        success: false,
        message: '未登录，无法获取权限信息'
      };
    }
    
    const timestamp = Date.now();
    const params = new URLSearchParams({
      t: timestamp.toString(),
      topicId: topicId,
    });
    
    const headers = buildGetHeaders(
      cookies,
      `https://wap.newsmth.net/article/${topicId}?from=board`
    );
    
    const url = `${WAP_BASE_URL}/wap/api/detail/rw/permissions?${params.toString()}`;
    console.log('获取帖子权限 URL:', url);
    
    const response = await fetchWithRetry(url, {
      method: 'GET',
      headers,
      credentials: 'include',
    }, DEFAULT_TIMEOUT);
    
    const json = await response.json();
    console.log('获取帖子权限响应:', json);
    
    if (json.code === 1 && json.data) {
      return {
        success: true,
        data: json.data
      };
    } else {
      return {
        success: false,
        message: json.message || '获取权限信息失败'
      };
    }
  } catch (error) {
    console.error('Get post permissions error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '获取权限信息失败'
    };
  }
};

