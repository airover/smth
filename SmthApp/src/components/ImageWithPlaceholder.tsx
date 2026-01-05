import React, {useState} from 'react';
import {Image, View, Text, StyleSheet, ImageStyle, StyleProp, ViewStyle} from 'react-native';

interface ImageWithPlaceholderProps {
  uri: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
  placeholderText?: string;
  isAvatar?: boolean; // 是否是头像，如果是则显示为圆形占位符
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
}) => {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

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
        {placeholderText ? <Text style={styles.placeholderText}>{placeholderText}</Text> : null}
      </View>
    );
  }

  return (
    <Image
      source={{uri}}
      style={style}
      resizeMode={resizeMode}
      onLoad={() => {
        setLoading(false);
      }}
      onError={(e) => {
        console.log(`Image load failed: ${uri}`);
        setFailed(true);
        setLoading(false);
      }}
    />
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
});

export default ImageWithPlaceholder;

