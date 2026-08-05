import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  Alert,
  InteractionManager,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getFriendsList} from '../services/api';
import {useTheme} from '../components/ThemedComponents';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import {ChevronRightIcon, UsersIcon} from '../components/SvgIcons';
import {getCardElevation} from '../utils/theme';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  scaleModerate,
} from '../utils/responsive';

interface UserItem {
  id: string;
  username: string;
  nickname?: string;
  avatar?: string;
}

const MyFollowingScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  
  const [following, setFollowing] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentUsername, setCurrentUsername] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalFollowing, setTotalFollowing] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // 加载当前用户名
  const loadCurrentUsername = async () => {
    try {
      const username = await AsyncStorage.getItem('username');
      if (username) {
        setCurrentUsername(username);
        return username;
      }
    } catch (error) {
      console.error('Load current username error:', error);
    }
    return '';
  };

  // 加载关注列表
  const loadFollowing = async (page: number = 1, forceRefresh: boolean = false, append: boolean = false) => {
    try {
      const username = currentUsername || await loadCurrentUsername();
      
      if (!username) {
        Alert.alert('提示', '请先登录');
        setLoading(false);
        return;
      }

      const result = await getFriendsList(username, page, forceRefresh);
      
      if (result.success && result.friends) {
        // friends现在直接是用户对象数组，包含完整的用户信息
        const users = result.friends.map((friend: any) => ({
          id: friend.id || friend.username,
          username: friend.username,
          nickname: friend.nickname,
          avatar: friend.avatar,
        }));

        if (append) {
          // 追加数据（加载更多）
          setFollowing(prev => [...prev, ...users]);
        } else {
          // 替换数据（刷新）
          setFollowing(users);
        }
        
        setTotalFollowing(result.total);
        setCurrentPage(result.page);
        
        // 直接使用API返回的hasMore字段
        setHasMore(result.hasMore);
      } else {
        if (!append) {
          Alert.alert('提示', result.message || '获取关注列表失败');
        }
      }
    } catch (error: any) {
      console.error('Load following error:', error);
      if (error.message === 'LOGIN_EXPIRED') {
        Alert.alert(
          '登录已过期',
          '请重新登录',
          [
            {
              text: '去登录',
              onPress: () => navigation.navigate('Login'),
            },
            {text: '取消', style: 'cancel'},
          ]
        );
      } else if (!append) {
        Alert.alert('错误', '加载失败，请稍后重试');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadFollowing(1);
  }, []);

  // 页面获得焦点时刷新
  useFocusEffect(
    useCallback(() => {
      if (!loading) {
        const task = InteractionManager.runAfterInteractions(() => {
          loadFollowing(1);
        });
        return () => task.cancel();
      }
    }, [])
  );

  // 下拉刷新
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFollowing(1, true, false);
  }, [currentUsername]);

  // 加载更多
  const onLoadMore = useCallback(() => {
    if (!loadingMore && hasMore && !refreshing) {
      setLoadingMore(true);
      loadFollowing(currentPage + 1, false, true);
    }
  }, [loadingMore, hasMore, refreshing, currentPage]);

  // 点击用户
  const handleUserPress = (user: UserItem) => {
    navigation.navigate('UserProfile', {username: user.username});
  };

  // 渲染用户项
  const renderItem = ({item}: {item: UserItem}) => (
    <TouchableOpacity
      style={[styles.userItem, {backgroundColor: theme.cardBackground}, getCardElevation(theme)]}
      onPress={() => handleUserPress(item)}
      activeOpacity={0.7}
    >
      {item.avatar ? (
        <ImageWithPlaceholder
          uri={item.avatar}
          style={styles.avatar}
          resizeMode="cover"
          isAvatar={true}
        />
      ) : (
        <View style={[styles.avatarPlaceholder, {backgroundColor: theme.primary}]}>
          <Text style={styles.avatarText}>
            {item.username?.charAt(0).toUpperCase() || 'U'}
          </Text>
        </View>
      )}
      <View style={styles.userInfo}>
        <Text style={[styles.nickname, {color: theme.text}]}>
          {item.nickname || item.username}
        </Text>
        {item.nickname && (
          <Text style={[styles.username, {color: theme.secondaryText}]}>
            @{item.username}
          </Text>
        )}
      </View>
      <ChevronRightIcon size={18} color={theme.chevron} />
    </TouchableOpacity>
  );

  // 渲染空状态
  const renderEmpty = () => {
    if (loading) {
      return null;
    }
    
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIcon}>
          <UsersIcon size={60} color={theme.secondaryText} />
        </View>
        <Text style={[styles.emptyText, {color: theme.secondaryText}]}>
          暂无关注的用户
        </Text>
        <Text style={[styles.emptyHint, {color: theme.secondaryText}]}>
          去关注感兴趣的用户吧
        </Text>
      </View>
    );
  };

  // 渲染头部统计
  const renderHeader = () => {
    if (following.length === 0) {
      return null;
    }
    
    return (
      <View style={styles.header}>
        <Text style={[styles.headerText, {color: theme.secondaryText}]}>
          共关注 {totalFollowing > 0 ? totalFollowing : following.length} 人
        </Text>
      </View>
    );
  };

  // 渲染底部加载更多
  const renderFooter = () => {
    if (!loadingMore) {
      return null;
    }
    
    return (
      <View style={styles.footerLoading}>
        <ActivityIndicator size="small" color={theme.primary} />
        <Text style={[styles.footerText, {color: theme.secondaryText}]}>
          加载中...
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, {backgroundColor: theme.background}]}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={following}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          contentContainerStyle={following.length === 0 ? styles.emptyList : styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.5}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: SPACING.md,
  },
  emptyList: {
    flex: 1,
  },
  header: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  headerText: {
    fontSize: FONT_SIZE.sm,
  },
  userItem: {
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: scaleModerate(48),
    height: scaleModerate(48),
    borderRadius: BORDER_RADIUS.md,
  },
  avatarPlaceholder: {
    width: scaleModerate(48),
    height: scaleModerate(48),
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    color: '#fff',
  },
  userInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  nickname: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '500',
    marginBottom: SPACING.xs - 2,
  },
  username: {
    fontSize: FONT_SIZE.sm,
  },
  chevron: {
    fontSize: FONT_SIZE.xl,
    marginLeft: SPACING.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scaleModerate(40),
  },
  emptyIcon: {
    marginBottom: SPACING.lg,
    opacity: 0.7,
  },
  emptyText: {
    fontSize: FONT_SIZE.lg,
    marginBottom: SPACING.sm,
  },
  emptyHint: {
    fontSize: FONT_SIZE.md,
    textAlign: 'center',
  },
  footerLoading: {
    paddingVertical: SPACING.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZE.sm,
  },
});

export default MyFollowingScreen;
