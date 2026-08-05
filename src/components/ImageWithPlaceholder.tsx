import React, {useState, useRef, useEffect} from 'react';
import {Image, Animated, View, Text, StyleSheet, ImageStyle, StyleProp, ViewStyle, ActivityIndicator, ImageResizeMode} from 'react-native';
import Svg, {Path, Line} from 'react-native-svg';
import {useTheme} from './ThemedComponents';

interface ImageWithPlaceholderProps {
  uri: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  placeholderText?: string;
  isAvatar?: boolean;
  onImageLoad?: (imageSize: {width: number; height: number}) => void;
  onLoadError?: () => void;
  showLoadingIndicator?: boolean;
}

const BrokenImageIcon: React.FC<{size?: number; color?: string}> = ({size = 28, color = '#c7c7cc'}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10" />
    <Path d="M3 16l5-5c.928-.893 2.072-.893 3 0l4 4" />
    <Path d="M14 14l1-1c.928-.893 2.072-.893 3 0l3 3" />
    <Line x1="18" y1="22" x2="22" y2="18" />
    <Line x1="22" y1="22" x2="18" y2="18" />
  </Svg>
);

const ImageWithPlaceholder: React.FC<ImageWithPlaceholderProps> = ({
  uri,
  style,
  resizeMode = 'cover',
  placeholderText,
  isAvatar = false,
  onImageLoad,
  onLoadError,
  showLoadingIndicator = false,
}) => {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const opacity = useRef(new Animated.Value(0)).current;
  const previousUri = useRef(uri);

  // 同一列表项复用组件时，头像地址变化后要重新尝试加载，不能沿用旧的失败状态。
  useEffect(() => {
    if (previousUri.current === uri) {
      return;
    }
    previousUri.current = uri;
    setFailed(false);
    setLoading(true);
    opacity.setValue(0);
  }, [uri, opacity]);

  if (failed) {
    if (isAvatar) {
      // 失败头像：用占位背景 + 名称首字母（无名称时回退到主题次要色的 ?）
      const initial = placeholderText ? placeholderText.trim().charAt(0).toUpperCase() : '?';
      return (
        <View style={[styles.avatarPlaceholder, {backgroundColor: theme.placeholderBackground}, style as ViewStyle]}>
          <Text style={[styles.avatarPlaceholderText, {color: theme.secondaryText}]}>{initial}</Text>
        </View>
      );
    }

    return (
      <View style={[styles.placeholder, {backgroundColor: theme.placeholderBackground, borderColor: theme.border}, style as ViewStyle]}>
        <BrokenImageIcon size={22} color={theme.secondaryText} />
        {!!placeholderText && (
          <Text style={[styles.placeholderText, {color: theme.secondaryText}]} numberOfLines={1}>
            {placeholderText}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={[{backgroundColor: theme.placeholderBackground}, style as ViewStyle]}>
      <Animated.Image
        source={{uri}}
        style={[StyleSheet.absoluteFill, {opacity}]}
        resizeMode={resizeMode}
        onLoad={(event) => {
          setLoading(false);
          // 淡入，告别生硬的 0→1 闪现
          Animated.timing(opacity, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
          }).start();
          if (onImageLoad && event.nativeEvent.source) {
            const {width, height} = event.nativeEvent.source;
            onImageLoad({width, height});
          }
        }}
        onError={() => {
          setFailed(true);
          setLoading(false);
          if (onLoadError) {
            onLoadError();
          }
        }}
      />
      {loading && showLoadingIndicator && (
        <View style={[styles.loadingContainer, {backgroundColor: theme.placeholderBackground}]}>
          <ActivityIndicator size="small" color={theme.secondaryText} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  placeholder: {
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  placeholderText: {
    marginLeft: 8,
    fontSize: 13,
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 18,
    fontWeight: '600',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ImageWithPlaceholder;
