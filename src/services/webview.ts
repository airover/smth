// WebView 服务 - 用于处理登录和Cookie管理
import {WebView} from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'https://wap.newsmth.net';

// 注入的JavaScript代码，用于获取Cookie
export const getCookieScript = `
  (function() {
    function getCookies() {
      return document.cookie;
    }
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'cookies',
      data: getCookies()
    }));
  })();
  true;
`;

// 注入的JavaScript代码，用于检查登录状态
export const checkLoginScript = `
  (function() {
    function checkLogin() {
      // 检查页面中是否有登录相关的元素
      const loginElements = document.querySelectorAll('a[href*="login"], .login, a[href*="bbslogin"]');
      const userElements = document.querySelectorAll('.user-info, .username, .user, [class*="user"]');
      const logoutElements = document.querySelectorAll('a[href*="logout"], .logout, [class*="logout"]');
      
      // 更准确的登录状态检测
      const hasUserInfo = userElements.length > 0;
      const hasLogout = logoutElements.length > 0;
      const noLoginLink = loginElements.length === 0;
      
      // 如果页面有用户信息或退出链接，说明已登录
      const isLoggedIn = hasUserInfo || hasLogout || (noLoginLink && document.cookie.includes('main'));
      
      // 尝试从页面获取用户名
      let username = null;
      if (userElements.length > 0) {
        username = userElements[0].textContent?.trim() || null;
      }
      
      // 如果没找到用户名，尝试从 Cookie 中获取
      if (!username) {
        const cookieMatch = document.cookie.match(/main\[0\]\[userid\]=([^;]+)/);
        if (cookieMatch) {
          username = decodeURIComponent(cookieMatch[1]);
        }
      }
      
      return {
        isLoggedIn: isLoggedIn,
        username: username,
        cookies: document.cookie
      };
    }
    const result = checkLogin();
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'loginStatus',
      data: result
    }));
  })();
  true;
`;

// 处理WebView消息
export const handleWebViewMessage = async (
  event: any,
  onCookiesReceived?: (cookies: string) => void,
  onLoginStatusChanged?: (isLoggedIn: boolean, username?: string) => void,
  onTencentCaptchaResult?: (ticket: string, randstr: string, appid?: string) => void,
) => {
  try {
    const message = JSON.parse(event.nativeEvent.data);
    
    if (message.type === 'cookies' && message.data) {
      const cookies = message.data;
      console.log('Saving cookies from getCookieScript:', cookies.substring(0, 100));
      await AsyncStorage.setItem('cookies', cookies);
      onCookiesReceived?.(cookies);
    }
    
    if (message.type === 'loginStatus' && message.data) {
      const {isLoggedIn, username, cookies} = message.data;
      
      console.log('Login status message:', {isLoggedIn, username, hasCookies: !!cookies});
      
      // 保存 Cookie（如果提供了）
      if (cookies) {
        console.log('Saving cookies from loginStatus:', cookies.substring(0, 100));
        await AsyncStorage.setItem('cookies', cookies);
      }
      
      // 保存用户名和登录状态
      if (isLoggedIn) {
        if (username) {
          await AsyncStorage.setItem('username', username);
        }
        await AsyncStorage.setItem('isLoggedIn', 'true');
        console.log('Login status saved:', {username, isLoggedIn});
      }
      
      onLoginStatusChanged?.(isLoggedIn, username);
    }
    
    // 处理腾讯验证码结果
    if (message.type === 'tencentCaptchaResult' && message.data) {
      const {ret, ticket, randstr, appid} = message.data;
      if (ret === 0 && ticket && randstr) {
        onTencentCaptchaResult?.(ticket, randstr, appid);
      }
    }
  } catch (error) {
    console.error('Handle webview message error:', error);
  }
};

// 获取存储的Cookie并注入到WebView
export const getStoredCookies = async (): Promise<string> => {
  const cookies = await AsyncStorage.getItem('cookies');
  return cookies || '';
};

// 创建带Cookie的WebView源
export const createWebViewSource = (url: string) => {
  return {
    uri: url.startsWith('http') ? url : `${BASE_URL}${url}`,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    },
  };
};

// 导出腾讯验证码相关脚本
export {
  checkTencentCaptcha,
  initTencentCaptcha,
  showTencentCaptcha,
  getTencentCaptchaAppId,
  autoHandleTencentCaptcha,
} from './tencentCaptcha';

