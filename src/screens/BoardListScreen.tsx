import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import {useRoute, useNavigation, useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getFavoriteBoards} from '../services/api';
import {removeBoardFavorite} from '../services/dataFetcher';
import {Board} from '../types';
import {useTheme} from '../components/ThemedComponents';
import {getCardElevation} from '../utils/theme';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  scaleModerate,
} from '../utils/responsive';

const BoardListScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const {favorites} = route.params as {favorites?: boolean};
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    checkLoginAndLoadBoards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorites]);

  // 页面获得焦点时只检查登录状态，不重新加载数据
  useFocusEffect(
    React.useCallback(() => {
      checkLoginStatus();
    }, [])
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

  const checkLoginStatus = async () => {
    try {
      // 只检查登录状态，不重新加载数据
      const loginStatus = await AsyncStorage.getItem('isLoggedIn');
      const loggedIn = loginStatus === 'true';
      setIsLoggedIn(loggedIn);
    } catch (error) {
      console.error('Check login status error:', error);
    }
  };

  const loadFavoriteBoards = async (forceRefresh: boolean = false) => {
    try {
      const data = await getFavoriteBoards(forceRefresh);
      setBoards(data);
      setDataLoaded(true);
    } catch (error: any) {
      console.error('Load favorite boards error:', error);
      
      // 处理登录过期错误
      if (error.message === 'NOT_LOGGED_IN' || error.message === 'LOGIN_EXPIRED') {
        console.log('Login expired, clearing login status');
        setIsLoggedIn(false);
        // 提示用户重新登录
        Alert.alert(
          '登录已过期',
          '请重新登录后查看收藏版面',
          [
            {
              text: '去登录',
              onPress: handleLogin,
            },
            {
              text: '取消',
              style: 'cancel',
            },
          ]
        );
      }
      // 接口失败时不设置dataLoaded，避免显示"暂无收藏版面"
    } finally {
      setRefreshing(false);
    }
  };
  const handleLogin = () => {
    navigation.navigate('Login');
  };

  const handleRemoveFavorite = (board: Board) => {
    Alert.alert(
      '取消收藏',
      `确定要取消收藏 "${board.chineseName || board.name}" 吗？`,
      [
        {
          text: '取消',
          style: 'cancel',
        },
        {
          text: '确定',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await removeBoardFavorite(board.id);
              if (result.success) {
                // 从列表中移除该版面
                setBoards(prevBoards => prevBoards.filter(b => b.id !== board.id));
                Alert.alert('成功', '已取消收藏');
              } else {
                Alert.alert('失败', result.message || '取消收藏失败');
              }
            } catch (error) {
              console.error('Remove favorite error:', error);
              Alert.alert('错误', '取消收藏时发生错误');
            }
          },
        },
      ]
    );
  };

  // 下拉刷新
  const onRefresh = async () => {
    setRefreshing(true);
    await loadFavoriteBoards(true); // 强制刷新
  };

  const renderBoardItem = ({item}: {item: Board}) => (
    <TouchableOpacity
      style={[styles.boardItem, {backgroundColor: theme.cardBackground}, getCardElevation(theme)]}
      onPress={() => {
        // 由于 Board 是 MainTabs 中的嵌套路由，需要指定 MainTabs
        navigation.navigate('MainTabs', {
          screen: 'Board',
          params: {
            board: item.id,
            boardName: item.chineseName || item.name,
            source: 'link', // 标记为从链接进入，避免被当作Tab点击
          },
        });
      }}
      onLongPress={() => handleRemoveFavorite(item)}>
      <Text style={[styles.boardName, {color: theme.text}]}>
        {item.chineseName || item.name}
      </Text>
      {item.description && (
        <Text style={[styles.boardDesc, {color: theme.secondaryText}]} numberOfLines={1}>
          {item.description}
        </Text>
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, {backgroundColor: theme.background}]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </View>
    );
  }

  if (!isLoggedIn) {
    return (
      <View style={[styles.container, {backgroundColor: theme.background}]}>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyTitle, {color: theme.text}]}>未登录</Text>
          <Text style={[styles.emptyText, {color: theme.secondaryText}]}>请先登录以查看收藏版面</Text>
          <TouchableOpacity style={[styles.loginButton, {backgroundColor: theme.primary}]} onPress={handleLogin}>
            <Text style={styles.loginButtonText}>前往登录</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, {backgroundColor: theme.background}]}>
      <FlatList
        data={boards}
        renderItem={renderBoardItem}
        keyExtractor={item => item.id}
        numColumns={3}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.primary]}
            tintColor={theme.primary}
          />
        }
        ListEmptyComponent={
          dataLoaded ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, {color: theme.secondaryText}]}>暂无收藏版面</Text>
            </View>
          ) : null
        }
        contentContainerStyle={styles.content}
        columnWrapperStyle={styles.columnWrapper}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: SPACING.md,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
  },
  boardItem: {
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm + 2,
    marginHorizontal: SPACING.xs,
    flex: 1/3,
    height: scaleModerate(60),
    justifyContent: 'center',
    alignItems: 'center',
  },
  boardName: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
    textAlign: 'center',
  },
  boardDesc: {
    fontSize: FONT_SIZE.xs,
    marginTop: SPACING.xs / 2,
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
    paddingVertical: scaleModerate(60),
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    marginBottom: SPACING.xxl,
  },
  loginButton: {
    paddingHorizontal: SPACING.xxxl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  loginButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: '#fff',
  },
});

export default BoardListScreen;
