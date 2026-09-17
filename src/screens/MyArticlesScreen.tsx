import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  FlatList,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {getMyArticles, getMyLikes, MyArticle} from '../services/api';
import {
  getCacheWithTimestamp,
  readPersistedSnapshot,
  setCache,
  setCacheWithTimestamp,
  writePersistedSnapshot,
} from '../services/cacheManager';
import {getCurrentUsername} from '../services/auth';
import {formatRelativeTime} from '../utils/timeFormat';
import {useTheme} from '../components/ThemedComponents';
import {useSettings} from '../context/SettingsContext';
import {getFontSizes} from '../utils/theme';
import {cleanHtml} from '../utils/htmlParser';
import {ArticleIcon, ChevronRightIcon, HeartIcon, MessageIcon} from '../components/SvgIcons';
import {getCardElevation} from '../utils/theme';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  scaleModerate,
} from '../utils/responsive';
import {useFocusRefresh} from '../hooks/useFocusRefresh';

type MyArticlesTab = 0 | 1 | 2;
type MyArticlesCategory = 'myArticles' | 'myReplies' | 'myLikes';

interface ArticlesSnapshot {
  articles: MyArticle[];
  page: number;
  total: number;
  hasMore: boolean;
  owner?: string;
}

export const MY_ARTICLES_STORAGE_KEYS = {
  articles: 'my_articles_cache',
  replies: 'my_replies_cache',
  likes: 'my_likes_cache',
} as const;

const MY_ARTICLES_MEMORY_FRESH_TTL = 2 * 60 * 1000;
const MY_ARTICLES_PERSIST_MAX_STALE = 7 * 24 * 60 * 60 * 1000;
const MY_ARTICLES_REFRESH_INTERVAL = 2 * 60 * 1000;

const STORAGE_KEY_BY_TAB: Record<MyArticlesTab, string> = {
  0: MY_ARTICLES_STORAGE_KEYS.articles,
  1: MY_ARTICLES_STORAGE_KEYS.replies,
  2: MY_ARTICLES_STORAGE_KEYS.likes,
};

