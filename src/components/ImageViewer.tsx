import React, {useState, useRef} from 'react';
import {
  Modal,
  View,
  Image,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Platform,
  ScrollView,
  Animated,
  Easing,
  PanResponder,
  Share,
  Alert,
  PermissionsAndroid,
  Linking,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  CameraRoll,
  iosReadGalleryPermission,
  iosRequestReadWriteGalleryPermission,
} from '@react-native-camera-roll/camera-roll';
import RNFetchBlob from 'rn-fetch-blob';

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

// 常量定义
const DOUBLE_TAP_DELAY = 300;
const SWIPE_THRESHOLD = 100; // 下滑关闭距离阈值
const SWIPE_VELOCITY_THRESHOLD = 0.6; // 下滑关闭速度阈值
const SWIPE_FORCE_CLOSE_THRESHOLD = 220; // 强制关闭的距离阈值（降低到250px）
const MIN_SWIPE_DISTANCE = 8; // 最小滑动距离才开始响应（降低到8px）
const IMAGE_SWIPE_DISTANCE = 60; // 水平切图的最小距离
const MIN_OPACITY = 0.3;
const ZOOM_IN_DURATION = 400;
const ZOOM_OUT_DURATION = 600;
const CLOSE_ANIMATION_DURATION = 200;
const MAX_IMAGE_HEIGHT_RATIO = 0.9;
const DEFAULT_IMAGE_HEIGHT_RATIO = 0.7;

