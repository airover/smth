// 主题化的通用组件
import React from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from 'react-native';
import {useSettings} from '../context/SettingsContext';
import {getTheme, ThemeColors} from '../utils/theme';

// 导出 useTheme Hook，方便直接获取主题
export const useTheme = () => {
  const {settings} = useSettings();
  return getTheme(settings.themeMode);
};

// 主题化的 SafeAreaView
export const ThemedSafeAreaView: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}> = ({children, style}) => {
  const theme = useTheme();
  
  return (
    <SafeAreaView style={[{flex: 1, backgroundColor: theme.background}, style]}>
      {children}
    </SafeAreaView>
  );
};

// 主题化的 View
export const ThemedView: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  card?: boolean; // 是否是卡片样式
}> = ({children, style, card = false}) => {
  const theme = useTheme();
  
  const defaultStyle = card 
    ? {backgroundColor: theme.cardBackground}
    : {backgroundColor: theme.background};
  
  return (
    <View style={[defaultStyle, style]}>
      {children}
    </View>
  );
};

// 主题化的 Text
export const ThemedText: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  secondary?: boolean; // 是否是次要文字
  primary?: boolean; // 是否使用主色调
}> = ({children, style, secondary = false, primary = false}) => {
  const theme = useTheme();
  
  const defaultStyle = {
    color: primary ? theme.primary : (secondary ? theme.secondaryText : theme.text)
  };
  
  return (
    <Text style={[defaultStyle, style]}>
      {children}
    </Text>
  );
};

// 主题化的 ActivityIndicator
export const ThemedActivityIndicator: React.FC<{
  size?: 'small' | 'large';
  style?: StyleProp<ViewStyle>;
}> = ({size = 'large', style}) => {
  const theme = useTheme();
  
  return <ActivityIndicator size={size} color={theme.primary} style={style} />;
};

// 获取主题样式的 Hook
export const useThemedStyles = <T extends StyleSheet.NamedStyles<T>>(
  stylesFn: (theme: ThemeColors) => T
) => {
  const theme = useTheme();
  return stylesFn(theme);
};
