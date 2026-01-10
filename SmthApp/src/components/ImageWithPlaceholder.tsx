import React, {useState} from 'react';
import {Image, View, Text, StyleSheet, ImageStyle, StyleProp, ViewStyle, ActivityIndicator, ImageResizeMode} from 'react-native';

interface ImageWithPlaceholderProps {
  uri: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  placeholderText?: string;
  isAvatar?: boolean; // 是否是头像，如果是则显示为圆形占位符
  onImageLoad?: (imageSize: {width: number; height: number}) => void; // 图片加载完成回调
  showLoadingIndicator?: boolean; // 是否显示加载指示器
}

/**
 * 带占位符的图片组件
 * 当图片加载失败时显示占位图
 */
const ImageWithPlaceholder: React.FC<ImageWithPlaceholderProps> = ({
  uri,
  style,
  resizeMode = 'cover',
  placeholderText = '图片加载失败',
  isAvatar = false,
  onImageLoad,
  showLoadingIndicator = false,
}) => {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  // 调试：打印头像URL
  if (isAvatar && uri) {
    console.log('Loading avatar image:', uri);
  }

  if (failed) {
    // 如果是头像且没有文本，显示简化的占位符
    if (isAvatar && !placeholderText) {
      return (
        <View style={[styles.avatarPlaceholder, style as ViewStyle]}>
          <Text style={styles.avatarPlaceholderText}>?</Text>
        </View>
      );
    }
    
    return (
      <View style={[styles.placeholder, style as ViewStyle]}>
        <Text style={styles.placeholderIcon}>🖼️</Text>
      </View>
    );
  }

  return (
    <View style={style as ViewStyle}>
      <Image
        source={{uri}}
        style={[StyleSheet.absoluteFill, {opacity: loading ? 0 : 1}]}
        resizeMode={resizeMode}
        onLoad={(event) => {
          setLoading(false);
          if (isAvatar) {
            console.log('Avatar image loaded successfully:', uri);
          }
          // 获取图片实际尺寸并回调
          if (onImageLoad && event.nativeEvent.source) {
            const {width, height} = event.nativeEvent.source;
            onImageLoad({width, height});
          }
        }}
        onError={(e) => {
          console.log(`Image load failed: ${uri}`, e.nativeEvent?.error);
          setFailed(true);
          setLoading(false);
        }}
      />
      {loading && showLoadingIndicator && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#999" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  placeholderText: {
    fontSize: 12,
    color: '#999',
  },
  avatarPlaceholder: {
    backgroundColor: '#E1E1E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
});

export default ImageWithPlaceholder;

