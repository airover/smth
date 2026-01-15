import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {SwipeListView} from 'react-native-swipe-list-view';
import {useNavigation} from '@react-navigation/native';
import {getFavoriteTopics, getFavoriteBoards} from '../services/dataFetcher';
import {markFavoriteTopicRead, removeFavoriteTopic} from '../services/api';
import {Board} from '../types';
import {formatRelativeTime} from '../utils/timeFormat';
import {useTheme} from '../components/ThemedComponents';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  scaleModerate,
} from '../utils/responsive';

type TabType = 'topics' | 'boards';

const FavoritesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  
  const [activeTab, setActiveTab] = useState<TabType>('topics');
  const [topics, setTopics] = useState<any[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [topicsPage, setTopicsPage] = useState(0);
  const [hasMoreTopics, setHasMoreTopics] = useState(false);
  const [removingTopic, setRemovingTopic] = useState<string | null>(null);

  // 加载收藏的文章
  const loadTopics = useCallback(async (page: number = 0, isRefresh: boolean = false) => {
    try {
      if (page === 0) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      
      const result = await getFavoriteTopics(page, 20);
      
      if (page === 0) {
        setTopics(result.topics);
      } else {
        setTopics(prev => [...prev, ...result.topics]);
      }
      
      setTopicsPage(page);
      setHasMoreTopics((page + 1) * 20 < result.totalItems);
    } catch (error: any) {
      console.error('Load favorite topics error:', error);
      
      if (error.message === 'NOT_LOGGED_IN') {
        Alert.alert(
          '未登录',
          '请先登录后查看收藏',
          [
            {
              text: '去登录',
              onPress: () => navigation.navigate('Login'),
            },
            {
              text: '取消',
              style: 'cancel',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      } else {
        Alert.alert('加载失败', error.message || '请稍后重试');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [navigation]);

  // 加载收藏的版面
  const loadBoards = useCallback(async (forceRefresh: boolean = false) => {
    try {
      setLoading(true);
      const result = await getFavoriteBoards(forceRefresh);
      setBoards(result);
    } catch (error: any) {
      console.error('Load favorite boards error:', error);
      
      if (error.message === 'NOT_LOGGED_IN') {
        Alert.alert(
          '未登录',
          '请先登录后查看收藏',
          [
            {
              text: '去登录',
              onPress: () => navigation.navigate('Login'),
            },
            {
              text: '取消',
              style: 'cancel',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      } else {
        Alert.alert('加载失败', error.message || '请稍后重试');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigation]);

  // 初始加载
  useEffect(() => {
    if (activeTab === 'topics') {
      loadTopics(0);
    } else {
      loadBoards();
    }
  }, [activeTab, loadTopics, loadBoards]);

  // 下拉刷新
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (activeTab === 'topics') {
      await loadTopics(0, true);
    } else {
      await loadBoards(true); // 强制刷新
    }
  }, [activeTab, loadTopics, loadBoards]);

  // 加载更多（仅文章列表）
  const onLoadMore = useCallback(() => {
    if (activeTab === 'topics' && hasMoreTopics && !loadingMore && !loading) {
      loadTopics(topicsPage + 1);
    }
  }, [activeTab, hasMoreTopics, loadingMore, loading, topicsPage, loadTopics]);

  // 标记文章为已读（静默执行，不显示提示）
  const markAsReadSilently = useCallback(async (item: any) => {
    if (!item.topicId || !item.hasNewReply) {
      return;
    }

    try {
      // 使用当前的回复数作为已读位置
      const readOrder = item.replyCount || 1;
      
      const result = await markFavoriteTopicRead(item.topicId, readOrder);
      
      if (result.success) {
        // 更新本地状态，移除"新"标识
        setTopics(prev => 
          prev.map(t => 
            t.topicId === item.topicId 
              ? {...t, hasNewReply: false, readOrder}
              : t
          )
        );
        console.log('已静默标记为已读:', item.topicId);
      }
    } catch (error: any) {
      console.error('Mark as read error:', error);
    }
  }, []);

  // 取消收藏文章
  const handleRemoveFavorite = useCallback(async (item: any) => {
    if (!item.topicId || removingTopic) {
      return;
    }

    try {
      setRemovingTopic(item.topicId);
      
      const result = await removeFavoriteTopic(item.topicId);
      
      if (result.success) {
        // 从列表中移除
        setTopics(prev => prev.filter(t => t.topicId !== item.topicId));
        Alert.alert('成功', result.message || '已取消收藏');
      } else {
        Alert.alert('失败', result.message || '取消收藏失败');
      }
    } catch (error: any) {
      console.error('Remove favorite error:', error);
      Alert.alert('错误', error.message || '操作失败');
    } finally {
      setRemovingTopic(null);
    }
  }, [removingTopic]);

  // 渲染Tab切换按钮 - 横向胶囊样式
  const renderTabs = () => (
    <View style={[styles.tabContainer, {backgroundColor: theme.cardBackground, borderBottomColor: theme.border}]}>
      <TouchableOpacity
        style={[
          styles.tab,
          {backgroundColor: activeTab === 'topics' ? theme.primary : theme.background},
          {borderColor: activeTab === 'topics' ? 'transparent' : '#e0e0e0'},
        ]}
        onPress={() => setActiveTab('topics')}
      >
        <Text style={[
          styles.tabText,
          {color: activeTab === 'topics' ? '#fff' : theme.text},
        ]}>
          文章
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.tab,
          {backgroundColor: activeTab === 'boards' ? theme.primary : theme.background},
          {borderColor: activeTab === 'boards' ? 'transparent' : '#e0e0e0'},
        ]}
        onPress={() => setActiveTab('boards')}
      >
        <Text style={[
          styles.tabText,
          {color: activeTab === 'boards' ? '#fff' : theme.text},
        ]}>
          版面
        </Text>
      </TouchableOpacity>
    </View>
  );

  // 渲染文章项 - 卡片样式
  const renderTopicItem = ({item}: {item: any}) => (
    <TouchableOpacity
      style={[styles.topicItem, {backgroundColor: theme.cardBackground, borderBottomColor: theme.border}]}
      onPress={() => {
        if (item.boardName && item.topicId) {
          // 点击时自动标记已读
          markAsReadSilently(item);
          
          navigation.navigate('PostDetail', {
            board: item.boardName,
            postId: item.topicId,
          });
        }
      }}
      activeOpacity={0.7}
    >
      <View style={styles.topicHeader}>
        <Text style={[styles.topicTitle, {color: theme.text}]} numberOfLines={2}>
          {item.subject}
        </Text>
        {item.hasNewReply && (
          <View style={[styles.newReplyBadge, {backgroundColor: theme.primary}]}>
            <Text style={styles.newReplyText}>新</Text>
          </View>
        )}
      </View>
      <View style={styles.topicMeta}>
        <Text style={[styles.topicBoard, {color: theme.primary}]}>
          {item.boardTitle || item.boardName}
        </Text>
        <Text style={[styles.topicAuthor, {color: theme.secondaryText}]}>
          {item.authorNick || item.author}
        </Text>
        {item.postTime && (
          <Text style={[styles.topicTime, {color: theme.secondaryText}]}>
            {formatRelativeTime(item.postTime)}
          </Text>
        )}
        {item.replyCount !== undefined && (
          <Text style={[styles.topicReply, {color: theme.secondaryText}]}>
            {item.replyCount}回复
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  // 渲染隐藏的删除按钮
  const renderHiddenItem = ({item}: {item: any}) => (
    <View style={styles.rowBack}>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleRemoveFavorite(item)}
      >
        <Text style={styles.deleteButtonText}>取消收藏</Text>
      </TouchableOpacity>
    </View>
  );

  // 渲染版面项 - 卡片样式
  const renderBoardItem = ({item}: {item: Board}) => (
    <TouchableOpacity
      style={[styles.boardItem, {backgroundColor: theme.cardBackground, borderBottomColor: theme.border}]}
      onPress={() => {
        navigation.navigate('MainTabs', {
          screen: 'Board',
          params: {
            board: item.id || item.name,
            boardName: item.chineseName || item.name,
            source: 'favorites',
          },
        });
      }}
      activeOpacity={0.7}
    >
      <View style={styles.boardInfo}>
        <Text style={[styles.boardName, {color: theme.text}]}>
          {item.chineseName || item.name}
        </Text>
        {item.description && (
          <Text style={[styles.boardDesc, {color: theme.secondaryText}]} numberOfLines={1}>
            {item.description}
          </Text>
        )}
      </View>
      <Text style={[styles.boardArrow, {color: theme.secondaryText}]}>›</Text>
    </TouchableOpacity>
  );

  // 渲染底部加载
  const renderFooter = () => {
    if (activeTab !== 'topics' || !loadingMore) {
      return null;
    }
    
    return (
      <View style={styles.footerContainer}>
        <ActivityIndicator size="small" color={theme.primary} />
        <Text style={[styles.footerText, {color: theme.secondaryText}]}>加载中...</Text>
      </View>
    );
  };

  // 渲染空状态
  const renderEmpty = () => {
    if (loading) {
      return null;
    }
    
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, {color: theme.secondaryText}]}>
          {activeTab === 'topics' ? '暂无收藏的文章' : '暂无收藏的版面'}
        </Text>
      </View>
    );
  };

  if (loading && (activeTab === 'topics' ? topics.length === 0 : boards.length === 0)) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: theme.background}]}>
        {renderTabs()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.background}]}>
      {renderTabs()}
      {activeTab === 'topics' ? (
        <SwipeListView
          data={topics}
          renderItem={renderTopicItem}
          renderHiddenItem={renderHiddenItem}
          keyExtractor={(item, index) => `topic-${item.id || item.topicId}-${index}`}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          contentContainerStyle={
            topics.length === 0
              ? styles.emptyList
              : {paddingTop: SPACING.md, paddingBottom: SPACING.md}
          }
          rightOpenValue={-100}
          disableRightSwipe
          closeOnRowPress
          closeOnScroll
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }
        />
      ) : (
        <SwipeListView
          data={boards}
          renderItem={renderBoardItem}
          renderHiddenItem={() => null}
          keyExtractor={(item, index) => `board-${item.id || item.name}-${index}`}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={
            boards.length === 0
              ? styles.emptyList
              : {paddingTop: SPACING.md, paddingBottom: SPACING.md}
          }
          disableRightSwipe
          disableLeftSwipe
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }
        />
      )}
    </SafeAreaView>
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
  // Tab切换 - 横向胶囊样式
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: SPACING.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
  },
  activeTab: {
    borderColor: 'transparent',
  },
  tabText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  // 滑动删除相关样式
  rowBack: {
    alignItems: 'flex-end',
    backgroundColor: '#f5f5f5',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingRight: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: '100%',
    borderTopRightRadius: BORDER_RADIUS.lg,
    borderBottomRightRadius: BORDER_RADIUS.lg,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  // 文章项 - 卡片样式
  topicItem: {
    padding: SPACING.lg,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  topicHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  topicTitle: {
    flex: 1,
    fontSize: FONT_SIZE.lg,
    fontWeight: '500',
    lineHeight: scaleModerate(22),
  },
  newReplyBadge: {
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
    marginLeft: SPACING.sm,
  },
  newReplyText: {
    color: '#fff',
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },
  topicMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  topicBoard: {
    fontSize: FONT_SIZE.sm,
    marginRight: SPACING.md,
  },
  topicAuthor: {
    fontSize: FONT_SIZE.sm,
    marginRight: SPACING.md,
  },
  topicTime: {
    fontSize: FONT_SIZE.sm,
    marginRight: SPACING.md,
  },
  topicReply: {
    fontSize: FONT_SIZE.sm,
  },
  // 版面项 - 卡片样式
  boardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  boardInfo: {
    flex: 1,
  },
  boardName: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '500',
    marginBottom: SPACING.xs,
  },
  boardDesc: {
    fontSize: FONT_SIZE.sm,
  },
  boardArrow: {
    fontSize: scaleModerate(24),
    marginLeft: SPACING.md,
  },
  // 底部加载
  footerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  footerText: {
    fontSize: FONT_SIZE.sm,
    marginLeft: SPACING.sm,
  },
  // 空状态
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
  },
  emptyList: {
    flex: 1,
  },
  emptyText: {
    fontSize: FONT_SIZE.lg,
  },
});

export default FavoritesScreen;
