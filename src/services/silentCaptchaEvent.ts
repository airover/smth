/**
 * 静默验证码事件通信模块
 * 
 * 用于 auth.ts（服务层）和 SilentCaptchaWebView（UI 组件）之间的通信：
 * 1. auth.ts 发起请求 → SilentCaptchaWebView 加载极验 SDK 完成无感验证
 * 2. SilentCaptchaWebView 返回验证结果 → auth.ts 继续登录流程
 */

type CaptchaResult = {
  success: boolean;
  captchaParams?: {
    captcha_id: string;
    lot_number: string;
    captcha_output: string;
    pass_token: string;
    gen_time: string;
  };
  error?: string;
};

type CaptchaRequestCallback = (result: CaptchaResult) => void;

// 当前等待中的验证码请求回调
let pendingCallback: CaptchaRequestCallback | null = null;

// UI 组件注册的处理器（当收到请求时触发 WebView 加载）
let requestHandler: (() => void) | null = null;

/**
 * 【服务层调用】请求静默验证码
 * 返回一个 Promise，在验证完成或超时后 resolve
 * @param timeoutMs 超时时间（毫秒），超时后静默放弃
 */
export const requestSilentCaptcha = (timeoutMs: number = 15000): Promise<CaptchaResult> => {
  return new Promise((resolve) => {
    // 如果已有等待中的请求，直接返回失败
    if (pendingCallback) {
      resolve({ success: false, error: '已有验证码请求进行中' });
      return;
    }

    // 设置超时
    const timer = setTimeout(() => {
      if (pendingCallback) {
        console.log('[静默验证码] ⏰ 超时，静默放弃');
        pendingCallback = null;
        resolve({ success: false, error: '验证码超时' });
      }
    }, timeoutMs);

    // 注册回调
    pendingCallback = (result: CaptchaResult) => {
      clearTimeout(timer);
      pendingCallback = null;
      resolve(result);
    };

    // 通知 UI 组件开始加载验证码
    if (requestHandler) {
      requestHandler();
    } else {
      // UI 组件未注册，直接返回失败
      clearTimeout(timer);
      pendingCallback = null;
      resolve({ success: false, error: '静默验证码组件未就绪' });
    }
  });
};

/**
 * 【UI 组件调用】注册请求处理器
 * SilentCaptchaWebView 在挂载时调用，注册自己为处理器
 */
export const registerCaptchaHandler = (handler: () => void): (() => void) => {
  requestHandler = handler;
  return () => {
    // 返回取消注册函数
    if (requestHandler === handler) {
      requestHandler = null;
    }
  };
};

/**
 * 【UI 组件调用】提交验证码结果
 * SilentCaptchaWebView 在验证完成后调用
 */
export const submitCaptchaResult = (result: CaptchaResult): void => {
  if (pendingCallback) {
    pendingCallback(result);
  }
};
