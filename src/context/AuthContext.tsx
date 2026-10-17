import React, {createContext, useContext, useState, useEffect, ReactNode} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Alert, AppState} from 'react-native';
import {logout as apiLogout} from '../services/api';
import {checkIsLoggedIn, recoverAuthenticatedUsername} from '../services/auth';
import {activateAccountCache} from '../services/accountCache';
import {clearCache} from '../services/cacheManager';
import {checkWapSession, subscribeLoginExpired} from '../services/wapSession';
import {getSavedCredentials} from '../utils/storage';

export interface ReloginCredentials {
  username: string;
  password: string;
  remember: boolean;
}

interface AuthContextType {
  isLoggedIn: boolean;
  isLoading: boolean;
  /** 会话过期时预填到登录页的账号（即刚过期的账号）及其保存的密码 */
  reloginCredentials: ReloginCredentials | null;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{children: ReactNode}> = ({children}) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [reloginCredentials, setReloginCredentials] = useState<ReloginCredentials | null>(null);

  useEffect(() => {
    checkLoginStatus();
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      void recoverAuthenticatedUsername().then(() => checkWapSession('resume'));
    });
    // 会话经服务端确认失效后，回到登录页并明确告知原因（只提示一次）。
    const unsubscribeExpired = subscribeLoginExpired(async ({username, reason}) => {
      // 先取出该账号自己保存的密码，再切到登录页，登录页挂载时即可预填。
      const saved = await getSavedCredentials(username).catch(() => null);
      setReloginCredentials({
        username,
        password: saved?.password || '',
        remember: saved?.remember ?? false,
      });
      setIsLoggedIn(false);
      Alert.alert(
        '登录已过期',
        reason === 'mismatch'
          ? `账号 ${username} 的登录凭证与账号不符，请重新登录。`
          : `账号 ${username} 的登录状态已失效，请重新登录。`,
        [{text: '好的'}],
      );
    });
    return () => {
      subscription.remove();
      unsubscribeExpired();
    };
  }, []);

  const checkLoginStatus = async () => {
    try {
      const loggedIn = await checkIsLoggedIn();
      setIsLoggedIn(loggedIn);
      // 本地凭证先放行进入，后台再向服务端确认是否仍然有效。
      if (loggedIn) void recoverAuthenticatedUsername().then(() => checkWapSession('startup'));
    } catch (error) {
      console.error('Check login status error:', error);
      setIsLoggedIn(false);
    } finally {
      setIsLoading(false);
    }
  };

  const login = () => {
    setReloginCredentials(null);
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
    <AuthContext.Provider value={{isLoggedIn, isLoading, reloginCredentials, login, logout}}>
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
