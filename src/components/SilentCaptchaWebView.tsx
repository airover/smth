/**
 * 静默优先验证 WebView：按调用方指定的 GeeTest ID 做限时尝试。
 * 仅 SDK 正常返回票据时报告成功；交互挑战无法在隐藏 WebView 中完成，
 * 超时/错误会返回失败，由发帖/回复流程切换到可见验证码界面。
 */
import React, {useRef, useState, useEffect, useCallback} from 'react';
import {View, StyleSheet} from 'react-native';
import {WebView} from 'react-native-webview';
import {
  DEFAULT_LOGIN_CAPTCHA_ID,
  registerCaptchaHandler,
  submitCaptchaResult,
} from '../services/silentCaptchaEvent';
import type {SilentCaptchaRequest} from '../services/silentCaptchaEvent';

const SilentCaptchaWebView: React.FC = () => {
  const webViewRef = useRef<WebView>(null);
  // active 为 true 时才渲染 WebView（按需加载，避免常驻占用资源）
  const [active, setActive] = useState(false);
  const [activeRequest, setActiveRequest] = useState<SilentCaptchaRequest>({
    captchaId: DEFAULT_LOGIN_CAPTCHA_ID,
    timeoutMs: 15000,
  });
  // 用于强制重新创建 WebView（每次请求都用全新的 WebView）
  const [webViewKey, setWebViewKey] = useState(0);

  // 注册为验证码请求处理器；超时/离开流程时可立即销毁隐藏 WebView。
  useEffect(() => {
    const unregister = registerCaptchaHandler(
      request => {
        console.log('[静默验证码WebView] 收到验证码请求，激活 WebView');
        setActiveRequest(request);
        setWebViewKey(prev => prev + 1); // 强制重新创建
        setActive(true);
      },
      () => setActive(false),
    );
    return unregister;
  }, []);

  // 隐藏验证限时尝试；无感通过则返回票据，交互/超时则立即回退到可见验证。
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      console.log('[静默验证码WebView] 静默尝试超时，回退到可见验证');
      submitCaptchaResult({success: false, error: '静默验证超时'});
      setActive(false);
    }, Math.max(0, activeRequest.timeoutMs - 250));
    return () => clearTimeout(timer);
  }, [active, activeRequest.timeoutMs, webViewKey]);

  const handleMessage = useCallback((event: any) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      if (message.type === 'log') {
        console.log('[静默验证码WebView] 日志:', message.data?.message);
        return;
      }

      switch (message.type) {
        case 'captchaSuccess': {
          const data = message.data;
          console.log('[静默验证码WebView] ✅ 极验无感验证成功');
          submitCaptchaResult({
            success: true,
            captchaParams: {
              captcha_id: activeRequest.captchaId,
              lot_number: data.lot_number,
              captcha_output: data.captcha_output,
              pass_token: data.pass_token,
              gen_time: data.gen_time,
            },
          });
          // 验证完成，销毁 WebView
          setActive(false);
          break;
        }
        case 'captchaCancelled':
          // 极验被关闭（不应该发生在静默模式下，但做防御）
          console.log('[静默验证码WebView] 验证被关闭');
          submitCaptchaResult({ success: false, error: '验证被关闭' });
          setActive(false);
          break;
        case 'sdkError':
          console.log('[静默验证码WebView] SDK 错误:', message.data?.error);
          submitCaptchaResult({ success: false, error: message.data?.error || 'SDK 错误' });
          setActive(false);
          break;
        case 'sdkReady':
          console.log('[静默验证码WebView] 极验 SDK 就绪');
          break;
      }
    } catch (e) {
      console.error('[静默验证码WebView] 解析消息失败:', e);
    }
  }, [activeRequest.captchaId]);

  // 静默模式的极验 HTML：和 CaptchaScreen 类似，但去掉所有 UI 元素
  const silentCaptchaHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    html, body { margin: 0; padding: 0; width: 0; height: 0; overflow: hidden; }
    /* 隐藏极验的所有弹窗 UI，防止渲染开销 */
    .geetest_popup_ghost, .geetest_popup_wrap, .geetest_panel,
    .geetest_wind, .geetest_holder { 
      opacity: 0 !important; 
      pointer-events: none !important;
    }
  </style>
</head>
<body>
  <script src="https://static.geetest.com/v4/gt4.js"></script>
  <script>
    function sendMessage(type, data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, data: data }));
      }
    }

    function initGeetest() {
      if (typeof initGeetest4 === 'undefined') {
        setTimeout(initGeetest, 300);
        return;
      }

      initGeetest4({
        captchaId: '${activeRequest.captchaId}',
        product: 'bind',
        language: 'zho',
        protocol: 'https://',
        hideSuccess: true
      }, function(captchaObj) {
        window.captchaObj = captchaObj;

        captchaObj.onReady(function() {
          sendMessage('sdkReady', { ready: true });
          // 立即触发验证
          setTimeout(function() {
            try {
              captchaObj.showCaptcha();
            } catch (e) {
              sendMessage('log', { message: '调用 showCaptcha 失败: ' + e.message });
            }
          }, 200);
        }).onSuccess(function() {
          var result = captchaObj.getValidate();
          if (result) {
            sendMessage('captchaSuccess', {
              lot_number: result.lot_number,
              captcha_output: result.captcha_output,
              pass_token: result.pass_token,
              gen_time: result.gen_time
            });
          }
        }).onClose(function() {
          sendMessage('captchaCancelled', {});
        }).onError(function(e) {
          sendMessage('sdkError', { error: e.message || '验证码加载失败' });
        });
      });
    }

    if (document.readyState === 'complete') {
      initGeetest();
    } else {
      window.onload = initGeetest;
    }
  </script>
</body>
</html>
  `;

  if (!active) {
    return null; // 不活跃时不渲染任何内容
  }

  return (
    <View style={styles.container} pointerEvents="none">
      <WebView
        key={webViewKey}
        ref={webViewRef}
        source={{html: silentCaptchaHtml, baseUrl: 'https://wap.newsmth.net'}}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onMessage={handleMessage}
        // 完全不可见，不可交互
        scrollEnabled={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
    overflow: 'hidden',
  },
  webview: {
    width: 1,
    height: 1,
    opacity: 0,
  },
});

export default SilentCaptchaWebView;
