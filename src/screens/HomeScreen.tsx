import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {getTopTen, getHotPosts, getHotBoards} from '../services/api';
import {TopTenItem, Board} from '../types';
import {formatRelativeTime} from '../utils/timeFormat';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useTheme} from '../components/ThemedComponents';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
} from '../utils/responsive';
import {useReadPosts} from '../context/ReadPostsContext';

// 缓存配置常量
const CACHE_CONFIG = {
  TOP_TEN: {
    MAX_AGE: 5 * 60 * 1000,           // 5分钟
    REFRESH_THRESHOLD: 60 * 1000,     // 1分钟后后台刷新
    VERSION: '1.0.0',
  },
  HOT_BOARDS: {
    MAX_AGE: 10 * 60 * 1000,          // 10分钟
    VERSION: '1.0.0',
  },
  HOT_POSTS: {
    MAX_AGE: 2 * 60 * 1000,           // 2分钟
    REFRESH_THRESHOLD: 60 * 1000,     // 1分钟后后台刷新
    VERSION: '1.0.0',
  },
};

// 缓存数据类型
interface CacheData<T> {
  version: string;
  data: T;
  timestamp: number;
}

// 统一的缓存有效性判断
const isCacheValid = (parsed: any, maxAge: number, version: string): boolean => {
  if (!parsed || parsed.version !== version) {
    return false;
  }
  const age = Date.now() - parsed.timestamp;
  return age < maxAge;
};

// 统一的缓存读取逻辑
const loadCacheData = async <T,>(
  key: string,
  maxAge: number,
  version: string,
): Promise<{data: T; age: number; isExpired: boolean} | null> => {
  try {
    const cached = await AsyncStorage.getItem(key);
    if (!cached) {
      return null;
    }

    const parsed: CacheData<T> = JSON.parse(cached);
    
    // 版本不匹配，不返回数据
    if (parsed.version !== version) {
      console.log(`[Cache] ${key} invalid version`);
      return null;
    }

    const age = Date.now() - parsed.timestamp;
    const isExpired = age >= maxAge;
    
    if (isExpired) {
      console.log(`[Cache] ${key} expired (age: ${Math.floor(age / 1000)}s), but still using it, items: ${Array.isArray(parsed.data) ? parsed.data.length : 'N/A'}`);
    } else {
      console.log(`[Cache] Using ${key}, age: ${Math.floor(age / 1000)}s, items: ${Array.isArray(parsed.data) ? parsed.data.length : 'N/A'}`);
    }
    
    return {data: parsed.data, age, isExpired};
  } catch (e) {
    console.error(`[Cache] Failed to load ${key}:`, e);
    return null;
  }
};

