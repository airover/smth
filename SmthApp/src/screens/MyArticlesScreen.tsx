import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  Dimensions,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getMyArticles, MyArticle} from '../services/api';
import {formatRelativeTime} from '../utils/timeFormat';
import {useTheme} from '../components/ThemedComponents';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  scaleModerate,
} from '../utils/responsive';

// 缓存 key
const MY_ARTICLES_CACHE_KEY = 'my_articles_cache';
const MY_REPLIES_CACHE_KEY = 'my_replies_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

interface CachedData {
  articles: MyArticle[];
  timestamp: number;
  page: number;
  total: number;
  hasMore: boolean;
}

const MyArticlesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  
  // Tab状态：0=帖子, 1=回复
  const [activeTab, setActiveTab] = useState<0 | 1>(0);
  
  // 帖子数据
  const [articles, setArticles] = useState<MyArticle[]>([]);
  const [articlesPage, setArticlesPage] = useState(1);
  const [articlesTotal, setArticlesTotal] = useState(0);
  const [articlesHasMore, setArticlesHasMore] = useState(false);
  
  // 回复数据
  const [replies, setReplies] = useState<MyArticle[]>([]);
  const [repliesPage, setRepliesPage] = useState(1);
  const [repliesTotal, setRepliesTotal] = useState(0);
  const [repliesHasMore, setRepliesHasMore] = useState(false);
  
  // 加载状态
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // 防止重复加载
  const isLoadingRef = useRef(false);

  // 加载缓存数据
  const loadCachedData = async (type: 0 | 1): Promise<CachedData | null> => {
    try {
      const cacheKey = type === 0 ? MY_ARTICLES_CACHE_KEY : MY_REPLIES_CACHE_KEY;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const data: CachedData = JSON.parse(cached);
        // 检查缓存是否过期
        if (Date.now() - data.timestamp < CACHE_DURATION) {
          return data;
        }
      }
    } catch (error) {
      console.error('loadCachedData error:', error);
    }
    return null;
  };

  // 保存缓存数据
  const saveCachedData = async (type: 0 | 1, data: Omit<CachedData, 'timestamp'>) => {
    try {
      const cacheKey = type === 0 ? MY_ARTICLES_CACHE_KEY : MY_REPLIES_CACHE_KEY;
      const cachedData: CachedData = {
        ...data,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(cacheKey, JSON.stringify(cachedData));
    } catch (error) {
      console.error('saveCachedData error:', error);
    }
  };

  // 加载数据
  const loadData = async (type: 0 | 1, page: number = 1, isRefresh: boolean = false) => {
    if (isLoadingRef.current && !isRefresh) {
      return;
    }
    
    isLoadingRef.current = true;
    
    try {
      // 如果是首次加载，先尝试从缓存获取
      if (page === 1 && !isRefresh) {
        const cached = await loadCachedData(type);
        if (cached) {
          console.log(`使用缓存数据 type=${type}`);
          if (type === 0) {
            setArticles(cached.articles);
            setArticlesPage(cached.page);
            setArticlesTotal(cached.total);
            setArticlesHasMore(cached.hasMore);
          } else {
            setReplies(cached.articles);
            setRepliesPage(cached.page);
            setRepliesTotal(cached.total);
            setRepliesHasMore(cached.hasMore);
          }
          setLoading(false);
          
          // 异步刷新数据
          loadData(type, 1, true);
          return;
        }
      }
      
      const result = await getMyArticles(type, page);
      
      if (page === 1) {
        // 第一页，替换数据
        if (type === 0) {
          setArticles(result.articles);
          setArticlesPage(1);
          setArticlesTotal(result.total);
          setArticlesHasMore(result.hasMore);
        } else {
          setReplies(result.articles);
          setRepliesPage(1);
          setRepliesTotal(result.total);
          setRepliesHasMore(result.hasMore);
        }
        
        // 保存到缓存
        await saveCachedData(type, {
          articles: result.articles,
          page: 1,
          total: result.total,
          hasMore: result.hasMore,
        });
      } else {
        // 加载更多，追加数据
        if (type === 0) {
          const newArticles = [...articles, ...result.articles];
          setArticles(newArticles);
          setArticlesPage(page);
          setArticlesHasMore(result.hasMore);
        } else {
          const newReplies = [...replies, ...result.articles];
          setReplies(newReplies);
          setRepliesPage(page);
          setRepliesHasMore(result.hasMore);
        }
      }
    } catch (error) {
      console.error('loadData error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      isLoadingRef.current = false;
    }
  };

  // 初始加载
  useEffect(() => {
    loadData(activeTab);
  }, []);

  // Tab切换时加载
  useEffect(() => {
    const currentData = activeTab === 0 ? articles : replies;
    if (currentData.length === 0) {
      setLoading(true);
      loadData(activeTab);
    }
  }, [activeTab]);

  // 页面获得焦点时刷新
  useFocusEffect(
    useCallback(() => {
      // 页面回来时不自动刷新，用户可以下拉刷新
    }, [])
  );

  // 下拉刷新
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(activeTab, 1, true);
  }, [activeTab]);

  // 加载更多
  const onLoadMore = useCallback(() => {
    const hasMore = activeTab === 0 ? articlesHasMore : repliesHasMore;
    const currentPage = activeTab === 0 ? articlesPage : repliesPage;
    
    if (!hasMore || loadingMore || isLoadingRef.current) {
      return;
    }
    
    setLoadingMore(true);
    loadData(activeTab, currentPage + 1);
  }, [activeTab, articlesHasMore, repliesHasMore, articlesPage, repliesPage, loadingMore]);

  // 点击帖子
  const handleArticlePress = (item: MyArticle) => {
    // 对于回复，如果有 topicId 则跳转到主题帖
    const postId = activeTab === 1 && item.topicId ? item.topicId : item.id;
    navigation.navigate('PostDetail', {
      board: item.board,
      postId: postId,
    });
  };

  // 渲染帖子项
  const renderItem = ({item}: {item: MyArticle}) => (
    <TouchableOpacity
      style={[styles.articleItem, {backgroundColor: theme.cardBackground}]}
      onPress={() => handleArticlePress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.itemContent}>
        <Text style={[styles.title, {color: theme.text}]} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.boardTag, {backgroundColor: theme.primary + '20', color: theme.primary}]}>
            {item.boardName || item.board}
          </Text>
          {item.replyCount !== undefined && item.replyCount > 0 && (
            <Text style={[styles.metaText, {color: theme.secondaryText}]}>
              {item.replyCount} 回复
            </Text>
          )}
        </View>
        <Text style={[styles.timeText, {color: theme.secondaryText}]}>
          {formatRelativeTime(new Date(item.time).toISOString())}
        </Text>
      </View>
      <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
    </TouchableOpacity>
  );

  // 渲染列表底部
  const renderFooter = () => {
    const hasMore = activeTab === 0 ? articlesHasMore : repliesHasMore;
    
    if (loadingMore) {
      return (
        <View style={styles.footerContainer}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.footerText, {color: theme.secondaryText}]}>加载中...</Text>
        </View>
      );
    }
    
    if (!hasMore && (activeTab === 0 ? articles : replies).length > 0) {
      return (
        <View style={styles.footerContainer}>
          <Text style={[styles.footerText, {color: theme.secondaryText}]}>没有更多了</Text>
        </View>
      );
    }
    
    return null;
  };

  // 渲染空状态
  const renderEmpty = () => {
    if (loading) {
      return null;
    }
    
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>{activeTab === 0 ? '📝' : '💬'}</Text>
        <Text style={[styles.emptyText, {color: theme.secondaryText}]}>
          {activeTab === 0 ? '暂无发表的帖子' : '暂无回复记录'}
        </Text>
        <Text style={[styles.emptyHint, {color: theme.secondaryText}]}>
          {activeTab === 0 ? '去版面发表你的第一篇帖子吧' : '去参与讨论留下你的第一条回复吧'}
        </Text>
      </View>
    );
  };

  // 渲染头部统计
  const renderHeader = () => {
    const total = activeTab === 0 ? articlesTotal : repliesTotal;
    const dataLength = (activeTab === 0 ? articles : replies).length;
    
    if (dataLength === 0) {
      return null;
    }
    
    return (
      <View style={styles.header}>
        <Text style={[styles.headerText, {color: theme.secondaryText}]}>
          共 {total} 条记录
        </Text>
      </View>
    );
  };

  // 当前显示的数据
  const currentData = activeTab === 0 ? articles : replies;

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.background}]}>
      {/* Tab切换栏 */}
      <View style={[styles.tabContainer, {backgroundColor: theme.cardBackground, borderBottomColor: theme.border}]}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 0 && [styles.activeTab, {borderBottomColor: theme.primary}],
          ]}
          onPress={() => setActiveTab(0)}
        >
          <Text
            style={[
              styles.tabText,
              {color: theme.secondaryText},
              activeTab === 0 && [styles.activeTabText, {color: theme.primary}],
            ]}
          >
            我的帖子
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 1 && [styles.activeTab, {borderBottomColor: theme.primary}],
          ]}
          onPress={() => setActiveTab(1)}
        >
          <Text
            style={[
              styles.tabText,
              {color: theme.secondaryText},
              activeTab === 1 && [styles.activeTabText, {color: theme.primary}],
            ]}
          >
            我的回复
          </Text>
        </TouchableOpacity>
      </View>

      {/* 加载中 */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={currentData}
          renderItem={renderItem}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          contentContainerStyle={currentData.length === 0 ? styles.emptyList : styles.list}
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
  // Tab 样式
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '500',
  },
  activeTabText: {
    fontWeight: '600',
  },
  // 列表样式
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
  articleItem: {
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemContent: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '500',
    marginBottom: SPACING.sm + 2,
    lineHeight: FONT_SIZE.xxl,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs + 2,
  },
  boardTag: {
    fontSize: FONT_SIZE.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs - 1,
    borderRadius: BORDER_RADIUS.sm,
    overflow: 'hidden',
    marginRight: SPACING.sm + 2,
  },
  metaText: {
    fontSize: FONT_SIZE.sm,
  },
  timeText: {
    fontSize: FONT_SIZE.xs,
  },
  chevron: {
    fontSize: FONT_SIZE.xl,
    marginLeft: SPACING.sm,
  },
  // 底部样式
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
  // 空状态样式
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scaleModerate(40),
  },
  emptyIcon: {
    fontSize: scaleModerate(64),
    marginBottom: SPACING.lg,
  },
  emptyText: {
    fontSize: FONT_SIZE.lg,
    marginBottom: SPACING.sm,
  },
  emptyHint: {
    fontSize: FONT_SIZE.md,
    textAlign: 'center',
  },
});

export default MyArticlesScreen;
