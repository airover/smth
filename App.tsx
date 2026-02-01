import React, {useState, useEffect} from 'react';
import {View, StyleSheet} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

// Components
import AppNavigator from './src/navigation/AppNavigator';
import LoginScreen from './src/screens/LoginScreen';
import LaunchScreen from './src/components/LaunchScreen';
import {SettingsProvider} from './src/context/SettingsContext';
import {AuthProvider, useAuth} from './src/context/AuthContext';

// 空白占位屏幕，用于登录状态检查期间
const EmptyScreen = () => <View style={{flex: 1, backgroundColor: '#fff'}} />;

const RootStack = createNativeStackNavigator();

const AppContent = () => {
  const {isLoggedIn, isLoading: authLoading, login} = useAuth();
  const [appReady, setAppReady] = useState(false);
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
      // 并行执行：1. 最小展示时间 2. 预加载凭据
      const [, credentialsResult] = await Promise.all([
        // 保持启动页展示至少 2 秒
        new Promise(resolve => setTimeout(resolve, 2000)),
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

  // 只有当 App 初始化完成且 AuthContext 加载完成时，才隐藏 Loading
  const showLoading = !appReady || authLoading;

  return (
    <View style={styles.container}>
      <NavigationContainer>
        <RootStack.Navigator screenOptions={{headerShown: false, animation: 'none'}}>
          {showLoading ? (
            // 登录状态检查中，渲染空白占位（被启动屏覆盖）
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
      {/* LaunchScreen 作为覆盖层，避免导航切换闪烁 */}
      {showLoading && (
        <View style={styles.splashOverlay}>
          <LaunchScreen />
        </View>
      )}
    </View>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <SettingsProvider>
        <AppContent />
      </SettingsProvider>
    </AuthProvider>
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
