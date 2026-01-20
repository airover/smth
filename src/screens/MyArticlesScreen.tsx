import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  Dimensions,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getMyArticles, getMyLikes, MyArticle} from '../services/api';
import {formatRelativeTime} from '../utils/timeFormat';
import {useTheme} from '../components/ThemedComponents';
import {useSettings} from '../context/SettingsContext';
import {getFontSizes} from '../utils/theme';
import {cleanHtml} from '../utils/htmlParser';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  scaleModerate,
} from '../utils/responsive';

// 缓存 key
const MY_ARTICLES_CACHE_KEY = 'my_articles_cache';
const MY_REPLIES_CACHE_KEY = 'my_replies_cache';
const MY_LIKES_CACHE_KEY = 'my_likes_cache';
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
  const {settings} = useSettings();
  const fontSizes = getFontSizes(settings.fontSize);
  
  // Tab状态：0=帖子, 1=回复, 2=喜欢
  const [activeTab, setActiveTab] = useState<0 | 1 | 2>(0);
  
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
  
  // 喜欢数据
  const [likes, setLikes] = useState<MyArticle[]>([]);
  const [likesPage, setLikesPage] = useState(1);
  const [likesTotal, setLikesTotal] = useState(0);
  const [likesHasMore, setLikesHasMore] = useState(false);
  
  // 加载状态
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // 防止重复加载
  const isLoadingRef = useRef(false);

  // 加载缓存数据
  const loadCachedData = async (type: 0 | 1 | 2): Promise<CachedData | null> => {
    try {
      const cacheKey = type === 0 ? MY_ARTICLES_CACHE_KEY : type === 1 ? MY_REPLIES_CACHE_KEY : MY_LIKES_CACHE_KEY;
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
  const saveCachedData = async (type: 0 | 1 | 2, data: Omit<CachedData, 'timestamp'>) => {
    try {
      const cacheKey = type === 0 ? MY_ARTICLES_CACHE_KEY : type === 1 ? MY_REPLIES_CACHE_KEY : MY_LIKES_CACHE_KEY;
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
  const loadData = async (type: 0 | 1 | 2, page: number = 1, isRefresh: boolean = false) => {
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
          } else if (type === 1) {
            setReplies(cached.articles);
            setRepliesPage(cached.page);
            setRepliesTotal(cached.total);
            setRepliesHasMore(cached.hasMore);
          } else {
            setLikes(cached.articles);
            setLikesPage(cached.page);
            setLikesTotal(cached.total);
            setLikesHasMore(cached.hasMore);
          }
          setLoading(false);
          
          // 异步刷新数据
          loadData(type, 1, true);
          return;
        }
      }
      
      const result = type === 2 ? await getMyLikes(page) : await getMyArticles(type, page);
      
      if (page === 1) {
        // 第一页，替换数据
        if (type === 0) {
          setArticles(result.articles);
          setArticlesPage(1);
          setArticlesTotal(result.total);
          setArticlesHasMore(result.hasMore);
        } else if (type === 1) {
          setReplies(result.articles);
          setRepliesPage(1);
          setRepliesTotal(result.total);
          setRepliesHasMore(result.hasMore);
        } else {
          setLikes(result.articles);
          setLikesPage(1);
          setLikesTotal(result.total);
          setLikesHasMore(result.hasMore);
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
        } else if (type === 1) {
          const newReplies = [...replies, ...result.articles];
          setReplies(newReplies);
          setRepliesPage(page);
          setRepliesHasMore(result.hasMore);
        } else {
          const newLikes = [...likes, ...result.articles];
          setLikes(newLikes);
          setLikesPage(page);
          setLikesHasMore(result.hasMore);
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
    const currentData = activeTab === 0 ? articles : activeTab === 1 ? replies : likes;
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
    const hasMore = activeTab === 0 ? articlesHasMore : activeTab === 1 ? repliesHasMore : likesHasMore;
    const currentPage = activeTab === 0 ? articlesPage : activeTab === 1 ? repliesPage : likesPage;
    
    if (!hasMore || loadingMore || isLoadingRef.current) {
      return;
    }
    
    setLoadingMore(true);
    loadData(activeTab, currentPage + 1);
  }, [activeTab, articlesHasMore, repliesHasMore, likesHasMore, articlesPage, repliesPage, likesPage, loadingMore]);

  // 点击帖子
  const handleArticlePress = (item: MyArticle) => {
    navigation.navigate('PostDetail', {
      board: item.board,
      postId: item.topicId,
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
        <Text 
          style={[
            styles.title, 
            {color: theme.text, fontSize: fontSizes.content, lineHeight: fontSizes.lineHeight}
          ]} 
          numberOfLines={2}
        >
          {item.title}
        </Text>
        {/* 回复和喜欢类型显示内容摘要 */}
        {(activeTab === 1 || activeTab === 2) && item.content && (
          <Text 
            style={[
              styles.contentPreview, 
              {color: theme.secondaryText, fontSize: fontSizes.quote, lineHeight: fontSizes.quoteLineHeight}
            ]} 
            numberOfLines={2}
          >
            {cleanHtml(item.content, {collapseWhitespace: true})}
          </Text>
        )}
        {/* 底部元信息：版面、回复数、时间在同一行 */}
        <View style={styles.metaRow}>
          <View style={styles.metaLeft}>
            <Text style={[styles.boardTag, {backgroundColor: theme.primary + '20', color: theme.primary}]}>
              {item.boardName || item.board}
            </Text>
            {item.replyCount !== undefined && item.replyCount > 0 && (
              <Text style={[styles.replyCount, {color: theme.secondaryText}]}>
                {item.replyCount} 回复
              </Text>
            )}
          </View>
          <Text style={[styles.timeText, {color: theme.secondaryText}]}>
            {formatRelativeTime(item.time)}
          </Text>
        </View>
      </View>
      <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
    </TouchableOpacity>
  );

  // 渲染列表底部
  const renderFooter = () => {
    const hasMore = activeTab === 0 ? articlesHasMore : activeTab === 1 ? repliesHasMore : likesHasMore;
    
    if (loadingMore) {
      return (
        <View style={styles.footerContainer}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.footerText, {color: theme.secondaryText}]}>加载中...</Text>
        </View>
      );
    }
    
    if (!hasMore && (activeTab === 0 ? articles : activeTab === 1 ? replies : likes).length > 0) {
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
        <Text style={styles.emptyIcon}>{activeTab === 0 ? '📝' : activeTab === 1 ? '💬' : '❤️'}</Text>
        <Text style={[styles.emptyText, {color: theme.secondaryText}]}>
          {activeTab === 0 ? '暂无发表的帖子' : activeTab === 1 ? '暂无回复记录' : '暂无喜欢的内容'}
        </Text>
        <Text style={[styles.emptyHint, {color: theme.secondaryText}]}>
          {activeTab === 0 ? '去版面发表你的第一篇帖子吧' : activeTab === 1 ? '去参与讨论留下你的第一条回复吧' : '去给喜欢的帖子点个赞吧'}
        </Text>
      </View>
    );
  };

  // 渲染头部统计
  const renderHeader = () => {
    const total = activeTab === 0 ? articlesTotal : activeTab === 1 ? repliesTotal : likesTotal;
    const dataLength = (activeTab === 0 ? articles : activeTab === 1 ? replies : likes).length;
    
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
  const currentData = activeTab === 0 ? articles : activeTab === 1 ? replies : likes;

  return (
    <View style={[styles.container, {backgroundColor: theme.background}]}>
      {/* Tab切换栏 - 横向滚动胶囊样式 */}
      <View style={[styles.tabContainer, {backgroundColor: theme.cardBackground, borderBottomColor: theme.border}]}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 0 && [styles.activeTab, {backgroundColor: theme.primary}],
            {backgroundColor: activeTab === 0 ? theme.primary : theme.background},
          ]}
          onPress={() => setActiveTab(0)}
        >
          <Text
            style={[
              styles.tabText,
              {color: activeTab === 0 ? '#fff' : theme.text},
            ]}
          >
            帖子
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 1 && [styles.activeTab, {backgroundColor: theme.primary}],
            {backgroundColor: activeTab === 1 ? theme.primary : theme.background},
          ]}
          onPress={() => setActiveTab(1)}
        >
          <Text
            style={[
              styles.tabText,
              {color: activeTab === 1 ? '#fff' : theme.text},
            ]}
          >
            回复
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 2 && [styles.activeTab, {backgroundColor: theme.primary}],
            {backgroundColor: activeTab === 2 ? theme.primary : theme.background},
          ]}
          onPress={() => setActiveTab(2)}
        >
          <Text
            style={[
              styles.tabText,
              {color: activeTab === 2 ? '#fff' : theme.text},
            ]}
          >
            喜欢
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
  // Tab 样式 - 横向胶囊样式
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
    borderColor: '#e0e0e0',
  },
  activeTab: {
    borderColor: 'transparent',
  },
  tabText: {
    fontSize: FONT_SIZE.md,
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
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  itemContent: {
    flex: 1,
  },
  title: {
    // fontSize 和 lineHeight 由 fontSizes 动态控制
    fontWeight: '500',
    marginBottom: SPACING.sm,
  },
  contentPreview: {
    // fontSize 和 lineHeight 由 fontSizes 动态控制
    marginBottom: SPACING.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  boardTag: {
    fontSize: 10,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
    overflow: 'hidden',
    marginRight: SPACING.sm,
  },
  replyCount: {
    fontSize: 10,
  },
  timeText: {
    fontSize: 10,
    textAlign: 'right',
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
