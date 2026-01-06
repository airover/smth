import React, {useState, useRef, useEffect} from 'react';
import {
  Modal,
  View,
  Image,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  StatusBar,
  SafeAreaView,
  ScrollView,
} from 'react-native';

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

interface ImageViewerProps {
  visible: boolean;
  imageUri: string;
  onClose: () => void;
}

const ImageViewer: React.FC<ImageViewerProps> = ({visible, imageUri, onClose}) => {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [imageSize, setImageSize] = useState({width: 0, height: 0});
  const scrollViewRef = useRef<ScrollView>(null);
  const lastTapRef = useRef<number>(0);
  const [scrollViewKey, setScrollViewKey] = useState(0); // 用于强制重建ScrollView以重置缩放
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null); // 加载超时定时器
  const imageSizeCacheRef = useRef<Map<string, {width: number; height: number}>>(new Map()); // 缓存图片尺寸

  // 当visible或imageUri改变时重置状态
  useEffect(() => {
    if (visible && imageUri) {
      // 重建ScrollView以重置缩放状态
      setScrollViewKey(Date.now());
      
      // 检查缓存中是否有该图片的尺寸信息
      const cachedSize = imageSizeCacheRef.current.get(imageUri);
      
      if (cachedSize) {
        // 有缓存，直接使用缓存的尺寸，不需要loading
        setImageSize(cachedSize);
        setFailed(false);
        setLoading(false);
      } else {
        // 没有缓存，需要等待加载完成
        setLoading(true);
        setFailed(false);
        setImageSize({width: 0, height: 0});
        
        // 只有在没有缓存时才设置超时保护
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
        }
        loadingTimeoutRef.current = setTimeout(() => {
          setLoading(false);
          setFailed(true);
        }, 10000);
      }
      
      lastTapRef.current = 0;
    }
    
    // 清理函数
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    };
  }, [visible, imageUri]);

  // 当scrollViewKey变化时，重置滚动位置
  useEffect(() => {
    if (scrollViewKey && scrollViewRef.current) {
      // 延迟执行以确保ScrollView已经重建
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({x: 0, y: 0, animated: false});
      }, 100);
    }
  }, [scrollViewKey]);

  const handleClose = () => {
    onClose();
  };

  const handleImageLoadStart = () => {
    // 不在这里设置loading，由useEffect统一管理
  };

  const handleImageLoad = (event: any) => {
    // 清除加载超时定时器
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    
    const {width, height} = event.nativeEvent.source;
    const size = {width, height};
    setImageSize(size);
    
    // 缓存图片尺寸
    imageSizeCacheRef.current.set(imageUri, size);
    
    setLoading(false);
    setFailed(false);
  };

  const handleImageLoadEnd = () => {
    // 清除超时定时器
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    // onLoadEnd一定会触发，作为最终的fallback确保loading被关闭
    // 使用短延迟确保onLoad有机会先执行（onLoad会设置正确的imageSize）
    setTimeout(() => {
      setLoading(false);
    }, 50);
  };

  const handleImageError = () => {
    // 清除加载超时定时器
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    
    setLoading(false);
    setFailed(true);
  };

  // 双击检测函数
  const handleDoubleTap = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300; // 300ms内的两次点击视为双击

    if (lastTapRef.current && now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // 双击触发关闭
      lastTapRef.current = 0;
      handleClose();
    } else {
      // 记录第一次点击时间
      lastTapRef.current = now;
    }
  };

  // 计算图片显示尺寸，保持原始比例
  const getImageDisplaySize = () => {
    if (!imageSize.width || !imageSize.height) {
      return {width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.8};
    }

    const imageAspectRatio = imageSize.width / imageSize.height;

    // 始终按屏幕宽度显示，保持宽高比
    // 这样超长图可以通过滚动查看
    let displayWidth = SCREEN_WIDTH;
    let displayHeight = SCREEN_WIDTH / imageAspectRatio;

    // 如果图片是横向的（宽度大于高度），并且计算出的高度小于屏幕高度的50%
    // 则按屏幕高度的90%来显示，以获得更好的视觉效果
    if (imageAspectRatio > 1 && displayHeight < SCREEN_HEIGHT * 0.5) {
      displayHeight = SCREEN_HEIGHT * 0.9;
      displayWidth = displayHeight * imageAspectRatio;
      // 如果宽度超过屏幕，则回退到按宽度显示
      if (displayWidth > SCREEN_WIDTH) {
        displayWidth = SCREEN_WIDTH;
        displayHeight = SCREEN_WIDTH / imageAspectRatio;
      }
    }

    return {width: displayWidth, height: displayHeight};
  };

  const displaySize = getImageDisplaySize();

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent={true}>
      <StatusBar backgroundColor="rgba(0,0,0,0.9)" barStyle="light-content" />
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <TouchableOpacity style={styles.closeButtonArea} onPress={handleClose}>
            <View style={styles.closeButton}>
              <View style={styles.closeIcon}>
                <View style={styles.closeLine1} />
                <View style={styles.closeLine2} />
              </View>
            </View>
          </TouchableOpacity>
        </SafeAreaView>

        <View style={styles.backgroundArea}>
          <ScrollView
            key={scrollViewKey}
            ref={scrollViewRef}
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            maximumZoomScale={3}
            minimumZoomScale={1}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            centerContent={true}
            bounces={false}
            bouncesZoom={true}>
            <Pressable 
              style={styles.imageContainer}
              onPress={handleDoubleTap}>
              {/* 图片容器：固定尺寸，确保布局稳定 */}
              <View style={displaySize}>
                {/* 图片始终存在，通过opacity控制可见性 */}
                <Image
                  key={imageUri}
                  source={{uri: imageUri}}
                  style={[styles.image, displaySize, {opacity: failed ? 0 : loading ? 0 : 1}]}
                  resizeMode="contain"
                  onLoadStart={handleImageLoadStart}
                  onLoad={handleImageLoad}
                  onLoadEnd={handleImageLoadEnd}
                  onError={handleImageError}
                />
                {/* Loading指示器：绝对定位，居中显示 */}
                {loading && !failed && (
                  <View style={styles.overlayContainer}>
                    <ActivityIndicator size="large" color="#fff" />
                  </View>
                )}
                {/* 错误状态：绝对定位，居中显示 */}
                {failed && (
                  <View style={styles.overlayContainer}>
                    <View style={styles.errorIcon}>
                      <View style={styles.errorIconInner} />
                    </View>
                  </View>
                )}
              </View>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  backgroundArea: {
    flex: 1,
  },
  safeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  closeButtonArea: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
  },
  closeIcon: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeLine1: {
    position: 'absolute',
    width: 16,
    height: 2,
    backgroundColor: '#fff',
    transform: [{rotate: '45deg'}],
  },
  closeLine2: {
    position: 'absolute',
    width: 16,
    height: 2,
    backgroundColor: '#fff',
    transform: [{rotate: '-45deg'}],
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: SCREEN_WIDTH,
    minHeight: SCREEN_HEIGHT,
  },
  image: {
    backgroundColor: 'transparent',
  },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorIconInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
});

export default ImageViewer;