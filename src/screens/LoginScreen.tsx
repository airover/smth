import React, {useState, useRef, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  Switch,
  Modal,
  Keyboard,
  StatusBar,
  useColorScheme,
} from 'react-native';
import {WebView} from 'react-native-webview';
// 以下工具函数用于 WebView 登录流程
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useNavigation} from '@react-navigation/native';
import {
  handleWebViewMessage,
  getCookieScript,
  // checkLoginScript, checkTencentCaptcha, initTencentCaptcha - 用于 WebView 登录流程
  showTencentCaptcha,
  // getTencentCaptchaAppId, autoHandleTencentCaptcha - 用于 WebView 登录流程
} from '../services/webview';
import {saveCredentials} from '../utils/storage';
import {recognizeCaptcha} from '../services/captchaRecognizer';
import {recognizeCaptchaWithFreeOCR} from '../services/captchaRecognizerLocal';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  scaleModerate,
  responsiveSize,
} from '../utils/responsive';
import CaptchaScreen from './CaptchaScreen';

interface LoginScreenProps {
  onLoginSuccess?: () => void;
  initialCredentials?: {
    username: string;
    password: string;
    remember: boolean;
  } | null;
}

const LoginScreen: React.FC<LoginScreenProps> = ({onLoginSuccess, initialCredentials}) => {
  const navigation = useNavigation<any>();
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';
  // 使用预加载的凭据作为初始值，避免异步加载导致闪烁
  const [username, setUsername] = useState(initialCredentials?.username || '');
  const [password, setPassword] = useState(initialCredentials?.password || '');
  const [captcha, setCaptcha] = useState('');
  const [captchaImage, setCaptchaImage] = useState<string | null>(null);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showWebView, setShowWebView] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(initialCredentials?.remember || false);
  const autoRecognize = true; // 始终自动识别验证码
  const [recognizing, setRecognizing] = useState(false); // 正在识别验证码
  const [tencentCaptchaTicket, setTencentCaptchaTicket] = useState<string | null>(null); // 腾讯验证码 ticket
  const [tencentCaptchaRandstr, setTencentCaptchaRandstr] = useState<string | null>(null); // 腾讯验证码 randstr
  const [tencentCaptchaAppId, setTencentCaptchaAppId] = useState<string | null>(null); // 腾讯验证码 AppID
  const [isTencentCaptcha, setIsTencentCaptcha] = useState(false); // 是否使用腾讯验证码
  const [showCaptchaScreen, setShowCaptchaScreen] = useState(false); // 是否显示独立验证码页面
  const [captchaVerified, setCaptchaVerified] = useState(false); // 验证码是否已验证（避免重复检测）
  const [loginRetryCount, setLoginRetryCount] = useState(0); // 登录重试次数
  const webViewRef = useRef<WebView>(null);

  // 在组件加载时，尝试获取保存的凭据（如果没有通过 props 传入）
  useEffect(() => {
    const loadSavedCredentials = async () => {
      // 如果已经通过 props 传入了凭据，则不需要再加载
      if (initialCredentials?.username) {
        return;
      }
      
      try {
        const {getSavedCredentials} = require('../utils/storage');
        const saved = await getSavedCredentials();
        console.log('加载保存的凭据:', {
          username: saved.username,
          hasPassword: !!saved.password,
          remember: saved.remember,
        });
        
        if (saved.username) {
          setUsername(saved.username);
        }
        if (saved.password && saved.remember) {
          setPassword(saved.password);
        }
        setRememberPassword(saved.remember);
      } catch (error) {
        console.error('加载保存的凭据失败:', error);
      }
    };
    
    loadSavedCredentials();
  }, [initialCredentials]);

  // 当处于加载状态时，设置超时自动重置，避免卡死
  useEffect(() => {
    let timer: any;
    // 设置超时自动重置，避免卡死
    if (loading) {
      timer = setTimeout(() => {
        console.log('登录超时，自动重置加载状态');
        setLoading(false);
      }, 20000); // 20秒超时
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loading]);

  // 移除 loadSavedCredentials 函数，凭据已通过 props 传入

  const handleSaveCredentials = async () => {
    try {
      await saveCredentials(username, password, rememberPassword);
  } catch (_error) {
      console.error('Save credentials error:', _error);
    }
  };

  const checkCaptcha = async () => {
    // 尝试获取验证码图片
    try {
      const captchaUrl = 'https://wap.newsmth.net/bbsimg/captcha.png';
      setCaptchaImage(captchaUrl);
      setShowCaptcha(true);
    } catch (_error) {
      console.log('No captcha required');
    }
  };

  const refreshCaptcha = () => {
    // 刷新验证码
    const timestamp = new Date().getTime();
    const newCaptchaUrl = `https://wap.newsmth.net/bbsimg/captcha.png?t=${timestamp}`;
    setCaptchaImage(newCaptchaUrl);
    setCaptcha('');
    
    // 如果启用了自动识别，尝试识别新的验证码
    if (autoRecognize) {
      autoRecognizeCaptcha(newCaptchaUrl);
    }
  };

  /**
   * 自动识别验证码
   */
  const autoRecognizeCaptcha = async (imageUrl: string) => {
    if (!imageUrl) {
      return;
    }

    setRecognizing(true);
    console.log('开始自动识别验证码...');

    try {
      // 首先尝试使用免费 OCR API
      let result = await recognizeCaptchaWithFreeOCR(imageUrl);
      
      // 如果免费 OCR 失败，尝试使用百度 OCR（如果配置了）
      if (!result.success) {
        console.log('免费 OCR 识别失败，尝试百度 OCR...');
        result = await recognizeCaptcha(imageUrl, true);
      }

      if (result.success && result.text) {
        console.log('验证码识别成功:', result.text);
        setCaptcha(result.text);
        setRecognizing(false);
        
        // 自动提交登录（延迟一下让状态更新）
        setTimeout(() => {
          if (username.trim() && password.trim()) {
            handleLogin();
          }
        }, 500);
      } else {
        console.log('验证码识别失败:', result.error);
        // 识别失败，显示给用户手动输入
        setRecognizing(false);
        Alert.alert(
          '自动识别失败',
          `无法自动识别验证码：${result.error || '未知错误'}\n请手动输入验证码。`,
          [{text: '确定'}]
        );
      }
    } catch (error) {
      console.error('自动识别验证码错误:', error);
      setRecognizing(false);
      Alert.alert(
        '识别错误',
        '验证码自动识别出错，请手动输入验证码。',
        [{text: '确定'}]
      );
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('提示', '请输入用户名和密码');
      return;
    }

    // 检查验证码是否已验证
    if (!captchaVerified) {
      Alert.alert('提示', '请先完成人机验证后再点击登录');
      return;
    }

    // 只在使用传统图片验证码时检查输入框
    if (showCaptcha && !isTencentCaptcha && !captcha.trim()) {
      Alert.alert('提示', '请输入验证码');
      return;
    }

    // 保存账号密码（如果用户选择了记住密码）
    await handleSaveCredentials();

    // 重置重试计数
    setLoginRetryCount(0);
    setLoading(true);
    
    try {
      console.log('直接发送登录请求');
      
      // 准备极验验证码参数
      let captchaParams = undefined;
      if (captchaVerified && tencentCaptchaTicket && tencentCaptchaRandstr) {
        // 解析 ticket 中的极验参数
        const parts = tencentCaptchaTicket.split('|');
        if (parts.length >= 4) {
          captchaParams = {
            captcha_id: 'b01299f3ff24047dc399e650eec51a81',
            lot_number: parts[0],
            captcha_output: parts[1],
            pass_token: parts[2],
            gen_time: parts[3],
          };
          console.log('使用极验验证码参数:', {
            lot_number: parts[0],
            gen_time: parts[3],
          });
        }
      }
      
      // 导入 login 函数
      const { login } = require('../services/api');
      
      // 直接调用 API
      const result = await login(
        username.trim(),
        password.trim(),
        showCaptcha && !isTencentCaptcha ? captcha.trim() : undefined,
        captchaParams
      );
      
      console.log('登录结果:', result);
      
      if (result.success) {
        // 登录成功
        console.log('登录成功!', result.data);
        
        // 调用成功回调或导航返回
        if (onLoginSuccess) {
          onLoginSuccess();
        } else if (navigation.canGoBack()) {
          navigation.goBack();
        }
      } else {
        // 登录失败
        console.log('登录失败:', result.message);
        setLoading(false);
        setCaptchaVerified(false);
        setTencentCaptchaTicket(null);
        setTencentCaptchaRandstr(null);
        Alert.alert('登录失败', result.message || '请检查用户名密码或验证码');
      }
    } catch (error) {
      console.error('登录错误:', error);
      setLoading(false);
      Alert.alert('登录失败', '网络请求失败，请检查网络连接');
    }
  };

  const handleWebViewNavigationStateChange = async (navState: any) => {
    console.log('WebView URL changed:', navState.url, 'captchaVerified:', captchaVerified);
    
    // 检查URL变化，判断是否需要验证码
    // 如果验证码已验证，跳过检测直接提交登录
    if ((navState.url.includes('login') || navState.url.includes('bbslogin')) && !captchaVerified) {
      // 检查是否需要验证码（极验或传统图片验证码）
      const checkCaptchaScript = `
        (function() {
          // 检查极验验证码 (GeeTest)
          const hasGeetest = typeof initGeetest4 !== 'undefined' || 
                             document.querySelector('script[src*="geetest.com"]') !== null ||
                             document.querySelector('.geetest_holder') !== null;
          
          // 检查腾讯验证码
          const hasTencentCaptcha = typeof window.TencentCaptcha !== 'undefined' || 
                                     document.querySelector('script[src*="captcha.qq.com"]') !== null ||
                                     document.querySelector('#TencentCaptcha') !== null;
          
          // 检查传统图片验证码
          const captchaImg = document.querySelector('img[src*="captcha"], img[alt*="验证码"], img[alt*="captcha"]');
          const captchaInput = document.querySelector('input[name*="captcha"], input[name*="code"], input[type="text"][placeholder*="验证码"]');
          
          if (hasGeetest) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'geetestCaptchaRequired',
              data: {
                required: true,
                sdkLoaded: typeof initGeetest4 !== 'undefined'
              }
            }));
          } else if (hasTencentCaptcha) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'tencentCaptchaRequired',
              data: {
                required: true,
                sdkLoaded: typeof window.TencentCaptcha !== 'undefined'
              }
            }));
          } else if (captchaImg || captchaInput) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'captchaRequired',
              data: {
                imageUrl: captchaImg ? captchaImg.src : null,
                required: true
              }
            }));
          }
        })();
        true;
      `;
      
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(checkCaptchaScript);
      }, 1500);
    }

    // 检查是否登录成功（跳转到主页、用户页等）
    if (navState.url.includes('mainpage') || 
        navState.url.includes('user') || 
        navState.url.includes('index') || 
        (navState.url === 'https://wap.newsmth.net/' && !navState.url.includes('login'))) {
      console.log('检测到导航到主页，URL:', navState.url);
      // 重置重试计数
      setLoginRetryCount(0);
      // 获取Cookie以供后续使用
      webViewRef.current?.injectJavaScript(getCookieScript);
      
      // 注意：登录成功的状态已经通过 loginSuccess 消息处理
      // 这里只是确保获取到 Cookie
    }
    
    // 如果还在登录页面且没有正在验证，检查是否有错误消息
    if ((navState.url.includes('login') || navState.url.includes('bbslogin')) && 
        !navState.loading && 
        !captchaVerified) {
      console.log('仍在登录页面，检查是否有错误消息');
      
      // 检测页面上的错误提示
      const checkErrorScript = `
        (function() {
          const errorMsg = document.querySelector('.error, .alert, #error_msg, font[color="red"]');
          if (errorMsg && errorMsg.textContent.trim().length > 0) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'loginError',
              data: { message: errorMsg.textContent.trim() }
            }));
          }
        })();
        true;
      `;
      webViewRef.current?.injectJavaScript(checkErrorScript);
        }
  };

  const handleMessage = async (event: any) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      
      // 处理极验验证码检测结果
      if (message.type === 'geetestCaptchaRequired' && message.data.required) {
        console.log('检测到极验验证码，SDK加载状态:', message.data.sdkLoaded ? '已加载' : '未加载');
        setIsTencentCaptcha(true); // 复用这个状态表示需要弹窗验证码
        setShowCaptcha(true);
        setLoading(false);
        setCaptchaVerified(false); // 重置验证状态
        
        // 显示独立的验证码页面
        setShowCaptchaScreen(true);
        setShowWebView(false);
        return;
      }
      
      // 处理腾讯验证码检测结果（保留兼容）
      if (message.type === 'tencentCaptchaRequired' && message.data.required) {
        console.log('检测到腾讯验证码');
        setIsTencentCaptcha(true);
        setShowCaptcha(true);
        setLoading(false);
        setCaptchaVerified(false); // 重置验证状态
        
        // 显示独立的验证码页面
        setShowCaptchaScreen(true);
        setShowWebView(false);
        return;
      }
      
      // 处理腾讯验证码结果
      if (message.type === 'tencentCaptchaResult') {
        const {ret, ticket, randstr, appid, errorCode, errorMessage} = message.data;
        console.log('腾讯验证码结果:', {ret, ticket, randstr, appid});
        
        if (ret === 0 && ticket && randstr) {
          // 验证成功
          setTencentCaptchaTicket(ticket);
          setTencentCaptchaRandstr(randstr);
          if (appid) {
            setTencentCaptchaAppId(appid);
          }
          
          // 自动提交登录
          setTimeout(() => {
            if (username.trim() && password.trim()) {
              handleLogin();
            }
          }, 500);
        } else {
          // 验证失败或取消
          console.log('腾讯验证码失败:', {errorCode, errorMessage});
          if (errorCode !== -1) { // -1 通常表示用户取消，不需要提示
            Alert.alert('验证码', errorMessage || '验证码验证失败，请重试');
          }
        }
        return;
      }
      
      // 处理腾讯验证码就绪
      if (message.type === 'tencentCaptchaReady') {
        if (message.data.ready) {
          console.log('腾讯验证码 SDK 已就绪');
          // 可以尝试自动触发
          if (autoRecognize && tencentCaptchaAppId) {
            setTimeout(() => {
              webViewRef.current?.injectJavaScript(showTencentCaptcha(tencentCaptchaAppId));
            }, 500);
          }
        }
        return;
      }
      
      // 处理获取到的 AppID
      if (message.type === 'tencentCaptchaAppId') {
        const appId = message.data;
        if (appId) {
          setTencentCaptchaAppId(appId);
          console.log('获取到腾讯验证码 AppID:', appId);
        }
        return;
      }

      // 处理登录成功消息
      if (message.type === 'loginSuccess') {
        console.log('收到登录成功消息:', message.data);
        setLoading(false);
        setShowWebView(false);
        setLoginRetryCount(0);
        
        // 保存登录状态
        await AsyncStorage.setItem('isLoggedIn', 'true');
        
        // 保存用户名
        const accountName = message.data.account?.name || username.trim();
        if (accountName) {
          await AsyncStorage.setItem('username', accountName);
        }
        
        // 保存账号到多账号列表
        try {
          const cookies = await AsyncStorage.getItem('cookies');
          if (cookies && accountName) {
            const savedAccountsJson = await AsyncStorage.getItem('savedAccounts');
            let savedAccounts = savedAccountsJson ? JSON.parse(savedAccountsJson) : [];
            
            // 检查账号是否已存在
            const existingIndex = savedAccounts.findIndex((acc: any) => acc.username === accountName);
            
            const accountInfo = {
              username: accountName,
              nickname: message.data.account?.nickname,
              avatar: message.data.account?.avatar,
              cookies: cookies,
              isCurrent: true,
            };
            
            if (existingIndex >= 0) {
              // 更新现有账号
              savedAccounts[existingIndex] = accountInfo;
            } else {
              // 添加新账号
              savedAccounts.push(accountInfo);
            }
            
            // 将其他账号标记为非当前
            savedAccounts = savedAccounts.map((acc: any) => ({
              ...acc,
              isCurrent: acc.username === accountName,
            }));
            
            await AsyncStorage.setItem('savedAccounts', JSON.stringify(savedAccounts));
            console.log('账号已保存到多账号列表');
          }
        } catch (error) {
          console.error('保存账号到多账号列表失败:', error);
        }
        
        console.log('登录成功!', {
          username: accountName,
          message: message.data.message
        });
        
        // 调用登录成功回调或导航返回
        if (onLoginSuccess) {
          onLoginSuccess();
        } else if (navigation.canGoBack()) {
          navigation.goBack();
        }
        
        return;
      }
      
      // 处理登录错误消息
      if (message.type === 'loginError') {
        console.log('收到登录错误消息:', message.data.message);
        setLoading(false);
        setShowWebView(false);
        setLoginRetryCount(0); // 重置重试计数
        setCaptchaVerified(false); // 重置验证状态
        setTencentCaptchaTicket(null); // 清除验证码
        setTencentCaptchaRandstr(null);
        Alert.alert('登录失败', message.data.message || '请检查用户名密码或验证码，然后重新验证登录');
        return;
      }
      
      // 处理传统图片验证码
      if (message.type === 'captchaRequired' && message.data.required) {
        setIsTencentCaptcha(false);
        setShowCaptcha(true);
        setCaptchaVerified(false); // 重置验证状态
        const captchaUrl = message.data.imageUrl || 'https://wap.newsmth.net/bbsimg/captcha.png';
        setCaptchaImage(captchaUrl);
        setShowWebView(false);
        setLoading(false);
        
        // 如果启用了自动识别，尝试自动识别验证码
        if (autoRecognize) {
          autoRecognizeCaptcha(captchaUrl);
        }
        return;
      }
      
      await handleWebViewMessage(
        event,
        async (cookies) => {
          // Cookie已经在handleWebViewMessage中保存到AsyncStorage
          console.log('收到Cookie');
        },
        async (isLoggedIn, detectedUsername) => {
          if (isLoggedIn) {
            setLoading(false);
            setShowWebView(false);
            await AsyncStorage.setItem('isLoggedIn', 'true');
            
            // 保存用户名
            const finalUsername = username.trim() || detectedUsername || await AsyncStorage.getItem('username') || '';
            if (finalUsername) {
              await AsyncStorage.setItem('username', finalUsername);
            }
            
            console.log('登录成功!', {
              username: finalUsername,
              isLoggedIn
            });
            
            // 直接返回主界面
            if (onLoginSuccess) {
              onLoginSuccess();
            } else if (navigation.canGoBack()) {
              navigation.goBack();
            }
          } else {
            // 如果已经在WebView模式下，且检测到未登录（可能是登录失败或正在处理）
            // 我们不立即设置loading为false，因为页面可能正在跳转
            console.log('检测到当前状态：未登录');
          }
        }
      );
    } catch (error) {
      console.error('Handle message error:', error);
    }
  };

  const submitLogin = () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('提示', '请输入用户名和密码');
      return;
    }

    // 检查验证码（传统图片验证码或腾讯验证码）
    if (showCaptcha) {
      if (isTencentCaptcha) {
        // 腾讯验证码需要 ticket 和 randstr
        if (!tencentCaptchaTicket || !tencentCaptchaRandstr) {
          Alert.alert('提示', '请完成验证码验证');
          // 重新显示 WebView 让用户完成验证码
          setShowWebView(true);
          setLoading(true);
          return;
        }
      } else {
        // 传统图片验证码需要输入文本
        if (!captcha.trim()) {
          Alert.alert('提示', '请输入验证码');
          return;
        }
      }
    }

    setLoading(true);
    setShowWebView(true);

    // 构建登录脚本
    setTimeout(() => {
  // 登录脚本：使用已获取的验证码结果提交表单
  const loginScript = `
    (function() {
      console.log('开始执行登录脚本...');
      
      // 确保 DOM 已加载
      if (!document.body) {
        console.log('[submitLogin] document.body 未就绪，等待...');
        setTimeout(arguments.callee, 100);
        return;
      }
      
      const ticketVal = '${(tencentCaptchaTicket || "").replace(/'/g, "\\'")}';
      const randstrVal = '${(tencentCaptchaRandstr || "").replace(/'/g, "\\'")}';
      
      // 解析极验 v4 参数
      let lot_number = '';
      let captcha_output = '';
      let pass_token = '';
      let gen_time = '';
      
      if (ticketVal.indexOf('|') !== -1) {
        const parts = ticketVal.split('|');
        if (parts.length >= 4) {
          lot_number = parts[0];
          captcha_output = parts[1];
          pass_token = parts[2];
          gen_time = parts[3];
          console.log('解析极验参数成功');
        }
      } else {
        lot_number = ticketVal;
        captcha_output = randstrVal;
        pass_token = ticketVal;
        gen_time = Math.floor(Date.now() / 1000).toString();
      }

      let form = document.querySelector('form[action*="login"], form[action*="bbslogin"], form');
      
      if (!form) {
        console.log('未找到表单，创建POST表单');
        // 创建一个POST表单
        form = document.createElement('form');
        form.method = 'POST';
        form.action = '/login';
        document.body.appendChild(form);
            } else {
        console.log('找到表单, action:', form.action, 'method:', form.method);
        // 确保表单是POST方法
        form.method = 'POST';
      }
      
      // 添加或更新字段的辅助函数
      const addField = (name, value) => {
        let input = form.querySelector('input[name="' + name + '"]');
        if (!input) {
          input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          form.appendChild(input);
        }
        input.value = value;
        console.log('设置字段:', name, '=', value.substring(0, 30) + (value.length > 30 ? '...' : ''));
      };
      
      // 填写用户名和密码（使用浏览器实际的参数名）
      addField('username', '${username.replace(/'/g, "\\'")}');
      addField('password', '${password.replace(/'/g, "\\'")}');
      
      // 添加极验验证码参数
      if (lot_number) {
        addField('captcha_id', 'b01299f3ff24047dc399e650eec51a81');  // 水木的极验captcha_id
        addField('lot_number', lot_number);
        addField('captcha_output', captcha_output);
        addField('pass_token', pass_token);
        addField('gen_time', gen_time);
        addField('type', '2');  // 极验类型
        addField('client', 'wap');  // 客户端类型
      }
      
      // 添加时间戳
      addField('t', Date.now().toString());
      
      // 填写传统验证码（如果有）
      const captchaInput = form.querySelector('input[name="captcha"], input[name="code"]');
      if (captchaInput && '${captcha}') {
          captchaInput.value = '${captcha.replace(/'/g, "\\'")}';
        console.log('填写传统验证码');
      }
      
      console.log('准备提交表单, method:', form.method, 'action:', form.action);
      console.log('表单字段总数:', form.querySelectorAll('input').length);
      
      // 使用 fetch API 提交表单，服务器返回 JSON
      const formData = new FormData(form);
      
      // 输出所有表单字段用于调试
      console.log('=== 表单数据 ===');
      for (let [key, value] of formData.entries()) {
        if (key === 'password') {
          console.log(key + ':', '***');
        } else {
          console.log(key + ':', typeof value === 'string' ? value.substring(0, 50) : value);
        }
      }
      console.log('=== 表单数据结束 ===');
      
      console.log('[submitLogin] 使用 fetch 提交');
      
      fetch(form.action || '/login', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          'Accept': 'application/json, text/html, */*',
          'X-Requested-With': 'XMLHttpRequest'
        }
      })
      .then(response => {
        console.log('[submitLogin] Response status:', response.status);
        console.log('[submitLogin] Response URL:', response.url);
        console.log('[submitLogin] Response Content-Type:', response.headers.get('content-type'));
        return response.json();
      })
      .then(json => {
        console.log('[submitLogin] Response JSON:', JSON.stringify(json));
        
        // 检查响应格式: { code: 1, data: { url: "/" }, message: "操作成功" }
        if (json.code === 1) {
          // 登录成功
          console.log('[submitLogin] 登录成功, 跳转到:', json.data?.url || '/');
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'loginSuccess',
            data: { 
              message: json.message,
              account: json.data?.account,
              redirectUrl: json.data?.url || '/'
            }
          }));
          // 跳转到主页
          setTimeout(() => {
            window.location.href = json.data?.url || '/';
          }, 500);
        } else {
          // 登录失败
          console.log('[submitLogin] 登录失败:', json.message);
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'loginError',
            data: { message: json.message || '登录失败，请重试' }
          }));
        }
      })
      .catch(error => {
        console.log('[submitLogin] Fetch error:', error);
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'loginError',
          data: { message: '网络请求失败: ' + error.message }
        }));
      });
    })();
    true;
  `;      webViewRef.current?.injectJavaScript(loginScript);
    }, 1500);
  };

  // 处理验证码验证成功
  const handleCaptchaSuccess = (ticket: string, randstr: string) => {
    console.log('验证码验证成功:', {ticket: ticket?.substring(0, 30) + '...', randstr});
    setTencentCaptchaTicket(ticket);
    setTencentCaptchaRandstr(randstr);
    setShowCaptchaScreen(false);
    setCaptchaVerified(true); // 标记验证码已通过
    setIsTencentCaptcha(true); // 标记为腾讯验证码模式
    setShowCaptcha(true); // 确保验证码状态为显示
    
    // 延迟关闭键盘，确保Modal完全关闭后再执行，避免焦点自动回到输入框
    setTimeout(() => {
      Keyboard.dismiss();
    }, 300);
    
    // 用户验证后自动关闭弹窗，不再自动提交登录，等待用户点击登录按钮
    console.log('验证码验证完成，等待用户手动点击登录');
  };

  // 使用已验证的验证码直接提交登录
  const submitLoginWithCaptcha = (ticket: string, randstr: string) => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('提示', '请输入用户名和密码');
      return;
    }

    setLoading(true);
    setShowWebView(true);
    setCaptchaVerified(true); // 标记验证码已验证，避免重复检测
    
    // 构建直接登录脚本，使用极验验证码结果
    const loginScript = `
      (function() {
        console.log('使用极验验证码结果登录');
        
        // 确保 DOM 已加载
        if (!document.body) {
          console.log('[submitLoginWithCaptcha] document.body 未就绪，等待...');
          setTimeout(arguments.callee, 100);
          return;
        }
        
        const ticketVal = '${ticket}';
        const randstrVal = '${randstr}';
        
        // 解析极验 v4 参数
        let lot_number = ticketVal;
        let captcha_output = randstrVal;
        let pass_token = ticketVal;
        let gen_time = Math.floor(Date.now() / 1000).toString();
        
        if (ticketVal.indexOf('|') !== -1) {
          const parts = ticketVal.split('|');
          if (parts.length >= 4) {
            lot_number = parts[0];
            captcha_output = parts[1];
            pass_token = parts[2];
            gen_time = parts[3];
            console.log('解析极验参数成功');
          }
        }
        
        // 尝试找到登录表单或创建新表单
        let form = document.querySelector('form[action*="login"], form[action*="bbslogin"], form');
        
        if (!form) {
          console.log('未找到表单，创建POST表单');
          form = document.createElement('form');
          form.method = 'POST';
          form.action = '/login';
          document.body.appendChild(form);
        } else {
          console.log('找到表单, action:', form.action);
          form.method = 'POST';
        }
        
        // 添加或更新字段
          const addHiddenField = (name, value) => {
            let input = form.querySelector('input[name="' + name + '"]');
            if (!input) {
              input = document.createElement('input');
              input.type = 'hidden';
              input.name = name;
              form.appendChild(input);
            }
            input.value = value;
          console.log('[submitLoginWithCaptcha] 设置字段:', name);
        };
        
        // 填写用户名和密码（使用浏览器实际的参数名）
        addHiddenField('username', '${username.replace(/'/g, "\\'")}');
        addHiddenField('password', '${password.replace(/'/g, "\\'")}');
        
        // 添加极验验证码参数
        addHiddenField('captcha_id', 'b01299f3ff24047dc399e650eec51a81');
        addHiddenField('lot_number', lot_number);
        addHiddenField('captcha_output', captcha_output);
        addHiddenField('pass_token', pass_token);
        addHiddenField('gen_time', gen_time);
        addHiddenField('type', '2');
        addHiddenField('client', 'wap');
        addHiddenField('t', Date.now().toString());
        
        console.log('[submitLoginWithCaptcha] 准备提交表单, method:', form.method, 'action:', form.action);
        
        // 使用 fetch API 提交表单，服务器返回 JSON
        const formData = new FormData(form);
        
        // 输出所有表单字段（用于调试）
        console.log('[submitLoginWithCaptcha] === 表单数据 ===');
        for (let [key, value] of formData.entries()) {
          if (key === 'password') {
            console.log(key + ':', '***');
        } else {
            console.log(key + ':', typeof value === 'string' ? value.substring(0, 50) : value);
          }
        }
        console.log('[submitLoginWithCaptcha] === 表单数据结束 ===');
        
        console.log('[submitLoginWithCaptcha] 使用 fetch 提交');
        
        fetch(form.action || '/login', {
          method: 'POST',
          body: formData,
          credentials: 'include',
          headers: {
            'Accept': 'application/json, text/html, */*',
            'X-Requested-With': 'XMLHttpRequest'
          }
        })
        .then(response => {
          console.log('[submitLoginWithCaptcha] Response status:', response.status);
          console.log('[submitLoginWithCaptcha] Response URL:', response.url);
          console.log('[submitLoginWithCaptcha] Response Content-Type:', response.headers.get('content-type'));
          return response.json();
        })
        .then(json => {
          console.log('[submitLoginWithCaptcha] Response JSON:', JSON.stringify(json));
          
          // 检查响应格式: { code: 1, data: { url: "/" }, message: "操作成功" }
          if (json.code === 1) {
            // 登录成功
            console.log('[submitLoginWithCaptcha] 登录成功, 跳转到:', json.data?.url || '/');
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'loginSuccess',
              data: { 
                message: json.message,
                account: json.data?.account,
                redirectUrl: json.data?.url || '/'
              }
            }));
            // 跳转到主页
            setTimeout(() => {
              window.location.href = json.data?.url || '/';
            }, 500);
          } else {
            // 登录失败
            console.log('[submitLoginWithCaptcha] 登录失败:', json.message);
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'loginError',
              data: { message: json.message || '登录失败，请重试' }
            }));
          }
        })
        .catch(error => {
          console.log('[submitLoginWithCaptcha] Fetch error:', error);
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'loginError',
            data: { message: '网络请求失败: ' + error.message }
          }));
        });
      })();
      true;
    `;
    
    // 延迟执行登录脚本，确保WebView已加载
    setTimeout(() => {
      webViewRef.current?.injectJavaScript(loginScript);
      console.log('已注入登录脚本');
    }, 1000);
  };

  // 处理验证码取消
  const handleCaptchaCancel = () => {
    setShowCaptchaScreen(false);
    setLoading(false);
  };

  // 显示独立的验证码页面 (通过 Modal 弹窗)
  const renderCaptchaModal = () => (
    <Modal
      visible={showCaptchaScreen}
      transparent={true}
      animationType="fade"
      onRequestClose={handleCaptchaCancel}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <CaptchaScreen
            username={username}
            password={password}
            onCaptchaSuccess={handleCaptchaSuccess}
            onCancel={handleCaptchaCancel}
          />
        </View>
      </View>
    </Modal>
    );



  // 不再需要 WebView 界面，直接使用主登录界面和 API 登录
  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={isDarkMode ? '#000' : '#fff'}
      />
      {renderCaptchaModal()}
      <View style={styles.content}>
        <Text style={styles.title}>水木社区</Text>
        <Text style={styles.subtitle}>登录</Text>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="用户名"
            placeholderTextColor="#999"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="密码"
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputContainer}>
          <TouchableOpacity
            style={[
              styles.input,
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: captchaVerified ? '#f0fff0' : '#f9f9f9',
                borderColor: captchaVerified ? '#34C759' : '#ddd',
              }
            ]}
            onPress={() => setShowCaptchaScreen(true)}
          >
            <Text style={{ fontSize: 16, color: captchaVerified ? '#34C759' : '#666' }}>
              {captchaVerified ? '✅ 验证码已验证' : '点击进行人机验证'}
            </Text>
            {!captchaVerified && <Text style={{ fontSize: 14, color: '#007AFF' }}>去验证</Text>}
          </TouchableOpacity>
        </View>

        {/* 验证码UI已移除，现在使用弹窗方式 */}

        <View style={styles.rememberContainer}>
          <Switch
            value={rememberPassword}
            onValueChange={setRememberPassword}
            trackColor={{false: '#ddd', true: '#007AFF'}}
            thumbColor={rememberPassword ? '#fff' : '#f4f3f4'}
          />
          <Text style={styles.rememberText}>记住密码</Text>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>登录</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: SPACING.xl,
    justifyContent: 'center',
  },
  title: {
    fontSize: responsiveSize(28, 32, 36, 40),
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZE.xl,
    color: '#666',
    textAlign: 'center',
    marginBottom: SPACING.xxxl + 8,
  },
  inputContainer: {
    marginBottom: SPACING.lg,
  },
  input: {
    height: responsiveSize(46, 50, 54, 58),
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.lg,
    fontSize: FONT_SIZE.lg,
    backgroundColor: '#f9f9f9',
  },
  captchaContainer: {
    marginBottom: SPACING.lg,
  },
  captchaLabel: {
    fontSize: FONT_SIZE.md,
    color: '#666',
    marginBottom: SPACING.sm,
  },
  captchaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  captchaImage: {
    width: scaleModerate(120),
    height: responsiveSize(46, 50, 54, 58),
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: '#f9f9f9',
  },
  refreshButton: {
    marginLeft: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: '#f0f0f0',
    borderRadius: BORDER_RADIUS.sm,
  },
  refreshText: {
    fontSize: FONT_SIZE.md,
    color: '#007AFF',
  },
  captchaInput: {
    height: responsiveSize(46, 50, 54, 58),
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.lg,
    fontSize: FONT_SIZE.lg,
    backgroundColor: '#f9f9f9',
  },
  recognizingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  recognizingText: {
    fontSize: FONT_SIZE.sm,
    color: '#007AFF',
    marginLeft: SPACING.sm,
  },
  captchaStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: '#f9f9f9',
    borderRadius: BORDER_RADIUS.md,
  },
  captchaStatusText: {
    fontSize: FONT_SIZE.md,
    color: '#666',
    flex: 1,
  },
  rememberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  rememberText: {
    fontSize: FONT_SIZE.md,
    color: '#666',
    marginLeft: SPACING.sm,
  },
  button: {
    height: responsiveSize(46, 50, 54, 58),
    backgroundColor: '#007AFF',
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.xl,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZE.lg,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
});

export default LoginScreen;
