import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {getTopTen, getHotPosts, getHotBoards, getReplyNotifications} from '../services/api';
import {TopTenItem, Board} from '../types';
import {formatRelativeTime} from '../utils/timeFormat';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getCache, setCache, getCacheWithTimestamp, setCacheWithTimestamp, clearCache, readPersistedSnapshot, writePersistedSnapshot} from '../services/cacheManager';
import {useTheme, SkeletonList} from '../components/ThemedComponents';
import {getCardElevation} from '../utils/theme';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
} from '../utils/responsive';
import {useReadPosts} from '../context/ReadPostsContext';
import {
  PullDownFavoritesOverlay,
  usePullDownFavorites,
} from '../components/PullDownFavoritesOverlay';
import FavoritesDrawer from '../components/FavoritesDrawer';
import {useFloatingHeader} from '../components/ThemeHeader';
import {BellIcon} from '../components/SvgIcons';
import {useFocusRefresh} from '../hooks/useFocusRefresh';

const AUTO_REFRESH_CHECK_INTERVAL = 60 * 1000;
const UNREAD_COUNT_REFRESH_INTERVAL = 30 * 1000;

// 缓存配置常量
const CACHE_CONFIG = {
  TOP_TEN: {
    MEMORY_FRESH_TTL: 2 * 60 * 1000,
    PERSIST_MAX_STALE: 24 * 60 * 60 * 1000,
  },
  HOT_BOARDS: {
    MEMORY_FRESH_TTL: 10 * 60 * 1000,
    PERSIST_MAX_STALE: 3 * 24 * 60 * 60 * 1000,
  },
  HOT_POSTS: {
    MEMORY_FRESH_TTL: 1 * 60 * 1000,
    PERSIST_MAX_STALE: 24 * 60 * 60 * 1000,
  },
};

// 三处持久化 key 沿用旧版本的字面量，保证升级后仍能读出已有的 AsyncStorage 数据。
export const TOP_TEN_STORAGE_KEY = 'topTen_cache';
export const HOT_BOARDS_STORAGE_KEY = 'hotBoards_cache';
export const HOT_POSTS_FIRST_PAGE_STORAGE_KEY = 'hotPosts_page1_cache';

type HomeSnapshotCategory = 'topTen' | 'hotBoards' | 'hotPostsFirstPage';

// 先查 cacheManager 内存层，miss 再查 AsyncStorage 持久层，命中后回填内存层，
// 供下一次同会话内的读取直接走内存。两层要不要都用、怎么组合，由这里（调用点）决定，
// cacheManager 本身不知道也不关心这件事。
const getCachedSnapshot = async <T,>(
  category: HomeSnapshotCategory,
  storageKey: string,
  memoryFreshTTL: number,
  persistMaxStale: number,
): Promise<{data: T; age: number; isExpired: boolean} | null> => {
  const memory = getCacheWithTimestamp<T>(category);
  if (memory) {
    const age = Date.now() - memory.timestamp;
    if (age < persistMaxStale) {
      return {data: memory.data, age, isExpired: age >= memoryFreshTTL};
    }
  }

  const persisted = await readPersistedSnapshot<T>(storageKey, persistMaxStale);
  if (persisted && !persisted.isExpired) {
    // 回填时保留持久快照的原始年龄，避免旧数据被重新标记成新缓存。
    setCacheWithTimestamp(category, undefined, persisted.data, Date.now() - persisted.age);
    return {
      data: persisted.data,
      age: persisted.age,
      isExpired: persisted.age >= memoryFreshTTL,
    };
  }
  return null;
};

