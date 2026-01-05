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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      console.log('Loading home data...');
      const [topTenData, hotPostsResult, hotBoardsData] = await Promise.all([
        getTopTen(),
        getHotPosts(1, 20),
        getHotBoards(),
      ]);
      console.log('Top ten data:', topTenData.length, 'items');
      console.log('Hot posts data:', hotPostsResult.topics.length, 'items, total pages:', hotPostsResult.totalPages);
      console.log('Hot boards data:', hotBoardsData.length, 'items');
      setTopTen(topTenData);
      setHotPosts(hotPostsResult.topics);
      setHotBoards(hotBoardsData);
      setHotPostsPage(1);
      setHasMoreHotPosts(1 < hotPostsResult.totalPages);
    } catch (error) {
      console.error('Load data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreHotPosts = async () => {
    if (loadingMoreHotPosts || !hasMoreHotPosts) return;
    
    setLoadingMoreHotPosts(true);
    try {
      const nextPage = hotPostsPage + 1;
      console.log('Loading more hot posts, page:', nextPage);
      const result = await getHotPosts(nextPage, 20);
      console.log('Loaded more hot posts:', result.topics.length, 'items, total pages:', result.totalPages);
      
      if (result.topics.length > 0) {
        // 使用Set来去重，确保不会有重复的id
        setHotPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newPosts = result.topics.filter(p => !existingIds.has(p.id));
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
    await loadData();
    setRefreshing(false);
  };

  const renderTopTenItem = ({item}: {item: TopTenItem}) => (
    <TouchableOpacity
      style={styles.topTenItem}
      onPress={() => {
        // 导航到帖子详情
        navigation.navigate('PostDetail', {
          board: item.board,
          postId: item.id,
        });
      }}>
      <Text style={styles.topTenTitle} numberOfLines={1}>
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
        data={hotPosts}
        renderItem={renderTopTenItem}
        keyExtractor={item => item.id}
        onEndReached={loadMoreHotPosts}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>今日十大</Text>
              {topTen.length > 0 ? (
                <FlatList
                  data={topTen}
                  renderItem={renderTopTenItem}
                  keyExtractor={item => item.id}
                  scrollEnabled={false}
                />
              ) : (
                <Text style={styles.emptyText}>暂无数据</Text>
              )}
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
              ) : (
                <Text style={styles.emptyText}>暂无数据</Text>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>热门帖子</Text>
            </View>
          </>
        }
        ListFooterComponent={
          hasMoreHotPosts ? (
            <View style={styles.footerContainer}>
              {loadingMoreHotPosts ? (
                <ActivityIndicator size="small" color="#007AFF" />
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.section}>
            <Text style={styles.emptyText}>暂无热门帖子</Text>
          </View>
        }
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
  topTenTitle: {
    fontSize: 16,
    color: '#000',
    marginBottom: 8,
    fontWeight: '500',
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

