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
  RefreshControl,
  PanResponder,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {getBoards, getFavoriteBoards, getBoardPosts} from '../services/api';
import {getSubBoards, checkBoardFavorite, addBoardFavorite, removeBoardFavorite} from '../services/dataFetcher';
import {Board, Post} from '../types';
import {getCache, setCache} from '../services/cacheManager';
import {formatRelativeTime} from '../utils/timeFormat';
import AsyncStorage from '@react-native-async-storage/async-storage';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const DRAWER_WIDTH = SCREEN_WIDTH * 0.8;

// 频道类型定义
interface Channel {
  id: string;
  name: string;
  type: string;
  value: string;
}

// 图览附件类型
interface AlbumAttachment {
  cdnUrl: string;
  name: string;
  size: number;
  type: string;
}

// 图览文章类型
interface AlbumArticle {
  id: string;
  subject: string;
  body: string;
  attachments: AlbumAttachment[];
  account: {
    name: string;
    nick: string;
    avatarUrl?: string;
  };
  board: {
    name: string;
    title: string;
  };
  postTime: number;
  topicId: string;
}

// 频道帖子类型定义
interface ChannelTopic {
  id: string;
  subject: string;
  availables: number;
  firstArticleId: string;
  likeAvailables: number;
  flushTime: number;
  lastPostTime: number;
  lastArticleOrder: number;
  boardId: string;
  fav: boolean;
  lastArticleId: string;
  status: number;
  article: {
    id: string;
    subject: string;
    body: string;
    postTime: number;
    editTime: number;
    account: {
      id: string;
      name: string;
      nick: string;
      gender: number;
      level: number;
      levelTitle: string;
      avatarUrl?: string;
    };
  };
  board: {
    id: string;
    name: string;
    title: string;
  };
  // 图览专用字段
  topicId?: string;
  postTime?: number;
  attachments?: AlbumAttachment[];
}

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
  const [searchText, setSearchText] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [showChannels, setShowChannels] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [channelPosts, setChannelPosts] = useState<ChannelTopic[]>([]);
  const [channelPage, setChannelPage] = useState(1);
  const [channelHasMore, setChannelHasMore] = useState(true);
  const [loadingChannelPosts, setLoadingChannelPosts] = useState(false);
  const [postsDataLoaded, setPostsDataLoaded] = useState(false);
  const [channelPostsDataLoaded, setChannelPostsDataLoaded] = useState(false);
  const [sortByReplyTime, setSortByReplyTime] = useState(false); // false: 按发布时间, true: 按回复时间
  const [showFabMenu, setShowFabMenu] = useState(false); // 浮动按钮菜单显示状态
  const [sortRefreshing, setSortRefreshing] = useState(false); // 排序刷新状态
  const [isBoardFavorited, setIsBoardFavorited] = useState(false); // 当前版面是否已收藏
  const [checkingFavorite, setCheckingFavorite] = useState(false); // 正在检查收藏状态

  const modalAnim = useRef(new Animated.Value(0)).current;
  const fabMenuAnim = useRef(new Animated.Value(0)).current; // 浮动菜单动画
  const fabPosition = useRef(new Animated.ValueXY({x: 0, y: 0})).current; // 浮动按钮位置偏移量

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // 清理频道状态，确保从其他页面进入版面时状态正确
      setSelectedChannel(null);
      setChannelPosts([]);
      setShowChannels(false);
      
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
    loadChannels();
  }, []);

  // 监听页面失去焦点，在后台默默关闭菜单
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      // 直接设置动画值为0和状态为false，在后台关闭菜单
      fabMenuAnim.setValue(0);
      setShowFabMenu(false);
    });

    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (selectedChannel) {
      // 选择频道时清理版面相关状态
      setSelectedBoard(null);
      setPosts([]);
      setPage(1);
      setHasMore(true);
      setShowChannels(true); // 显示频道列表
      setLoading(true); // 设置加载状态
      setPostsDataLoaded(false); // 重置版面数据加载状态
      setChannelPostsDataLoaded(false); // 重置频道数据加载状态
    }
  }, [selectedChannel]);

  useEffect(() => {
    if (selectedBoard) {
      // 切换版面时重置分页状态
      setPage(1);
      setHasMore(true);
      setPosts([]);
      setLoading(true); // 设置加载状态
      setPostsDataLoaded(false); // 重置数据加载状态
      loadPosts(selectedBoard.id, 1, sortByReplyTime ? 1 : 0);
      setShowChannels(false); // 选择版面后隐藏频道列表
      // 检查版面是否已收藏
      checkBoardFavoriteStatus(selectedBoard.id);
    }
  }, [selectedBoard]);

  // 排序方式变化时重新加载
  useEffect(() => {
    if (selectedBoard) {
      setPage(1);
      setHasMore(true);
      setPosts([]);
      setSortRefreshing(true); // 使用独立的排序刷新状态
      setPostsDataLoaded(false);
      loadPosts(selectedBoard.id, 1, sortByReplyTime ? 1 : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortByReplyTime]);

  // 浮动菜单动画
  useEffect(() => {
    Animated.spring(fabMenuAnim, {
      toValue: showFabMenu ? 1 : 0,
      useNativeDriver: false, // 必须为false，因为fabPosition使用false，不能混用
      tension: 50,
      friction: 7,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFabMenu]);

  // 浮动按钮拖动手势
  const isDragging = useRef(false);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => {
        // 只有移动距离超过5px才认为是拖动
        return Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5;
      },
      onPanResponderGrant: () => {
        isDragging.current = false;
        fabPosition.setOffset({
          x: (fabPosition.x as any)._value,
          y: (fabPosition.y as any)._value,
        });
        fabPosition.setValue({x: 0, y: 0});
      },
      onPanResponderMove: (event, gestureState) => {
        // 如果移动距离超过5px，标记为拖动
        if (Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5) {
          isDragging.current = true;
        }
        // 手动更新位置
        fabPosition.setValue({
          x: gestureState.dx,
          y: gestureState.dy,
        });
      },
      onPanResponderRelease: () => {
        fabPosition.flattenOffset();
        
        // 边界检测，确保按钮不会超出屏幕
        const screenWidth = Dimensions.get('window').width;
        const screenHeight = Dimensions.get('window').height;
        const buttonSize = 56;
        const padding = 20;
        
        // 计算边界限制（相对于右下角的偏移）
        const maxX = screenWidth - buttonSize - padding * 2; // 最大向左偏移
        const maxY = screenHeight - buttonSize - padding * 2 - 100; // 最大向上偏移（减去底部安全区域）
        
        Animated.spring(fabPosition, {
          toValue: {
            x: Math.max(-maxX, Math.min((fabPosition.x as any)._value, 0)), // 限制在屏幕内
            y: Math.max(-maxY, Math.min((fabPosition.y as any)._value, 0)),
          },
          useNativeDriver: false,
          tension: 50,
          friction: 7,
        }).start();
        
        // 延迟重置拖动状态，避免拖动结束时立即触发点击事件
        // 使用 setTimeout 确保 onPress 事件能够正确检测到拖动状态
        setTimeout(() => {
          isDragging.current = false;
        }, 100);
      },
    })
  ).current;

  // 动态更新导航栏
  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => {
        if (selectedBoard) {
          return (
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitleText} numberOfLines={1}>
                {selectedBoard.chineseName || selectedBoard.name}
              </Text>
            </View>
          );
        } else {
          // 频道和未选择状态都显示搜索框
          return (
            <View style={styles.headerContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="搜索版面或帖子"
                value={searchText}
                onChangeText={setSearchText}
                returnKeyType="search"
                onSubmitEditing={() => {
                  // TODO: 实现搜索功能
                  console.log('搜索:', searchText);
                }}
              />
            </View>
          );
        }
      },
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
  }, [selectedBoard, selectedChannel, searchText, navigation]);

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

  // 检查版面收藏状态
  const checkBoardFavoriteStatus = async (boardId: string) => {
    try {
      setCheckingFavorite(true);
      const isFavorited = await checkBoardFavorite(boardId);
      setIsBoardFavorited(isFavorited);
    } catch (error) {
      console.error('Check board favorite status error:', error);
      setIsBoardFavorited(false);
    } finally {
      setCheckingFavorite(false);
    }
  };

  // 切换版面收藏状态
  const handleToggleBoardFavorite = async () => {
    if (!selectedBoard) return;
    
    setShowFabMenu(false); // 立即关闭菜单
    
    try {
      if (isBoardFavorited) {
        // 取消收藏
        const result = await removeBoardFavorite(selectedBoard.id);
        if (result.success) {
          setIsBoardFavorited(false);
          console.log('取消收藏成功');
        } else {
          console.error('取消收藏失败:', result.message);
        }
      } else {
        // 添加收藏
        const result = await addBoardFavorite(selectedBoard.id);
        if (result.success) {
          setIsBoardFavorited(true);
          console.log('收藏成功');
        } else {
          console.error('收藏失败:', result.message);
        }
      }
    } catch (error) {
      console.error('Toggle board favorite error:', error);
    }
  };

  const loadChannels = async () => {
    try {
      // 检查缓存
      const cachedChannels = getCache<Channel[]>('channels');
      if (cachedChannels) {
        console.log('缓存频道数据:', cachedChannels.map(c => c.name));
        // 过滤掉"热贴"频道（包括"热帖"的不同写法）
        const filteredChannels = cachedChannels.filter(channel => 
          channel.name !== '热贴' && channel.name !== '热帖'
        );
        console.log('过滤后频道:', filteredChannels.map(c => c.name));
        setChannels(filteredChannels);
        // 初次进入时默认选中"图览"
        if (!selectedChannel && filteredChannels.length > 0) {
          const albumChannel = filteredChannels.find(c => c.name === '图览');
          if (albumChannel) {
            setSelectedChannel(albumChannel);
            loadAlbumPosts(1);
          }
        }
        return;
      }

      const response = await fetch('https://wap.newsmth.net/wap/api/profile/navigation', {
        method: 'GET',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
          'access-control-allow-origin': '*',
          'authorization': 'Basic Og==',
          'cache-control': 'no-cache',
          'pragma': 'no-cache',
          'priority': 'u=1, i',
          'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
          'test-uin-only': '1',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
        }
      });

      const result = await response.json();
      if (result.code === 1 && result.data && result.data.data) {
        const channelsData = result.data.data;
        console.log('原始频道数据:', channelsData.map((c: Channel) => c.name));
        // 过滤掉"热贴"频道（包括"热帖"的不同写法）
        const filteredChannels = channelsData.filter((channel: Channel) => 
          channel.name !== '热贴' && channel.name !== '热帖'
        );
        console.log('过滤后频道:', filteredChannels.map((c: Channel) => c.name));
        setChannels(filteredChannels);
        // 缓存频道数据（过滤后的）
        setCache('channels', undefined, filteredChannels);
        
        // 初次进入时默认选中"图览"
        if (!selectedChannel && filteredChannels.length > 0) {
          const albumChannel = filteredChannels.find((c: Channel) => c.name === '图览');
          if (albumChannel) {
            setSelectedChannel(albumChannel);
            loadAlbumPosts(1);
          }
        }
      }
    } catch (error) {
      console.error('Load channels error:', error);
    }
  };

  const loadAlbumPosts = async (pageNum: number = 1) => {
    try {
      if (pageNum > 1) {
        setLoadingChannelPosts(true);
      } else {
        setLoading(true);
      }

      const timestamp = Date.now();
      const url = `https://wap.newsmth.net/wap/api/album/load/global?t=${timestamp}&page=${pageNum}&size=20`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
          'access-control-allow-origin': '*',
          'authorization': 'Basic Og==',
          'cache-control': 'no-cache',
          'pragma': 'no-cache',
          'priority': 'u=1, i',
          'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
          'test-uin-only': '1',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
        }
      });

      const result = await response.json();
      if (result.code === 1 && result.data) {
        const { articles, pager } = result.data;
        
        // 转换图览数据为频道帖子格式
        const convertedTopics: ChannelTopic[] = (articles || []).map((article: AlbumArticle) => ({
          id: article.id,
          subject: article.subject,
          availables: 0, // 图览没有回复数
          firstArticleId: article.id,
          likeAvailables: 0,
          flushTime: article.postTime,
          lastPostTime: article.postTime,
          lastArticleOrder: 0,
          boardId: article.board.name,
          fav: false,
          lastArticleId: article.id,
          status: 0,
          article: {
            id: article.id,
            subject: article.subject,
            body: article.body,
            postTime: article.postTime,
            editTime: 0,
            account: {
              id: article.account.name,
              name: article.account.name,
              nick: article.account.nick,
              gender: 0,
              level: 0,
              levelTitle: '',
              avatarUrl: article.account.avatarUrl,
            },
          },
          board: {
            id: article.board.name,
            name: article.board.name,
            title: article.board.title,
          },
          topicId: article.topicId, // 图览的主题ID
          postTime: article.postTime,
          // 添加图片信息，用于后续渲染
          attachments: article.attachments,
        } as any));
        
        if (pageNum === 1) {
          setChannelPosts(convertedTopics);
          setChannelPage(1);
        } else {
          setChannelPosts(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newPosts = convertedTopics.filter(p => !existingIds.has(p.id));
            return [...prev, ...newPosts];
          });
        }
        
        // 检查是否还有更多数据
        const totalPages = Math.ceil(pager.items / pager.size);
        setChannelHasMore(pageNum < totalPages);
        setChannelPostsDataLoaded(true);
      }
    } catch (error) {
      console.error('Load album posts error:', error);
    } finally {
      setLoading(false);
      if (pageNum > 1) {
        setLoadingChannelPosts(false);
      }
    }
  };

  const loadChannelPosts = async (channelId: string, pageNum: number = 1) => {
    try {
      if (pageNum > 1) {
        setLoadingChannelPosts(true);
      } else {
        setLoading(true);
      }

      const timestamp = Date.now();
      const url = `https://wap.newsmth.net/wap/api/channel/loadTopics?t=${timestamp}&channel=${channelId}&page=${pageNum}&size=20`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
          'access-control-allow-origin': '*',
          'authorization': 'Basic Og==',
          'cache-control': 'no-cache',
          'pragma': 'no-cache',
          'priority': 'u=1, i',
          'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
          'test-uin-only': '1',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
        }
      });

      const result = await response.json();
      if (result.code === 1 && result.data) {
        const { topics, pager } = result.data;
        
        if (pageNum === 1) {
          setChannelPosts(topics || []);
          setChannelPage(1);
        } else {
          // 使用Set来去重，确保不会有重复的id
          setChannelPosts(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newPosts = (topics || []).filter((p: ChannelTopic) => !existingIds.has(p.id));
            return [...prev, ...newPosts];
          });
        }
        
        // 检查是否还有更多数据
        const totalPages = Math.ceil(pager.items / pager.size);
        setChannelHasMore(pageNum < totalPages);
        setChannelPostsDataLoaded(true);
      }
    } catch (error) {
      console.error('Load channel posts error:', error);
      // 接口失败时不设置channelPostsDataLoaded
    } finally {
      setLoading(false);
      if (pageNum > 1) {
        setLoadingChannelPosts(false);
      }
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

  const loadPosts = async (boardId: string, pageNum: number, orderByFlushTime: number = 0) => {
    try {
      if (pageNum > 1) {
        setLoadingMore(true);
      } else if (!sortRefreshing) {
        // 只有非排序刷新时才设置loading
        setLoading(true);
      }
      
      const {topics, tops, totalPages} = await getBoardPosts(boardId, pageNum, orderByFlushTime);
      
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
      setPostsDataLoaded(true);
    } catch (error) {
      console.error('Load posts error:', error);
      // 接口失败时不设置postsDataLoaded
    } finally {
      setLoading(false);
      setSortRefreshing(false); // 清除排序刷新状态
      if (pageNum > 1) {
        setLoadingMore(false);
      }
    }
  };

  const loadMore = () => {
    if (selectedChannel) {
      // 频道帖子加载更多
      if (channelHasMore && !loadingChannelPosts) {
        const nextPage = channelPage + 1;
        setChannelPage(nextPage);
        // 判断是否是图览频道
        if (selectedChannel.name === '图览') {
          loadAlbumPosts(nextPage);
        } else {
          loadChannelPosts(selectedChannel.id, nextPage);
        }
      }
    } else if (selectedBoard) {
      // 版面帖子加载更多
      if (hasMore && !loadingMore) {
        const nextPage = page + 1;
        setPage(nextPage);
        loadPosts(selectedBoard.id, nextPage, sortByReplyTime ? 1 : 0);
      }
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (selectedChannel) {
        setChannelPage(1);
        setChannelHasMore(true);
        // 判断是否是图览频道
        if (selectedChannel.name === '图览') {
          await loadAlbumPosts(1);
        } else {
          await loadChannelPosts(selectedChannel.id, 1);
        }
      } else if (selectedBoard) {
        setPage(1);
        setHasMore(true);
        await loadPosts(selectedBoard.id, 1, sortByReplyTime ? 1 : 0);
      } else {
        await loadChannels();
      }
    } catch (error) {
      console.error('Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const renderChannelItem = ({item}: {item: Channel}) => (
    <TouchableOpacity
      style={[
        styles.channelItem,
        selectedChannel?.id === item.id && styles.selectedChannelItem
      ]}
      onPress={() => {
        setSelectedChannel(item);
        setSelectedBoard(null); // 清除版面选择
        setChannelPage(1);
        setChannelHasMore(true);
        setChannelPosts([]);
        // 判断是否是图览频道
        if (item.name === '图览') {
          loadAlbumPosts(1);
        } else {
          loadChannelPosts(item.id, 1);
        }
        console.log('选择频道:', item);
      }}>
      <Text style={[
        styles.channelText,
        selectedChannel?.id === item.id && styles.selectedChannelText
      ]}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  const renderChannelsList = () => {
    if (!showChannels || channels.length === 0) return null;
    
    return (
      <View style={styles.channelsContainer}>
        <FlatList
          data={channels}
          renderItem={renderChannelItem}
          keyExtractor={item => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.channelsList}
        />
      </View>
    );
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
          <Text style={styles.statsText}>{formatRelativeTime(sortByReplyTime ? item.lastReplyTime : item.postTime)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  )};

  const renderChannelPostItem = ({item}: {item: ChannelTopic}) => {
    const isRead = readPosts.has(item.id);
    return (
      <TouchableOpacity
        style={styles.postItem}
        onPress={() => {
          markAsRead(item.id);
          navigation.navigate('PostDetail', {
            board: item.board.name,
            postId: item.topicId || item.id, // 图览使用topicId，普通频道使用id
          });
        }}>
        <View style={styles.postHeader}>
          <Text 
            style={[
              styles.postTitle,
              isRead && styles.readPostTitle
            ]} 
            numberOfLines={2}
          >
            {item.subject}
          </Text>
        </View>
        <View style={styles.postMeta}>
          <View style={styles.postAuthorInfo}>
            <Text style={styles.metaText}>
              {item.article.account.nick} ({item.article.account.name})
            </Text>
            {item.article.account.levelTitle && (
              <Text style={styles.levelTitle}> · {item.article.account.levelTitle}</Text>
            )}
          </View>
          <View style={styles.postStats}>
            <Text style={styles.metaText}>{item.availables} 回复</Text>
            <Text style={styles.statsText}>{formatRelativeTime(sortByReplyTime ? item.lastPostTime : item.postTime)}</Text>
          </View>
        </View>
        <View style={styles.channelPostBoard}>
          <Text style={styles.boardNameText}>📋 {item.board.title}</Text>
        </View>
      </TouchableOpacity>
    );
  };

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
    const showFooter = selectedChannel ? channelHasMore : hasMore;
    const isLoading = selectedChannel ? loadingChannelPosts : loadingMore;
    
    if (!showFooter) return null;
    
    return (
      <View style={styles.footerContainer}>
        {isLoading ? (
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

  // 浮动按钮菜单项配置
  const fabMenuItems = [
    {
      icon: sortByReplyTime ? '📅' : '💬',
      label: sortByReplyTime ? '按发布' : '按回复',
      onPress: () => {
        setShowFabMenu(false); // 立即关闭菜单
        // 等待菜单缩回动画完成后再切换排序，避免刷新时菜单残留
        setTimeout(() => {
          setSortByReplyTime(!sortByReplyTime);
        }, 300);
      },
      show: selectedBoard !== null,
      disabled: false,
    },
    {
      icon: '✏️',
      label: '发帖',
      onPress: () => {
        setShowFabMenu(false); // 立即关闭菜单
        // TODO: 跳转到发帖页面
        console.log('发帖');
      },
      show: selectedBoard !== null,
      disabled: false,
    },
    {
      icon: '⭐',
      label: isBoardFavorited ? '已收藏' : '收藏',
      onPress: () => {
        if (selectedBoard) {
          handleToggleBoardFavorite();
        } else {
          setShowFabMenu(false); // 立即关闭菜单
          navigation.navigate('BoardList', {favorites: true});
        }
      },
      show: true,
      disabled: false, // 不再置灰，始终可点击
    },
  ].filter(item => item.show);

  // 渲染浮动按钮菜单
  const renderFabMenu = () => {
    if (!selectedBoard && !selectedChannel) return null;

    return (
      <>
        {/* 菜单项 - 只在菜单展开时可交互 */}
        {fabMenuItems.map((item, index) => {
          // 计算角度：向左上方扇形展开
          // 在React Native中，Y轴向下为正，所以需要调整角度
          // 我们希望菜单从左边（180度）到上边（270度）展开
          const totalAngle = Math.PI / 2; // 90度扇形范围
          const startAngle = Math.PI; // 180度（正左方）
          const angle = startAngle + (totalAngle / Math.max(fabMenuItems.length - 1, 1)) * index;
          const radius = 100;
          const menuTranslateX = fabMenuAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, Math.cos(angle) * radius], // 180度到270度，cos为负，向左
          });
          const menuTranslateY = fabMenuAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, Math.sin(angle) * radius], // 180度到270度，sin为负，向上
          });

          return (
            <Animated.View
              key={index}
              pointerEvents={showFabMenu ? 'auto' : 'none'}
              style={[
                styles.fabMenuItem,
                {
                  opacity: fabMenuAnim,
                  transform: [
                    {translateX: fabPosition.x},
                    {translateY: fabPosition.y},
                    {translateX: menuTranslateX},
                    {translateY: menuTranslateY},
                    {
                      scale: fabMenuAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 1],
                      }),
                    },
                  ],
                },
              ]}>
              <TouchableOpacity
                style={styles.fabMenuButton}
                onPress={item.onPress}
                activeOpacity={0.8}>
                <Text style={styles.fabMenuIcon}>{item.icon}</Text>
              </TouchableOpacity>
              <Text style={styles.fabMenuLabel}>{item.label}</Text>
            </Animated.View>
          );
        })}

        {/* 主浮动按钮 */}
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.fabButton,
            {
              transform: [
                {translateX: fabPosition.x},
                {translateY: fabPosition.y},
              ],
            },
          ]}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              // 只有在非拖动状态下才切换菜单
              if (!isDragging.current) {
                setShowFabMenu(!showFabMenu);
              }
            }}
            style={styles.fabButtonTouchable}>
            <Animated.Text
              style={[
                styles.fabIcon,
                {
                  transform: [
                    {
                      rotate: fabMenuAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '45deg'],
                      }),
                    },
                  ],
                },
              ]}>
              +
            </Animated.Text>
          </TouchableOpacity>
        </Animated.View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {renderChannelsList()}
      {selectedChannel ? (
        <FlatList
          data={channelPosts}
          renderItem={renderChannelPostItem}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            !loading && !refreshing && channelPosts.length === 0 && channelPostsDataLoaded ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>暂无帖子</Text>
              </View>
            ) : null
          }
          ListFooterComponent={renderFooter}
        />
      ) : selectedBoard ? (
        <FlatList
          data={posts}
          renderItem={renderPostItem}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            !loading && !refreshing && posts.length === 0 && postsDataLoaded ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>暂无帖子</Text>
              </View>
            ) : null
          }
          ListFooterComponent={renderFooter}
        />
      ) : (
        <ScrollView
          style={styles.container}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }>
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>请选择版面或频道</Text>
            <Text style={styles.hintText}>点击左上角菜单选择版面，或使用上方频道快速浏览</Text>
          </View>
        </ScrollView>
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

      {/* 浮动按钮菜单 - 仅在查看版面帖子时显示，查看频道时隐藏 */}
      {!selectedChannel && renderFabMenu()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  headerContainer: {
    flex: 1,
    marginHorizontal: 16,
  },
  searchInput: {
    height: 36,
    backgroundColor: '#f0f0f0',
    borderRadius: 18,
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#333',
  },
  channelsContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingVertical: 8,
  },
  channelsList: {
    paddingHorizontal: 16,
  },
  channelItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: '#f8f8f8',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  selectedChannelItem: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  channelText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  selectedChannelText: {
    color: '#fff',
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
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginBottom: 8,
  },
  hintText: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  channelPostBoard: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f0f0f0',
  },
  boardNameText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
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
  fabButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 32,
    color: '#007AFF',
    fontWeight: '200',
    lineHeight: 32,
  },
  fabMenuItem: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    alignItems: 'center',
  },
  fabMenuButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  fabMenuIcon: {
    fontSize: 20,
    color: '#007AFF',
  },
  fabMenuLabel: {
    marginTop: 6,
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
    overflow: 'hidden',
  },
  fabButtonTouchable: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default BoardScreen;
