import React, {useEffect, useState, useMemo} from 'react';
import {
  View,
  TouchableWithoutFeedback,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import ImageView from 'react-native-image-viewing';
import type {ImageSource} from 'react-native-image-viewing/dist/@types';

interface ImageViewerProps {
  visible: boolean;
  imageUri: string;
  onClose: () => void;
}

// 关闭按钮组件
const CloseButton: React.FC<{onPress: () => void}> = ({onPress}) => (
  <SafeAreaView style={styles.safeArea}>
    <TouchableWithoutFeedback onPress={onPress}>
      <View style={styles.closeButtonArea}>
        <View style={styles.closeButton}>
          <View style={styles.closeIcon}>
            <View style={styles.closeLine1} />
            <View style={styles.closeLine2} />
          </View>
        </View>
      </View>
    </TouchableWithoutFeedback>
  </SafeAreaView>
);

// Header 组件工厂函数
const createHeaderComponent = (onClose: () => void) => {
  const HeaderComponent = () => <CloseButton onPress={onClose} />;
  return HeaderComponent;
};

const ImageViewer: React.FC<ImageViewerProps> = ({visible, imageUri, onClose}) => {
  // 使用 key 强制重新渲染，解决缩放后位置偏移问题
  const [viewerKey, setViewerKey] = useState<number>(Date.now());
  
  // 每次打开时更新 key，确保组件完全重置
  useEffect(() => {
    if (visible) {
      // 打开时：更新 key
      setViewerKey(Date.now());
    }
  }, [visible]);

  // 构造图片数组，不指定宽高，让库自动处理以确保宽度占满屏幕
  const images = useMemo(() => {
    return [{uri: imageUri}] as ImageSource[];
  }, [imageUri]);

  // 创建 Header 组件
  const HeaderComponent = useMemo(() => createHeaderComponent(onClose), [onClose]);

  return (
    <ImageView
      key={viewerKey}
      images={images}
      imageIndex={0}
      visible={visible}
      onRequestClose={onClose}
      swipeToCloseEnabled={true}
      doubleTapToZoomEnabled={true}
      HeaderComponent={HeaderComponent}
      presentationStyle="overFullScreen"
      animationType="fade"
      backgroundColor="rgba(0, 0, 0, 0.9)"
    />
  );
};

const styles = StyleSheet.create({
  safeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: 'flex-end', // 让关闭按钮靠右
  },
  closeButtonArea: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 10,
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
});

export default ImageViewer;