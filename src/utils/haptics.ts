// 轻量触感反馈封装
// 当前使用 React Native 内置 Vibration（零依赖）。
// 若后续引入 react-native-haptic-feedback，可在此处替换实现而不改动调用方。
import {Vibration, Platform} from 'react-native';

// iOS 上短促振动模拟「轻点」反馈；Android 给出对应时长。
const lightPattern = Platform.OS === 'ios' ? 10 : 15;
const mediumPattern = Platform.OS === 'ios' ? 20 : 30;
const successPattern = Platform.OS === 'ios' ? [0, 15, 60, 25] : [0, 20, 50, 30];

/** 轻量点击反馈：用于点赞、切换、按钮按下 */
export const impactLight = (): void => {
  try {
    Vibration.vibrate(lightPattern);
  } catch {}
};

/** 中等反馈：用于较重的操作，如扔鸡蛋落地、长按触发 */
export const impactMedium = (): void => {
  try {
    Vibration.vibrate(mediumPattern);
  } catch {}
};

/** 成功通知反馈：用于发帖/回复/评分提交成功 */
export const notifySuccess = (): void => {
  try {
    Vibration.vibrate(successPattern);
  } catch {}
};

export default {impactLight, impactMedium, notifySuccess};
