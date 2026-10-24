/**
 * 静默验证码事件通信模块。
 * 登录、发帖/回复可指定各自的 GeeTest ID 和超时；静默通过时返回服务端票据，
 * 失败/超时由调用方决定是否打开可交互的验证码界面。
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

export const DEFAULT_LOGIN_CAPTCHA_ID = 'b01299f3ff24047dc399e650eec51a81';

export type SilentCaptchaRequest = {
  captchaId: string;
  timeoutMs: number;
};

type CaptchaRequestCallback = (result: CaptchaResult) => void;
type CaptchaRequestHandler = (request: SilentCaptchaRequest) => void;

// 当前等待中的验证码请求回调
let pendingCallback: CaptchaRequestCallback | null = null;

// UI 组件注册的处理器（当收到请求时触发 WebView 加载）
let requestHandler: CaptchaRequestHandler | null = null;
let cancelActiveRequest: (() => void) | null = null;

/**
 * 【服务层调用】请求静默验证码
 * 返回一个 Promise，在验证完成或超时后 resolve
 * @param timeoutMs 超时时间（毫秒），超时后回退到可见验证
 * @param captchaId 当前操作对应的 GeeTest ID；缺省为 M 站登录验证码
 */
export const requestSilentCaptcha = (
  timeoutMs: number = 15000,
  captchaId: string = DEFAULT_LOGIN_CAPTCHA_ID,
): Promise<CaptchaResult> => {
  return new Promise((resolve) => {
    // 如果已有等待中的请求，直接返回失败
    if (pendingCallback) {
      resolve({ success: false, error: '已有验证码请求进行中' });
      return;
    }

    // 设置超时
    const timer = setTimeout(() => {
      if (pendingCallback) {
        console.log('[静默验证码] ⏰ 超时，回退到可见验证');
        pendingCallback({ success: false, error: '验证码超时' });
        cancelActiveRequest?.();
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
      requestHandler({ captchaId, timeoutMs });
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
export const registerCaptchaHandler = (
  handler: CaptchaRequestHandler,
  cancelHandler: () => void,
): (() => void) => {
  requestHandler = handler;
  cancelActiveRequest = cancelHandler;
  return () => {
    // 返回取消注册函数
    if (requestHandler === handler) {
      requestHandler = null;
      cancelActiveRequest = null;
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
