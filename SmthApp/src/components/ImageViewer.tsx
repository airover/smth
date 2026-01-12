import React, {useState, useRef} from 'react';
import {
  Modal,
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  ActivityIndicator,
  Platform,
  ScrollView,
  Animated,
  PanResponder,
  Share,
  Alert,
  PermissionsAndroid,
  Linking,
} from 'react-native';
import {
  CameraRoll,
  iosReadGalleryPermission,
  iosRequestReadWriteGalleryPermission,
} from '@react-native-camera-roll/camera-roll';
import RNFetchBlob from 'rn-fetch-blob';

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

// 常量定义
const DOUBLE_TAP_DELAY = 300;
const SWIPE_THRESHOLD = 150;
const SWIPE_VELOCITY_THRESHOLD = 0.5;
const MIN_OPACITY = 0.3;
const ZOOM_IN_DURATION = 400;
const ZOOM_OUT_DURATION = 600;
const CLOSE_ANIMATION_DURATION = 200;
const MAX_IMAGE_HEIGHT_RATIO = 0.9;
const DEFAULT_IMAGE_HEIGHT_RATIO = 0.7;

interface ImageViewerProps {
  visible: boolean;
  imageUri: string;
  onClose: () => void;
}

const ImageViewer: React.FC<ImageViewerProps> = ({visible, imageUri, onClose}) => {
  const [loading, setLoading] = useState(true);
  const [imageSize, setImageSize] = useState<{width: number; height: number} | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const lastTap = useRef<number | null>(null);
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (visible && imageUri) {
      setLoading(true);
      setIsZoomed(false);
      translateY.setValue(0);
      opacity.setValue(1);
      zoomScale.setValue(1);
      // 获取图片尺寸
      Image.getSize(
        imageUri,
        (width, height) => {
          setImageSize({width, height});
          setLoading(false);
        },
        () => {
          setLoading(false);
        }
      );
    } else if (!visible) {
      // Modal关闭时清理动画监听器
      cleanupAnimationListener();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, imageUri]);

  // 下滑关闭手势处理
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isZoomed,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // 只在未缩放且垂直滑动时响应
        return !isZoomed && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
          // 根据滑动距离调整透明度
          const newOpacity = Math.max(MIN_OPACITY, 1 - gestureState.dy / SCREEN_HEIGHT);
          opacity.setValue(newOpacity);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // 如果下滑超过阈值或速度足够快，则关闭
        if (gestureState.dy > SWIPE_THRESHOLD || gestureState.vy > SWIPE_VELOCITY_THRESHOLD) {
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: SCREEN_HEIGHT,
              duration: CLOSE_ANIMATION_DURATION,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: CLOSE_ANIMATION_DURATION,
              useNativeDriver: true,
            }),
          ]).start(() => {
            onClose();
          });
        } else {
          // 否则回弹
          Animated.parallel([
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
            }),
            Animated.spring(opacity, {
              toValue: 1,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    })
  ).current;

  // 双击缩放处理
  const zoomScale = useRef(new Animated.Value(1)).current;
  const animationListenerRef = useRef<string | null>(null);

  // 清理动画监听器
  const cleanupAnimationListener = () => {
    if (animationListenerRef.current) {
      zoomScale.removeListener(animationListenerRef.current);
      animationListenerRef.current = null;
    }
  };

  // 组件卸载时清理
  React.useEffect(() => {
    return () => {
      cleanupAnimationListener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDoubleTap = () => {
    const now = Date.now();

    if (lastTap.current && now - lastTap.current < DOUBLE_TAP_DELAY) {
      // 清理之前的监听器
      cleanupAnimationListener();

      // 双击触发
      if (isZoomed) {
        // 缩小到原始大小（使用平滑动画）
        scrollViewRef.current?.scrollTo({x: 0, y: 0, animated: false});
        setIsZoomed(false);
        
        Animated.timing(zoomScale, {
          toValue: 1,
          duration: ZOOM_OUT_DURATION,
          useNativeDriver: false,
        }).start(() => {
          cleanupAnimationListener();
        });
        
        // 监听动画值变化，实时更新 ScrollView 的缩放
        const listenerId = zoomScale.addListener(({value}) => {
          scrollViewRef.current?.setNativeProps({
            zoomScale: value,
          });
        });
        animationListenerRef.current = listenerId;
      } else {
        // 放大到2倍（使用平滑动画）
        setIsZoomed(true);
        Animated.timing(zoomScale, {
          toValue: 2,
          duration: ZOOM_IN_DURATION,
          useNativeDriver: false,
        }).start(() => {
          cleanupAnimationListener();
        });
        
        // 监听动画值变化，实时更新 ScrollView 的缩放
        const listenerId = zoomScale.addListener(({value}) => {
          scrollViewRef.current?.setNativeProps({
            zoomScale: value,
          });
        });
        animationListenerRef.current = listenerId;
      }
      lastTap.current = null;
    } else {
      lastTap.current = now;
    }
  };

  // 请求Android相册权限
  const requestAndroidPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      const apiLevel = Platform.Version;
      
      // Android 13+ (API 33+) 使用新的权限模型
      if (apiLevel >= 33) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
          {
            title: '相册权限',
            message: '需要访问您的相册以保存图片',
            buttonNeutral: '稍后询问',
            buttonNegative: '拒绝',
            buttonPositive: '允许',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        // Android 13以下使用旧的权限
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          {
            title: '存储权限',
            message: '需要访问您的存储以保存图片',
            buttonNeutral: '稍后询问',
            buttonNegative: '拒绝',
            buttonPositive: '允许',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (err) {
      return false;
    }
  };

  // 检查并请求iOS相册权限
  const requestIOSPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'ios') {
      return true;
    }

    try {
      // 检查当前权限状态（使用readWrite检查，这样系统设置中会显示完整选项）
      const permission = await iosReadGalleryPermission('readWrite');
      
      // 只有完全访问权限才能保存新照片
      if (permission === 'granted') {
        return true;
      }

      // 如果是有限访问权限，提示用户需要升级到完全访问
      if (permission === 'limited') {
        return new Promise((resolve) => {
          Alert.alert(
            '需要完全访问权限',
            '当前为"选择的照片"模式，无法保存新照片。请在"设置 > 隐私与安全性 > 照片"中选择"完全访问"',
            [
              {text: '取消', style: 'cancel', onPress: () => resolve(false)},
              {
                text: '去设置',
                onPress: () => {
                  Linking.openSettings();
                  resolve(false);
                },
              },
            ]
          );
        });
      }

      // 如果权限被拒绝或阻止，引导用户去设置
      if (permission === 'denied' || permission === 'blocked') {
        return new Promise((resolve) => {
          Alert.alert(
            '需要相册权限',
            '请在"设置 > 隐私与安全性 > 照片"中允许本应用访问相册',
            [
              {text: '取消', style: 'cancel', onPress: () => resolve(false)},
              {
                text: '去设置',
                onPress: () => {
                  Linking.openSettings();
                  resolve(false);
                },
              },
            ]
          );
        });
      }

      // 首次请求权限，直接请求读写权限（这样系统会显示标准的权限对话框）
      // iOS系统会自动提供"选择照片"、"允许访问所有照片"和"不允许"三个选项
      try {
        const result = await iosRequestReadWriteGalleryPermission();
        // 只有完全访问权限才返回true
        if (result === 'granted') {
          return true;
        } else if (result === 'limited') {
          // 用户选择了"选择照片"，提示需要完全访问
          Alert.alert(
            '需要完全访问权限',
            '您选择了"选择的照片"模式，无法保存新照片。请在"设置 > 隐私与安全性 > 照片"中选择"完全访问"',
            [
              {text: '知道了', style: 'cancel'},
              {
                text: '去设置',
                onPress: () => {
                  Linking.openSettings();
                },
              },
            ]
          );
          return false;
        } else {
          return false;
        }
      } catch (err) {
        return false;
      }
    } catch (error) {
      return false;
    }
  };

  // 下载图片到相册
  const handleDownload = async () => {
    try {
      // iOS需要请求权限
      if (Platform.OS === 'ios') {
        const hasPermission = await requestIOSPermission();
        
        if (!hasPermission) {
          return;
        }
        
        // 保存前再次验证权限状态（使用addOnly检查，因为保存只需要添加权限）
        const finalPermission = await iosReadGalleryPermission('addOnly');
        
        // addOnly权限：granted表示可以添加照片
        if (finalPermission !== 'granted') {
          Alert.alert(
            '权限不足',
            `当前权限状态为"${finalPermission}"，需要允许添加照片的权限。请在"设置 > 隐私与安全性 > 照片"中允许本应用访问照片`,
            [
              {text: '取消', style: 'cancel'},
              {
                text: '去设置',
                onPress: () => {
                  Linking.openSettings();
                },
              },
            ]
          );
          return;
        }
      }

      // Android需要请求权限
      if (Platform.OS === 'android') {
        const hasPermission = await requestAndroidPermission();
        
        if (!hasPermission) {
          Alert.alert('提示', '需要相册权限才能保存图片');
          return;
        }
      }

      // 保存图片到相册
      // 注意：CameraRoll.save 只接受本地文件路径（file://），不支持网络URL
      // 对于网络图片，使用 rn-fetch-blob 的缓存机制，它会优先使用已缓存的图片
      let localPath = imageUri;
      
      if (imageUri.startsWith('http://') || imageUri.startsWith('https://')) {
        // 从URL中尝试提取扩展名，支持常见图片格式
        const urlPath = imageUri.split('?')[0]; // 去掉查询参数
        const lastPart = urlPath.split('/').pop() || '';
        const dotIndex = lastPart.lastIndexOf('.');
        let extension = 'jpg'; // 默认jpg
        
        if (dotIndex > 0) {
          const ext = lastPart.substring(dotIndex + 1).toLowerCase();
          // 验证是否是有效的图片扩展名
          if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp'].includes(ext)) {
            extension = ext;
          }
        }
        
        const downloadResult = await RNFetchBlob.config({
          fileCache: true,
          appendExt: extension,
        }).fetch('GET', imageUri);
        
        localPath = downloadResult.path();
        
        // 转换为file://协议
        if (!localPath.startsWith('file://')) {
          localPath = 'file://' + localPath;
        }
      }

      // 保存图片到相册
      const filePathForCheck = localPath.replace('file://', '');
      const fileExists = await RNFetchBlob.fs.exists(filePathForCheck);
      
      if (!fileExists) {
        throw new Error('临时文件不存在');
      }
      
      await CameraRoll.save(localPath, {type: 'photo'});
      
      // 清理临时文件（如果是下载的）
      if (localPath !== imageUri && localPath.startsWith('file://')) {
        const tempPath = localPath.replace('file://', '');
        RNFetchBlob.fs.unlink(tempPath).catch(() => {});
      }
      
      Alert.alert('成功', '图片已保存到相册');
    } catch (error: any) {
      // 特殊处理3302错误
      if (error?.message?.includes('3302')) {
        Alert.alert(
          '保存失败',
          '无法保存照片到相册。这通常是因为权限设置为"选择的照片"而非"完全访问"。\n\n请在"设置 > 隐私与安全性 > 照片 > SmthApp"中选择"完全访问"',
          [
            {text: '取消', style: 'cancel'},
            {
              text: '去设置',
              onPress: () => {
                Linking.openSettings();
              },
            },
          ]
        );
      } else {
        Alert.alert('下载失败', `无法保存图片到相册\n错误: ${error?.message || '未知错误'}`);
      }
    }
  };

  // 分享图片（分享图片内容数据，而非链接）
  const handleShare = async () => {
    try {
      let localPath = imageUri;
      
      // 如果是网络图片，先下载到本地
      if (imageUri.startsWith('http://') || imageUri.startsWith('https://')) {
        // 从URL中尝试提取扩展名
        const urlPath = imageUri.split('?')[0];
        const lastPart = urlPath.split('/').pop() || '';
        const dotIndex = lastPart.lastIndexOf('.');
        let extension = 'jpg';
        
        if (dotIndex > 0) {
          const ext = lastPart.substring(dotIndex + 1).toLowerCase();
          if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp'].includes(ext)) {
            extension = ext;
          }
        }
        
        const downloadResult = await RNFetchBlob.config({
          fileCache: true,
          appendExt: extension,
        }).fetch('GET', imageUri);
        
        localPath = downloadResult.path();
      }
      
      // 确保路径格式正确
      const shareUrl = localPath.startsWith('file://') ? localPath : `file://${localPath}`;
      
      const result = await Share.share(
        Platform.OS === 'ios'
          ? {
              url: shareUrl, // iOS使用url字段分享本地文件
            }
          : {
              message: '分享图片',
              url: shareUrl, // Android也支持url字段
            }
      );

      if (result.action === Share.sharedAction) {
        // 分享成功
      } else if (result.action === Share.dismissedAction) {
        // 用户取消分享
      }
    } catch (error) {
      Alert.alert('分享失败', '无法分享图片');
    }
  };

  // 计算图片显示尺寸（保持宽高比）
  const getImageStyle = () => {
    if (!imageSize) {
      return {width: SCREEN_WIDTH, height: SCREEN_HEIGHT * DEFAULT_IMAGE_HEIGHT_RATIO};
    }

    const {width, height} = imageSize;
    const aspectRatio = width / height;

    // 优先适配宽度
    let displayWidth = SCREEN_WIDTH;
    let displayHeight = SCREEN_WIDTH / aspectRatio;

    // 如果高度超过屏幕，则适配高度
    if (displayHeight > SCREEN_HEIGHT * MAX_IMAGE_HEIGHT_RATIO) {
      displayHeight = SCREEN_HEIGHT * MAX_IMAGE_HEIGHT_RATIO;
      displayWidth = displayHeight * aspectRatio;
    }

    return {
      width: displayWidth,
      height: displayHeight,
    };
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={true}
      presentationStyle="overFullScreen"
    >
      <Animated.View style={[styles.container, {opacity}]}>
        <SafeAreaView style={styles.safeArea}>
          {/* 背景蒙层 - 点击关闭 */}
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={onClose}
          >
            {/* ScrollView 支持缩放 */}
            <Animated.View
              style={[styles.scrollWrapper, {transform: [{translateY}]}]}
              {...panResponder.panHandlers}
            >
              <ScrollView
                ref={scrollViewRef}
                contentContainerStyle={styles.scrollContent}
                maximumZoomScale={3}
                minimumZoomScale={1}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                bounces={false}
                bouncesZoom={true}
                decelerationRate="fast"
                scrollEventThrottle={16}
                onScrollBeginDrag={() => setIsZoomed(true)}
                onScrollEndDrag={(e) => {
                  // 检查是否回到了原始缩放级别
                  if (e.nativeEvent.zoomScale === 1) {
                    setIsZoomed(false);
                  }
                }}
              >
                {/* 图片容器 - 阻止点击穿透到背景，支持双击缩放 */}
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleDoubleTap();
                  }}
                  style={styles.imageWrapper}
                >
                  {loading ? (
                    <ActivityIndicator size="large" color="#fff" />
                  ) : (
                    <Image
                      source={{uri: imageUri}}
                      style={[styles.image, getImageStyle()]}
                      resizeMode="contain"
                    />
                  )}
                </TouchableOpacity>
              </ScrollView>
            </Animated.View>
          </TouchableOpacity>

          {/* 右下角操作按钮组 */}
          <View style={styles.actionButtons}>
            {/* 下载按钮 */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleDownload}
              activeOpacity={0.8}
            >
              <View style={styles.actionIcon}>
                {/* 下载图标：向下箭头 */}
                <View style={styles.downloadArrow} />
                <View style={styles.downloadLine} />
              </View>
            </TouchableOpacity>

            {/* 分享按钮 */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleShare}
              activeOpacity={0.8}
            >
              <View style={styles.actionIcon}>
                {/* 分享图标：三个点连线 */}
                <View style={styles.shareDot1} />
                <View style={styles.shareDot2} />
                <View style={styles.shareDot3} />
                <View style={styles.shareLine1} />
                <View style={styles.shareLine2} />
              </View>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  safeArea: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
  },
  scrollWrapper: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    backgroundColor: 'transparent',
  },
  // 右下角操作按钮组
  actionButtons: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 30,
    right: 20,
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  actionIcon: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 下载图标样式
  downloadArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fff',
    position: 'absolute',
    bottom: 0,
  },
  downloadLine: {
    width: 2,
    height: 14,
    backgroundColor: '#fff',
    position: 'absolute',
    bottom: 10,
  },
  // 分享图标样式（三个点连线）
  shareDot1: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fff',
    position: 'absolute',
    left: 2,
    top: 9,
  },
  shareDot2: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fff',
    position: 'absolute',
    right: 2,
    top: 3,
  },
  shareDot3: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fff',
    position: 'absolute',
    right: 2,
    bottom: 3,
  },
  shareLine1: {
    width: 12,
    height: 1.5,
    backgroundColor: '#fff',
    position: 'absolute',
    left: 6,
    top: 7,
    transform: [{rotate: '-25deg'}],
  },
  shareLine2: {
    width: 12,
    height: 1.5,
    backgroundColor: '#fff',
    position: 'absolute',
    left: 6,
    bottom: 7,
    transform: [{rotate: '25deg'}],
  },
});

export default ImageViewer;