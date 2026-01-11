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
} from 'react-native';

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

interface ImageViewerProps {
  visible: boolean;
  imageUri: string;
  onClose: () => void;
}

const ImageViewer: React.FC<ImageViewerProps> = ({visible, imageUri, onClose}) => {
  const [loading, setLoading] = useState(true);
  const [imageSize, setImageSize] = useState<{width: number; height: number} | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  React.useEffect(() => {
    console.log('🖼️ ImageViewer (原生Modal):', {visible, imageUri: imageUri?.substring(0, 50)});
    if (visible && imageUri) {
      setLoading(true);
      // 获取图片尺寸
      Image.getSize(
        imageUri,
        (width, height) => {
          console.log('🖼️ 图片尺寸:', {width, height});
          setImageSize({width, height});
          setLoading(false);
        },
        (error) => {
          console.error('🖼️ 获取图片尺寸失败:', error);
          setLoading(false);
        }
      );
    }
  }, [visible, imageUri]);

  // 计算图片显示尺寸（保持宽高比）
  const getImageStyle = () => {
    if (!imageSize) {
      return {width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.7};
    }

    const {width, height} = imageSize;
    const aspectRatio = width / height;

    // 优先适配宽度
    let displayWidth = SCREEN_WIDTH;
    let displayHeight = SCREEN_WIDTH / aspectRatio;

    // 如果高度超过屏幕，则适配高度
    if (displayHeight > SCREEN_HEIGHT * 0.9) {
      displayHeight = SCREEN_HEIGHT * 0.9;
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
      <SafeAreaView style={styles.container}>
        {/* 背景蒙层 - 点击关闭 */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        >
          {/* ScrollView 支持缩放 */}
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.scrollContent}
            maximumZoomScale={3}
            minimumZoomScale={1}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            bounces={false}
            bouncesZoom={true}
          >
            {/* 图片容器 - 阻止点击穿透到背景 */}
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
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
        </TouchableOpacity>

        {/* 关闭按钮 */}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          activeOpacity={0.8}
        >
          <View style={styles.closeIcon}>
            <View style={styles.closeLine1} />
            <View style={styles.closeLine2} />
          </View>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  backdrop: {
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
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
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
});

export default ImageViewer;