import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Modal,
  TextInput,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {getBoards, getFavoriteBoards, getBoardPosts} from '../services/api';
import {getSubBoards} from '../services/dataFetcher';
import {Board, Post} from '../types';
import {getCache, setCache} from '../services/cacheManager';
import {formatRelativeTime} from '../utils/timeFormat';
import AsyncStorage from '@react-native-async-storage/async-storage';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const DRAWER_WIDTH = SCREEN_WIDTH * 0.8;

const BoardScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const [boards, setBoards] = useState<Board[]>([]);
  const [favoriteBoards, setFavoriteBoards] = useState<Board[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
  const [showBoardList, setShowBoardList] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [readPosts, setReadPosts] = useState<Set<string>>(new Set());

  const modalAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (showBoardList) {
      Animated.parallel([
        Animated.spring(modalAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }),
      ]).start();
    } else {
      Animated.timing(modalAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [showBoardList]);

  const closeDrawer = () => {
    Animated.timing(modalAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setShowBoardList(false));
  };

  // 处理从其他页面（如收藏页）传来的版面参数
  useEffect(() => {
    const params = route.params as {board?: string, boardName?: string};
    if (params?.board) {
      setSelectedBoard({
        id: params.board,
        name: params.boardName || params.board,
        chineseName: params.boardName,
      });
    }
  }, [route.params]);

  useEffect(() => {
    loadBoards();
    loadFavoriteBoards();
    loadReadPosts();
  }, []);

  useEffect(() => {
    if (selectedBoard) {
      // 切换版面时重置分页状态
      setPage(1);
      setHasMore(true);
      setPosts([]);
      loadPosts(selectedBoard.id, 1);
    }
    // 动态更新导航栏
    navigation.setOptions({
      headerTitle: selectedBoard ? selectedBoard.chineseName || selectedBoard.name : '版面',
      headerLeft: () => (
        <TouchableOpacity
          style={{paddingLeft: 16}}
          onPress={() => setShowBoardList(true)}>
          <Text style={{fontSize: 24}}>☰</Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity
          style={{paddingRight: 16}}
          onPress={() => navigation.navigate('BoardList', {favorites: true})}>
          <Text style={{fontSize: 24, color: '#007AFF'}}>⭐</Text>
        </TouchableOpacity>
      ),
    });
  }, [selectedBoard]);

  const loadBoards = async () => {
    try {
      // 检查缓存
      const cachedData = getCache<any[]>('boards');
      if (cachedData) {
        setBoards(cachedData);
        setLoading(false);
        return;
      }

      // 1. 先拉取一级目录
      const firstLevelSections = await getBoards();

      // 2. 遍历一级目录，拉取各分区内容（自动构建多级层级）
      const boardTreePromises = firstLevelSections.map(async (section) => {
        try {
          const subBoards = await getSubBoards(section.id);
          
          // 将子版面挂载到一级目录上（层级关系已在 getSubBoards 中通过 groupId 构建）
          return {
            ...section,
            children: subBoards,
          };
        } catch (error) {
          console.error(`拉取分区 "${section.chineseName || section.name}" 子版面失败:`, error);
          return {
            ...section,
            children: [],
          };
        }
      });

      // 3. 等待所有分区内容加载完成
      const completeTree = await Promise.all(boardTreePromises);

      // 4. 缓存完整的目录树
      setCache('boards', undefined, completeTree);
      setBoards(completeTree);
    } catch (error) {
      console.error('Load boards error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFavoriteBoards = async () => {
    try {
      const data = await getFavoriteBoards();
      setFavoriteBoards(data);
    } catch (error) {
      console.error('Load favorite boards error:', error);
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

  const loadPosts = async (boardId: string, pageNum: number) => {
    try {
      if (pageNum > 1) {
        setLoadingMore(true);
      }
      
      const {topics, tops, totalPages} = await getBoardPosts(boardId, pageNum);
      
      if (pageNum === 1) {
        // 第一页时，如果有置顶帖且不是加载更多，则合并
        const combinedPosts = [...tops, ...topics];
        setPosts(combinedPosts);
        setPage(1);
      } else {
        // 使用Set来去重，确保不会有重复的id
        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newPosts = topics.filter(p => !existingIds.has(p.id));
          return [...prev, ...newPosts];
        });
      }
      
      setHasMore(pageNum < totalPages);
    } catch (error) {
      console.error('Load posts error:', error);
    } finally {
      setLoading(false);
      if (pageNum > 1) {
        setLoadingMore(false);
      }
    }
  };

  const loadMore = () => {
    if (hasMore && selectedBoard && !loadingMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadPosts(selectedBoard.id, nextPage);
    }
  };

  // 子组件：渲染版面项目组（支持同级手风琴效果）
  const BoardItemGroup = ({
    items,
    level = 0,
  }: {
    items: any[],
    level?: number,
  }) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    return (
      <>
        {items.map((item) => (
          <BoardItem
            key={item.id}
            item={item}
            level={level}
            expandedId={expandedId}
            onToggleExpand={setExpandedId}
          />
        ))}
      </>
    );
  };

  // 子组件：渲染单个版面项目（使用预加载的目录树）
  const BoardItem = ({
    item,
    level = 0,
    expandedId,
    onToggleExpand,
  }: {
    item: any,
    level?: number,
    expandedId?: string | null,
    onToggleExpand?: (id: string | null) => void,
  }) => {
    const isSelected = selectedBoard?.id === item.id;
    const subBoards = item.children || [];
    const hasChildren = subBoards.length > 0;
    const isExpanded = expandedId === item.id;
    const isRootLevel = level === 0;

    const handleToggle = () => {
      // 根节点始终只展开/折叠，不选中
      if (isRootLevel) {
        if (onToggleExpand) {
          onToggleExpand(isExpanded ? null : item.id);
        }
        return;
      }

      // 如果是版面（非文件夹），选中并关闭抽屉
      if (!item.isFolder && !hasChildren) {
        setSelectedBoard(item);
        closeDrawer();
        return;
      }

      // 如果是文件夹，切换展开状态（手风琴效果）
      if (onToggleExpand) {
        onToggleExpand(isExpanded ? null : item.id);
      }
    };

    if (isRootLevel) {
      // 根节点渲染为可点击的分类标题
      return (
        <View style={styles.sectionGroup}>
          <TouchableOpacity style={styles.sectionHeader} onPress={handleToggle}>
            <View style={styles.sectionHeaderContent}>
              <Text style={styles.sectionHeaderText}>{item.chineseName || item.name}</Text>
              <Text style={styles.sectionExpandArrow}>{isExpanded ? '▼' : '▶'}</Text>
            </View>
          </TouchableOpacity>
          {isExpanded && hasChildren && (
            <View>
              <BoardItemGroup items={subBoards} level={level + 1} />
            </View>
          )}
        </View>
      );
    }

    return (
      <View>
        <TouchableOpacity
          style={[
            styles.boardItem,
            {paddingLeft: 16 + (level - 1) * 16},
            isSelected && styles.selectedBoardItem
          ]}
          onPress={handleToggle}>
          <View style={styles.boardItemContent}>
            <View style={styles.boardIconContainer}>
              {item.isFolder ? (
                <Text style={styles.folderIcon}>{isExpanded ? '📂' : '📁'}</Text>
              ) : (
                <Text style={styles.boardIcon}>📄</Text>
              )}
            </View>
            <Text style={[
              styles.boardName,
              isSelected && styles.selectedBoardName
            ]}>
              {item.chineseName || item.name}
            </Text>
            {item.isFolder && (
              <Text style={styles.expandArrow}>
                {isExpanded ? '▼' : '▶'}
              </Text>
            )}
          </View>
        </TouchableOpacity>
        {isExpanded && hasChildren && (
          <View style={styles.subBoardsContainer}>
            <BoardItemGroup items={subBoards} level={level + 1} />
          </View>
        )}
      </View>
    );
  };

  const renderBoardList = () => (
    <BoardItemGroup items={boards} level={0} />
  );

  const renderPostItem = ({item}: {item: any}) => {
    const isRead = readPosts.has(item.id);
    return (
    <TouchableOpacity
      style={styles.postItem}
      onPress={() => {
        markAsRead(item.id);
        navigation.navigate('PostDetail', {
          board: item.board,
          postId: item.id,
        });
      }}>
      <View style={styles.postHeader}>
        {item.isTop && <View style={styles.topBadge}><Text style={styles.topBadgeText}>置顶</Text></View>}
        <Text 
          style={[
            styles.postTitle, 
            item.isTop && styles.topPostTitle,
            isRead && styles.readPostTitle
          ]} 
          numberOfLines={2}
        >
        {item.title}
      </Text>
      </View>
      <View style={styles.postMeta}>
        <View style={styles.postAuthorInfo}>
          {item.nickname ? (
            <Text style={styles.metaText}>{item.nickname} ({item.author})</Text>
          ) : (
        <Text style={styles.metaText}>{item.author}</Text>
          )}
          {item.levelTitle && <Text style={styles.levelTitle}> · {item.levelTitle}</Text>}
        </View>
        <View style={styles.postStats}>
          <Text style={styles.metaText}>{item.replyCount} 回复</Text>
          <Text style={styles.statsText}>{formatRelativeTime(item.postTime)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  )};

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  const renderFooter = () => {
    if (!hasMore) return null;
    
    return (
      <View style={styles.footerContainer}>
        {loadingMore ? (
          <ActivityIndicator size="small" color="#007AFF" />
        ) : (
          <TouchableOpacity 
            style={styles.loadMoreButton}
            onPress={loadMore}>
            <Text style={styles.loadMoreText}>加载更多</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {selectedBoard ? (
        <FlatList
          data={posts}
          renderItem={renderPostItem}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>暂无帖子</Text>
            </View>
          }
          ListFooterComponent={renderFooter}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>请选择版面</Text>
        </View>
      )}

      <Modal
        visible={showBoardList}
        animationType="none"
        transparent={true}
        onRequestClose={closeDrawer}>
        <View style={styles.modalContainer}>
          <TouchableWithoutFeedback onPress={closeDrawer}>
            <Animated.View 
              style={[
                styles.modalOverlay,
                { opacity: modalAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1]
                  }) 
                }
              ]} 
            />
          </TouchableWithoutFeedback>
          <Animated.View 
            style={[
              styles.modalContent, 
              { 
                opacity: modalAnim,
                transform: [
                  { scale: modalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1]
                    }) 
                  },
                  { translateY: modalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0]
                    }) 
                  }
                ] 
              }
            ]}>
            <View style={styles.modalHeader}>
              <View style={styles.drawerTitleContainer}>
                <Text style={styles.drawerTitleEmoji}>📋</Text>
                <Text style={styles.modalTitle}>版面目录</Text>
              </View>
              <TouchableOpacity onPress={closeDrawer} style={styles.drawerCloseButton}>
                <Text style={{fontSize: 20, color: '#999'}}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {renderBoardList()}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  topBadge: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
    marginTop: 2,
  },
  topBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  postTitle: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    fontWeight: '500',
    lineHeight: 22,
  },
  topPostTitle: {
    color: '#FF3B30',
  },
  readPostTitle: {
    color: '#999',
    fontWeight: 'normal',
  },
  postMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  postAuthorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  levelTitle: {
    fontSize: 11,
    color: '#999',
  },
  postStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
    color: '#666',
  },
  statsText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
  footerContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadMoreButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  loadMoreText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 16,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    width: DRAWER_WIDTH,
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    backgroundColor: '#fff',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  drawerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  drawerTitleEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  drawerCloseButton: {
    padding: 4,
  },
  sectionGroup: {
    marginBottom: 8,
  },
  sectionHeader: {
    backgroundColor: '#f8f8f8',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  sectionHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    flex: 1,
  },
  sectionExpandArrow: {
    fontSize: 10,
    color: '#888',
    marginLeft: 8,
  },
  boardItem: {
    paddingVertical: 10,
    paddingRight: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f5f5f5',
  },
  rootFolder: {
    backgroundColor: '#fcfcfc',
  },
  selectedBoardItem: {
    backgroundColor: '#f0f7ff',
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
  },
  boardItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  boardIconContainer: {
    width: 20,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderIcon: {
    fontSize: 14,
  },
  boardIcon: {
    fontSize: 12,
    opacity: 0.5,
  },
  boardName: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  rootBoardName: {
    fontWeight: '600',
    color: '#222',
  },
  selectedBoardName: {
    color: '#007AFF',
    fontWeight: '600',
  },
  expandArrow: {
    fontSize: 10,
    color: '#bbb',
    marginLeft: 4,
  },
  subBoardsContainer: {
    backgroundColor: '#fff',
  },
});

export default BoardScreen;
