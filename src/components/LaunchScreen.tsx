import React from 'react';
import {View, StyleSheet, StatusBar, useColorScheme, Image} from 'react-native';

const LaunchScreen = () => {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  return (
    <View style={[styles.splashContainer, isDarkMode && styles.splashContainerDark]}>
      <StatusBar 
        barStyle={isDarkMode ? "light-content" : "dark-content"} 
        backgroundColor={isDarkMode ? "#000" : "#fff"} 
      />
      <View style={styles.imageContainer}>
        <Image 
          source={{uri: 'hacker'}} 
          style={styles.image}
          resizeMode="contain"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashContainerDark: {
    backgroundColor: '#000',
  },
  imageContainer: {
    // 移除 flex: 1，允许容器根据内容调整大小，或者直接约束大小
    width: 1024,
    height: 1024,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: 1024,
    height: 1024,
  },
});

export default LaunchScreen;