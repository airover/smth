import React, {useState, useEffect} from 'react';
import {View, StyleSheet} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

// Components
import AppNavigator from './src/navigation/AppNavigator';
import LoginScreen from './src/screens/LoginScreen';
import LaunchScreen from './src/components/LaunchScreen';
import {SettingsProvider} from './src/context/SettingsContext';

// 空白占位屏幕，用于登录状态检查期间
const EmptyScreen = () => <View style={{flex: 1, backgroundColor: '#fff'}} />;

const RootStack = createNativeStackNavigator();

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loginStatusChecked, setLoginStatusChecked] = useState(false); // 登录状态是否已检查完成
  // 预加载的凭据，在闪屏期间加载完成，传递给 LoginScreen 避免二次加载
  const [preloadedCredentials, setPreloadedCredentials] = useState<{
    username: string;
    password: string;
    remember: boolean;
  } | null>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // 并行执行：1. 最小展示时间 2. 检查登录状态 3. 预加载凭据
      const [, loginResult, credentialsResult] = await Promise.all([
        // 保持启动页展示至少 1 秒
        new Promise(resolve => setTimeout(resolve, 2000)),
        // 检查登录状态
        checkLoginStatus(),
        // 预加载凭据（为未登录情况准备）
        preloadCredentials(),
      ]);

      if (loginResult.isLoggedIn) {
        // 已登录：直接进入首页
        setIsLoggedIn(true);
        setLoginStatusChecked(true);
        setIsLoading(false);
      } else {
        // 未登录：设置预加载的凭据，然后渲染登录界面
        setPreloadedCredentials(credentialsResult);
        setLoginStatusChecked(true);
        // 给一点时间让 LoginScreen 完成首次渲染（使用预加载的凭据）
        setTimeout(() => {
          setIsLoading(false);
        }, 100);
      }
    } catch (error) {
      console.error('Initialize app error:', error);
      setLoginStatusChecked(true);
      setIsLoading(false);
    }
  };

  const checkLoginStatus = async (): Promise<{isLoggedIn: boolean}> => {
    try {
      const loggedIn = await AsyncStorage.getItem('isLoggedIn');
      const cookies = await AsyncStorage.getItem('cookies');
      return {isLoggedIn: loggedIn === 'true' && !!cookies};
    } catch (error) {
      console.error('Check login status error:', error);
      return {isLoggedIn: false};
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

  const handleLoginSuccess = () => {
    setIsLoggedIn(true);
  };

  return (
    <SettingsProvider>
      <View style={styles.container}>
        <NavigationContainer>
          <RootStack.Navigator screenOptions={{headerShown: false, animation: 'none'}}>
            {!loginStatusChecked ? (
              // 登录状态检查中，渲染空白占位（被启动屏覆盖）
              <RootStack.Screen name="Loading" component={EmptyScreen} />
            ) : isLoggedIn ? (
              <RootStack.Screen name="App" component={AppNavigator} />
            ) : (
              <RootStack.Screen name="Login">
                {() => (
                  <LoginScreen
                    onLoginSuccess={handleLoginSuccess}
                    initialCredentials={preloadedCredentials}
                  />
                )}
              </RootStack.Screen>
            )}
          </RootStack.Navigator>
        </NavigationContainer>
        {/* LaunchScreen 作为覆盖层，避免导航切换闪烁 */}
        {isLoading && (
          <View style={styles.splashOverlay}>
            <LaunchScreen />
          </View>
        )}
      </View>
    </SettingsProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
});

export default App;
