// 本地存储工具函数
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AppSettings} from '../types';

export const STORAGE_KEYS = {
  SAVED_USERNAME: 'saved_username',
  SAVED_PASSWORD: 'saved_password',
  REMEMBER_PASSWORD: 'remember_password',
  IS_LOGGED_IN: 'isLoggedIn',
  USERNAME: 'username',
  COOKIES: 'cookies',
  FAVORITE_BOARDS: 'favoriteBoards',
  APP_SETTINGS: 'app_settings', // 全局配置
};

// 默认配置
const DEFAULT_SETTINGS: AppSettings = {
  fontSize: 'medium',
  defaultBoardSort: 'post',
  themeMode: 'light',
};

// 保存账号密码
export const saveCredentials = async (
  username: string,
  password: string,
  remember: boolean,
): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SAVED_USERNAME, username);
    if (remember) {
      await AsyncStorage.setItem(STORAGE_KEYS.SAVED_PASSWORD, password);
      await AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_PASSWORD, 'true');
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.SAVED_PASSWORD);
      await AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_PASSWORD, 'false');
    }
  } catch (error) {
    console.error('Save credentials error:', error);
    throw error;
  }
};

// 获取保存的账号密码
export const getSavedCredentials = async (): Promise<{
  username: string | null;
  password: string | null;
  remember: boolean;
}> => {
  try {
    const username = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_USERNAME);
    const remember = await AsyncStorage.getItem(STORAGE_KEYS.REMEMBER_PASSWORD);
    const password =
      remember === 'true'
        ? await AsyncStorage.getItem(STORAGE_KEYS.SAVED_PASSWORD)
        : null;

    return {
      username,
      password,
      remember: remember === 'true',
    };
  } catch (error) {
    console.error('Get saved credentials error:', error);
    return {
      username: null,
      password: null,
      remember: false,
    };
  }
};

// 清除保存的账号密码
export const clearSavedCredentials = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.SAVED_USERNAME);
    await AsyncStorage.removeItem(STORAGE_KEYS.SAVED_PASSWORD);
    await AsyncStorage.removeItem(STORAGE_KEYS.REMEMBER_PASSWORD);
  } catch (error) {
    console.error('Clear saved credentials error:', error);
    throw error;
  }
};

// 获取应用配置
export const getAppSettings = async (): Promise<AppSettings> => {
  try {
    const settingsJson = await AsyncStorage.getItem(STORAGE_KEYS.APP_SETTINGS);
    if (settingsJson) {
      const settings = JSON.parse(settingsJson);
      // 合并默认配置，确保新增配置项有默认值
      return {...DEFAULT_SETTINGS, ...settings};
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Get app settings error:', error);
    return DEFAULT_SETTINGS;
  }
};

// 保存应用配置
export const saveAppSettings = async (settings: AppSettings): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.APP_SETTINGS, JSON.stringify(settings));
  } catch (error) {
    console.error('Save app settings error:', error);
    throw error;
  }
};

// 更新单个配置项
export const updateAppSetting = async <K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<void> => {
  try {
    const settings = await getAppSettings();
    settings[key] = value;
    await saveAppSettings(settings);
  } catch (error) {
    console.error('Update app setting error:', error);
    throw error;
  }
};
