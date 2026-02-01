import React, {createContext, useContext, useState, useEffect, ReactNode} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {logout as apiLogout} from '../services/api';

interface AuthContextType {
  isLoggedIn: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{children: ReactNode}> = ({children}) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkLoginStatus();
  }, []);

  const checkLoginStatus = async () => {
    try {
      const loggedIn = await AsyncStorage.getItem('isLoggedIn');
      const cookies = await AsyncStorage.getItem('cookies');
      setIsLoggedIn(loggedIn === 'true' && !!cookies);
    } catch (error) {
      console.error('Check login status error:', error);
      setIsLoggedIn(false);
    } finally {
      setIsLoading(false);
    }
  };

  const login = () => {
    setIsLoggedIn(true);
  };

  const logout = async () => {
    try {
      await apiLogout();
    } catch (error) {
      console.error('Logout API error:', error);
    } finally {
      // 无论 API 是否成功，本地都执行退出
      await AsyncStorage.removeItem('isLoggedIn');
      // 可以在这里清除其他用户相关的数据，如 username 等，视需求而定
      // await AsyncStorage.removeItem('username'); 
      setIsLoggedIn(false);
    }
  };

  return (
    <AuthContext.Provider value={{isLoggedIn, isLoading, login, logout}}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within a AuthProvider');
  }
  return context;
};