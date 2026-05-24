import React, {useState, useEffect, useMemo, useRef} from 'react';
import {View, StyleSheet, useColorScheme, NativeModules, AppState} from 'react-native';
import {NavigationContainer, DefaultTheme, DarkTheme} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

// Components
import AppNavigator from './src/navigation/AppNavigator';
import LoginScreen from './src/screens/LoginScreen';
import {SettingsProvider, useSettings} from './src/context/SettingsContext';
import {AuthProvider, useAuth} from './src/context/AuthContext';
import {ReadPostsProvider} from './src/context/ReadPostsContext';
import {getTheme} from './src/utils/theme';
import {startMSiteKeepAlive, stopMSiteKeepAlive, triggerSilentMSiteReLogin} from './src/services/auth';
import {AppStateProvider, useOnAppResume} from './src/context/AppStateContext';
import SilentCaptchaWebView from './src/components/SilentCaptchaWebView';

const {SplashScreenManager} = NativeModules;

// 空白占位屏幕，用于登录状态检查期间
const EmptyScreen = () => {
  const isDarkMode = useColorScheme() === 'dark';
  return <View style={{flex: 1, backgroundColor: isDarkMode ? '#000' : '#fff'}} />;
};

const RootStack = createNativeStackNavigator();

const AppContent = () => {
  const {isLoggedIn, isLoading: authLoading, login} = useAuth();
  const {settings} = useSettings();
  const [appReady, setAppReady] = useState(false);
  const [preloadedCredentials, setPreloadedCredentials] = useState<{
    username: string;
    password: string;
    remember: boolean;
  } | null>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  // M 站心跳保活：用户已登录时启动，登出时停止
  useEffect(() => {
    if (isLoggedIn && !authLoading) {
      startMSiteKeepAlive();
    } else {
      stopMSiteKeepAlive();
    }
    return () => {
      stopMSiteKeepAlive();
    };
  }, [isLoggedIn, authLoading]);

  // App 从后台切回前台时，立即触发一次 M 站心跳检测
  // （后台挂起期间定时器不工作，session 可能已过期）
  useOnAppResume(() => {
    if (isLoggedIn) {
      triggerSilentMSiteReLogin();
    }
  }, [isLoggedIn]);

  // 当 app 初始化完成且认证状态加载完成后，隐藏原生启动屏覆盖层
  useEffect(() => {
    if (appReady && !authLoading) {
      // 使用 requestAnimationFrame 确保 JS 端的真实内容已经渲染到屏幕上
      requestAnimationFrame(() => {
        SplashScreenManager?.hide();
      });
    }
  }, [appReady, authLoading]);

  const initializeApp = async () => {
    try {
      // 并行执行：1. 最小展示时间 2. 预加载凭据
      const [, credentialsResult] = await Promise.all([
        // 保持启动页展示至少 2 秒
        new Promise<void>(resolve => setTimeout(() => resolve(), 2000)),
        // 预加载凭据（为未登录情况准备）
        preloadCredentials(),
      ]);

      setPreloadedCredentials(credentialsResult);
      setAppReady(true);
    } catch (error) {
      console.error('Initialize app error:', error);
      setAppReady(true);
    }
  };

  const preloadCredentials = async (): Promise<{
    username: string;
    password: string;
    remember: boolean;
  }> => {
    try {
      const {getSavedCredentials} = require('./src/utils/storage');
      const credentials = await getSavedCredentials();
      return {
        username: credentials.username || '',
        password: credentials.remember ? (credentials.password || '') : '',
        remember: credentials.remember || false,
      };
    } catch (error) {
      console.error('Preload credentials error:', error);
      return {username: '', password: '', remember: false};
    }
  };

  // 只有当 App 初始化完成且 AuthContext 加载完成时，才切换到真实内容
  const showLoading = !appReady || authLoading;

  // 根据用户主题设置和系统主题来决定导航容器的主题
  const colorScheme = useColorScheme();
  const isDarkMode = settings.themeMode === 'dark' || (settings.themeMode === 'auto' && colorScheme === 'dark');
  const isSpringMode = settings.themeMode === 'spring';
  const appTheme = getTheme(settings.themeMode === 'auto' ? (colorScheme === 'dark' ? 'dark' : 'light') : settings.themeMode);
  const navTheme = useMemo(() => ({
    ...(isDarkMode || isSpringMode ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDarkMode || isSpringMode ? DarkTheme.colors : DefaultTheme.colors),
      // 春节主题时，让 Screen 的 Background 也使用红色，避免导航栏和内容区之间露出暖白色间隙
      background: isSpringMode ? appTheme.headerBackground : appTheme.background,
      card: appTheme.headerBackground,
      text: appTheme.headerText,
      border: appTheme.border,
      primary: appTheme.headerTint,
    },
  }), [isDarkMode, isSpringMode, appTheme]);

  return (
    <View style={[styles.container, {backgroundColor: appTheme.background}]}>
      <NavigationContainer theme={navTheme}>
        <RootStack.Navigator screenOptions={{headerShown: false, animation: 'none'}}>
          {showLoading ? (
            // 登录状态检查中，渲染空白占位（被原生启动屏覆盖层遮挡）
            <RootStack.Screen name="Loading" component={EmptyScreen} />
          ) : isLoggedIn ? (
            <RootStack.Screen name="App" component={AppNavigator} />
          ) : (
            <RootStack.Screen name="Login">
              {() => (
                <LoginScreen
                  onLoginSuccess={login}
                  initialCredentials={preloadedCredentials}
                />
              )}
            </RootStack.Screen>
          )}
        </RootStack.Navigator>
      </NavigationContainer>
      {/* 隐藏的静默验证码 WebView，用于 M 站心跳检测到过期后自动重新登录 */}
      {isLoggedIn && <SilentCaptchaWebView />}
    </View>
  );
};

const App = () => {
  return (
    <AppStateProvider>
      <AuthProvider>
        <SettingsProvider>
          <ReadPostsProvider>
            <AppContent />
          </ReadPostsProvider>
        </SettingsProvider>
      </AuthProvider>
    </AppStateProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