const saveCachedSnapshot = <T,>(
  category: HomeSnapshotCategory,
  storageKey: string,
  data: T,
): void => {
  setCache(category, undefined, data);
  writePersistedSnapshot(storageKey, data);
};

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const setHeaderOptions = useFloatingHeader();
  const {isRead, markAsRead} = useReadPosts();
  const [topTen, setTopTen] = useState<TopTenItem[]>([]);
  const [hotPosts, setHotPosts] = useState<TopTenItem[]>([]);
  const [hotBoards, setHotBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hotPostsPage, setHotPostsPage] = useState(1);
  const [hasMoreHotPosts, setHasMoreHotPosts] = useState(true);
  const [loadingMoreHotPosts, setLoadingMoreHotPosts] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [unreadReplyCount, setUnreadReplyCount] = useState(0);
  const isSilentRefreshingRef = useRef(false);
  const apiRequestRef = useRef<Promise<void> | null>(null);
  const isRefreshInProgressRef = useRef(false);
  const unreadCountFetchedAtRef = useRef(0);
  const unreadCountRequestRef = useRef<Promise<void> | null>(null);
  const scrollOffsetYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const hasPendingSilentUpdateRef = useRef(false);
  const hasDisplayableDataRef = useRef(false);

  const loadUnreadReplyCount = useCallback(async (force = false): Promise<void> => {
    if (!force && Date.now() - unreadCountFetchedAtRef.current < UNREAD_COUNT_REFRESH_INTERVAL) {
      return;
    }
    if (unreadCountRequestRef.current) {
      return unreadCountRequestRef.current;
    }

    const request = (async () => {
      try {
        if (await AsyncStorage.getItem('isLoggedIn') !== 'true') {
          setUnreadReplyCount(0);
          unreadCountFetchedAtRef.current = Date.now();
          return;
        }
        const result = await getReplyNotifications(1, 1);
        setUnreadReplyCount(result.total);
        unreadCountFetchedAtRef.current = Date.now();
      } catch (error) {
        console.log('[Home] Load unread reply count failed:', error);
      }
    })();

    unreadCountRequestRef.current = request;
    try {
      await request;
    } finally {
      if (unreadCountRequestRef.current === request) {
        unreadCountRequestRef.current = null;
      }
    }
  }, []);

  const openReplyNotifications = useCallback(() => {
    navigation.navigate('Mail', {tab: 'reply'});
  }, [navigation]);

  // 下拉进入收藏抽屉
  const [drawerVisible, setDrawerVisible] = useState(false);
  const contentTranslateY = useRef(new Animated.Value(0)).current;
  const onRefreshRef = useRef<() => void>(() => {});

  const handleOpenDrawer = useCallback(() => {
    setDrawerVisible(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerVisible(false);
  }, []);

  const handlePullRefresh = useCallback(() => {
    onRefreshRef.current();
  }, []);

  const {
    pullOffset,
    state: pullDownState,
    onScrollBeginDrag: pullDownOnScrollBeginDrag,
    onScroll: pullDownOnScroll,
    onScrollEndDrag: pullDownOnScrollEndDrag,
    setRefreshing: setPullDownRefreshing,
    consumeNativeRefreshSuppression,
  } = usePullDownFavorites(handleOpenDrawer, handlePullRefresh);

  const canApplySilentRefreshToUI = useCallback(() => {
    return scrollOffsetYRef.current >= 0 && scrollOffsetYRef.current <= 8 && !isDraggingRef.current;
  }, []);

  const loadDataFromAPI = useCallback(async (isBackground = false, applyToState = true): Promise<void> => {
    if (apiRequestRef.current) {
      return apiRequestRef.current;
    }

    const request = (async () => {
      try {
        console.log('Loading data from API...', isBackground ? '(background)' : '');
        const [topTenData, hotPostsResult, hotBoardsData] = await Promise.all([
          getTopTen(),
          getHotPosts(1, 20),
          getHotBoards(),
        ]);
      
        console.log('API data loaded:', {
          topTen: topTenData ? topTenData.length : 'null',
          hotPosts: hotPostsResult.topics.length,
          hotBoards: hotBoardsData.length,
          totalPages: hotPostsResult.totalPages
        });
      
        // 只有在数据非空时才更新缓存和状态
        if (topTenData !== null && topTenData.length > 0) {
          if (applyToState) {
            setTopTen(topTenData);
          }
          saveCachedSnapshot('topTen', TOP_TEN_STORAGE_KEY, topTenData);
        } else {
          console.log('[Cache] topTen返回空数据，保留本地缓存');
        }

        // 热门版面和热帖：只有在有数据时才更新
        if (hotBoardsData && hotBoardsData.length > 0) {
          if (applyToState) {
            setHotBoards(hotBoardsData);
          }
          saveCachedSnapshot('hotBoards', HOT_BOARDS_STORAGE_KEY, hotBoardsData);
        } else {
          console.log('[Cache] hotBoards返回空数据，保留本地缓存');
        }

        if (hotPostsResult.topics && hotPostsResult.topics.length > 0) {
          if (applyToState) {
            setHotPosts(hotPostsResult.topics);
            setHotPostsPage(1);
            setHasMoreHotPosts(hotPostsResult.totalPages > 1);
          }
          saveCachedSnapshot('hotPostsFirstPage', HOT_POSTS_FIRST_PAGE_STORAGE_KEY, hotPostsResult);
        } else {
          console.log('[Cache] hotPosts返回空数据，保留本地缓存');
        }

        if (applyToState) {
          setDataLoaded(true);
        } else {
          hasPendingSilentUpdateRef.current = true;
        }
      } catch (error) {
        console.error('Load data from API error:', error);
        if (!isBackground) {
          throw error; // 如果不是后台刷新，抛出错误
        }
      }
    })();

    apiRequestRef.current = request;
    try {
      await request;
    } finally {
      if (apiRequestRef.current === request) {
        apiRequestRef.current = null;
      }
    }
  }, []);

  const loadData = useCallback(async (forceRefresh = false, silent = false) => {
    try {
      console.log('Loading home data...', forceRefresh ? '(force refresh)' : '');
      const applyToState = !silent || canApplySilentRefreshToUI();
      
      // 1. 尝试从内存/持久化缓存获取数据（cacheManager 内存层优先，miss 再查 AsyncStorage）
      if (!forceRefresh) {
        try {
          // 并行加载所有缓存
          const [topTenResult, hotBoardsResult, hotPostsResult] = await Promise.all([
            getCachedSnapshot<TopTenItem[]>(
              'topTen',
              TOP_TEN_STORAGE_KEY,
              CACHE_CONFIG.TOP_TEN.MEMORY_FRESH_TTL,
              CACHE_CONFIG.TOP_TEN.PERSIST_MAX_STALE,
            ),
            getCachedSnapshot<Board[]>(
              'hotBoards',
              HOT_BOARDS_STORAGE_KEY,
              CACHE_CONFIG.HOT_BOARDS.MEMORY_FRESH_TTL,
              CACHE_CONFIG.HOT_BOARDS.PERSIST_MAX_STALE,
            ),
            getCachedSnapshot<{topics: TopTenItem[], totalPages: number}>(
              'hotPostsFirstPage',
              HOT_POSTS_FIRST_PAGE_STORAGE_KEY,
              CACHE_CONFIG.HOT_POSTS.MEMORY_FRESH_TTL,
              CACHE_CONFIG.HOT_POSTS.PERSIST_MAX_STALE,
            ),
          ]);

          let hasValidCache = false;
          let needsRefresh = false;

          // 处理今日十大缓存 - 即使过期也使用
          if (topTenResult && topTenResult.data && topTenResult.data.length > 0) {
            if (applyToState) {
              setTopTen(topTenResult.data);
            }
            hasValidCache = true;

            // 过期或超过刷新阈值，标记需要后台刷新
            if (topTenResult.isExpired) {
              console.log('[Cache] topTen needs background refresh');
              needsRefresh = true;
            }
          } else {
            // 这一块完全没有缓存：即使其他块有新鲜缓存能先展示，也要标记需要后台刷新，
            // 否则这一块会一直空着，直到某个其他块恰好过期触发整体刷新。
            needsRefresh = true;
          }

          // 处理热门版面缓存 - 即使过期也使用
          if (hotBoardsResult && hotBoardsResult.data && hotBoardsResult.data.length > 0) {
            if (applyToState) {
              setHotBoards(hotBoardsResult.data);
            }
            hasValidCache = true;

            if (hotBoardsResult.isExpired) {
              needsRefresh = true;
            }
          } else {
            needsRefresh = true;
          }

          // 处理热帖缓存 - 即使过期也使用
          if (hotPostsResult && hotPostsResult.data && hotPostsResult.data.topics.length > 0) {
            if (applyToState) {
              setHotPosts(hotPostsResult.data.topics);
              setHotPostsPage(1);
              setHasMoreHotPosts(hotPostsResult.data.totalPages > 1);
            }
            hasValidCache = true;

            // 过期或超过刷新阈值，标记需要后台刷新
            if (hotPostsResult.isExpired) {
              console.log('[Cache] hotPosts needs background refresh');
              needsRefresh = true;
            }
          } else {
            needsRefresh = true;
          }
          
          // 如果有有效缓存（包括过期的），先显示缓存
          if (hasValidCache) {
            if (applyToState && !silent) {
              setLoading(false);
            }
            if (applyToState) {
              setDataLoaded(true);
            } else {
              hasPendingSilentUpdateRef.current = true;
            }
            
            // 如果需要刷新，后台异步更新
            if (needsRefresh) {
              console.log('[Cache] Background refresh triggered');
              const refreshPromise = loadDataFromAPI(true, applyToState);
              if (silent) {
                await refreshPromise;
              }
            }
            
            return;
          }
        } catch (e) {
          console.error('[Cache] Failed to load persistent cache:', e);
        }
      }
      
      if (silent) {
        // 缓存超过最大兜底期时，即使 state 里还留着旧画面，也要重新请求；
        // “已有画面”不能代替“缓存仍可用”的判断。
        console.log(
          hasDisplayableDataRef.current
            ? '[Cache] Silent refresh has no usable cache, refreshing in background'
            : '[Cache] Silent refresh has no displayable cache, loading in background',
        );
        await loadDataFromAPI(true, applyToState);
        return;
      }

      // 2. 没有缓存或强制刷新，同步加载
      setLoading(true);
      await loadDataFromAPI(false);
    } catch (error) {
      console.error('Load data error:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [canApplySilentRefreshToUI, loadDataFromAPI]);

  const loadDataSilently = useCallback(async () => {
    if (isSilentRefreshingRef.current) {
      return;
    }

    isSilentRefreshingRef.current = true;
    try {
      await loadData(false, true);
    } catch (error) {
      console.error('[Cache] Silent refresh failed, ignored:', error);
    } finally {
      isSilentRefreshingRef.current = false;
    }
  }, [loadData]);

  const applyPendingSilentUpdate = useCallback(() => {
    if (!hasPendingSilentUpdateRef.current || !canApplySilentRefreshToUI()) {
      return;
    }

    hasPendingSilentUpdateRef.current = false;
    loadData(false, true);
  }, [canApplySilentRefreshToUI, loadData]);

  useEffect(() => {
    loadData();
    loadUnreadReplyCount();
  }, [loadData, loadUnreadReplyCount]);

  useEffect(() => {
    setHeaderOptions({
      headerRight: () => (
        <TouchableOpacity style={styles.floatingBellButton} onPress={openReplyNotifications} accessibilityLabel="回复提醒">
          <BellIcon size={22} color={theme.headerTint} />
          {unreadReplyCount > 0 && <View style={[styles.headerBellBadge, {borderColor: theme.headerBackground}]} />}
        </TouchableOpacity>
      ),
    });
  }, [openReplyNotifications, setHeaderOptions, theme.headerBackground, theme.headerTint, unreadReplyCount]);

  useEffect(() => {
    hasDisplayableDataRef.current = dataLoaded || topTen.length > 0 || hotBoards.length > 0 || hotPosts.length > 0;
  }, [dataLoaded, hotBoards.length, hotPosts.length, topTen.length]);

  const refreshHomeSilently = useCallback(async () => {
    await Promise.all([loadDataSilently(), loadUnreadReplyCount()]);
  }, [loadDataSilently, loadUnreadReplyCount]);

  useFocusRefresh(refreshHomeSilently, {
    intervalMs: AUTO_REFRESH_CHECK_INTERVAL,
  });

  const handleListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
    pullDownOnScroll(event);
  }, [pullDownOnScroll]);

  const handleScrollBeginDrag = useCallback(() => {
    isDraggingRef.current = true;
    pullDownOnScrollBeginDrag();
  }, [pullDownOnScrollBeginDrag]);

  const handleScrollEndDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    isDraggingRef.current = false;
    scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
    pullDownOnScrollEndDrag();
    applyPendingSilentUpdate();
  }, [applyPendingSilentUpdate, pullDownOnScrollEndDrag]);

  const handleMomentumScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    isDraggingRef.current = false;
    scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
    applyPendingSilentUpdate();
  }, [applyPendingSilentUpdate]);

  const loadMoreHotPosts = async () => {
    if (loadingMoreHotPosts || !hasMoreHotPosts) return;

    setLoadingMoreHotPosts(true);
    try {
      const nextPage = hotPostsPage + 1;
      console.log('Loading more hot posts, page:', nextPage);

      // 深页只做会话内内存缓存（cacheManager 'hotPosts' 字典分类），不落盘：
      // 深页时效性高、复用率低，纯内存足够，也避免了过期分页 key 需要额外清理的问题。
      const cacheKey = `page${nextPage}`;
      let result = getCache<{topics: TopTenItem[], totalPages: number}>('hotPosts', cacheKey);

      if (!result) {
        result = await getHotPosts(nextPage, 20);
        setCache('hotPosts', cacheKey, result);
      }

      console.log('Loaded more hot posts:', result.topics.length, 'items, total pages:', result.totalPages);

      if (result.topics.length > 0) {
        // 使用Set来去重，确保不会有重复的id
        setHotPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newPosts = result!.topics.filter((p: TopTenItem) => !existingIds.has(p.id));
          return [...prev, ...newPosts];
        });
        setHotPostsPage(nextPage);
        setHasMoreHotPosts(nextPage < result.totalPages);
      } else {
        setHasMoreHotPosts(false);
      }
    } catch (error) {
      console.error('Load more hot posts error:', error);
    } finally {
      setLoadingMoreHotPosts(false);
    }
  };

  const onRefreshInternal = async () => {
    if (isRefreshInProgressRef.current) {
      return;
    }

    isRefreshInProgressRef.current = true;
    setRefreshing(true);
    setPullDownRefreshing(true);
    try {
      // 清除热帖深页的会话内缓存，避免刷新后翻页命中刷新前缓存的旧数据
      clearCache('hotPosts');

      // 重置分页状态
      setHotPostsPage(1);
      setHasMoreHotPosts(true);

      // 手动下拉刷新时强制从API获取最新数据
      await Promise.all([
        loadDataFromAPI(false),
        loadUnreadReplyCount(true),
      ]);
    } catch (error) {
      console.error('Refresh error:', error);
    } finally {
      isRefreshInProgressRef.current = false;
      setRefreshing(false);
      setPullDownRefreshing(false);
    }
  };

  // 绑定 ref 供 handlePullRefresh 调用
  onRefreshRef.current = onRefreshInternal;

  const onRefresh = () => {
    if (consumeNativeRefreshSuppression()) return;
    onRefreshInternal();
  };



  const renderTopTenItem = ({item, index, data}: {item: TopTenItem, index?: number, data?: TopTenItem[]}) => {
    const itemIsRead = isRead(item.id);
    const isLastItem = data && index !== undefined && index === data.length - 1;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        style={[
          styles.topTenItem,
          !isLastItem && {borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border}
        ]}
        onPress={() => {
          markAsRead(item.id);
          navigation.navigate('PostDetail', {
            board: item.board,
            postId: item.id,
          });
        }}>
        <Text
          style={[
            styles.topTenTitle,
            {color: theme.text},
            itemIsRead && {color: theme.secondaryText, fontWeight: 'normal'}
          ]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        <View style={styles.topTenMeta}>
          <Text style={[styles.metaText, {color: theme.secondaryText}]}>{item.author}</Text>
          <Text style={[styles.metaSeparator, {color: theme.secondaryText}]}>·</Text>
          <Text style={[styles.metaText, {color: theme.secondaryText}]}>{item.replyCount} 回复</Text>
          <Text style={[styles.metaSeparator, {color: theme.secondaryText}]}>·</Text>
          <Text style={[styles.metaText, {color: theme.secondaryText}]}>
            {formatRelativeTime(item.lastReplyTime || item.postTime)}
          </Text>
          <Text style={[styles.metaSeparator, {color: theme.secondaryText}]}>·</Text>
          <TouchableOpacity
            onPress={() => {
              navigation.navigate('MainTabs', {
                screen: 'Board',
                params: {
                  board: item.board,
                  boardName: item.boardName || item.board,
                  source: 'link',
                },
              });
            }}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
          >
            <Text style={[styles.metaText, styles.boardLink, {color: theme.primary}]}>
              {item.boardName || item.board}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderHotBoardItem = ({item}: {item: Board}) => (
    <TouchableOpacity
      activeOpacity={0.7}
      style={[styles.hotBoardItem, {backgroundColor: theme.placeholderBackground, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border}]}
      onPress={() => {
        navigation.navigate('MainTabs', {
          screen: 'Board',
          params: {
            board: item.id,
            boardName: item.chineseName || item.name,
            source: 'link',
          },
        });
      }}>
      <Text style={[styles.hotBoardName, {color: theme.text}]}>
        {item.chineseName || item.name}
      </Text>
      {item.description && (
        <Text style={[styles.hotBoardDesc, {color: theme.secondaryText}]} numberOfLines={1}>
          {item.description}
        </Text>
      )}
    </TouchableOpacity>
  );


  if (loading) {
    return (
      <View style={[styles.container, {backgroundColor: theme.background}]}>
        <SkeletonList count={5} lines={2} />
      </View>
    );
  }

  return (
    <View style={[styles.container, {backgroundColor: theme.background}]}>
      {/* 收藏抽屉面板（绝对定位在顶部） */}
      <FavoritesDrawer visible={drawerVisible} onClose={handleCloseDrawer} contentTranslateY={contentTranslateY} />

      {/* 首页内容（被抽屉推下） */}
      <Animated.View style={[styles.mainContent, {transform: [{translateY: contentTranslateY}]}]}>
        {/* 下拉进入收藏的浮层提示 */}
        <PullDownFavoritesOverlay
          pullOffset={pullOffset}
          state={pullDownState}
        />
        <FlatList
          data={[{type: 'content'}]}
          contentContainerStyle={styles.content}
          scrollEventThrottle={16}
          onScroll={handleListScroll}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          renderItem={() => (
          <View>
            <View style={[styles.section, {backgroundColor: theme.cardBackground}, getCardElevation(theme)]}>
              <Text style={[styles.sectionTitle, {color: theme.text}]}>今日十大</Text>
              {topTen.length > 0 ? (
                <FlatList
                  data={topTen}
                  renderItem={({item, index}) => renderTopTenItem({item, index, data: topTen})}
                  keyExtractor={item => item.id}
                  scrollEnabled={false}
                />
              ) : dataLoaded ? (
                <Text style={[styles.emptyText, {color: theme.secondaryText}]}>暂无数据</Text>
              ) : null}
            </View>

            <View style={[styles.section, {backgroundColor: theme.cardBackground}, getCardElevation(theme)]}>
              <Text style={[styles.sectionTitle, {color: theme.text}]}>热门版面</Text>
              {hotBoards.length > 0 ? (
                <FlatList
                  data={hotBoards}
                  renderItem={renderHotBoardItem}
                  keyExtractor={item => item.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.hotBoardsList}
                />
              ) : dataLoaded ? (
                <Text style={[styles.emptyText, {color: theme.secondaryText}]}>暂无数据</Text>
              ) : null}
            </View>

            <View style={[styles.section, {backgroundColor: theme.cardBackground}, getCardElevation(theme)]}>
              <Text style={[styles.sectionTitle, {color: theme.text}]}>热门帖子</Text>
              {hotPosts.length > 0 ? (
                <FlatList
                  data={hotPosts}
                  renderItem={({item, index}) => renderTopTenItem({item, index, data: hotPosts})}
                  keyExtractor={item => item.id}
                  scrollEnabled={false}
                  // 该列表 scrollEnabled=false，不是真实的滚动容器，onEndReached 挂在这里
                  // 会因为 distanceFromEnd 恒为 0 而在每次内容变化后立刻再次触发，
                  // 导致一次性把所有热帖拉完。分页触发改为挂在外层真正可滚动的 FlatList 上。
                  ListFooterComponent={
                    hasMoreHotPosts ? (
                      <View style={styles.footerContainer}>
                        {loadingMoreHotPosts ? (
                          <ActivityIndicator size="small" color={theme.primary} />
                        ) : null}
                      </View>
                    ) : null
                  }
                />
              ) : dataLoaded ? (
                <Text style={[styles.emptyText, {color: theme.secondaryText}]}>暂无热门帖子</Text>
              ) : null}
            </View>
          </View>
        )}
        keyExtractor={() => 'content'}
        onEndReached={loadMoreHotPosts}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  mainContent: {
    flex: 1,
  },
  floatingBellButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBellBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    borderWidth: 1,
  },
  content: {
    padding: SPACING.lg,
  },
  section: {
    marginBottom: SPACING.xxl,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
  topTenItem: {
    paddingVertical: SPACING.md,
  },
  topTenTitle: {
    fontSize: FONT_SIZE.lg,
    marginBottom: SPACING.sm,
    fontWeight: '500',
  },
  topTenMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  metaText: {
    fontSize: FONT_SIZE.sm,
  },
  metaSeparator: {
    fontSize: FONT_SIZE.sm,
    marginHorizontal: SPACING.xs,
    opacity: 0.5,
  },
  boardLink: {
    fontWeight: '500',
  },
  hotBoardsList: {
    paddingVertical: SPACING.sm,
  },
  hotBoardItem: {
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginRight: SPACING.md,
    minWidth: 100,
  },
  hotBoardName: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '500',
    marginBottom: SPACING.xs,
  },
  hotBoardDesc: {
    fontSize: FONT_SIZE.sm,
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    textAlign: 'center',
    paddingVertical: SPACING.xl,
  },
  footerContainer: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
});

export default HomeScreen;
