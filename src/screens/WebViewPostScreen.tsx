import React, {useRef, useState, useEffect} from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import {useNavigation, useRoute} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface RouteParams {
  boardId: string;
  boardName?: string;
  reId?: string;
  mode?: 'create' | 'reply';
}

const WebViewPostScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = (route.params as RouteParams) || {};
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [initialUrl] = useState(() => {
    // 构建发帖URL
    let url = `https://wap.newsmth.net/post?boardId=${params.boardId}`;
    if (params.reId) {
      url += `&reid=${params.reId}`;
    }
    return url;
  });

  // 注入Cookie（保持登录状态）
  useEffect(() => {
    const injectCookie = async () => {
      const cookie = await AsyncStorage.getItem('cookie');
      if (cookie && webViewRef.current) {
        // 注入Cookie的JavaScript代码
        const injectedJS = `
          document.cookie = "${cookie}";
          true; // 必须返回true
        `;
        webViewRef.current.injectJavaScript(injectedJS);
      }
    };
    if (webViewRef.current && !loading) {
      injectCookie();
    }
  }, [loading]);

  // 监听导航变化
  const handleNavigationStateChange = (navState: any) => {
    console.log('WebView URL:', navState.url);

    // 检测是否发帖成功（跳转到帖子详情页）
    if (navState.url.includes('/topic/') && !navState.url.includes('/post')) {
      // 成功跳转到帖子详情页
      setTimeout(() => {
        Alert.alert('成功', '发帖成功', [
          {
            text: '确定',
            onPress: () => {
              navigation.goBack();
              // 触发列表刷新
              if (navigation.canGoBack()) {
                navigation.setParams({refresh: Date.now()});
              }
            },
          },
        ]);
      }, 500);
    }

    // 检测是否返回到版面（取消发帖）
    if (
      navState.url.includes('/board/') &&
      !navState.url.includes('/post') &&
      !loading
    ) {
      // 用户取消了发帖
      navigation.goBack();
    }
  };

  // 处理错误
  const handleError = (syntheticEvent: any) => {
    const {nativeEvent} = syntheticEvent;
    console.error('WebView error:', nativeEvent);
    Alert.alert('错误', '页面加载失败，请重试');
  };

  // 处理加载结束
  const handleLoadEnd = () => {
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      )}
      <WebView
        ref={webViewRef}
        source={{uri: initialUrl}}
        onNavigationStateChange={handleNavigationStateChange}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        style={styles.webview}
        sharedCookiesEnabled={true}
        allowsBackForwardNavigationGestures={true}
        domStorageEnabled={true}
        javaScriptEnabled={true}
        startInLoadingState={true}
        // 注入JavaScript（用于日志和调试）
        injectedJavaScript={`
          console.log('WebView loaded for post');
          true;
        `}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    zIndex: 999,
  },
});

export default WebViewPostScreen;
