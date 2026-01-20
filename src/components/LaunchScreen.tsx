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
          resizeMode="cover"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  splashContainerDark: {
    backgroundColor: '#000',
  },
  imageContainer: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

export default LaunchScreen;