interface ImageViewerProps {
  visible: boolean;
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

const ImageViewer: React.FC<ImageViewerProps> = ({visible, images, initialIndex, onClose}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const currentIndexRef = useRef(initialIndex);
  const imageCountRef = useRef(images.length);
  imageCountRef.current = images.length;
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const imageUri = images[currentIndex] || '';
  const [loading, setLoading] = useState(true);
  const [imageSize, setImageSize] = useState<{width: number; height: number} | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const lastTap = useRef<number | null>(null);
  const translateY = useRef(new Animated.Value(0)).current;
  const swipeX = useRef(new Animated.Value(0)).current;
  const coverOpacity = useRef(new Animated.Value(1)).current;
  const [transitionCover, setTransitionCover] = useState<{uri: string; index: number} | null>(null);
  const coverRef = useRef<{uri: string; index: number} | null>(null);
  const handoffReset = useRef(false);
  const handoffLoaded = useRef(false);
  const handoffFading = useRef(false);
  const handoffCommitted = useRef(false);
  const handoffTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeAnimating = useRef(false);
  const swipeWasHorizontal = useRef(false);
  const imageSizeCache = useRef<Record<string, {width: number; height: number}>>({});
  const opacity = useRef(new Animated.Value(1)).current;
  const currentZoomScale = useRef(1); // 记录当前实际的缩放比例
  const backgroundPressStart = useRef<{x: number; y: number} | null>(null); // 记录背景按下的位置
  const gestureDisabled = useRef(false); // 当前手势周期是否禁用（用于处理多指冲突）
  const isScrolling = useRef(false); // 是否正在滚动/缩放
  const isPinching = useRef(false); // 是否正在双指缩放
  const lastPinchTime = useRef(0); // 最后一次双指缩放的时间

  // 目标图始终覆盖动画交接处，待新图片真实渲染后再淡出，防止一帧空白。
  const finishHandoff = () => {
    if (!coverRef.current || !handoffReset.current || !handoffLoaded.current || handoffFading.current) return;
    handoffFading.current = true;
    if (handoffTimeout.current) clearTimeout(handoffTimeout.current);
    handoffTimeout.current = null;
    Animated.timing(coverOpacity, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start(() => {
      coverRef.current = null;
      setTransitionCover(null);
      coverOpacity.setValue(1);
      swipeAnimating.current = false;
      handoffFading.current = false;
    });
  };

  const commitHandoff = (cover: {uri: string; index: number}) => {
    if (coverRef.current !== cover || handoffCommitted.current) return;
    handoffCommitted.current = true;
    if (handoffTimeout.current) clearTimeout(handoffTimeout.current);
    handoffTimeout.current = null;
    currentIndexRef.current = cover.index;
    setCurrentIndex(cover.index);
    requestAnimationFrame(() => {
      if (coverRef.current !== cover) return;
      swipeX.setValue(0);
      handoffReset.current = true;
      handoffTimeout.current = setTimeout(() => {
        handoffLoaded.current = true;
        finishHandoff();
      }, 3000);
      finishHandoff();
    });
  };

  React.useEffect(() => {
    if (handoffTimeout.current) clearTimeout(handoffTimeout.current);
    handoffTimeout.current = null;
    coverRef.current = null;
    setTransitionCover(null);
    coverOpacity.stopAnimation();
    coverOpacity.setValue(1);
    handoffReset.current = false;
    handoffLoaded.current = false;
    handoffFading.current = false;
    handoffCommitted.current = false;
    swipeAnimating.current = false;
    swipeX.stopAnimation();
    swipeX.setValue(0);
    if (visible) {
      currentIndexRef.current = initialIndex;
      setCurrentIndex(initialIndex);
    }
  }, [visible, images, initialIndex, swipeX, coverOpacity]);

  React.useEffect(() => {
    if (!visible || !imageUri) return;
    let cancelled = false;
    const cachedSize = imageSizeCache.current[imageUri];
    setLoading(!cachedSize);
    setImageSize(cachedSize || null);
    setIsZoomed(false);
    lastTap.current = null;
    translateY.setValue(0);
    opacity.setValue(1);
    // 重置缩放
    scrollViewRef.current?.getScrollResponder()?.scrollResponderZoomTo({
      x: 0,
      y: 0,
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
      animated: false,
    });
    currentZoomScale.current = 1;

    if (!cachedSize) {
      Image.getSize(
        imageUri,
        (width, height) => {
          if (cancelled) return;
          imageSizeCache.current[imageUri] = {width, height};
          setImageSize({width, height});
          setLoading(false);
        },
        () => {
          if (!cancelled) setLoading(false);
        },
      );
    }
    // 缓存相邻图片尺寸，让翻页时无需再次等待 getSize 才显示图片。
    [images[currentIndex - 1], images[currentIndex + 1]].forEach(uri => {
      if (uri && !imageSizeCache.current[uri]) {
        Image.getSize(uri, (width, height) => {
          imageSizeCache.current[uri] = {width, height};
        }, () => {});
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, imageUri, currentIndex]);

  // 处理背景按下
  const handleBackgroundPressIn = (event: any) => {
    const {pageX, pageY} = event.nativeEvent;
    backgroundPressStart.current = {x: pageX, y: pageY};
  };

  // 处理背景抬起
  const handleBackgroundPressOut = (event: any) => {
    if (backgroundPressStart.current) {
      const {pageX, pageY} = event.nativeEvent;
      const startPos = backgroundPressStart.current;
      
      // 计算移动距离
      const deltaX = Math.abs(pageX - startPos.x);
      const deltaY = Math.abs(pageY - startPos.y);
      const totalDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      
      // 只有移动距离小于10px才认为是点击，才关闭
      if (totalDistance < 10) {
        onClose();
      }
      
      backgroundPressStart.current = null;
    }
  };

  // 未放大时才允许左右切图；放大后单指拖动仍交给 ScrollView。
  const canSwipeBetweenImages = (dx: number, dy: number, touches: number) => (
    imageCountRef.current > 1
    && !swipeAnimating.current
    && touches === 1
    && currentZoomScale.current <= 1.05
    && !gestureDisabled.current
    && !isPinching.current
    && Date.now() - lastPinchTime.current >= 500
    && Math.abs(dx) > 12
    && Math.abs(dx) > Math.abs(dy) * 1.5
  );

  // 下滑关闭与未放大时的水平切图手势处理
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false, // 永远不在开始时捕获
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // 如果当前手势周期已被禁用（例如检测到了多指），则不再响应
        if (gestureDisabled.current) return false;
        
        // 如果正在滚动或缩放，不响应
        if (isScrolling.current) return false;
        
        // 如果正在双指缩放，不响应
        if (isPinching.current) return false;
        
        // 如果刚刚完成缩放操作（500ms内），不响应下滑，给用户时间稳定
        const timeSinceLastPinch = Date.now() - lastPinchTime.current;
        if (timeSinceLastPinch < 500) return false;

        // 如果检测到多指，立即禁用当前周期的手势响应
        if (gestureState.numberActiveTouches > 1) {
          gestureDisabled.current = true;
          isPinching.current = true;
          return false;
        }

        // 严格条件：只在未缩放、单指触摸、垂直滑动且移动距离足够时响应
        const isSingleTouch = gestureState.numberActiveTouches === 1;
        const isNotZoomed = currentZoomScale.current <= 1.05; // 增加容差到1.05
        const isVerticalSwipe = Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 2; // 提高垂直判断阈值
        const hasMinDistance = Math.abs(gestureState.dy) > MIN_SWIPE_DISTANCE;
        const isDownSwipe = gestureState.dy > 0;
        
        // 所有条件必须同时满足，确保不干扰双指缩放
        return (isSingleTouch && isNotZoomed && isVerticalSwipe && hasMinDistance && isDownSwipe)
          || canSwipeBetweenImages(gestureState.dx, gestureState.dy, gestureState.numberActiveTouches);
      },
      onStartShouldSetPanResponderCapture: () => false, // 不捕获开始事件
      onMoveShouldSetPanResponderCapture: (_, gestureState) =>
        canSwipeBetweenImages(gestureState.dx, gestureState.dy, gestureState.numberActiveTouches),
      onPanResponderMove: (_, gestureState) => {
        if (gestureDisabled.current || isPinching.current || swipeAnimating.current) return;
        if (currentZoomScale.current > 1.05) return;

        if (imageCountRef.current > 1
          && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5) {
          const direction = gestureState.dx < 0 ? 1 : -1;
          const hasNeighbor = currentIndexRef.current + direction >= 0
            && currentIndexRef.current + direction < imageCountRef.current;
          swipeWasHorizontal.current = true;
          swipeX.setValue(hasNeighbor
            ? Math.max(-SCREEN_WIDTH, Math.min(SCREEN_WIDTH, gestureState.dx))
            : gestureState.dx * 0.2);
          return;
        }

        if (isScrolling.current) return;
        // 手势从横向转成纵向时先让图片回到中心。
        if (swipeWasHorizontal.current) {
          swipeWasHorizontal.current = false;
          Animated.spring(swipeX, {toValue: 0, useNativeDriver: true}).start();
        }
        // 只响应向下滑动
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
          // 根据滑动距离调整透明度
          const newOpacity = Math.max(MIN_OPACITY, 1 - gestureState.dy / SCREEN_HEIGHT);
          opacity.setValue(newOpacity);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // 多指触摸过程中即使缩放状态尚未更新，也不能当作翻图。
        const wasPinching = gestureDisabled.current || isPinching.current || gestureState.numberActiveTouches > 1;
        gestureDisabled.current = false;
        swipeWasHorizontal.current = false;
        if (wasPinching || currentZoomScale.current > 1.05) {
          Animated.spring(swipeX, {toValue: 0, useNativeDriver: true}).start();
          return;
        }

        const horizontal = imageCountRef.current > 1
          && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5;
        if (horizontal) {
          const direction = gestureState.dx < 0 ? 1 : -1;
          const nextIndex = currentIndexRef.current + direction;
          const hasNeighbor = nextIndex >= 0 && nextIndex < imageCountRef.current;
          const shouldTurn = hasNeighbor && (
            Math.abs(gestureState.dx) >= IMAGE_SWIPE_DISTANCE
            || (Math.abs(gestureState.dx) >= 20 && Math.abs(gestureState.vx) > 0.65)
          );
          swipeAnimating.current = true;
          if (shouldTurn) {
            Animated.timing(swipeX, {
              toValue: -direction * SCREEN_WIDTH,
              duration: 220,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start(({finished}) => {
              if (finished) {
                const cover = {uri: imagesRef.current[nextIndex], index: nextIndex};
                coverRef.current = cover;
                handoffLoaded.current = false;
                handoffReset.current = false;
                handoffCommitted.current = false;
                coverOpacity.setValue(1);
                setTransitionCover(cover);
                // 目标图完成解码后再替换底层；相邻图在等待期间仍留在屏幕中央。
                handoffTimeout.current = setTimeout(() => commitHandoff(cover), 3000);
              } else {
                swipeX.setValue(0);
                swipeAnimating.current = false;
              }
            });
          } else {
            Animated.spring(swipeX, {
              toValue: 0,
              speed: 22,
              bounciness: 4,
              useNativeDriver: true,
            }).start(() => { swipeAnimating.current = false; });
          }
          return;
        }
        Animated.spring(swipeX, {toValue: 0, useNativeDriver: true}).start();

        // 关闭条件：
        // 1. 距离非常大（超过强制关闭阈值）- 无论速度如何都关闭
        // 2. 距离和速度都达到阈值 - 同时满足才关闭
        const shouldClose = 
          gestureState.dy > SWIPE_FORCE_CLOSE_THRESHOLD || // 距离非常大
          (gestureState.dy > SWIPE_THRESHOLD && gestureState.vy > SWIPE_VELOCITY_THRESHOLD); // 距离和速度都满足
        
        if (shouldClose) {
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
      onPanResponderTerminate: () => {
        // 手势被中断时重置状态（但不影响 isPinching）
        gestureDisabled.current = false;
        swipeWasHorizontal.current = false;
        swipeX.stopAnimation();
        Animated.spring(swipeX, {toValue: 0, useNativeDriver: true}).start();
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
      },
    })
  ).current;

  // 双击缩放处理


  const handleDoubleTap = (event: any) => {
    const now = Date.now();

    if (lastTap.current && now - lastTap.current < DOUBLE_TAP_DELAY) {
      const scrollResponder = (scrollViewRef.current as any)?.getScrollResponder();
      
      if (currentZoomScale.current > 1.05) {
        // 缩小到原始大小
        scrollResponder?.scrollResponderZoomTo({
          x: 0,
          y: 0,
          width: SCREEN_WIDTH,
          height: SCREEN_HEIGHT,
          animated: true,
        });
        // 立即更新状态
        currentZoomScale.current = 1;
        setIsZoomed(false);
      } else {
        // 放大到2倍，以屏幕中心为中心
        const zoomFactor = 2;
        const zoomWidth = SCREEN_WIDTH / zoomFactor;
        const zoomHeight = SCREEN_HEIGHT / zoomFactor;
        
        // 计算屏幕中心位置
        // scrollResponderZoomTo 的 x,y 是相对于内容视图左上角的坐标
        // 由于图片在未缩放状态下是居中的，且 contentSize 至少为屏幕大小
        // 所以我们以屏幕中心为准
        const x = (SCREEN_WIDTH - zoomWidth) / 2;
        const y = (SCREEN_HEIGHT - zoomHeight) / 2;
        
        scrollResponder?.scrollResponderZoomTo({
          x,
          y,
          width: zoomWidth,
          height: zoomHeight,
          animated: true,
        });
        // 立即更新状态
        currentZoomScale.current = 2;
        setIsZoomed(true);
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
    } catch {
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
      } catch {
        return false;
      }
    } catch {
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
    } catch {
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
          {/* 背景蒙层 - 长按关闭 */}
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPressIn={handleBackgroundPressIn}
            onPressOut={handleBackgroundPressOut}
          >
            {/* ScrollView 支持缩放 */}
            <Animated.View
              style={[styles.scrollWrapper, {transform: [{translateY}]}]}
              {...panResponder.panHandlers}
            >
              <Animated.View style={[styles.pageTrack, {transform: [{translateX: swipeX}]}]}>
                {currentIndex > 0 && (
                  <View style={[styles.adjacentPage, {left: -SCREEN_WIDTH}]} pointerEvents="none">
                    <Image source={{uri: images[currentIndex - 1]}} style={styles.adjacentImage} resizeMode="contain" />
                  </View>
                )}
                {currentIndex + 1 < images.length && (
                  <View style={[styles.adjacentPage, {left: SCREEN_WIDTH}]} pointerEvents="none">
                    <Image source={{uri: images[currentIndex + 1]}} style={styles.adjacentImage} resizeMode="contain" />
                  </View>
                )}
              <ScrollView
                key={`preview-${currentIndex}`}
                ref={scrollViewRef}
                style={styles.currentPage}
                contentContainerStyle={styles.scrollContent}
                maximumZoomScale={3}
                minimumZoomScale={1}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                bounces={false}
                bouncesZoom={true}
                scrollEventThrottle={16}
                onScroll={(e) => {
                  // 实时更新缩放比例
                  const scale = e.nativeEvent.zoomScale || 1;
                  currentZoomScale.current = scale;
                  setIsZoomed(scale > 1.01);
                }}
                // 增加手势冲突处理
                onTouchStart={(e) => {
                  // 如果检测到多指，立即禁用 PanResponder，标记为正在缩放
                  if (e.nativeEvent.touches.length > 1) {
                    gestureDisabled.current = true;
                    isPinching.current = true;
                  }
                }}
                onTouchEnd={(e) => {
                  // 当触摸结束时检查是否是缩放结束
                  if (isPinching.current && e.nativeEvent.touches.length === 0) {
                    isPinching.current = false;
                    lastPinchTime.current = Date.now();
                    // 延迟重置 gestureDisabled，给 ScrollView 时间完成缩放动画
                    setTimeout(() => {
                      gestureDisabled.current = false;
                      isScrolling.current = false;
                    }, 300);
                  }
                }}
                onScrollBeginDrag={() => {
                  isScrolling.current = true;
                }}
                onScrollEndDrag={() => {
                  // 延迟重置，确保滚动/缩放完全停止
                  setTimeout(() => {
                    isScrolling.current = false;
                  }, 100);
                }}
                onMomentumScrollEnd={() => {
                  // 惯性滚动结束后重置状态
                  isScrolling.current = false;
                }}
                scrollEnabled={true}
                pinchGestureEnabled={true}
                directionalLockEnabled={false}
                alwaysBounceVertical={false}
                alwaysBounceHorizontal={false}
                centerContent={true}
              >
                {/* 图片容器 - 阻止点击穿透到背景，支持双击缩放 */}
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleDoubleTap(e);
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
                      onLoad={() => {
                        if (coverRef.current?.index === currentIndex) {
                          handoffLoaded.current = true;
                          finishHandoff();
                        }
                      }}
                      onError={() => {
                        if (coverRef.current?.index === currentIndex) {
                          handoffLoaded.current = true;
                          finishHandoff();
                        }
                      }}
                    />
                  )}
                </TouchableOpacity>
              </ScrollView>
              </Animated.View>
              {transitionCover && (
                <Animated.View style={[styles.transitionCover, {opacity: coverOpacity}]} pointerEvents="none">
                  <Image
                    source={{uri: transitionCover.uri}}
                    style={styles.adjacentImage}
                    resizeMode="contain"
                    onLoad={() => commitHandoff(transitionCover)}
                    onError={() => commitHandoff(transitionCover)}
                  />
                </Animated.View>
              )}
            </Animated.View>
          </TouchableOpacity>

          {images.length > 1 && (
            <View style={styles.pageIndicator} pointerEvents="none">
              <Text style={styles.pageIndicatorText}>{currentIndex + 1} / {images.length}</Text>
            </View>
          )}

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
    overflow: 'hidden',
  },
  pageTrack: {
    flex: 1,
    width: SCREEN_WIDTH,
  },
  currentPage: {
    flex: 1,
  },
  adjacentPage: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    justifyContent: 'center',
  },
  transitionCover: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  adjacentImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * MAX_IMAGE_HEIGHT_RATIO,
    alignSelf: 'center',
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
  pageIndicator: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 47 : 37,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pageIndicatorText: {
    color: '#fff',
    fontSize: 14,
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