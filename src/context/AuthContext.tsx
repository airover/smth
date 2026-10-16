import React, {createContext, useContext, useState, useEffect, ReactNode} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AppState} from 'react-native';
import {logout as apiLogout} from '../services/api';
import {checkIsLoggedIn, recoverAuthenticatedUsername} from '../services/auth';
import {activateAccountCache} from '../services/accountCache';
import {clearCache} from '../services/cacheManager';

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
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void recoverAuthenticatedUsername();
    });
    return () => subscription.remove();
  }, []);

  const checkLoginStatus = async () => {
    try {
      setIsLoggedIn(await checkIsLoggedIn());
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
      // 即使持久层清理失败，也立即终止当前会话和内存缓存。
      activateAccountCache(null);
      clearCache();
      try {
        await AsyncStorage.multiRemove(['isLoggedIn', 'username', 'cookies']);
      } finally {
        setIsLoggedIn(false);
      }
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
