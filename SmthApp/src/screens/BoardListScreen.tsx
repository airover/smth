import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import {useRoute, useNavigation, useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getFavoriteBoards} from '../services/api';
import {Board} from '../types';

const BoardListScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const {favorites} = route.params as {favorites?: boolean};
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    checkLoginAndLoadBoards();
  }, [favorites]);

  // 页面获得焦点时重新检查登录状态
  useFocusEffect(
    React.useCallback(() => {
      checkLoginAndLoadBoards();
    }, [favorites])
  );

  const checkLoginAndLoadBoards = async () => {
    try {
      setLoading(true);
      // 检查登录状态
      const loginStatus = await AsyncStorage.getItem('isLoggedIn');
      const loggedIn = loginStatus === 'true';
      setIsLoggedIn(loggedIn);

      if (!loggedIn) {
        // 未登录，不加载数据
        setLoading(false);
        return;
      }

      // 已登录，加载收藏版面
      if (favorites) {
        await loadFavoriteBoards();
      }
    } catch (error) {
      console.error('Check login and load boards error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFavoriteBoards = async () => {
    try {
      const data = await getFavoriteBoards();
      setBoards(data);
    } catch (error) {
      console.error('Load favorite boards error:', error);
    }
  };

  const handleLogin = () => {
    navigation.navigate('Login');
  };

  const renderBoardItem = ({item}: {item: Board}) => (
    <TouchableOpacity
      style={styles.boardItem}
      onPress={() => {
        // 由于 Board 是 MainTabs 中的嵌套路由，需要指定 MainTabs
        navigation.navigate('MainTabs', {
          screen: 'Board',
          params: {
            board: item.id,
            boardName: item.chineseName || item.name,
          },
        });
      }}>
      <Text style={styles.boardName}>
        {item.chineseName || item.name}
      </Text>
      {item.description && (
        <Text style={styles.boardDesc} numberOfLines={1}>
          {item.description}
        </Text>
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>未登录</Text>
          <Text style={styles.emptyText}>请先登录以查看收藏版面</Text>
          <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
            <Text style={styles.loginButtonText}>前往登录</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={boards}
        renderItem={renderBoardItem}
        keyExtractor={item => item.id}
        numColumns={3}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>暂无收藏版面</Text>
          </View>
        }
        contentContainerStyle={styles.content}
        columnWrapperStyle={styles.columnWrapper}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 12,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
  },
  boardItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    marginHorizontal: 4,
    flex: 1/3,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  boardName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
    textAlign: 'center',
  },
  boardDesc: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginBottom: 24,
  },
  loginButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default BoardListScreen;

