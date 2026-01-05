// 腾讯验证码服务
// 参考: https://ssl.captcha.qq.com/TCaptcha.js

/**
 * 检测页面是否使用腾讯验证码
 */
export const checkTencentCaptcha = `
  (function() {
    // 检查是否加载了腾讯验证码 SDK
    const hasTencentCaptcha = typeof window.TencentCaptcha !== 'undefined' || 
                               typeof window.AqSCode !== 'undefined' ||
                               document.querySelector('script[src*="captcha.qq.com"]') !== null ||
                               document.querySelector('script[src*="TCaptcha"]') !== null ||
                               document.querySelector('#TencentCaptcha') !== null;
    
    // 检查是否有验证码相关的元素
    const captchaElements = document.querySelectorAll('[id*="captcha"], [class*="captcha"], [id*="TencentCaptcha"]');
    
    return {
      hasTencentCaptcha: hasTencentCaptcha || captchaElements.length > 0,
      captchaElements: captchaElements.length,
      sdkLoaded: typeof window.TencentCaptcha !== 'undefined'
    };
  })();
  true;
`;

/**
 * 初始化腾讯验证码
 * @param appId 腾讯验证码 AppID（如果需要）
 */
export const initTencentCaptcha = (appId?: string) => `
  (function() {
    try {
      // 检查是否已加载腾讯验证码 SDK
      if (typeof window.TencentCaptcha === 'undefined') {
        // 尝试加载 SDK
        const script = document.createElement('script');
        script.src = 'https://ssl.captcha.qq.com/TCaptcha.js';
        script.onload = function() {
          console.log('Tencent Captcha SDK loaded');
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'tencentCaptchaReady',
            data: {ready: true}
          }));
        };
        script.onerror = function() {
          console.error('Failed to load Tencent Captcha SDK');
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'tencentCaptchaReady',
            data: {ready: false, error: 'SDK load failed'}
          }));
        };
        document.head.appendChild(script);
      } else {
        // SDK 已加载
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'tencentCaptchaReady',
          data: {ready: true}
        }));
      }
    } catch (e) {
      console.error('Init Tencent Captcha error:', e);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'tencentCaptchaReady',
        data: {ready: false, error: e.message}
      }));
    }
  })();
  true;
`;

/**
 * 触发腾讯验证码显示
 * @param appId 腾讯验证码 AppID（从页面获取或使用默认值）
 */
export const showTencentCaptcha = (appId?: string) => `
  (function() {
    try {
      // 尝试从页面获取 AppID
      let captchaAppId = '${appId || ''}';
      
      // 从页面元素或脚本中提取 AppID
      if (!captchaAppId) {
        const scripts = document.querySelectorAll('script');
        for (let script of scripts) {
          const text = script.textContent || script.innerHTML;
          const match = text.match(/TencentCaptcha\\s*\\(\\s*['"]([^'"]+)['"]/);
          if (match) {
            captchaAppId = match[1];
            break;
          }
        }
      }
      
      // 如果找到了 AppID 且 SDK 已加载
      if (captchaAppId && typeof window.TencentCaptcha !== 'undefined') {
        // 创建验证码实例
        const captcha = new window.TencentCaptcha(captchaAppId, function(res) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'tencentCaptchaResult',
            data: {
              ret: res.ret,
              ticket: res.ticket,
              randstr: res.randstr,
              appid: res.appid,
              errorCode: res.errorCode,
              errorMessage: res.errorMessage
            }
          }));
        });
        
        // 显示验证码
        captcha.show();
      } else {
        // 尝试自动绑定到页面上的按钮
        const captchaBtn = document.getElementById('TencentCaptcha') || 
                          document.querySelector('[id*="captcha"]') ||
                          document.querySelector('[class*="captcha"]');
        
        if (captchaBtn) {
          // 触发点击事件
          captchaBtn.click();
        } else {
          // 如果找不到按钮，尝试查找并触发验证码
          const event = new Event('click', {bubbles: true});
          const elements = document.querySelectorAll('button, a, div[onclick]');
          for (let el of elements) {
            if (el.textContent && (el.textContent.includes('验证') || el.textContent.includes('captcha'))) {
              el.dispatchEvent(event);
              break;
            }
          }
        }
        
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'tencentCaptchaTriggered',
          data: {triggered: true}
        }));
      }
    } catch (e) {
      console.error('Show Tencent Captcha error:', e);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'tencentCaptchaError',
        data: {error: e.message}
      }));
    }
  })();
  true;
`;

/**
 * 检查页面中的腾讯验证码 AppID
 */
export const getTencentCaptchaAppId = `
  (function() {
    try {
      // 从脚本中提取 AppID
      const scripts = document.querySelectorAll('script');
      for (let script of scripts) {
        const text = script.textContent || script.innerHTML;
        // 匹配 TencentCaptcha('appid', ...)
        const match = text.match(/TencentCaptcha\\s*\\(\\s*['"]([^'"]+)['"]/);
        if (match) {
          return match[1];
        }
        // 匹配其他可能的格式
        const match2 = text.match(/appid\\s*[:=]\\s*['"]([^'"]+)['"]/);
        if (match2) {
          return match2[1];
        }
      }
      
      // 从全局变量中获取
      if (window.__TencentCaptchaOpts__ && window.__TencentCaptchaOpts__.appid) {
        return window.__TencentCaptchaOpts__.appid;
      }
      
      return null;
    } catch (e) {
      console.error('Get AppID error:', e);
      return null;
    }
  })();
  true;
`;

/**
 * 自动处理腾讯验证码（尝试自动触发）
 */
export const autoHandleTencentCaptcha = `
  (function() {
    try {
      // 等待页面加载完成
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
          setTimeout(handleCaptcha, 1000);
        });
      } else {
        setTimeout(handleCaptcha, 1000);
      }
      
      function handleCaptcha() {
        // 查找验证码按钮
        const captchaBtn = document.getElementById('TencentCaptcha') || 
                          document.querySelector('button[id*="captcha"]') ||
                          document.querySelector('a[id*="captcha"]') ||
                          document.querySelector('[onclick*="captcha"]') ||
                          document.querySelector('[class*="captcha-btn"]');
        
        if (captchaBtn) {
          // 触发点击
          captchaBtn.click();
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'tencentCaptchaAutoTriggered',
            data: {success: true}
          }));
        } else {
          // 尝试通过 TencentCaptcha API
          if (typeof window.TencentCaptcha !== 'undefined') {
            // 需要 AppID，暂时无法自动触发
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'tencentCaptchaAutoTriggered',
              data: {success: false, reason: 'Need AppID'}
            }));
          } else {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'tencentCaptchaAutoTriggered',
              data: {success: false, reason: 'SDK not loaded'}
            }));
          }
        }
      }
    } catch (e) {
      console.error('Auto handle captcha error:', e);
    }
  })();
  true;
`;