const CATEGORY_BY_TAB: Record<MyArticlesTab, MyArticlesCategory> = {
  0: 'myArticles',
  1: 'myReplies',
  2: 'myLikes',
};

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
  const [articlesLoaded, setArticlesLoaded] = useState(false);

  // 回复数据
  const [replies, setReplies] = useState<MyArticle[]>([]);
  const [repliesPage, setRepliesPage] = useState(1);
  const [repliesTotal, setRepliesTotal] = useState(0);
  const [repliesHasMore, setRepliesHasMore] = useState(false);
  const [repliesLoaded, setRepliesLoaded] = useState(false);

  // 喜欢数据
  const [likes, setLikes] = useState<MyArticle[]>([]);
  const [likesPage, setLikesPage] = useState(1);
  const [likesTotal, setLikesTotal] = useState(0);
  const [likesHasMore, setLikesHasMore] = useState(false);
  const [likesLoaded, setLikesLoaded] = useState(false);

  // 加载状态：是否正在下拉刷新/加载更多。是否显示首屏骨架屏改用下面按 tab 独立的
  // *Loaded 判断——它们在切 tab 的当次渲染里就能算出来，不需要等 effect 跑完，
  // 避免"切到还没加载过的 tab 时，先用旧的 loading 值渲染一帧空列表"的闪烁。
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // 防止重复加载
  const isLoadingRef = useRef(false);

  // 加载缓存数据
  // 把一份快照（本地状态或缓存里取出的）应用到对应 tab 的 state 上
  const applySnapshot = useCallback((type: MyArticlesTab, snapshot: ArticlesSnapshot) => {
    if (type === 0) {
      setArticles(snapshot.articles);
      setArticlesPage(snapshot.page);
      setArticlesTotal(snapshot.total);
      setArticlesHasMore(snapshot.hasMore);
    } else if (type === 1) {
      setReplies(snapshot.articles);
      setRepliesPage(snapshot.page);
      setRepliesTotal(snapshot.total);
      setRepliesHasMore(snapshot.hasMore);
    } else {
      setLikes(snapshot.articles);
      setLikesPage(snapshot.page);
      setLikesTotal(snapshot.total);
      setLikesHasMore(snapshot.hasMore);
    }
  }, []);

  const setLoadedFlag = useCallback((type: MyArticlesTab, value: boolean) => {
    if (type === 0) {
      setArticlesLoaded(value);
    } else if (type === 1) {
      setRepliesLoaded(value);
    } else {
      setLikesLoaded(value);
    }
  }, []);

  // 加载数据。页面进入/切换 tab 时会先使用新鲜缓存；过期缓存只负责首屏兜底，
  // 然后由静默请求更新。
  const loadData = useCallback(async (
    type: MyArticlesTab,
    page: number = 1,
    isRefresh: boolean = false,
    _silent: boolean = false,
  ) => {
    if (isLoadingRef.current) {
      return;
    }

    isLoadingRef.current = true;

    try {
      const currentUsername = page === 1 ? await getCurrentUsername() : null;

      let shouldRequest = true;

      // 先恢复缓存。新鲜缓存直接使用并跳过请求；过期但仍在兜底期内的缓存先展示，
      // 再由本次进入页面的静默刷新检查更新。
      if (page === 1 && !isRefresh) {
        const cached = getCacheWithTimestamp<ArticlesSnapshot>(CATEGORY_BY_TAB[type]);
        let cachedTimestamp: number | null = null;

        if (
          cached
          && cached.data.owner === currentUsername
          && Date.now() - cached.timestamp < MY_ARTICLES_PERSIST_MAX_STALE
        ) {
          applySnapshot(type, cached.data);
          setLoadedFlag(type, true);
          cachedTimestamp = cached.timestamp;
        } else if (currentUsername) {
          // 持久化缓存允许比内存新鲜期更久的兜底，但超过最大兜底期就不再展示。
          const persisted = await readPersistedSnapshot<ArticlesSnapshot>(
            STORAGE_KEY_BY_TAB[type],
            MY_ARTICLES_PERSIST_MAX_STALE,
          );
          if (
            persisted?.data &&
            !persisted.isExpired &&
            persisted.data.owner === currentUsername &&
            Array.isArray(persisted.data.articles)
          ) {
            applySnapshot(type, persisted.data);
            setLoadedFlag(type, true);
            cachedTimestamp = Date.now() - persisted.age;
            setCacheWithTimestamp(
              CATEGORY_BY_TAB[type],
              undefined,
              persisted.data,
              cachedTimestamp,
            );
          }
        }

        if (cachedTimestamp !== null) {
          shouldRequest = Date.now() - cachedTimestamp >= MY_ARTICLES_MEMORY_FRESH_TTL;
          if (!shouldRequest) {
            console.log(`[Cache] my-${type} 命中新鲜缓存，跳过请求`);
          }
        }
      }

      if (!shouldRequest) {
        return;
      }

      const result = type === 2 ? await getMyLikes(page) : await getMyArticles(type, page);

      if (page === 1) {
        // 第一页，替换数据
        const snapshot: ArticlesSnapshot = {
          articles: result.articles,
          page: 1,
          total: result.total,
          hasMore: result.hasMore,
          owner: currentUsername || undefined,
        };
        applySnapshot(type, snapshot);
        setCache(CATEGORY_BY_TAB[type], undefined, snapshot);
        if (currentUsername) {
          await writePersistedSnapshot(STORAGE_KEY_BY_TAB[type], snapshot);
        }
      } else {
        // 加载更多，追加数据
        if (type === 0) {
          setArticles(previous => [...previous, ...result.articles]);
          setArticlesPage(page);
          setArticlesHasMore(result.hasMore);
        } else if (type === 1) {
          setReplies(previous => [...previous, ...result.articles]);
          setRepliesPage(page);
          setRepliesHasMore(result.hasMore);
        } else {
          setLikes(previous => [...previous, ...result.articles]);
          setLikesPage(page);
          setLikesHasMore(result.hasMore);
        }
      }
    } catch (error) {
      console.error('loadData error:', error);
    } finally {
      // 不管成功还是失败都标记为“已尝试加载过”，避免请求失败时永远卡在骨架屏；
      // 失败时如果也没有缓存可用，会落到空状态而不是转不停的菊花。
      setLoadedFlag(type, true);
      setRefreshing(false);
      setLoadingMore(false);
      isLoadingRef.current = false;
    }
  }, [applySnapshot, setLoadedFlag]);

  // 首次挂载和 Tab 切换都会命中下面这个 effect（activeTab 的“首次渲染”本身就算
  // 一次依赖变化），不需要再单独加一个只在挂载时跑的效果。是否需要加载改判断
  // “这个 tab 是否已经加载过”（*Loaded），而不是判断“当前数据是否为空”——后者在
  // 切到一个从未加载过的 tab 时，effect 触发前的那一次渲染就已经是“数据为空”，
  // 会先用旧的渲染分支画一帧空列表，才轮到这个 effect 去纠正。
  useEffect(() => {
    const currentLoaded = activeTab === 0 ? articlesLoaded : activeTab === 1 ? repliesLoaded : likesLoaded;
    loadData(activeTab, 1, false, currentLoaded);
  }, [activeTab, articlesLoaded, likesLoaded, loadData, repliesLoaded]);

  const refreshActiveTabSilently = useCallback(() => {
    const currentPage = activeTab === 0 ? articlesPage : activeTab === 1 ? repliesPage : likesPage;
    if (currentPage > 1) {
      // 已经加载了深页时不在焦点刷新中重置为第一页，避免打断列表阅读。
      return Promise.resolve();
    }
    return loadData(activeTab, 1, false, true);
  }, [activeTab, articlesPage, repliesPage, likesPage, loadData]);

  useFocusRefresh(refreshActiveTabSilently, {
    intervalMs: MY_ARTICLES_REFRESH_INTERVAL,
    skipFirstFocus: true,
  });

  // 下拉刷新
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(activeTab, 1, true, false);
  }, [activeTab, loadData]);

  // 加载更多
  const onLoadMore = useCallback(() => {
    const hasMore = activeTab === 0 ? articlesHasMore : activeTab === 1 ? repliesHasMore : likesHasMore;
    const currentPage = activeTab === 0 ? articlesPage : activeTab === 1 ? repliesPage : likesPage;
    
    if (!hasMore || loadingMore || isLoadingRef.current) {
      return;
    }
    
    setLoadingMore(true);
    loadData(activeTab, currentPage + 1);
  }, [activeTab, articlesHasMore, repliesHasMore, likesHasMore, articlesPage, repliesPage, likesPage, loadingMore, loadData]);

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
      style={[styles.articleItem, {backgroundColor: theme.cardBackground}, getCardElevation(theme)]}
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
      <ChevronRightIcon size={18} color={theme.chevron} />
    </TouchableOpacity>
  );

  // 渲染列表底部
  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View style={styles.footerContainer}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.footerText, {color: theme.secondaryText}]}>加载中...</Text>
        </View>
      );
    }

    // 到底后留白，不再显示“没有更多了”提示。
    return null;
  };

  // 渲染空状态（只有当前 tab 已经加载完成时才会被渲染到，见下方 FlatList 的条件）
  const renderEmpty = () => {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIcon}>
          {activeTab === 0 ? (
            <ArticleIcon size={60} color={theme.secondaryText} />
          ) : activeTab === 1 ? (
            <MessageIcon size={60} color={theme.secondaryText} />
          ) : (
            <HeartIcon size={60} color={theme.secondaryText} />
          )}
        </View>
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
  const currentLoaded = activeTab === 0 ? articlesLoaded : activeTab === 1 ? repliesLoaded : likesLoaded;

  return (
    <View style={[styles.container, {backgroundColor: theme.background}]}>
      {/* 与版面帖子列表一致的分段切换控件 */}
      <View style={styles.tabBarArea}>
        <View style={[styles.tabContainer, {backgroundColor: theme.placeholderBackground}]}>
          {(['帖子', '回复', '喜欢'] as const).map((label, index) => {
            const tab = index as 0 | 1 | 2;
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={label}
                style={[styles.tab, isActive && {backgroundColor: theme.primary}]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.8}>
                <Text style={[styles.tabText, {color: isActive ? '#fff' : theme.secondaryText}]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 加载中：按当前 tab 是否已经加载过判断，这个值和 activeTab 在同一次渲染里
          就能算出来，不用等 effect 跑完，切到未加载过的 tab 时不会先画一帧空列表 */}
      {!currentLoaded ? (
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
  tabBarArea: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  tabContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    padding: 3,
    borderRadius: 18,
  },
  tab: {
    flex: 1,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
  },
  tabText: {
    fontSize: 13,
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
});

export default MyArticlesScreen;
