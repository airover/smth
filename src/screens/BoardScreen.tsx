import React, {useState, useEffect, useRef, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  RefreshControl,
  PanResponder,
  ImageBackground,
  // Image - 预留用于将来图片功能
  Alert,
} from 'react-native';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import {useNavigation, useRoute} from '@react-navigation/native';
import {getBoards, getFavoriteBoards, getBoardPosts} from '../services/api';
import {getSubBoards, checkBoardFavorite, addBoardFavorite, removeBoardFavorite, getMSitePostIdForTopic, getStaticAttachmentUrlsForTopic} from '../services/dataFetcher';
import {Board, Post} from '../types';
import {getCache, setCache, getCacheWithTimestamp} from '../services/cacheManager';
import {formatRelativeTime} from '../utils/timeFormat';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useSettings} from '../context/SettingsContext';
import {useTheme} from '../components/ThemedComponents';
import {
  StarIcon,
  SearchIcon,
  FolderOpenIcon,
  FolderIcon,
  FileIcon,
  BoardIcon,
  CalendarIcon,
  MessageIcon,
  EditIcon,
  MenuIcon,
} from '../components/SvgIcons';
import {ThemedHeaderButton, useFloatingHeader} from '../components/ThemeHeader';
import {useReadPosts} from '../context/ReadPostsContext';


const {width: SCREEN_WIDTH} = Dimensions.get('window');
const DRAWER_WIDTH = SCREEN_WIDTH * 0.8;
const LIST_CACHE_FRESH_AGE = 60 * 1000;
const LIST_CACHE_MAX_STALE_AGE = 30 * 60 * 1000;

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
    k3sUrl?: string;
    ks3Url?: string;
    avatar?: string;
  };
  board: {
    id: string; // 版面hash ID
    name: string; // 版面英文名
    title: string; // 版面中文名
    groupId: string;
    sectionId: string;
    type: number;
    status: number;
    isFavorite: number;
    accessScore?: number;
    readOnly?: boolean;
    todayPostCount?: number;
    forbiddenReply?: boolean;
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
      k3sUrl?: string;
      ks3Url?: string;
      avatar?: string;
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
  mSitePostId?: string | null; // M站短ID，用于帖子详情获取静态附件URL
}

const BoardScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const {settings} = useSettings();
  const theme = useTheme();

  // 基于主题的动态样式 — 确保真机上主题切换时样式完全重建
  const themedStyles = useMemo(() => ({
    searchBarContainer: {
      backgroundColor: 'transparent',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: 'transparent',
    } as const,
    searchInput: {
      height: 36,
      backgroundColor: theme.placeholderBackground,
      borderRadius: 18,
      paddingHorizontal: 16,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    searchPlaceholder: {
      fontSize: 14,
      color: theme.secondaryText,
    },
    channelsContainer: {
      backgroundColor: 'transparent',
      borderBottomWidth: 1,
      borderBottomColor: 'transparent',
      paddingVertical: 8,
    },
    channelItem: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      marginRight: 8,
      backgroundColor: theme.placeholderBackground,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    channelItemSelected: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      marginRight: 8,
      backgroundColor: theme.primary,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.primary,
    },
    channelText: {
      fontSize: 14,
      fontWeight: '500' as const,
      color: theme.text,
    },
    channelTextSelected: {
      fontSize: 14,
      fontWeight: '600' as const,
      color: '#fff',
    },
  }), [theme]);

  const [boards, setBoards] = useState<Board[]>([]);
  // loadFavoriteBoards 用于刷新收藏版面列表
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_favoriteBoards, setFavoriteBoards] = useState<Board[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
  const [showBoardList, setShowBoardList] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const {isRead, markAsRead} = useReadPosts();

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
  const [sortByReplyTime, setSortByReplyTime] = useState(settings.defaultBoardSort === 'reply'); // 从全局配置初始化
  const [showFabMenu, setShowFabMenu] = useState(false); // 浮动按钮菜单显示状态
  const [sortRefreshing, setSortRefreshing] = useState(false); // 排序刷新状态
  const [isBoardFavorited, setIsBoardFavorited] = useState(false); // 当前版面是否已收藏
  // checkingFavorite 用于显示加载状态
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_checkingFavorite, setCheckingFavorite] = useState(false); // 正在检查收藏状态

  // 使用Ref来追踪最新的状态，解决闭包问题
  const selectedBoardRef = useRef(selectedBoard);
  const selectedChannelRef = useRef(selectedChannel);
  const channelsRef = useRef(channels);
  const channelsListRef = useRef<FlatList>(null);

  useEffect(() => {
    selectedBoardRef.current = selectedBoard;
  }, [selectedBoard]);

  useEffect(() => {
    selectedChannelRef.current = selectedChannel;
  }, [selectedChannel]);

  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  const switchToChannel = (index: number) => {
    const currentChannels = channelsRef.current;
    if (index >= 0 && index < currentChannels.length) {
      const targetChannel = currentChannels[index];
      setSelectedChannel(targetChannel);
      // 滚动频道列表以显示选中的频道
      // 稍微延迟一下，确保状态更新后再滚动
      setTimeout(() => {
        channelsListRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.5,
        });
      }, 0);
    }
  };

  // 频道切换手势
  const channelSwipeResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // 只有在显示频道列表且没有选中具体版面时才启用
        if (!selectedChannelRef.current || selectedBoardRef.current) return false;
        
        // 更严格的水平滑动判断：
        // 1. 水平距离必须是垂直距离的2倍以上（确保是明显的水平滑动）
        // 2. 水平距离超过30px（提高阈值）
        // 3. 垂直距离不能超过30px（避免斜向滑动被误判）
        const absX = Math.abs(gestureState.dx);
        const absY = Math.abs(gestureState.dy);
        const isHorizontal = absX > absY * 2 && absX > 30 && absY < 30;
        return isHorizontal;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (evt, gestureState) => {
        if (Math.abs(gestureState.dx) > 80) { // 滑动距离超过 80 才触发切换（提高阈值）
          const currentChannels = channelsRef.current;
          const currentIndex = currentChannels.findIndex(c => c.id === selectedChannelRef.current?.id);
          if (currentIndex === -1) return;

          if (gestureState.dx > 0) {
            // 向右滑动，切换到上一个频道
            if (currentIndex > 0) {
              switchToChannel(currentIndex - 1);
            }
          } else {
            // 向左滑动，切换到下一个频道
            if (currentIndex < currentChannels.length - 1) {
              switchToChannel(currentIndex + 1);
            }
          }
        }
      },
    })
  ).current;

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
    const params = route.params as {board?: string, boardName?: string, source?: string, resetToHome?: boolean};
    
    // 处理重置到首页的情况
    if (params?.resetToHome) {
      setSelectedBoard(null);
      setSelectedChannel(null);
      setPosts([]);
      setChannelPosts([]);
      setPage(1);
      setChannelPage(1);
      setShowChannels(true);
      setShowFabMenu(false);
      
      // 选中图览频道
      if (channels.length > 0) {
        const albumChannel = channels.find(c => c.name === '图览');
        if (albumChannel) {
          setSelectedChannel(albumChannel);
        }
      }
      
      // 清除参数
      navigation.setParams({resetToHome: undefined});
      return;
    }
    
    // 处理从外部链接进入版面的情况（收藏页、搜索页、首页等）
    if (params?.board && params?.source && params.source !== 'tab') {
      // 清理频道状态，确保从链接进入版面时状态正确
      setSelectedChannel(null);
      setChannelPosts([]);
      setShowChannels(false);
      
      setSelectedBoard({
        id: params.board,
        name: params.boardName || params.board,
        chineseName: params.boardName,
      });
      
      // 清除参数，避免重复处理
      navigation.setParams({board: undefined, boardName: undefined, source: undefined});
    }
    
    // 处理从Tab点击进入的情况（显示频道列表）
    if (params?.source === 'tab') {
      setShowChannels(true);
      // 清除参数
      navigation.setParams({source: undefined});
    }
  }, [route.params]);

  useEffect(() => {
    loadBoards();
    loadFavoriteBoards();
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

  // 监听Tab重复点击事件，返回版面首页（显示频道列表）
  useEffect(() => {
    const params = route.params as {resetToHome?: number};
    if (params?.resetToHome) {
      // 如果当前在查看某个版面或频道，则重置到首页状态
      if (selectedBoard || selectedChannel) {
        // 重置所有状态到初始状态
        setSelectedBoard(null);
        setPosts([]);
        setChannelPosts([]);
        setPage(1);
        setChannelPage(1);
        setHasMore(true);
        setChannelHasMore(true);
        setShowChannels(true); // 显示频道列表
        setPostsDataLoaded(false);
        setChannelPostsDataLoaded(false);
        // 关闭浮动菜单
        fabMenuAnim.setValue(0);
        setShowFabMenu(false);
        
        // 默认选中"图览"频道
        const albumChannel = channels.find(c => c.name === '图览');
        if (albumChannel) {
          setSelectedChannel(albumChannel);
        } else {
          setSelectedChannel(null);
        }
      }
    }
  }, [route.params, channels, selectedBoard, selectedChannel]);

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
      
      // 自动加载对应频道的帖子
      setChannelPage(1);
      setChannelHasMore(true);
      setChannelPosts([]);
      if (selectedChannel.name === '图览') {
        loadAlbumPosts(1);
      } else {
        loadChannelPosts(selectedChannel.id, 1);
      }
    }
  }, [selectedChannel]);

  useEffect(() => {
    if (selectedBoard) {
      // 验证版面ID是否有效
      if (!selectedBoard.id) {
        console.error('错误：版面ID为空', selectedBoard);
        Alert.alert('错误', '版面ID无效，无法加载帖子');
        return;
      }
      
      // 切换版面时重置分页状态和排序状态
      setPage(1);
      setHasMore(true);
      setPosts([]);
      setLoading(true); // 设置加载状态
      setPostsDataLoaded(false); // 重置数据加载状态
      // 重置排序为默认配置
      const defaultSort = settings.defaultBoardSort === 'reply';
      setSortByReplyTime(defaultSort);
      
      loadPosts(selectedBoard.id, 1, defaultSort ? 1 : 0);
      
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
  const setHeaderOptions = useFloatingHeader();
  useEffect(() => {
    setHeaderOptions({
      headerTitle: () => {
        if (selectedBoard) {
          return (
            <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitleText, {color: theme.headerText}]} numberOfLines={1}>
                {selectedBoard.chineseName || selectedBoard.name}
              </Text>
            </View>
          );
        } else if (selectedChannel || showChannels) {
          // 当选中频道或显示频道列表时，标题显示"频道"
          return (
            <View style={styles.headerTitleContainer}>
              <Text style={[styles.headerTitleText, {color: theme.headerText}]}>频道</Text>
            </View>
          );
        } else {
          return (
            <View style={styles.headerTitleContainer}>
              <Text style={[styles.headerTitleText, {color: theme.headerText}]}>版面</Text>
            </View>
          );
        }
      },
      headerLeft: () => (
        <ThemedHeaderButton
          onPress={() => setShowBoardList(true)}>
          <MenuIcon size={24} color={theme.headerBackgroundImage ? '#FFFFFF' : theme.tabBarInactive} />
        </ThemedHeaderButton>
      ),
      headerRight: () => (
        <ThemedHeaderButton
          onPress={() => navigation.navigate('BoardList', {favorites: true})}>
          <StarIcon size={24} color={theme.headerBackgroundImage ? '#FFFFFF' : theme.tabBarInactive} />
        </ThemedHeaderButton>
      ),
    });
  }, [selectedBoard, selectedChannel, showChannels, navigation, theme]);

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
        } else {
          console.error('取消收藏失败:', result.message);
        }
      } else {
        // 添加收藏
        const result = await addBoardFavorite(selectedBoard.id);
        if (result.success) {
          setIsBoardFavorited(true);
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
        // 过滤掉"热贴"频道（包括"热帖"的不同写法）
        const filteredChannels = cachedChannels.filter(channel => 
          channel.name !== '热贴' && channel.name !== '热帖'
        );
        // 将"图览"频道移到最左边
        const albumIndex = filteredChannels.findIndex(c => c.name === '图览');
        if (albumIndex > 0) {
          const albumChannel = filteredChannels.splice(albumIndex, 1)[0];
          filteredChannels.unshift(albumChannel);
        }
        setChannels(filteredChannels);
        // 初次进入时默认选中"图览"（仅当没有选中版面时）
        // 使用Ref和route.params来判断，避免闭包导致的旧状态问题
        const params = route.params as {board?: string, source?: string} | undefined;
        const isNavigatingFromLink = params?.board && params?.source && params.source !== 'tab';
        const hasSelectedBoard = selectedBoardRef.current || isNavigatingFromLink;
        
        if (!selectedChannelRef.current && !hasSelectedBoard && filteredChannels.length > 0) {
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
        // 过滤掉"热贴"频道（包括"热帖"的不同写法）
        const filteredChannels = channelsData.filter((channel: Channel) => 
          channel.name !== '热贴' && channel.name !== '热帖'
        );
        // 将"图览"频道移到最左边
        const albumIndex = filteredChannels.findIndex((c: Channel) => c.name === '图览');
        if (albumIndex > 0) {
          const albumChannel = filteredChannels.splice(albumIndex, 1)[0];
          filteredChannels.unshift(albumChannel);
        }
        setChannels(filteredChannels);
        // 缓存频道数据（过滤后的）
        setCache('channels', undefined, filteredChannels);
        
        // 初次进入时默认选中"图览"（仅当没有选中版面时）
        // 使用Ref和route.params来判断，避免闭包导致的旧状态问题
        const params = route.params as {board?: string, source?: string} | undefined;
        const isNavigatingFromLink = params?.board && params?.source && params.source !== 'tab';
        const hasSelectedBoard = selectedBoardRef.current || isNavigatingFromLink;

        if (!selectedChannelRef.current && !hasSelectedBoard && filteredChannels.length > 0) {
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

  const loadAlbumPosts = async (pageNum: number = 1, forceRefresh: boolean = false) => {
    try {
      let shouldUseCache = false;
      const cacheKey = `global`;

      if (pageNum === 1 && !forceRefresh) {
        try {
          const cached = getCacheWithTimestamp<any>('albumPosts', cacheKey);
          if (cached) {
            const { timestamp, data } = cached;
            const { data: topics, pager } = data;
            if (topics && topics.length > 0) {
              const age = Date.now() - timestamp;
              if (age < LIST_CACHE_MAX_STALE_AGE) {
                setChannelPosts(topics);
                setChannelPage(1);
                const totalPages = Math.ceil(pager.items / pager.size);
                setChannelHasMore(1 < totalPages);
                setChannelPostsDataLoaded(true);

                if (age < LIST_CACHE_FRESH_AGE) {
                  return;
                }
                shouldUseCache = true;
              }
            }
          }
        } catch (e) {
          console.error('Failed to load album cache:', e);
        }
      }

      if (pageNum > 1) {
        setLoadingChannelPosts(true);
      } else if (!shouldUseCache && !forceRefresh) {
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
        
        // 调试：打印第一篇文章的数据结构
        if (articles && articles.length > 0) {
        }
        
        // 转换图览数据为频道帖子格式
        const convertedTopics: ChannelTopic[] = await Promise.all((articles || []).map(async (article: AlbumArticle) => {
          // 处理附件URL
          const processedAttachments = (article.attachments || []).map((att: any, attIdx: number) => {
            // 优先使用 ks3Url，然后是 cdnUrl，最后是 url
            let url = att.ks3Url || att.cdnUrl || att.url || '';
            
            if (url && url.startsWith('http:')) {
              url = url.replace('http:', 'https:');
            }
            
            if (url && !url.startsWith('http')) {
              url = `https://file.mysmth.net/${url}`;
            } else if (!url && att.id) {
              // 如果没有 url 但有 id，尝试构建下载链接
              url = `https://wap.newsmth.net/wap/api/attachment/download/${att.id}`;
            }
            
            const processed = {
              ...att,
              cdnUrl: url, // 统一使用cdnUrl字段
            };
            return processed;
          });
          
          // 处理头像URL：优先使用 k3sUrl/ks3Url，然后 avatarUrl，最后是 avatar
          let avatarUrl = article.account.k3sUrl || article.account.ks3Url || article.account.avatarUrl || '';
          if (!avatarUrl && article.account.avatar) {
            if (article.account.avatar.startsWith('http')) {
              avatarUrl = article.account.avatar;
            } else {
              avatarUrl = `https://file.mysmth.net/${article.account.avatar}`;
            }
          }
          // 确保使用 HTTPS
          if (avatarUrl && avatarUrl.startsWith('http:')) {
            avatarUrl = avatarUrl.replace('http:', 'https:');
          }
          
          return {
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
              avatarUrl: avatarUrl,
            },
          },
          board: {
            id: article.board.id, // 直接使用API返回的版面hash ID
            name: article.board.name,
            title: article.board.title,
          },
          topicId: article.topicId, // 图览的主题ID
          postTime: article.postTime,
          // 添加处理后的图片信息
          attachments: processedAttachments,
        } as any;
        }));
        
        // 为每个帖子获取静态URL（只在附件缺少云存储URL时才会尝试获取）
        const topicsWithStaticUrls = await Promise.all(convertedTopics.map(async (topic) => {
          const staticUrls = await getStaticAttachmentUrlsForTopic({
            attachments: topic.attachments || [],
            boardName: topic.board.name,
            topicTitle: topic.subject,
            logTag: 'AlbumPosts',
            topicId: topic.topicId || topic.id,
          });
          
          // 如果获取到静态URL，则填充到附件中
          let updatedAttachments = topic.attachments || [];
          if (staticUrls.length > 0 && updatedAttachments.length > 0) {
            updatedAttachments = updatedAttachments.map((att: any, index: number) => {
              // 按顺序匹配：第N个附件对应第N个静态URL
              if (index < staticUrls.length && !att.k3sUrl && !att.ks3Url) {
                return {
                  ...att,
                  cdnUrl: staticUrls[index],
                };
              }
              return att;
            });
          }
          
          return {
            ...topic,
            attachments: updatedAttachments,
          };
        }));
        if (pageNum === 1) {
          setChannelPosts(topicsWithStaticUrls);
          setChannelPage(1);
          
          // Save cache
          try {
            const cacheData = {
              data: topicsWithStaticUrls,
              pager: pager
            };
            setCache('albumPosts', cacheKey, cacheData);
          } catch (e) {
            console.error('Failed to save album cache:', e);
          }
        } else {
          setChannelPosts(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newPosts = topicsWithStaticUrls.filter(p => !existingIds.has(p.id));
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

  const loadChannelPosts = async (channelId: string, pageNum: number = 1, forceRefresh: boolean = false) => {
    try {
      let shouldUseCache = false;
      // const cacheKey = `cache_channel_${channelId}`;

      if (pageNum === 1 && !forceRefresh) {
        try {
          // const cachedData = await AsyncStorage.getItem(cacheKey);
          const cached = getCacheWithTimestamp<any>('channelPosts', channelId);
          if (cached) {
            const { timestamp, data } = cached;
            const { data: topics, pager } = data;
            if (topics && topics.length > 0) {
              const age = Date.now() - timestamp;
              if (age < LIST_CACHE_MAX_STALE_AGE) {
                setChannelPosts(topics);
                setChannelPage(1);
                const totalPages = Math.ceil(pager.items / pager.size);
                setChannelHasMore(1 < totalPages);
                setChannelPostsDataLoaded(true);

                if (age < LIST_CACHE_FRESH_AGE) {
                  return;
                }
                shouldUseCache = true;
              }
            }
          }
        } catch (e) {
          console.error('Failed to load channel cache:', e);
        }
      }

      if (pageNum > 1) {
        setLoadingChannelPosts(true);
      } else if (!shouldUseCache && !forceRefresh) {
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
        
        // 处理频道帖子的头像URL
        const processedTopics = await Promise.all((topics || []).map(async (topic: ChannelTopic) => {
          if (topic.article && topic.article.account) {
            const account = topic.article.account;
            let avatarUrl = account.k3sUrl || account.ks3Url || account.avatarUrl || '';
            if (!avatarUrl && account.avatar) {
              if (account.avatar.startsWith('http')) {
                avatarUrl = account.avatar;
              } else {
                avatarUrl = `https://file.mysmth.net/${account.avatar}`;
              }
            }
            // 确保使用 HTTPS
            if (avatarUrl && avatarUrl.startsWith('http:')) {
              avatarUrl = avatarUrl.replace('http:', 'https:');
            }
            return {
              ...topic,
              article: {
                ...topic.article,
                account: {
                  ...account,
                  avatarUrl: avatarUrl,
                },
              },
            };
          }
          return topic;
        }));
        
        // 为每个帖子获取mSitePostId（只在附件缺少云存储URL时才会尝试获取）
        const topicsWithMSiteId = await Promise.all(processedTopics.map(async (topic) => {
          const mSitePostId = await getMSitePostIdForTopic({
            attachments: topic.article?.attachments || [],
            boardName: topic.board.name,
            topicTitle: topic.subject,
            logTag: 'ChannelPosts',
            topicId: topic.topicId || topic.id,
          });
          return {
            ...topic,
            mSitePostId: mSitePostId,
          };
        }));
        
        if (pageNum === 1) {
          setChannelPosts(topicsWithMSiteId);
          setChannelPage(1);
          
          // Save cache
          try {
            const cacheData = {
              data: topicsWithMSiteId,
              pager: pager
            };
            setCache('channelPosts', channelId, cacheData);
          } catch (e) {
            console.error('Failed to save channel cache:', e);
          }
        } else {
          // 使用Set来去重，确保不会有重复的id
          setChannelPosts(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newPosts = topicsWithMSiteId.filter((p: ChannelTopic) => !existingIds.has(p.id));
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



  const loadPosts = async (boardId: string, pageNum: number, orderByFlushTime: number = 0, forceRefresh: boolean = false) => {
    try {
      let shouldUseCache = false;
      const cacheKey = `${boardId}_${orderByFlushTime}`;

      if (pageNum === 1 && !forceRefresh) {
        try {
          const cached = getCacheWithTimestamp<any>('boardPosts', cacheKey);
          if (cached) {
            const { timestamp, data } = cached;
            const { data: topics, tops, totalPages } = data;
            if (topics && topics.length > 0) {
              const age = Date.now() - timestamp;
              if (age < LIST_CACHE_MAX_STALE_AGE) {
                const combinedPosts = [...(tops || []), ...topics];
                setPosts(combinedPosts);
                setPage(1);
                setHasMore(true);
                setPostsDataLoaded(true);
              
                if (age < LIST_CACHE_FRESH_AGE) {
                  return;
                }
                shouldUseCache = true;
              }
            }
          }
        } catch (e) {
          console.error('Failed to load cache:', e);
        }
      }

      if (pageNum > 1) {
        setLoadingMore(true);
      } else if (!sortRefreshing && !shouldUseCache && !forceRefresh) {
        // 只有非排序刷新时才设置loading
        setLoading(true);
      }
      
      const {topics, tops, totalPages} = await getBoardPosts(boardId, pageNum, orderByFlushTime);
      
      if (pageNum === 1) {
        // 第一页时，如果有置顶帖且不是加载更多，则合并
        const combinedPosts = [...tops, ...topics];
        setPosts(combinedPosts);
        setPage(1);
        
        // Save cache - 只有成功获取到数据时才写入缓存
        if (topics.length > 0 || tops.length > 0) {
          try {
            const cacheData = {
              data: topics,
              tops: tops,
              totalPages: totalPages
            };
            setCache('boardPosts', cacheKey, cacheData);
          } catch (e) {
            console.error('Failed to save cache:', e);
          }
        }
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
    } catch (error: any) {
      console.error('Load posts error:', error);
      console.error('版面ID:', boardId, '页码:', pageNum);
      // 接口失败时不设置postsDataLoaded
      // 如果是第一页且没有缓存数据，显示错误提示
      if (pageNum === 1 && posts.length === 0) {
        Alert.alert('加载失败', error.message || '无法加载帖子列表，请稍后重试');
      }
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
          await loadAlbumPosts(1, true);
        } else {
          await loadChannelPosts(selectedChannel.id, 1, true);
        }
      } else if (selectedBoard) {
        setPage(1);
        setHasMore(true);
        await loadPosts(selectedBoard.id, 1, sortByReplyTime ? 1 : 0, true);
      } else {
        await loadChannels();
      }
    } catch (error) {
      console.error('Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const renderChannelItem = ({item}: {item: Channel}) => {
    const isSelected = selectedChannel?.id === item.id;
    return (
      <TouchableOpacity
        style={isSelected ? themedStyles.channelItemSelected : themedStyles.channelItem}
        onPress={() => {
          setSelectedChannel(item);
          // 注意：不需要在这里调用loadAlbumPosts或loadChannelPosts
          // 因为useEffect会监听selectedChannel的变化并自动加载
        }}>
        <Text style={isSelected ? themedStyles.channelTextSelected : themedStyles.channelText}>
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderChannelsList = () => {
    if (!showChannels || channels.length === 0) return null;
    
    return (
      <View style={themedStyles.channelsContainer}>
        <FlatList
          ref={channelsListRef}
          data={channels}
          extraData={themedStyles}
          renderItem={renderChannelItem}
          keyExtractor={item => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.channelsList}
          onScrollToIndexFailed={(info) => {
            // 处理滚动失败的情况
            const wait = new Promise<void>(resolve => setTimeout(() => resolve(), 500));
            wait.then(() => {
              channelsListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
            });
          }}
        />
      </View>
    );
  };

  // 渲染搜索框
  const renderSearchBar = () => {
    return (
      <View style={themedStyles.searchBarContainer}>
        <TouchableOpacity
          style={themedStyles.searchInput}
          onPress={() => {
            navigation.navigate('SearchInput');
          }}
          activeOpacity={0.7}>
<View style={{flexDirection: 'row', alignItems: 'center'}}><SearchIcon size={16} color={theme.secondaryText} /><Text style={[themedStyles.searchPlaceholder, {marginLeft: 6}]}>搜索文章/版面/用户</Text></View>
        </TouchableOpacity>
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
        // 确保版面对象有必要的字段
        const boardToSelect = {
          ...item,
          // 确保有id字段
          id: item.id,
          // 确保有name字段
          name: item.name || item.chineseName,
          // 确保有chineseName字段
          chineseName: item.chineseName || item.name,
        };
        // 清除频道相关状态，确保显示版面帖子而不是频道帖子
        // 保持与外部链接进入版面时的逻辑一致（参考第289-293行）
        setSelectedChannel(null);
        setChannelPosts([]);
        setShowChannels(false);
        setSelectedBoard(boardToSelect);
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
          <TouchableOpacity style={[styles.sectionHeader, {backgroundColor: theme.placeholderBackground, borderBottomColor: theme.border}]} onPress={handleToggle}>
            <View style={styles.sectionHeaderContent}>
              <Text style={[styles.sectionHeaderText, {color: theme.secondaryText}]}>{item.chineseName || item.name}</Text>
              <Text style={[styles.sectionExpandArrow, {color: theme.secondaryText}]}>{isExpanded ? '▼' : '▶'}</Text>
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
            {paddingLeft: 16 + (level - 1) * 16, borderBottomColor: theme.border},
            isSelected && [styles.selectedBoardItem, {backgroundColor: theme.primary + '15', borderLeftColor: theme.primary}]
          ]}
          onPress={handleToggle}>
          <View style={styles.boardItemContent}>
            <View style={styles.boardIconContainer}>
              {item.isFolder ? (
                <View style={styles.folderIcon}>{isExpanded ? <FolderOpenIcon size={18} color={theme.secondaryText} /> : <FolderIcon size={18} color={theme.secondaryText} />}</View>
              ) : (
                <View style={[styles.boardIcon, {opacity: 0.5}]}><FileIcon size={16} color={theme.secondaryText} /></View>
              )}
            </View>
            <Text style={[
              styles.boardName,
              {color: theme.text},
              isSelected && [styles.selectedBoardName, {color: theme.primary}]
            ]}>
              {item.chineseName || item.name}
            </Text>
            {item.isFolder && (
              <Text style={[styles.expandArrow, {color: theme.secondaryText}]}>
                {isExpanded ? '▼' : '▶'}
              </Text>
            )}
          </View>
        </TouchableOpacity>
        {isExpanded && hasChildren && (
          <View style={[styles.subBoardsContainer, {backgroundColor: theme.cardBackground}]}>
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
    const itemIsRead = isRead(item.id);
    const hasAttachments = item.attachments && item.attachments.length > 0;
    return (
    <TouchableOpacity
      style={[
        styles.postItem,
        {
          backgroundColor: theme.cardBackground,
          borderBottomColor: theme.divider  // 使用更明显的分隔线颜色
        }
      ]}
      onPress={() => {
        markAsRead(item.id);
        navigation.navigate('PostDetail', {
          board: item.board,
          postId: item.id,
          mSitePostId: item.mSitePostId,
        });
      }}>
      <View style={styles.postHeader}>
        {item.isTop && <View style={[styles.topBadge, {backgroundColor: theme.error}]}><Text style={styles.topBadgeText}>置顶</Text></View>}
        <Text 
          style={[
            styles.postTitle,
            {color: theme.text},
            item.isTop && {color: theme.error},
            itemIsRead && {color: theme.secondaryText, fontWeight: 'normal'}
          ]} 
          numberOfLines={2}
        >
          {item.title}{hasAttachments && <Text style={styles.attachmentIcon}> 📎</Text>}
        </Text>
      </View>
      <View style={styles.postMeta}>
        <View style={styles.postAuthorInfo}>
          <Text style={[styles.metaText, {color: theme.secondaryText}]}>{item.author}</Text>
          {item.levelTitle && <Text style={[styles.levelTitle, {color: theme.secondaryText}]}> · {item.levelTitle}</Text>}
        </View>
        <View style={styles.postStats}>
          <Text style={[styles.metaText, {color: theme.secondaryText}]}>{item.replyCount} 回复</Text>
          <Text style={[styles.statsText, {color: theme.secondaryText}]}>{formatRelativeTime(sortByReplyTime ? item.lastReplyTime : item.postTime)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  )};

  // 图览频道专用渲染函数 - 图片外显效果
  const renderAlbumPostItem = ({item}: {item: ChannelTopic}) => {
    const itemIsRead = isRead(item.id);
    const images = item.attachments || [];
    
    // 计算图片网格布局
    const getImageLayout = (count: number) => {
      if (count === 0) return [];
      if (count === 1) return [{width: SCREEN_WIDTH - 32, height: 300}];
      if (count === 2) return Array(2).fill({width: (SCREEN_WIDTH - 40) / 2, height: 200});
      if (count === 3) return Array(3).fill({width: (SCREEN_WIDTH - 48) / 3, height: 120});
      if (count === 4) return Array(4).fill({width: (SCREEN_WIDTH - 40) / 2, height: 150});
      // 5张及以上，显示前4张，第4张显示"+N"遮罩
      return Array(4).fill({width: (SCREEN_WIDTH - 40) / 2, height: 150});
    };

    const imageLayout = getImageLayout(images.length);
    const displayImages = images.slice(0, 4);
    const remainingCount = images.length > 4 ? images.length - 4 : 0;

    return (
      <TouchableOpacity
        style={[
          styles.albumPostItem,
          {
            backgroundColor: theme.cardBackground,
            borderBottomColor: theme.divider  // 使用更明显的分隔线颜色
          }
        ]}
        onPress={() => {
          markAsRead(item.id);
          navigation.navigate('PostDetail', {
            board: item.board.name,
            postId: item.topicId || item.id,
            mSitePostId: item.mSitePostId,
          });
        }}>
        {/* 用户信息 */}
        <View style={styles.albumPostHeader}>
          <View style={styles.albumUserInfo}>
            {item.article.account.avatarUrl ? (
              <ImageWithPlaceholder
                uri={item.article.account.avatarUrl}
                style={[styles.albumAvatar, {backgroundColor: theme.placeholderBackground}]}
                isAvatar={true}
              />
            ) : (
              <View style={[styles.albumAvatarPlaceholder, {backgroundColor: theme.primary}]}>
                <Text style={styles.albumAvatarText}>
                  {item.article.account.nick?.charAt(0) || '?'}
                </Text>
              </View>
            )}
            <View style={styles.albumUserDetails}>
              <Text style={[styles.albumUserName, {color: theme.text}]}>
                {item.article.account.name}
              </Text>
              <Text style={[styles.albumPostTime, {color: theme.secondaryText}]}>{formatRelativeTime(item.postTime || item.flushTime)}</Text>
            </View>
          </View>
        </View>

        {/* 帖子标题 */}
        <Text 
          style={[
            styles.albumPostTitle,
            {color: theme.text},
            itemIsRead && {color: theme.secondaryText, fontWeight: 'normal'}
          ]} 
          numberOfLines={3}
        >
          {item.subject}
        </Text>

        {/* 图片网格 */}
        {displayImages.length > 0 && (
          <View style={styles.albumImagesGrid}>
            {displayImages.map((img, index) => (
              <View 
                key={index} 
                style={[
                  styles.albumImageWrapper,
                  {backgroundColor: theme.placeholderBackground},
                  imageLayout[index] && {
                    width: imageLayout[index].width,
                    height: imageLayout[index].height,
                  }
                ]}
              >
                <ImageWithPlaceholder
                  uri={img.cdnUrl}
                  style={styles.albumImage}
                  resizeMode="cover"
                  showLoadingIndicator={true}
                />
                {/* 显示剩余图片数量 */}
                {index === 3 && remainingCount > 0 && (
                  <View style={styles.albumImageOverlay}>
                    <Text style={styles.albumImageOverlayText}>+{remainingCount}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* 版面信息 */}
        <View style={[styles.albumPostFooter, {borderTopColor: theme.border}]}>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation(); // 阻止事件冒泡，避免触发外层的帖子点击
              // 直接使用API返回的版面信息
              setSelectedBoard({
                id: item.board.id,
                name: item.board.name,
                chineseName: item.board.title,
              } as Board);
              setSelectedChannel(null); // 清除频道选择
            }}
          >
<View style={{flexDirection: 'row', alignItems: 'center'}}><BoardIcon size={14} color={theme.primary} /><Text style={[styles.albumBoardName, {color: theme.primary, marginLeft: 4}]}>{item.board.title}</Text></View>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // 普通频道渲染函数
  const renderChannelPostItem = ({item}: {item: ChannelTopic}) => {
    const itemIsRead = isRead(item.id);
    return (
      <TouchableOpacity
        style={[
          styles.postItem,
          {
            backgroundColor: theme.cardBackground,
            borderBottomColor: theme.divider  // 使用更明显的分隔线颜色
          }
        ]}
        onPress={() => {
          markAsRead(item.id);
          navigation.navigate('PostDetail', {
            board: item.board.name,
            postId: item.topicId || item.id, // 图览使用topicId，普通频道使用id
            mSitePostId: item.mSitePostId, // 传递M站短ID，用于帖子详情获取静态附件URL
          });
        }}>
        {/* 标题 */}
        <Text 
          style={[
            styles.channelPostTitle,
            {color: theme.text},
            itemIsRead && {color: theme.secondaryText, fontWeight: 'normal'}
          ]} 
          numberOfLines={1}
        >
          {item.subject}
        </Text>
        {/* 元信息：作者、回复数、时间、版面名 - 全部在一行 */}
        <View style={styles.channelPostMeta}>
          <Text style={[styles.channelMetaText, {color: theme.secondaryText}]}>
            {item.article.account.name}
          </Text>
          <Text style={[styles.channelMetaText, {color: theme.secondaryText}]}>
            回复: {item.availables}
          </Text>
          <Text style={[styles.channelMetaText, {color: theme.secondaryText}]}>
            {formatRelativeTime(sortByReplyTime ? item.lastPostTime : item.flushTime)}
          </Text>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              setSelectedBoard({
                id: item.board.id,
                name: item.board.name,
                chineseName: item.board.title,
              } as Board);
              setSelectedChannel(null);
            }}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
          >
            <Text style={[styles.channelMetaText, styles.channelBoardLink, {color: theme.primary}]}>
              {item.board.title}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, {backgroundColor: theme.background}]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </View>
    );
  }

  const renderFooter = () => {
    const showFooter = selectedChannel ? channelHasMore : hasMore;
    const isLoading = selectedChannel ? loadingChannelPosts : loadingMore;
    
    if (!showFooter) return null;
    
    return (
      <View style={styles.footerContainer}>
        {isLoading ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : (
          <TouchableOpacity 
            style={[styles.loadMoreButton, {backgroundColor: theme.cardBackground, borderColor: theme.border}]}
            onPress={loadMore}>
            <Text style={[styles.loadMoreText, {color: theme.primary}]}>加载更多</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // 浮动按钮菜单项配置
  const fabMenuItems = [
    {
      icon: sortByReplyTime ? <CalendarIcon size={20} color={theme.primary} /> : <MessageIcon size={20} color={theme.primary} />,
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
      icon: <EditIcon size={20} color={theme.primary} />,
      label: '发帖',
      onPress: () => {
        setShowFabMenu(false); // 立即关闭菜单
        if (selectedBoard) {
          navigation.navigate('CreatePost', {
            boardId: selectedBoard.id,
            boardName: selectedBoard.chineseName || selectedBoard.name,
          });
        }
      },
      show: selectedBoard !== null,
      disabled: false,
    },
    {
      icon: <StarIcon size={20} color={theme.primary} />,
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
                style={[styles.fabMenuButton, {backgroundColor: theme.cardBackground, borderColor: theme.border}]}
                onPress={item.onPress}
                activeOpacity={0.8}>
<View style={styles.fabMenuIcon}>{item.icon}</View>
              </TouchableOpacity>
              <Text style={[styles.fabMenuLabel, {color: theme.text, backgroundColor: theme.cardBackground, borderColor: theme.border}]}>{item.label}</Text>
            </Animated.View>
          );
        })}

        {/* 主浮动按钮 */}
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.fabButton,
            {backgroundColor: theme.cardBackground, borderColor: theme.primary},
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
                {color: theme.primary},
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
    <View style={[styles.container, {backgroundColor: theme.background}]}>
      {renderChannelsList()}
      {renderSearchBar()}
      <View style={{flex: 1}} {...channelSwipeResponder.panHandlers}>
        {selectedChannel ? (
          <FlatList
            data={channelPosts}
            renderItem={selectedChannel.name === '图览' ? renderAlbumPostItem : renderChannelPostItem}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            refreshControl={
              <RefreshControl 
                refreshing={refreshing} 
                onRefresh={onRefresh}
                tintColor={theme.primary}
                colors={[theme.primary]}
              />
            }
            ListEmptyComponent={
              !loading && !refreshing && channelPosts.length === 0 && channelPostsDataLoaded ? (
                <View style={styles.emptyContainer}>
                  <Text style={[styles.emptyText, {color: theme.secondaryText}]}>暂无帖子</Text>
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
              <RefreshControl 
                refreshing={refreshing} 
                onRefresh={onRefresh}
                tintColor={theme.primary}
                colors={[theme.primary]}
              />
            }
            ListEmptyComponent={
              !loading && !refreshing && posts.length === 0 && postsDataLoaded ? (
                <View style={styles.emptyContainer}>
                  <Text style={[styles.emptyText, {color: theme.secondaryText}]}>暂无帖子</Text>
                </View>
              ) : null
            }
            ListFooterComponent={renderFooter}
          />
        ) : (
          <ScrollView
            style={styles.container}
            refreshControl={
              <RefreshControl 
                refreshing={refreshing} 
                onRefresh={onRefresh}
                tintColor={theme.primary}
                colors={[theme.primary]}
              />
            }>
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, {color: theme.secondaryText}]}>请选择版面或频道</Text>
              <Text style={[styles.hintText, {color: theme.secondaryText}]}>点击左上角菜单选择版面，或使用上方频道快速浏览</Text>
            </View>
          </ScrollView>
        )}
      </View>

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
                backgroundColor: theme.cardBackground,
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
            <View style={[styles.modalHeader, {backgroundColor: theme.cardBackground, borderBottomColor: theme.border}]}>
              <View style={styles.drawerTitleContainer}>
                <View style={styles.drawerTitleEmoji}><BoardIcon size={20} color={theme.text} /></View>
                <Text style={[styles.modalTitle, {color: theme.text}]}>版面目录</Text>
              </View>
              <TouchableOpacity onPress={closeDrawer} style={styles.drawerCloseButton}>
                <Text style={{fontSize: 20, color: theme.secondaryText}}>✕</Text>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  headerContainer: {
    flex: 1,
    marginHorizontal: 16,
  },
  searchBarContainer: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  searchInput: {
    height: 36,
    backgroundColor: 'transparent',
    borderRadius: 18,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchPlaceholder: {
    fontSize: 14,
    // color 由主题动态控制
  },
  channelsContainer: {
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
    paddingVertical: 8,
  },
  channelsList: {
    paddingHorizontal: 16,
  },
  channelItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: 'transparent',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selectedChannelItem: {
    // 保留用于语义，实际颜色由主题动态控制
  },
  channelText: {
    fontSize: 14,
    // color 由主题动态控制
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
    backgroundColor: 'transparent',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  topBadge: {
    backgroundColor: 'transparent',
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
  attachmentIcon: {
    fontSize: 12,
  },
  postTitle: {
    flex: 1,
    fontSize: 16,
    // color 由主题动态控制
    fontWeight: '500',
    lineHeight: 22,
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
    // color 由主题动态控制
  },
  postStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
    // color 由主题动态控制
  },
  statsText: {
    fontSize: 12,
    // color 由主题动态控制
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
    color: 'transparent',
    marginBottom: 8,
  },
  hintText: {
    fontSize: 14,
    color: 'transparent',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  channelPostBoard: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
  boardNameText: {
    fontSize: 12,
    // color 由主题动态控制
  },
  // 频道帖子样式（对齐今日十大）
  channelPostTitle: {
    fontSize: 16,
    // color 由主题动态控制
    marginBottom: 8,
    fontWeight: '500',
  },
  channelPostMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  channelMetaText: {
    fontSize: 12,
    // color 由主题动态控制
    marginRight: 12,
  },
  channelBoardLink: {
    // color 由主题动态控制
    fontWeight: '500',
  },
  // 图览频道专用样式
  albumPostItem: {
    backgroundColor: 'transparent',
    padding: 16,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  albumPostHeader: {
    marginBottom: 12,
  },
  albumUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  albumAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  albumAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  albumAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  albumUserDetails: {
    marginLeft: 12,
    flex: 1,
  },
  albumUserName: {
    fontSize: 15,
    fontWeight: '600',
    // color 由主题动态控制
    marginBottom: 2,
  },
  albumPostTime: {
    fontSize: 12,
    // color 由主题动态控制
  },
  albumPostTitle: {
    fontSize: 16,
    // color 由主题动态控制
    lineHeight: 22,
    marginBottom: 12,
  },
  albumImagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 12,
  },
  albumImageWrapper: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  albumImage: {
    width: '100%',
    height: '100%',
  },
  albumImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  albumImageOverlayText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  albumPostFooter: {
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
  albumBoardName: {
    fontSize: 12,
    color: 'transparent',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleText: {
    fontSize: 17,
    fontWeight: '600',
    color: 'transparent',
    textAlign: 'center',
  },
  footerContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadMoreButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: 'transparent',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  loadMoreText: {
    fontSize: 14,
    color: 'transparent',
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
    backgroundColor: 'transparent',
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
    borderBottomColor: 'transparent',
    backgroundColor: 'transparent',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    // color 由主题动态控制
  },
  drawerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  drawerTitleEmoji: {
    marginRight: 8,
  },
  drawerCloseButton: {
    padding: 4,
  },
  sectionGroup: {
    marginBottom: 8,
  },
  sectionHeader: {
    backgroundColor: 'transparent',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  sectionHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: 'bold',
    // color 由主题动态控制
    textTransform: 'uppercase',
    letterSpacing: 1,
    flex: 1,
  },
  sectionExpandArrow: {
    fontSize: 10,
    // color 由主题动态控制
    marginLeft: 8,
  },
  boardItem: {
    paddingVertical: 10,
    paddingRight: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  rootFolder: {
    // backgroundColor 由主题动态控制
  },
  selectedBoardItem: {
    // backgroundColor 由主题动态控制
    borderLeftWidth: 3,
    // borderLeftColor 由主题动态控制
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
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    fontSize: 14,
  },
  boardIcon: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    fontSize: 12,
    opacity: 0.5,
  },
  boardName: {
    flex: 1,
    fontSize: 14,
    // color 由主题动态控制
  },
  rootBoardName: {
    fontWeight: '600',
    // color 由主题动态控制
  },
  selectedBoardName: {
    // color 由主题动态控制
    fontWeight: '600',
  },
  expandArrow: {
    fontSize: 10,
    // color 由主题动态控制
    marginLeft: 4,
  },
  subBoardsContainer: {
    // backgroundColor 由主题动态控制
  },
  fabButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    // backgroundColor 由主题动态控制
    borderWidth: 1,
    // borderColor 由主题动态控制
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
    // color 由主题动态控制
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
    // backgroundColor 由主题动态控制
    borderWidth: 1,
    // borderColor 由主题动态控制
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  fabMenuIcon: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  fabMenuLabel: {
    marginTop: 6,
    fontSize: 12,
    // color 由主题动态控制
    fontWeight: '600',
    // backgroundColor 由主题动态控制
    borderWidth: 1,
    // borderColor 由主题动态控制
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
