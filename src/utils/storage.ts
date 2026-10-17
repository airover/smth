// 本地存储工具函数
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import {AppSettings} from '../types';

export const STORAGE_KEYS = {
  SAVED_USERNAME: 'saved_username',
  SAVED_PASSWORD: 'saved_password', // 旧版明文密码，仅用于迁移
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
  autoResumeReading: true,
};

// ==================== 账号密码 ====================
// 密码按账号存入 Keychain，切换账号后 M 站静默重登等流程能取到当前账号自己的密码。
// AsyncStorage 只保留上次登录的用户名，用于登录页预填。

const PASSWORD_SERVICE_PREFIX = 'smth.password.';

const credentialIdentity = (username: string): string => username.trim().toLowerCase();

const passwordService = (username: string): string =>
  `${PASSWORD_SERVICE_PREFIX}${encodeURIComponent(credentialIdentity(username))}`;

const readPassword = async (username: string): Promise<string | null> => {
  const entry = await Keychain.getGenericPassword({service: passwordService(username)});
  return entry ? entry.password : null;
};

const writePassword = async (username: string, password: string): Promise<void> => {
  const result = await Keychain.setGenericPassword(credentialIdentity(username), password, {
    service: passwordService(username),
    // M 站静默重登可能在后台触发，首次解锁后即可读取。
    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  if (!result) throw new Error('SAVE_PASSWORD_FAILED');
};

let legacyMigration: Promise<void> | null = null;

/** 把旧版全局明文密码迁入对应账号的 Keychain 条目，成功后删除明文。 */
const migrateLegacyCredentials = (): Promise<void> => {
  if (!legacyMigration) {
    legacyMigration = (async () => {
      const [legacyUsername, legacyPassword, legacyRemember] = await AsyncStorage.multiGet([
        STORAGE_KEYS.SAVED_USERNAME,
        STORAGE_KEYS.SAVED_PASSWORD,
        STORAGE_KEYS.REMEMBER_PASSWORD,
      ]).then(entries => entries.map(([, value]) => value));
      if (legacyPassword === null) return;
      if (legacyUsername?.trim() && legacyRemember === 'true' && !(await readPassword(legacyUsername))) {
        await writePassword(legacyUsername, legacyPassword);
      }
      await AsyncStorage.removeItem(STORAGE_KEYS.SAVED_PASSWORD);
    })().catch(error => {
      // 失败时保留明文，下次再试。
      legacyMigration = null;
      console.error('Migrate legacy credentials error:', error);
    });
  }
  return legacyMigration;
};

// 保存账号密码（只影响该账号自己的记录）
export const saveCredentials = async (
  username: string,
  password: string,
  remember: boolean,
): Promise<void> => {
  try {
    const name = username.trim();
    if (!name) return;
    await migrateLegacyCredentials();
    if (remember && password) {
      await writePassword(name, password);
    } else {
      await Keychain.resetGenericPassword({service: passwordService(name)});
    }
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.SAVED_USERNAME, name],
      [STORAGE_KEYS.REMEMBER_PASSWORD, remember ? 'true' : 'false'],
    ]);
  } catch (error) {
    console.error('Save credentials error:', error);
    throw error;
  }
};

/**
 * 获取保存的账号密码。
 * 传入 username 时只返回该账号的记录；不传时返回上次登录的账号。
 */
export const getSavedCredentials = async (username?: string | null): Promise<{
  username: string | null;
  password: string | null;
  remember: boolean;
}> => {
  try {
    await migrateLegacyCredentials();
    const [lastUsername, lastRemember] = await AsyncStorage.multiGet([
      STORAGE_KEYS.SAVED_USERNAME,
      STORAGE_KEYS.REMEMBER_PASSWORD,
    ]).then(entries => entries.map(([, value]) => value));
    const target = username === undefined ? lastUsername?.trim() || null : username?.trim() || null;
    if (!target) {
      return {username: null, password: null, remember: lastRemember === 'true'};
    }
    const password = await readPassword(target);
    return {
      username: target,
      password,
      // 有记录说明该账号勾选过记住密码；没有记录时沿用上次的勾选习惯。
      remember: !!password || (username === undefined && lastRemember === 'true'),
    };
  } catch (error) {
    console.error('Get saved credentials error:', error);
    return {
      username: username?.trim() || null,
      password: null,
      remember: false,
    };
  }
};

// 清除保存的账号密码：传入 username 时只清除该账号，否则清除上次登录账号的记录
export const clearSavedCredentials = async (username?: string): Promise<void> => {
  try {
    await migrateLegacyCredentials();
    const lastUsername = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_USERNAME);
    const target = username?.trim() || lastUsername?.trim();
    if (target) await Keychain.resetGenericPassword({service: passwordService(target)});
    if (!username || (lastUsername && credentialIdentity(lastUsername) === credentialIdentity(username))) {
      await AsyncStorage.multiRemove([STORAGE_KEYS.SAVED_USERNAME, STORAGE_KEYS.REMEMBER_PASSWORD]);
    }
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
