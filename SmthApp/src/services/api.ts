// API 服务
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'https://wap.newsmth.net';
const WAP_BASE_URL = 'https://wap.newsmth.net';

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

  const response = await fetch(`${BASE_URL}${url}`, {
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
      headers['Cookie'] = cookies;
    }
    
    // 根据抓包数据，使用正确的正式登录接口
    const loginUrl = BASE_URL + '/wap/authorize/sign-in';
    console.log('发送登录请求到:', loginUrl);
    
    const response = await fetch(loginUrl, {
      method: 'POST',
      headers,
      body: formData.toString(),
      credentials: 'include',
    });

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
export {getTopTen, getHotPosts, getHotBoards, getBoards, getSubBoards, getBoardPosts, getPostDetail, getTopicReplies, getFavoriteBoards, getMessages, getConversationMessages} from './dataFetcher';

// 获取收藏版面（已移至 dataFetcher，此处保留类型定义兼容性，如果需要的话可以删除）
// export const getFavoriteBoards = async (): Promise<any[]> => { ... };

// 保存收藏版面（暂不支持在线保存，此处仅作占位）
export const saveFavoriteBoard = async (board: any) => {
  console.log('Save favorite board not implemented for online API yet');
};

// getBoardPosts 和 getPostDetail 已从 dataFetcher 导出

// 获取信箱
export const getMails = async (): Promise<any[]> => {
  try {
    const response = await request('/nForum/mail');
    const text = await response.text();
    // 解析HTML获取信箱
    return [];
  } catch (error) {
    console.error('Get mails error:', error);
    return [];
  }
};

// 从 wap API 获取用户信息
// API: POST https://wap.newsmth.net/wap/api/profile
// 响应: {code: 1, data: {account: {name, nick, avatar, ...}}}
export const getUserInfo = async (): Promise<any> => {
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
    
    const response = await fetch(`${WAP_BASE_URL}/wap/api/profile`, {
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
      
      // 优先使用 avatarUrl，因为它已经是 https 且在主域名下，更稳定
      let avatar = account.avatarUrl || account.ks3Url || account.k3sUrl || '';
      if (avatar && avatar.startsWith('http:')) {
        avatar = avatar.replace('http:', 'https:');
      }
      
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
      
      return userInfo;
    }
    
    // API 返回失败，尝试从本地存储获取
    console.log('getUserInfo: API returned failure, code:', json.code);
    const storedUsername = await AsyncStorage.getItem('username');
    if (storedUsername) {
      return {
        username: storedUsername,
        isLoggedIn: false, // 标记为可能未登录
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
        isLoggedIn: false, // 标记为可能未登录
      };
    }
    return null;
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
  
  console.log('Logout completed, all data cleared');
};

