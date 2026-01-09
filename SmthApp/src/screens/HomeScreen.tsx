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

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
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
    setLoading(true);
    try {
      console.log('Loading home data...', forceRefresh ? '(force refresh)' : '');
      
      // 尝试从缓存获取数据
      const cachedTopTen = cacheManager.get('topTen');
      const cachedHotBoards = cacheManager.get('hotBoards');
      const cachedHotPosts = cacheManager.get('hotPosts', 'page-1'); // 第一页数据
      
      // 如果有缓存且不是强制刷新，先显示缓存数据
      if (!forceRefresh && cachedTopTen && cachedHotBoards && cachedHotPosts) {
        console.log('Using cached data');
        setTopTen(cachedTopTen as TopTenItem[]);
        setHotBoards(cachedHotBoards as Board[]);
        setHotPosts((cachedHotPosts as {topics: TopTenItem[], totalPages: number}).topics);
        setHotPostsPage(1);
        setHasMoreHotPosts((cachedHotPosts as {topics: TopTenItem[], totalPages: number}).totalPages > 1);
        setLoading(false);
        
        // 后台异步刷新数据
        loadDataFromAPI(true);
        return;
      }
      
      // 没有缓存或强制刷新，直接从API获取
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
        topTen: topTenData.length,
        hotPosts: hotPostsResult.topics.length,
        hotBoards: hotBoardsData.length,
        totalPages: hotPostsResult.totalPages
      });
      
      // 缓存数据
      cacheManager.set('topTen', undefined, topTenData);
      cacheManager.set('hotBoards', undefined, hotBoardsData);
      cacheManager.set('hotPosts', 'page-1', hotPostsResult); // 第一页数据
      
      // 更新状态
      setTopTen(topTenData);
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
      
      // 尝试从缓存获取分页数据
      const cacheKey = `page-${nextPage}`;
      let cachedResult = cacheManager.get('hotPosts', cacheKey);
      
      if (!cachedResult) {
        // 缓存未命中，从API获取
        cachedResult = await getHotPosts(nextPage, 20);
        // 缓存分页数据
        cacheManager.set('hotPosts', cacheKey, cachedResult);
      }
      
      console.log('Loaded more hot posts:', (cachedResult as {topics: TopTenItem[], totalPages: number}).topics.length, 'items, total pages:', (cachedResult as {topics: TopTenItem[], totalPages: number}).totalPages);
      
      if ((cachedResult as {topics: TopTenItem[], totalPages: number}).topics.length > 0) {
        // 使用Set来去重，确保不会有重复的id
        setHotPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newPosts = (cachedResult as {topics: TopTenItem[], totalPages: number}).topics.filter((p: TopTenItem) => !existingIds.has(p.id));
          return [...prev, ...newPosts];
        });
        setHotPostsPage(nextPage);
        setHasMoreHotPosts(nextPage < (cachedResult as {topics: TopTenItem[], totalPages: number}).totalPages);
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
            isRead && styles.readPostTitle
          ]} 
          numberOfLines={1}
        >
          {item.title}
        </Text>
        <View style={styles.topTenMeta}>
          <Text style={styles.metaText}>{item.author}</Text>
          <Text style={styles.metaText}>回复: {item.replyCount}</Text>
          <Text style={styles.metaText}>
            {formatRelativeTime(item.lastReplyTime || item.postTime)}
          </Text>
          <TouchableOpacity 
            onPress={() => {
              navigation.navigate('Board', {
                board: item.board,
                boardName: item.boardName || item.board,
              });
            }}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
          >
            <Text style={[styles.metaText, styles.boardLink]}>
              {item.boardName || item.board}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderHotBoardItem = ({item}: {item: Board}) => (
    <TouchableOpacity
      style={styles.hotBoardItem}
      onPress={() => {
        // 由于是从 Home 标签切换到 Board 标签，可以直接导航
        navigation.navigate('Board', {
          board: item.id,
          boardName: item.chineseName || item.name,
        });
      }}>
      <Text style={styles.hotBoardName}>
        {item.chineseName || item.name}
      </Text>
      {item.description && (
        <Text style={styles.hotBoardDesc} numberOfLines={1}>
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

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={[{type: 'content'}]} // 使用单个项目来包装所有内容
        renderItem={() => (
          <View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>今日十大</Text>
              {topTen.length > 0 ? (
                <FlatList
                  data={topTen}
                  renderItem={({item, index}) => renderTopTenItem({item, index, data: topTen})}
                  keyExtractor={item => item.id}
                  scrollEnabled={false}
                />
              ) : dataLoaded ? (
                <Text style={styles.emptyText}>暂无数据</Text>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>热门版面</Text>
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
                <Text style={styles.emptyText}>暂无数据</Text>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>热门帖子</Text>
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
                          <ActivityIndicator size="small" color="#007AFF" />
                        ) : null}
                      </View>
                    ) : null
                  }
                />
              ) : dataLoaded ? (
                <Text style={styles.emptyText}>暂无热门帖子</Text>
              ) : null}
            </View>
          </View>
        )}
        keyExtractor={() => 'content'}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.content}
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
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginBottom: 24,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  topTenItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  lastTopTenItem: {
    borderBottomWidth: 0,
  },
  topTenTitle: {
    fontSize: 16,
    color: '#000',
    marginBottom: 8,
    fontWeight: '500',
  },
  readPostTitle: {
    color: '#999',
    fontWeight: 'normal',
  },
  topTenMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: 12,
    color: '#666',
    marginRight: 12,
  },
  boardLink: {
    color: '#007AFF',
    fontWeight: '500',
  },
  hotBoardsList: {
    paddingVertical: 8,
  },
  hotBoardItem: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginRight: 12,
    minWidth: 100,
  },
  hotBoardName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
    marginBottom: 4,
  },
  hotBoardDesc: {
    fontSize: 12,
    color: '#666',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  loadMoreButton: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  loadMoreText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  footerContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});

export default HomeScreen;