// 统一的缓存保存逻辑
const saveCacheData = async <T,>(
  key: string,
  data: T,
  version: string,
): Promise<void> => {
  try {
    const cacheData: CacheData<T> = {
      version,
      data,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(key, JSON.stringify(cacheData));
    console.log(`[Cache] Saved ${key} to AsyncStorage`);
  } catch (e) {
    console.error(`[Cache] Failed to save ${key}:`, e);
  }
};

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const {readPosts, isRead, markAsRead} = useReadPosts();
  const [topTen, setTopTen] = useState<TopTenItem[]>([]);
  const [hotPosts, setHotPosts] = useState<TopTenItem[]>([]);
  const [hotBoards, setHotBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hotPostsPage, setHotPostsPage] = useState(1);
  const [hasMoreHotPosts, setHasMoreHotPosts] = useState(true);
  const [loadingMoreHotPosts, setLoadingMoreHotPosts] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async (forceRefresh = false) => {
    try {
      console.log('Loading home data...', forceRefresh ? '(force refresh)' : '');
      
      // 1. 尝试从AsyncStorage获取持久化缓存
      if (!forceRefresh) {
        try {
          // 并行加载所有缓存
          const [topTenResult, hotBoardsResult, hotPostsResult] = await Promise.all([
            loadCacheData<TopTenItem[]>('topTen_cache', CACHE_CONFIG.TOP_TEN.MAX_AGE, CACHE_CONFIG.TOP_TEN.VERSION),
            loadCacheData<Board[]>('hotBoards_cache', CACHE_CONFIG.HOT_BOARDS.MAX_AGE, CACHE_CONFIG.HOT_BOARDS.VERSION),
            loadCacheData<{topics: TopTenItem[], totalPages: number}>('hotPosts_page1_cache', CACHE_CONFIG.HOT_POSTS.MAX_AGE, CACHE_CONFIG.HOT_POSTS.VERSION),
          ]);
          
          let hasValidCache = false;
          let needsRefresh = false;
          
          // 处理今日十大缓存 - 即使过期也使用
          if (topTenResult && topTenResult.data && topTenResult.data.length > 0) {
            setTopTen(topTenResult.data);
            hasValidCache = true;
            
            // 过期或超过刷新阈值，标记需要后台刷新
            if (topTenResult.isExpired || topTenResult.age > CACHE_CONFIG.TOP_TEN.REFRESH_THRESHOLD) {
              console.log('[Cache] topTen needs background refresh');
              needsRefresh = true;
            }
          }
          
          // 处理热门版面缓存 - 即使过期也使用
          if (hotBoardsResult && hotBoardsResult.data && hotBoardsResult.data.length > 0) {
            setHotBoards(hotBoardsResult.data);
            
            if (hotBoardsResult.isExpired) {
              needsRefresh = true;
            }
          }
          
          // 处理热帖缓存 - 即使过期也使用
          if (hotPostsResult && hotPostsResult.data) {
            setHotPosts(hotPostsResult.data.topics);
            setHotPostsPage(1);
            setHasMoreHotPosts(hotPostsResult.data.totalPages > 1);
            
            // 过期或超过刷新阈值，标记需要后台刷新
            if (hotPostsResult.isExpired || hotPostsResult.age > CACHE_CONFIG.HOT_POSTS.REFRESH_THRESHOLD) {
              console.log('[Cache] hotPosts needs background refresh');
              needsRefresh = true;
            }
          }
          
          // 如果有有效缓存（包括过期的），先显示缓存
          if (hasValidCache) {
            setLoading(false);
            setDataLoaded(true);
            
            // 如果需要刷新，后台异步更新
            if (needsRefresh) {
              console.log('[Cache] Background refresh triggered');
              loadDataFromAPI(true);
            }
            
            return;
          }
        } catch (e) {
          console.error('[Cache] Failed to load persistent cache:', e);
        }
      }
      
      // 2. 没有缓存或强制刷新，同步加载
      setLoading(true);
      await loadDataFromAPI(false);
    } catch (error) {
      console.error('Load data error:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const loadDataFromAPI = async (isBackground = false) => {
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
        await saveCacheData('topTen_cache', topTenData, CACHE_CONFIG.TOP_TEN.VERSION);
        setTopTen(topTenData);
      } else {
        console.log('[Cache] topTen返回空数据，保留本地缓存');
      }
      
      // 热门版面和热帖：只有在有数据时才更新
      if (hotBoardsData && hotBoardsData.length > 0) {
        await saveCacheData('hotBoards_cache', hotBoardsData, CACHE_CONFIG.HOT_BOARDS.VERSION);
        setHotBoards(hotBoardsData);
      } else {
        console.log('[Cache] hotBoards返回空数据，保留本地缓存');
      }
      
      if (hotPostsResult.topics && hotPostsResult.topics.length > 0) {
        await saveCacheData('hotPosts_page1_cache', hotPostsResult, CACHE_CONFIG.HOT_POSTS.VERSION);
        setHotPosts(hotPostsResult.topics);
        setHotPostsPage(1);
        setHasMoreHotPosts(hotPostsResult.totalPages > 1);
      } else {
        console.log('[Cache] hotPosts返回空数据，保留本地缓存');
      }
      
      setDataLoaded(true);
    } catch (error) {
      console.error('Load data from API error:', error);
      if (!isBackground) {
        throw error; // 如果不是后台刷新，抛出错误
      }
    }
  };

  const loadMoreHotPosts = async () => {
    if (loadingMoreHotPosts || !hasMoreHotPosts) return;
    
    setLoadingMoreHotPosts(true);
    try {
      const nextPage = hotPostsPage + 1;
      console.log('Loading more hot posts, page:', nextPage);
      
      // 尝试从缓存获取分页数据
      const cacheKey = `hotPosts_page${nextPage}_cache`;
      const cacheResult = await loadCacheData<{topics: TopTenItem[], totalPages: number}>(
        cacheKey,
        CACHE_CONFIG.HOT_POSTS.MAX_AGE,
        CACHE_CONFIG.HOT_POSTS.VERSION,
      );
      
      let result: {topics: TopTenItem[], totalPages: number};
      
      // 如果没有缓存或缓存过期，从API获取
      if (!cacheResult || cacheResult.isExpired) {
        result = await getHotPosts(nextPage, 20);
        await saveCacheData(cacheKey, result, CACHE_CONFIG.HOT_POSTS.VERSION);
      } else {
        result = cacheResult.data;
      }
      
      console.log('Loaded more hot posts:', result.topics.length, 'items, total pages:', result.totalPages);
      
      if (result.topics.length > 0) {
        // 使用Set来去重，确保不会有重复的id
        setHotPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newPosts = result.topics.filter((p: TopTenItem) => !existingIds.has(p.id));
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

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      console.log('[Refresh] Clearing all hotPosts page caches');
      
      // 清除所有热帖分页缓存
      const keys = await AsyncStorage.getAllKeys();
      const hotPostKeys = keys.filter(key => key.startsWith('hotPosts_page') && key !== 'hotPosts_page1_cache');
      if (hotPostKeys.length > 0) {
        await AsyncStorage.multiRemove(hotPostKeys);
        console.log(`[Refresh] Cleared ${hotPostKeys.length} hotPosts page caches`);
      }
      
      // 重置分页状态
      setHotPostsPage(1);
      setHasMoreHotPosts(true);
      
      // 手动下拉刷新时强制从API获取最新数据
      await loadDataFromAPI(false);
    } catch (error) {
      console.error('Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };



  const renderTopTenItem = ({item, index, data}: {item: TopTenItem, index?: number, data?: TopTenItem[]}) => {
    const itemIsRead = isRead(item.id);
    const isLastItem = data && index !== undefined && index === data.length - 1;
    
    return (
      <TouchableOpacity
        style={[
          styles.topTenItem,
          {borderBottomColor: theme.border},
          isLastItem && styles.lastTopTenItem
        ]}
        onPress={() => {
          markAsRead(item.id);
          // 导航到帖子详情
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
          <Text style={[styles.metaText, {color: theme.secondaryText}]}>回复: {item.replyCount}</Text>
          <Text style={[styles.metaText, {color: theme.secondaryText}]}>
            {formatRelativeTime(item.lastReplyTime || item.postTime)}
          </Text>
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
      style={[styles.hotBoardItem, {backgroundColor: theme.placeholderBackground}]}
      onPress={() => {
        // 由于是从 Home 标签切换到 Board 标签，需要使用嵌套导航
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
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, {backgroundColor: theme.background}]}>
      <FlatList
        data={[{type: 'content'}]} // 使用单个项目来包装所有内容
        renderItem={() => (
          <View>
            <View style={[styles.section, {backgroundColor: theme.cardBackground}]}>
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

            <View style={[styles.section, {backgroundColor: theme.cardBackground}]}>
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

            <View style={[styles.section, {backgroundColor: theme.cardBackground}]}>
              <Text style={[styles.sectionTitle, {color: theme.text}]}>热门帖子</Text>
              {hotPosts.length > 0 ? (
                <FlatList
                  data={hotPosts}
                  renderItem={({item, index}) => renderTopTenItem({item, index, data: hotPosts})}
                  keyExtractor={item => item.id}
                  scrollEnabled={false}
                  onEndReached={loadMoreHotPosts}
                  onEndReachedThreshold={0.3}
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
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
        contentContainerStyle={styles.content}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor 由主题动态控制
  },
  content: {
    padding: SPACING.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginBottom: SPACING.xxl,
    // backgroundColor 由主题动态控制
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    // color 由主题动态控制
    marginBottom: SPACING.md,
  },
  topTenItem: {
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    // borderBottomColor 由主题动态控制
  },
  lastTopTenItem: {
    borderBottomWidth: 0,
  },
  topTenTitle: {
    fontSize: FONT_SIZE.lg,
    // color 由主题动态控制
    marginBottom: SPACING.sm,
    fontWeight: '500',
  },
  topTenMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: FONT_SIZE.sm,
    // color 由主题动态控制
    marginRight: SPACING.md,
  },
  boardLink: {
    // color 由主题动态控制
    fontWeight: '500',
  },
  hotBoardsList: {
    paddingVertical: SPACING.sm,
  },
  hotBoardItem: {
    // backgroundColor 由主题动态控制
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginRight: SPACING.md,
    minWidth: 100,
  },
  hotBoardName: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '500',
    // color 由主题动态控制
    marginBottom: SPACING.xs,
  },
  hotBoardDesc: {
    fontSize: FONT_SIZE.sm,
    // color 由主题动态控制
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    // color 由主题动态控制
    textAlign: 'center',
    paddingVertical: SPACING.xl,
  },
  footerContainer: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
});

export default HomeScreen;

