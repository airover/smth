import React, {useState, useEffect} from 'react';
import {StatusBar, ActivityIndicator, View, StyleSheet} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

// Components
import AppNavigator from './src/navigation/AppNavigator';
import LoginScreen from './src/screens/LoginScreen';
import {SettingsProvider} from './src/context/SettingsContext';

const AuthStack = createNativeStackNavigator();

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkLoginStatus();
  }, []);

  const checkLoginStatus = async () => {
    try {
      const loggedIn = await AsyncStorage.getItem('isLoggedIn');
      const cookies = await AsyncStorage.getItem('cookies');
      
      if (loggedIn === 'true' && cookies) {
        setIsLoggedIn(true);
      }
    } catch (error) {
      console.error('Check login status error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginSuccess = () => {
    setIsLoggedIn(true);
  };

  // 显示加载状态
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  // 登录后显示主导航
  if (isLoggedIn) {
    return (
      <SettingsProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <AppNavigator />
      </SettingsProvider>
    );
  }

  // 未登录显示登录页面
  return (
    <SettingsProvider>
      <NavigationContainer>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <AuthStack.Navigator screenOptions={{headerShown: false}}>
          <AuthStack.Screen name="Login">
            {() => <LoginScreen onLoginSuccess={handleLoginSuccess} />}
          </AuthStack.Screen>
        </AuthStack.Navigator>
      </NavigationContainer>
    </SettingsProvider>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});

export default App;
