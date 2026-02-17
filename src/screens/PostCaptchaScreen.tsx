import React, {useRef, useState} from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
} from 'react-native';
import {WebView} from 'react-native-webview';

interface PostCaptchaScreenProps {
  onCaptchaSuccess: (ticket: string, randstr: string) => void;
  onCancel: () => void;
  captchaId?: string; // 可选，如果不传则使用默认的发帖ID
}

/**
 * 发帖/点赞通用的验证码组件
 * 
 * - 发帖 captcha_id：ade4a85345062fda4657d64aa3206cba
 * - 点赞 captcha_id：3a6990c763f90e33fa62a97faad3a05f
 * - 登录 captcha_id：b01299f3ff24047dc399e650eec51a81
 */
const PostCaptchaScreen: React.FC<PostCaptchaScreenProps> = ({
  onCaptchaSuccess,
  onCancel,
  captchaId,
}) => {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const sdkReadyRef = useRef(false);

  // 默认使用发帖 ID，如果传入了 captchaId 则使用传入的
  const GEETEST_CAPTCHA_ID = captchaId || 'ade4a85345062fda4657d64aa3206cba';

  const captchaHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>人机验证</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: transparent !important;
      overflow: hidden;
    }
    #loading-box {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #666;
      font-size: 14px;
      text-align: center;
      background: rgba(255,255,255,0.8);
      padding: 20px;
      border-radius: 8px;
    }
    #manual-btn {
      display: none;
      margin-top: 10px;
      padding: 10px 20px;
      background: #007AFF;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    /* 强制极验弹窗居中且显示在最上层 */
    .geetest_popup_ghost, .geetest_popup_wrap, .geetest_panel {
      z-index: 9999999 !important;
      position: fixed !important;
    }
  </style>
</head>
<body>
  <div id="loading-box">
    <div id="status-text">验证码加载中...</div>
    <button id="manual-btn" onclick="captchaObj && captchaObj.showCaptcha()">手动点击触发验证</button>
  </div>
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
        captchaId: '${GEETEST_CAPTCHA_ID}',
        product: 'bind', // 使用 bind 模式并手动 call showCaptcha
        language: 'zho',
        protocol: 'https://',
        hideSuccess: true
      }, function(captchaObj) {
        window.captchaObj = captchaObj;
        document.getElementById('loading-box').style.display = 'none';
        
        captchaObj.onReady(function() {
          sendMessage('log', { message: '极验准备就绪' });
          sendMessage('sdkReady', { ready: true });
          
          // 如果 2秒后还没显示，显示手动按钮
          setTimeout(function() {
            document.getElementById('status-text').innerHTML = '如果验证码未弹出，请点击下方按钮';
            document.getElementById('manual-btn').style.display = 'block';
          }, 2000);

          // 关键：延迟显示以确保 DOM 渲染完成
          setTimeout(function() {
            try {
              sendMessage('log', { message: '正在调用 showCaptcha' });
              captchaObj.showCaptcha();
            } catch (e) {
              sendMessage('log', { message: '调用失败: ' + e.message });
            }
          }, 300);
        }).onSuccess(function() {
          var result = captchaObj.getValidate();
          if (result) {
            sendMessage('captchaSuccess', {
              ...result,
              ticket: result.lot_number + '|' + result.captcha_output + '|' + result.pass_token + '|' + result.gen_time,
              randstr: result.lot_number
            });
          }
        }).onClose(function() {
          sendMessage('captchaCancelled', {});
        }).onError(function(e) {
          sendMessage('log', { message: '极验错误: ' + (e.message || '未知') });
          sendMessage('sdkError', { error: e.message || '验证码加载失败' });
        });
      });
    }
    
    // 确保脚本执行
    if (document.readyState === 'complete') {
      initGeetest();
    } else {
      window.onload = initGeetest;
    }
  </script>
</body>
</html>
  `;

  const handleMessage = (event: any) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'log') {
        return;
      }
      
      switch (message.type) {
        case 'sdkReady':
          if (!sdkReadyRef.current) {
            sdkReadyRef.current = true;
            // 延迟一点关闭加载层，确保 WebView 内容能显示出来
            setTimeout(() => setLoading(false), 500);
          }
          break;
        case 'captchaSuccess':
          onCaptchaSuccess(message.data.ticket, message.data.randstr);
          break;
        case 'captchaCancelled':
          onCancel();
          break;
        case 'sdkError':
          setLoading(false);
          break;
      }
    } catch (e) {
      console.error('Parse message error:', e);
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{html: captchaHtml, baseUrl: 'https://wap.newsmth.net'}}
        style={styles.webview}
        containerStyle={styles.webviewContainer}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onMessage={handleMessage}
        scrollEnabled={false}
      />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>安全检测中...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  webviewContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#333',
  },
});

export default PostCaptchaScreen;
