import {NativeModules} from 'react-native';

interface NativeAppInfo {
  appVersion?: string | null;
}

const appInfo = NativeModules.AppInfo as NativeAppInfo | undefined;

export const APP_VERSION = appInfo?.appVersion || '未知';
