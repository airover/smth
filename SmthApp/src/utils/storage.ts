// 本地存储工具函数
import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEYS = {
  SAVED_USERNAME: 'saved_username',
  SAVED_PASSWORD: 'saved_password',
  REMEMBER_PASSWORD: 'remember_password',
  IS_LOGGED_IN: 'isLoggedIn',
  USERNAME: 'username',
  COOKIES: 'cookies',
  FAVORITE_BOARDS: 'favoriteBoards',
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

