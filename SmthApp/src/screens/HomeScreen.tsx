import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {getTopTen, getHotPosts, getHotBoards} from '../services/api';
import {TopTenItem, Board} from '../types';
import {formatRelativeTime} from '../utils/timeFormat';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {cacheManager} from '../services/cacheManager';
import {useTheme} from '../components/ThemedComponents';

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const [topTen, setTopTen] = useState<TopTenItem[]>([]);
  const [hotPosts, setHotPosts] = useState<TopTenItem[]>([]);
  const [hotBoards, setHotBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hotPostsPage, setHotPostsPage] = useState(1);
  const [hasMoreHotPosts, setHasMoreHotPosts] = useState(true);
  const [loadingMoreHotPosts, setLoadingMoreHotPosts] = useState(false);
  const [readPosts, setReadPosts] = useState<Set<string>>(new Set());
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    loadData();
    loadReadPosts();
  }, []);

  const loadData = async (forceRefresh = false) => {
    try {
      console.log('Loading home data...', forceRefresh ? '(force refresh)' : '');
      
      // 1. 尝试从AsyncStorage获取持久化缓存
      if (!forceRefresh) {
        try {
          const [topTenCache, hotBoardsCache, hotPostsCache] = await Promise.all([
            AsyncStorage.getItem('topTen_cache'),
            AsyncStorage.getItem('hotBoards_cache'),
            AsyncStorage.getItem('hotPosts_page1_cache'),
          ]);
          
          let hasValidCache = false;
          const now = Date.now();
          
          // 解析今日十大缓存
          if (topTenCache) {
            const parsed = JSON.parse(topTenCache);
            const age = now - parsed.timestamp;
            
            // 5分钟内的缓存立即显示
            if (age < 5 * 60 * 1000 && parsed.version === '1.0.0') {
              setTopTen(parsed.data);
              // 只有数据不为空时才标记为有效缓存
              if (parsed.data && parsed.data.length > 0) {
                hasValidCache = true;
              }
              console.log(`[Cache] Using topTen cache, age: ${Math.floor(age / 1000)}s, items: ${parsed.data?.length || 0}`);
              
              // 超过1分钟的缓存，标记需要后台刷新
              if (age > 60 * 1000) {
                console.log('[Cache] topTen cache needs background refresh');
              }
            }
          }
          
          // 解析热门版面缓存
          if (hotBoardsCache) {
            const parsed = JSON.parse(hotBoardsCache);
            const age = now - parsed.timestamp;
            
            // 10分钟内的缓存立即显示
            if (age < 10 * 60 * 1000 && parsed.version === '1.0.0') {
              setHotBoards(parsed.data);
              console.log(`[Cache] Using hotBoards cache, age: ${Math.floor(age / 1000)}s, items: ${parsed.data?.length || 0}`);
            }
          }
          
          // 解析热帖缓存
          if (hotPostsCache) {
            const parsed = JSON.parse(hotPostsCache);
            const age = now - parsed.timestamp;
            
            // 2分钟内的缓存立即显示
            if (age < 2 * 60 * 1000 && parsed.version === '1.0.0') {
              setHotPosts(parsed.data.topics);
              setHotPostsPage(1);
              setHasMoreHotPosts(parsed.data.totalPages > 1);
              console.log(`[Cache] Using hotPosts cache, age: ${Math.floor(age / 1000)}s, items: ${parsed.data.topics?.length || 0}`);
            }
          }
          
          // 如果有有效缓存，先显示缓存
          if (hasValidCache) {
            setLoading(false);
            setDataLoaded(true);
            
            // 检查是否需要后台刷新
            let needsRefresh = false;
            
            if (topTenCache) {
              const parsed = JSON.parse(topTenCache);
              if (now - parsed.timestamp > 60 * 1000) {
                needsRefresh = true;
              }
            }
            
            if (hotPostsCache) {
              const parsed = JSON.parse(hotPostsCache);
              if (now - parsed.timestamp > 60 * 1000) {
                needsRefresh = true;
              }
            }
            
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
        topTen: topTenData ? topTenData.length : 'null (保留缓存)',
        hotPosts: hotPostsResult.topics.length,
        hotBoards: hotBoardsData.length,
        totalPages: hotPostsResult.totalPages
      });
      
      const now = Date.now();
      const version = '1.0.0';
      
      // 只有在数据非空时才更新缓存和状态
      if (topTenData !== null) {
        // 保存到内存缓存
        cacheManager.set('topTen', undefined, topTenData);
        
        // 保存到持久化缓存（AsyncStorage）
        try {
          await AsyncStorage.setItem('topTen_cache', JSON.stringify({
            version,
            data: topTenData,
            timestamp: now,
          }));
          console.log('[Cache] Saved topTen to AsyncStorage');
        } catch (e) {
          console.error('[Cache] Failed to save topTen to AsyncStorage:', e);
        }
        
        // 更新状态
        setTopTen(topTenData);
      } else {
        console.log('[Cache] topTen返回空，保留本地缓存数据');
      }
      
      // 热门版面和热帖始终更新
      cacheManager.set('hotBoards', undefined, hotBoardsData);
      cacheManager.set('hotPosts', 'page-1', hotPostsResult);
      
      // 保存到持久化缓存（AsyncStorage）
      try {
        await Promise.all([
          AsyncStorage.setItem('hotBoards_cache', JSON.stringify({
            version,
            data: hotBoardsData,
            timestamp: now,
          })),
          AsyncStorage.setItem('hotPosts_page1_cache', JSON.stringify({
            version,
            data: hotPostsResult,
            timestamp: now,
          })),
        ]);
        console.log('[Cache] Saved hotBoards and hotPosts to AsyncStorage');
      } catch (e) {
        console.error('[Cache] Failed to save to AsyncStorage:', e);
      }
      setHotPosts(hotPostsResult.topics);
      setHotBoards(hotBoardsData);
      setHotPostsPage(1);
      setHasMoreHotPosts(hotPostsResult.totalPages > 1);
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
      
      // 尝试从AsyncStorage获取分页缓存
      const cacheKey = `hotPosts_page${nextPage}_cache`;
      let cachedResult: {topics: TopTenItem[], totalPages: number} | null = null;
      
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          const age = Date.now() - parsed.timestamp;
          
          // 2分钟内的缓存有效
          if (age < 2 * 60 * 1000 && parsed.version === '1.0.0') {
            cachedResult = parsed.data;
            console.log(`[Cache] Using hotPosts page ${nextPage} cache, age: ${Math.floor(age / 1000)}s`);
          }
        }
      } catch (e) {
        console.error('[Cache] Failed to load hotPosts cache:', e);
      }
      
      // 如果没有缓存，从API获取
      if (!cachedResult) {
        cachedResult = await getHotPosts(nextPage, 20);
        
        // 保存到缓存
        try {
          await AsyncStorage.setItem(cacheKey, JSON.stringify({
            version: '1.0.0',
            data: cachedResult,
            timestamp: Date.now(),
          }));
          console.log(`[Cache] Saved hotPosts page ${nextPage} to cache`);
        } catch (e) {
          console.error('[Cache] Failed to save hotPosts cache:', e);
        }
      }
      
      console.log('Loaded more hot posts:', cachedResult.topics.length, 'items, total pages:', cachedResult.totalPages);
      
      if (cachedResult.topics.length > 0) {
        // 使用Set来去重，确保不会有重复的id
        setHotPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newPosts = cachedResult!.topics.filter((p: TopTenItem) => !existingIds.has(p.id));
          return [...prev, ...newPosts];
        });
        setHotPostsPage(nextPage);
        setHasMoreHotPosts(nextPage < cachedResult.totalPages);
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
      
      // 清除内存缓存中的热帖分页数据
      cacheManager.clearCategory('hotPosts');
      
      // 手动下拉刷新时强制从API获取最新数据
      await loadDataFromAPI(false);
    } catch (error) {
      console.error('Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const loadReadPosts = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem('read_posts_ids');
      if (jsonValue != null) {
        const ids = JSON.parse(jsonValue);
        setReadPosts(new Set(ids));
      }
    } catch (e) {
      console.error('Failed to load read posts:', e);
    }
  };

  const markAsRead = async (postId: string) => {
    if (readPosts.has(postId)) return;

    const newReadPosts = new Set(readPosts);
    newReadPosts.add(postId);
    setReadPosts(newReadPosts);

    try {
      await AsyncStorage.setItem('read_posts_ids', JSON.stringify(Array.from(newReadPosts)));
    } catch (e) {
      console.error('Failed to save read post:', e);
    }
  };

  const renderTopTenItem = ({item, index, data}: {item: TopTenItem, index?: number, data?: TopTenItem[]}) => {
    const isRead = readPosts.has(item.id);
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
            isRead && {color: theme.secondaryText, fontWeight: 'normal'}
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
      <SafeAreaView style={[styles.container, {backgroundColor: theme.background}]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.background}]}>
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor 由主题动态控制
  },
  content: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginBottom: 24,
    // backgroundColor 由主题动态控制
    borderRadius: 8,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    // color 由主题动态控制
    marginBottom: 12,
  },
  topTenItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    // borderBottomColor 由主题动态控制
  },
  lastTopTenItem: {
    borderBottomWidth: 0,
  },
  topTenTitle: {
    fontSize: 16,
    // color 由主题动态控制
    marginBottom: 8,
    fontWeight: '500',
  },
  topTenMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: 12,
    // color 由主题动态控制
    marginRight: 12,
  },
  boardLink: {
    // color 由主题动态控制
    fontWeight: '500',
  },
  hotBoardsList: {
    paddingVertical: 8,
  },
  hotBoardItem: {
    // backgroundColor 由主题动态控制
    borderRadius: 8,
    padding: 12,
    marginRight: 12,
    minWidth: 100,
  },
  hotBoardName: {
    fontSize: 16,
    fontWeight: '500',
    // color 由主题动态控制
    marginBottom: 4,
  },
  hotBoardDesc: {
    fontSize: 12,
    // color 由主题动态控制
  },
  emptyText: {
    fontSize: 14,
    // color 由主题动态控制
    textAlign: 'center',
    paddingVertical: 20,
  },
  footerContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});

export default HomeScreen;

