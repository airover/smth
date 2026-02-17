import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  Image,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  Share,
  ActionSheetIOS,
  AppState,
} from 'react-native';
import {useRoute, useNavigation} from '@react-navigation/native';
import {WebView} from 'react-native-webview';
import {getPostDetail, getTopicReplies, deletePost, getUserInfo, addFavoriteTopic, addLike, removeLike, getPostPermissions, PostPermissions} from '../services/api';
import PostCaptchaScreen from './PostCaptchaScreen';
import {deleteArticle} from '../services/postApi';
import {Post, Reply, Attachment, Like} from '../types';
import {formatRelativeTime} from '../utils/timeFormat';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import ImageViewer from '../components/ImageViewer';
import {cacheManager} from '../services/cacheManager';
import {saveBrowsingHistory} from './BrowsingHistoryScreen';
import {useSettings} from '../context/SettingsContext';
import {getTheme, getFontSizes} from '../utils/theme';
import {ThemedHeaderButton, useFloatingHeader} from '../components/ThemeHeader';
import {normalizeImageUrl, isImageAttachment, isVideoAttachment} from '../utils/imageUtils';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  scaleModerate,
  responsiveSize,
  RESPONSIVE,
} from '../utils/responsive';

// 格式化具体时间（用于主帖）
const formatDateTime = (time: string): string => {
  if (!time) return '';
  try {
    const date = new Date(time);
    if (isNaN(date.getTime())) {
      return String(time).substring(0, 16);
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  } catch (error) {
    return String(time).substring(0, 16);
  }
};

const SCREEN_WIDTH = RESPONSIVE.SCREEN_WIDTH;
const SCREEN_HEIGHT = RESPONSIVE.SCREEN_HEIGHT;

// 点赞/扔鸡蛋专用的 Captcha ID
const LIKE_CAPTCHA_ID = '3a6990c763f90e33fa62a97faad3a05f';

const PostDetailScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const {board, postId} = route.params as {board: string; postId: string};
  const {settings} = useSettings();
  const theme = getTheme(settings.themeMode);
  const fontSizes = getFontSizes(settings.fontSize);
  const [post, setPost] = useState<Post | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [likesExpanded, setLikesExpanded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false); // 下拉刷新状态
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState('');
  const [imageSizes, setImageSizes] = useState<{[key: string]: {width: number; height: number}}>({});
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set()); // 跟踪加载失败的图片
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [ratingType, setRatingType] = useState<'like' | 'dislike'>('like');
  const [ratingComment, setRatingComment] = useState('');
  const [ratingScore, setRatingScore] = useState<number | null>(null); // null表示未选择评分
  const [captchaParams, setCaptchaParams] = useState<any>(null); // 验证码参数
  const [showCaptchaModal, setShowCaptchaModal] = useState(false); // 显示验证码弹窗
  const [captchaVerified, setCaptchaVerified] = useState(false); // 验证码是否已验证
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc'); // 回复排序：asc=正序，desc=倒序
  const [permissions, setPermissions] = useState<PostPermissions | null>(null);
  const [webViewKey, setWebViewKey] = useState(0); // 用于强制刷新WebView
  const appStateRef = useRef(AppState.currentState);
  const [throwingEgg, setThrowingEgg] = useState(false);
  const [exploding, setExploding] = useState(false);
  const [eggButtonLayout, setEggButtonLayout] = useState({x: 0, y: 0});
  const [explosionPosition, setExplosionPosition] = useState({x: 0, y: 0});
  const eggButtonRef = useRef<any>(null);
  const eggAnimX = useRef(new Animated.Value(0)).current;
  const eggAnimY = useRef(new Animated.Value(0)).current;
  const eggOpacity = useRef(new Animated.Value(0)).current;
  const eggRotate = useRef(new Animated.Value(0)).current;
  const explosionScale = useRef(new Animated.Value(0)).current;
  const explosionOpacity = useRef(new Animated.Value(0)).current;
  const modalAnim = useRef(new Animated.Value(0)).current;
  // 使用 ref 追踪评分和评论的最新值，避免闭包陷阱
  const ratingScoreRef = useRef(ratingScore);
  const ratingCommentRef = useRef(ratingComment);

  useEffect(() => {
    ratingScoreRef.current = ratingScore;
  }, [ratingScore]);

  useEffect(() => {
    ratingCommentRef.current = ratingComment;
  }, [ratingComment]);

  // 蛋清飞溅粒子动画（20个方向，模拟蛋黄和蛋清）
  const splashParticles = useRef(
    Array.from({length: 20}, () => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(1),
    }))
  ).current;  // 蛋壳碎片动画（6个碎片）
  const shellParticles = useRef(
    Array.from({length: 6}, () => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      rotate: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    loadPostDetail(1);
    loadCurrentUser();
    loadPermissions();
  }, []);

  // 监听应用前后台切换，解决WebView内容丢失问题
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      // 从后台切换到前台时
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('[PostDetail] App从后台切回前台，刷新WebView');
        // 延迟一点执行，确保界面完全恢复
        setTimeout(() => {
          // 重置contentHeights并强制刷新WebView
          setContentHeights({});
          setWebViewKey(prev => prev + 1);
        }, 100);
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // 设置导航栏右侧按钮
  const setHeaderOptions = useFloatingHeader();
  useEffect(() => {
    setHeaderOptions({
      headerRight: () => (
        <ThemedHeaderButton
          onPress={() => {
            // 构建菜单选项
            const options: string[] = [];
            let deleteIndex = -1;
            
            // 只有当前用户是发帖人时才显示编辑和删除选项
            if (currentUsername && post && currentUsername === post.author) {
              options.push('编辑');
              options.push('删除');
              deleteIndex = options.length - 1;
            }
            
            options.push('回复', '收藏', '分享', '取消');
            const cancelButtonIndex = options.length - 1;
            
            if (Platform.OS === 'ios') {
              ActionSheetIOS.showActionSheetWithOptions(
                {
                  options,
                  cancelButtonIndex,
                  destructiveButtonIndex: deleteIndex >= 0 ? deleteIndex : undefined,
                  title: '更多操作',
                },
                (buttonIndex) => {
                  if (buttonIndex === cancelButtonIndex) {
                    return;
                  }
                  
                  // 根据选项执行对应操作
                  const selectedOption = options[buttonIndex];
                  if (selectedOption === '编辑') {
                    handleEditPost();
                  } else if (selectedOption === '删除') {
                    handleDeletePost();
                  } else if (selectedOption === '回复') {
                    handleReply();
                  } else if (selectedOption === '收藏') {
                    handleFavorite();
                  } else if (selectedOption === '分享') {
                    handleShare();
                  }
                }
              );
            } else {
              // Android使用Alert
              const buttons = [];
              
              if (currentUsername && post && currentUsername === post.author) {
                buttons.push({
                  text: '编辑',
                  onPress: handleEditPost,
                });
                buttons.push({
                  text: '删除',
                  style: 'destructive' as const,
                  onPress: handleDeletePost,
                });
              }
              
              buttons.push(
                {text: '回复', onPress: handleReply},
                {text: '收藏', onPress: handleFavorite},
                {text: '分享', onPress: handleShare},
                {text: '取消', style: 'cancel' as const}
              );
              
              Alert.alert('更多操作', '', buttons);
            }
          }}
        >
          <Text style={[styles.headerMenuButtonText, theme.headerBackgroundImage ? {color: '#333'} : null]}>⋮</Text>
        </ThemedHeaderButton>
      ),
    });
  }, [navigation, currentUsername, post]);

  const loadCurrentUser = async () => {
    try {
      const userInfo = await getUserInfo();
      if (userInfo && userInfo.username) {
        setCurrentUsername(userInfo.username);
      }
    } catch (error) {
      console.error('Load current user error:', error);
    }
  };

  const loadPermissions = async () => {
    try {
      const result = await getPostPermissions(postId);
      if (result.success && result.data) {
        setPermissions(result.data);
      }
    } catch (error) {
      console.error('Load permissions error:', error);
    }
  };

  const loadPostDetail = async (pageNum: number, forceRefresh: boolean = false) => {
    try {
      if (pageNum > 1) {
        setLoadingMore(true);
      }
      
      if (pageNum === 1) {
        // 第一页：检查缓存并获取主题详情和回复列表
        const postCacheKey = `${board}-${postId}`;
        const repliesCacheKey = `${postId}-1`;
        
        // 尝试从缓存获取数据（下拉刷新时跳过缓存）
        let detailData = forceRefresh ? null : cacheManager.get('postDetail', postCacheKey, 60 * 1000); // 1分钟缓存
        let repliesData = forceRefresh ? null : cacheManager.get('topicReplies', repliesCacheKey, 60 * 1000);
        
        // 保存旧缓存作为降级方案
        const oldDetailData = detailData;
        const oldRepliesData = repliesData;
        
        // 如果缓存中没有数据或强制刷新，则从API获取
        if (!detailData || !repliesData || forceRefresh) {
          console.log(`[PostDetail] ${forceRefresh ? 'Force refresh' : 'Cache miss'}, fetching from API`);
          
          try {
            const [apiDetailData, apiRepliesData] = await Promise.all([
              detailData ? Promise.resolve(detailData) : getPostDetail(board, postId, 1),
              repliesData ? Promise.resolve(repliesData) : getTopicReplies(postId, 1)
            ]);
            
            // ✅ 修复：只有成功获取且数据有效时才缓存和更新
            if (apiDetailData && apiDetailData !== null) {
              cacheManager.set('postDetail', postCacheKey, apiDetailData);
              detailData = apiDetailData;
            } else if (!detailData && oldDetailData) {
              // API失败时使用旧缓存降级
              console.log('[PostDetail] API failed, using old cache for detail');
              detailData = oldDetailData;
            }
            
            if (apiRepliesData && (apiRepliesData as {replies: any[], totalItems: number}).totalItems !== -1) {
              // ✅ 修复：检查 totalItems !== -1 来判断是否成功
              cacheManager.set('topicReplies', repliesCacheKey, apiRepliesData);
              repliesData = apiRepliesData;
            } else if (!repliesData && oldRepliesData) {
              // API失败时使用旧缓存降级
              console.log('[PostDetail] API failed, using old cache for replies');
              repliesData = oldRepliesData;
            }
          } catch (error: any) {
            console.error('[PostDetail] Failed to fetch data:', error.message);
            // 失败时使用旧缓存降级
            if (!detailData && oldDetailData) {
              detailData = oldDetailData;
            }
            if (!repliesData && oldRepliesData) {
              repliesData = oldRepliesData;
            }
          }
        } else {
          console.log('[PostDetail] Cache hit, using cached data');
        }

        if (detailData) {
          setPost(detailData as any);
          
          // 保存到浏览历史
          saveBrowsingHistory({
            postId,
            board,
            title: (detailData as any).title,
            author: (detailData as any).author,
            boardName: (detailData as any).boardName || board,
            replyCount: (detailData as any).replyCount,
          });
        }

        if (repliesData) {
          // 过滤掉第一层（主贴）和status非0的回复（status=0为正常，status=1为已删除等异常状态，status不存在时视为正常）
          const filteredReplies = (repliesData as {replies: any[], totalItems: number}).replies.filter((r: any) => r.floor !== 1 && (r.status == null || r.status === 0));
          setReplies(filteredReplies);
          setPage(1);
          setHasMore((repliesData as {replies: any[], totalItems: number}).replies.length >= 20); // 假设 pageSize 为 20
        }
      } else {
        // 后续页：检查缓存并获取回复列表
        const repliesCacheKey = `${postId}-${pageNum}`;
        let repliesData = cacheManager.get('topicReplies', repliesCacheKey, 60 * 1000);
        
        if (!repliesData) {
          console.log(`[PostDetail] Cache miss for page ${pageNum}, fetching from API`);
          try {
            repliesData = await getTopicReplies(postId, pageNum);
            // ✅ 修复：只有成功获取且数据有效时才缓存（totalItems !== -1）
            if (repliesData && (repliesData as {replies: any[], totalItems: number}).totalItems !== -1) {
              cacheManager.set('topicReplies', repliesCacheKey, repliesData);
            } else {
              // API返回失败，不更新数据
              repliesData = null;
            }
          } catch (error: any) {
            console.error(`[PostDetail] Failed to fetch page ${pageNum}:`, error.message);
            // 失败时不更新数据
            repliesData = null;
          }
        } else {
          console.log(`[PostDetail] Cache hit for page ${pageNum}, using cached data`);
        }
        
        if (repliesData && (repliesData as {replies: any[], totalItems: number}).replies.length > 0) {
          // 使用Set来去重，确保不会有重复的id
          setReplies(prev => {
            const existingIds = new Set(prev.map(r => r.id));
            const newReplies = (repliesData as {replies: any[], totalItems: number}).replies.filter((r: any) => !existingIds.has(r.id) && (r.status == null || r.status === 0));
            return [...prev, ...newReplies];
          });
          setPage(pageNum);
          setHasMore((repliesData as {replies: any[], totalItems: number}).replies.length >= 20);
        } else {
          setHasMore(false);
        }
      }
    } catch (error) {
      console.error('Load post detail error:', error);
    } finally {
      if (pageNum === 1) {
        setLoading(false);
        setRefreshing(false);
      } else {
        setLoadingMore(false);
      }
    }
  };

  // 下拉刷新
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPostDetail(1, true); // 强制刷新，跳过缓存
  };

  const loadMore = () => {
    if (hasMore && !loadingMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadPostDetail(nextPage);
    }
  };

  const handleDeletePost = async () => {
    Alert.alert(
      '确认删除',
      '确定要删除这篇帖子吗？删除后无法恢复。',
      [
        {
          text: '取消',
          style: 'cancel'
        },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              // 使用 articleId 而不是 topicId
              if (!post?.articleId) {
                Alert.alert('错误', '无法获取帖子ID');
                return;
              }
              const result = await deletePost(post.articleId, post?.title, board);
              if (result.success) {
                Alert.alert('成功', result.message || '删除成功', [
                  {
                    text: '确定',
                    onPress: () => navigation.goBack()
                  }
                ]);
              } else {
                Alert.alert('失败', result.message || '删除失败');
              }
            } catch (error) {
              Alert.alert('错误', '删除失败，请稍后重试');
            }
          }
        }
      ]
    );
  };

  const handleFavorite = async () => {
    if (!post?.id) {
      Alert.alert('错误', '无法获取帖子ID');
      return;
    }
    
    try {
      const result = await addFavoriteTopic(post.id);
      if (result.success) {
        Alert.alert('成功', result.message || '收藏成功');
      } else {
        Alert.alert('失败', result.message || '收藏失败');
      }
    } catch (error) {
      Alert.alert('错误', '收藏失败，请稍后重试');
    }
  };

  const handleReply = () => {
    if (!post) return;

    // 检查写权限
    // if (permissions && !permissions.write.hasPerm) {
    //   Alert.alert(
    //     '权限不足',
    //     permissions.write.cause || '您没有权限进行此操作',
    //     [{text: '确定'}]
    //   );
    //   return;
    // }
    
    navigation.navigate('CreatePost', {
      boardId: board,
      boardName: post.boardName || board,
      reId: post.articleId || post.id,
      reTitle: post.title,
      mode: 'reply'
    });
  };

  // 编辑帖子
  const handleEditPost = () => {
    if (!post) return;

    navigation.navigate('CreatePost', {
      boardId: board,
      boardName: post.boardName || board,
      articleId: post.articleId || post.id,
      editTitle: post.title,
      editContent: post.contentText || post.content || '',
      mode: 'edit',
    });
  };

  // 处理引用回复
  // 处理删除回复
  const handleDeleteReply = (reply: Reply) => {
    Alert.alert('确认删除', '确定要删除这条回复吗？', [
      {text: '取消', style: 'cancel'},
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteArticle(reply.id);
            // 删除成功后从列表中移除
            setReplies(prev => prev.filter(r => r.id !== reply.id));
            Alert.alert('成功', '回复已删除');
          } catch (error: any) {
            console.error('删除回复失败:', error);
            Alert.alert('失败', error.message || '删除回复失败');
          }
        },
      },
    ]);
  };

  const handleQuoteReply = (reply: Reply) => {
    if (!post) return;

    // 检查写权限
    // if (permissions && !permissions.write.hasPerm) {
    //   Alert.alert(
    //     '权限不足',
    //     permissions.write.cause || '您没有权限进行此操作',
    //     [{text: '确定'}]
    //   );
    //   return;
    // }

    // 格式化引用内容
    // 清理HTML标签
    const cleanContent = reply.content
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .trim();

    // 构造引用格式（参照curl示例）
    const quotedContent = `【 在 ${reply.author} 的大作中提到: 】\n: ${cleanContent.split('\n').join('\n: ')}\n\n`;

    navigation.navigate('CreatePost', {
      boardId: board,
      boardName: post.boardName || board,
      reId: post.articleId || post.id,
      reTitle: post.title,
      mode: 'reply',
      quotedContent: quotedContent, // 传递引用内容
    });
  };

  const handleShare = async () => {
    if (!post) {
      Alert.alert('错误', '无法获取帖子信息');
      return;
    }
    
    try {
      // 构造帖子URL：https://wap.newsmth.net/article/{topicId}?title={boardName}&from=board
      const topicId = post.id; // 使用 topicId
      const boardName = encodeURIComponent(post.boardName || board); // URL编码版面名
      const postUrl = `https://wap.newsmth.net/article/${topicId}?title=${boardName}&from=board`;
      const shareMessage = `${post.title}\n\n${postUrl}`;
      
      await Share.share(
        Platform.OS === 'ios'
          ? {
              message: post.title,
              url: postUrl,
            }
          : {
              message: shareMessage,
            }
      );
    } catch (error) {
      console.error('Share error:', error);
      Alert.alert('分享失败', '无法分享帖子');
    }
  };

  const handleLikePress = () => {
    // 检查写权限
    // if (permissions && !permissions.write.hasPerm) {
    //   Alert.alert(
    //     '权限不足',
    //     permissions.write.cause || '您没有权限进行此操作',
    //     [{text: '确定'}]
    //   );
    //   return;
    // }
    
    setRatingType('like');
    setRatingScore(null); // 默认不选择评分
    setRatingComment('');
    setRatingModalVisible(true);
    Animated.timing(modalAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleDislikePress = () => {
    // 检查写权限
    // if (permissions && !permissions.write.hasPerm) {
    //   Alert.alert(
    //     '权限不足',
    //     permissions.write.cause || '您没有权限进行此操作',
    //     [{text: '确定'}]
    //   );
    //   return;
    // }
    
    // 获取按钮在屏幕上的绝对位置
    if (eggButtonRef.current) {
      eggButtonRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
        setEggButtonLayout({x, y});
        // 播放扔鸡蛋动画，直接传递坐标值
        playThrowEggAnimation(x, y);
      });
    } else {
      // 如果ref不可用，使用默认位置播放动画
      playThrowEggAnimation(eggButtonLayout.x, eggButtonLayout.y);
    }
    
    // 同时显示弹窗
    setRatingType('dislike');
    setRatingScore(null); // 默认不选择评分
    setRatingComment('');
    setRatingModalVisible(true);
    Animated.timing(modalAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const playThrowEggAnimation = (buttonX: number, buttonY: number) => {
    // 重置动画值
    eggAnimX.setValue(0);
    eggAnimY.setValue(0);
    eggRotate.setValue(0);
    eggOpacity.setValue(1);
    explosionScale.setValue(0);
    explosionOpacity.setValue(0);
    splashParticles.forEach(particle => {
      particle.x.setValue(0);
      particle.y.setValue(0);
      particle.opacity.setValue(0);
      particle.scale.setValue(1);
    });
    shellParticles.forEach(particle => {
      particle.x.setValue(0);
      particle.y.setValue(0);
      particle.opacity.setValue(0);
      particle.rotate.setValue(0);
    });
    setThrowingEgg(true);
    setExploding(false);

    // 定义飞行距离
    const flyDistanceX = -180;
    const flyDistanceY = -300;

    // 抛物线动画：向左上方飞向主帖子内容（带旋转）
    Animated.parallel([
      // X轴移动（向左，使用线性让水平速度恒定）
      Animated.timing(eggAnimX, {
        toValue: flyDistanceX,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      // Y轴移动（模拟向上抛出受重力影响减速）
      Animated.timing(eggAnimY, {
        toValue: flyDistanceY,
        duration: 800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      // 旋转动画（逆时针旋转2圈）
      Animated.timing(eggRotate, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      // 透明度动画（飞行过程保持可见）
      Animated.sequence([
        Animated.delay(700),
        Animated.timing(eggOpacity, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      // 计算爆炸位置（鸡蛋最终位置），直接使用传入的坐标
      const explosionX = buttonX + flyDistanceX;
      const explosionY = buttonY + flyDistanceY;
      setExplosionPosition({x: explosionX, y: explosionY});
      
      // 鸡蛋消失后播放爆炸动画
      setThrowingEgg(false);
      setExploding(true);
      
      // 20个方向的蛋清/蛋黄飞溅粒子
      const splashAnimations = splashParticles.map((particle, index) => {
        // 前5个是蛋黄（大，粘稠），后15个是蛋清（小，飞得远）
        const isYolk = index < 5;
        const angle = (Math.random() * 360) * Math.PI / 180; 
        const distance = isYolk ? 30 + Math.random() * 30 : 60 + Math.random() * 80;
        
        const targetX = Math.cos(angle) * distance;
        const targetY = Math.sin(angle) * distance;
        
        const particleSize = isYolk ? 1.2 + Math.random() * 0.5 : 0.5 + Math.random() * 0.8;
        
        // 模拟流体效果：飞溅 -> 停顿 -> 缓慢流下并消失
        return Animated.sequence([
          // 1. 快速飞溅
          Animated.parallel([
            Animated.timing(particle.x, {
              toValue: targetX,
              duration: 300,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(particle.y, {
              toValue: targetY,
              duration: 300,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(particle.opacity, {
              toValue: 0.9, // 略微透明
              duration: 50,
              useNativeDriver: true,
            }),
            Animated.timing(particle.scale, {
              toValue: particleSize,
              duration: 300,
              useNativeDriver: true,
            }),
          ]),
          // 2. 粘在屏幕上稍微停顿
          Animated.delay(100 + Math.random() * 200),
          // 3. 缓慢流下并消失
          Animated.parallel([
            Animated.timing(particle.y, {
              toValue: targetY + 50 + Math.random() * 50, // 向下流淌
              duration: 800,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(particle.opacity, {
              toValue: 0,
              duration: 800,
              useNativeDriver: true,
            }),
          ])
        ]);
      });
      
      // 6个蛋壳碎片（白色，带旋转）
      const shellAnimations = shellParticles.map((particle, index) => {
        const angle = (Math.random() * 360) * Math.PI / 180;
        const distance = 50 + Math.random() * 60;
        const targetX = Math.cos(angle) * distance;
        const targetY = Math.sin(angle) * distance;
        const rotation = (Math.random() - 0.5) * 720;
        
        return Animated.parallel([
          Animated.timing(particle.x, {
            toValue: targetX,
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(particle.y, {
            toValue: targetY + 100, // 蛋壳受重力影响更大，落得更远
            duration: 600,
            easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(particle.opacity, {
              toValue: 1,
              duration: 50,
              useNativeDriver: true,
            }),
            Animated.delay(300),
            Animated.timing(particle.opacity, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(particle.rotate, {
            toValue: rotation,
            duration: 600,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]);
      });
      
      Animated.parallel([
        // 爆炸放大
        Animated.timing(explosionScale, {
          toValue: 1.5,
          duration: 300,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
        // 爆炸透明度
        Animated.sequence([
          Animated.timing(explosionOpacity, {
            toValue: 1,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.delay(100),
          Animated.timing(explosionOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
        // 蛋清飞溅
        ...splashAnimations,
        // 蛋壳碎片
        ...shellAnimations,
      ]).start(() => {
        setExploding(false);
      });
    });
  };
  const closeModal = () => {
    Animated.timing(modalAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setRatingModalVisible(false);
    });
  };

  const executeSubmit = async (params: any) => {
    if (!post?.id) {
      Alert.alert('错误', '无法获取帖子ID');
      return;
    }

    // 使用 ref 获取最新值，避免闭包导致的数据陈旧
    const currentScore = ratingScoreRef.current;
    const currentComment = ratingCommentRef.current;
    const finalScore = currentScore !== null ? currentScore : 0;
    
    // Debug log: 检查提交参数
    console.log('[点赞/扔鸡蛋] executeSubmit 被调用，参数:', {
      postId: post.id,
      board: board,
      finalScore: finalScore,
      ratingScoreState: ratingScore, // 打印 state 值对比
      ratingScoreRef: currentScore,  // 打印 ref 值对比
      ratingCommentState: ratingComment, // 打印 state 值对比
      ratingCommentRef: currentComment,  // 打印 ref 值对比
      captchaParams: params,
      postBoard: post.board,
      postBoardName: post.boardName,
    });
    
    if (finalScore === 0 && !currentComment.trim()) {
      Alert.alert('提示', '请选择评分或输入评价内容');
      return;
    }

    try {
      // 优先使用 post.board (从 API 返回的版面英文名称，如 FamilyLife)
      // 而非路由参数中的 board (hash ID，如 c82c03ff780d34e0a6404a05361cb69d)
      // 后台 API 期望的 boardName 是英文名称，不是 hash ID
      const boardNameForApi = post.board || board;
      console.log('[点赞/扔鸡蛋] 使用的版面参数:', {
        'post.board (API返回的英文名)': post.board,
        'board (路由参数hash ID)': board,
        '最终使用': boardNameForApi,
      });
      
      const result = await addLike(
        post.id, // 使用 topicId
        boardNameForApi, // 使用版面英文名称
        finalScore,
        currentComment.trim(),
        params
      );
      
      if (result.success) {
        closeModal();
        Alert.alert('成功', result.message || '评价成功');
        // 刷新帖子详情以显示新的点评
        await loadPostDetail(1, true);
        // 清除验证码状态
        setCaptchaParams(null);
        setCaptchaVerified(false);
      } else {
        Alert.alert('失败', result.message || '评价失败');
        // 验证码失败后清除，需要重新验证
        setCaptchaParams(null);
        setCaptchaVerified(false);
      }
    } catch (error) {
      Alert.alert('错误', '评价失败，请稍后重试');
      // 验证码失败后清除，需要重新验证
      setCaptchaParams(null);
      setCaptchaVerified(false);
    }
  };

  const handleSubmitRating = () => {
    const currentScore = ratingScoreRef.current;
    const currentComment = ratingCommentRef.current;
    const finalScore = currentScore !== null ? currentScore : 0;
    
    if (finalScore === 0 && !currentComment.trim()) {
      Alert.alert('提示', '请选择评分或输入评价内容');
      return;
    }

    if (!captchaVerified || !captchaParams) {
      handleCaptchaVerify();
    } else {
      executeSubmit(captchaParams);
    }
  };

  // 显示验证码弹窗
  const handleCaptchaVerify = () => {
    // 先关闭评价弹窗，避免 Modal 冲突
    setRatingModalVisible(false);
    // 延迟一点打开验证码弹窗，确保前一个 Modal 完全关闭
    setTimeout(() => {
      setShowCaptchaModal(true);
    }, 300);
  };

  // 验证码验证成功
  const handleCaptchaSuccess = (ticket: string, randstr: string) => {
    // Debug log: 验证码回调
    console.log('[点赞/扔鸡蛋] handleCaptchaSuccess 被调用:', {
      ticket: ticket,
      randstr: randstr,
      currentRatingScore: ratingScoreRef.current,
      currentRatingComment: ratingCommentRef.current,
    });
    
    // 解析验证码参数
    const parts = ticket.split('|');
    if (parts.length >= 4) {
      // 构造验证码参数对象，包含验证成功后的 token 信息
      const params = {
        captcha_id: LIKE_CAPTCHA_ID, // 使用常量
        lot_number: parts[0],
        captcha_output: parts[1],
        pass_token: parts[2],
        gen_time: parts[3],
      };
      
      console.log('[点赞/扔鸡蛋] 解析后的验证码参数:', params);
      
      setCaptchaParams(params);
      setCaptchaVerified(true);
      
      setShowCaptchaModal(false);
      // 验证成功后，直接提交点评数据，不再重新打开评价弹窗
      // 这里直接使用解析出的 params，确保使用最新的验证 token
      setTimeout(() => {
        executeSubmit(params);
      }, 300);
    } else {
      console.log('[点赞/扔鸡蛋] 验证码解析失败，parts:', parts);
      setShowCaptchaModal(false);
      // 验证失败也重新打开弹窗
      setTimeout(() => {
        setRatingModalVisible(true);
        Animated.timing(modalAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }, 300);
    }
  };
  // 验证码取消
  const handleCaptchaCancel = () => {
    setShowCaptchaModal(false);
    // 取消验证后，重新打开评价弹窗
    setTimeout(() => {
      setRatingModalVisible(true);
      // 确保动画状态正确
      Animated.timing(modalAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }, 300);
  };

  const handleRemoveLike = async (likeId: string) => {
    if (!post?.id) {
      Alert.alert('错误', '无法获取帖子ID');
      return;
    }

    Alert.alert(
      '确认删除',
      '确定要删除这条点赞评论吗？',
      [
        {
          text: '取消',
          style: 'cancel'
        },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              const boardNameForApi = post.board || board;
              const result = await removeLike(post.id, boardNameForApi);
              
              if (result.success) {
                Alert.alert('成功', result.message || '删除成功');
                // 刷新帖子详情以更新点赞列表
                await loadPostDetail(1, true);
              } else {
                Alert.alert('失败', result.message || '删除失败');
              }
            } catch (error) {
              Alert.alert('错误', '删除失败，请稍后重试');
            }
          }
        }
      ]
    );
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  const isImage = (attachment: any) => {
    return isImageAttachment(attachment);
  };

  const isVideo = (attachment: any) => {
    return isVideoAttachment(attachment);
  };

  // 生成 WebView 的 HTML 内容
  const generateSelectableHtml = (content: string) => {
    const lines = content.split('\n');
    let htmlContent = '';
    
    lines.forEach(line => {
      const isQuote = line.trim().startsWith(':') || line.includes('在大作中提到:');
      const escapedLine = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      
      if (isQuote) {
        htmlContent += `<p class="quote">${escapedLine}</p>`;
      } else if (line.trim()) {
        htmlContent += `<p>${escapedLine}</p>`;
      }
    });
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-user-select: text;
            user-select: text;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: ${fontSizes.content}px;
            line-height: ${fontSizes.lineHeight / fontSizes.content};
            color: ${theme.text};
            background-color: transparent;
            padding: 0;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          p {
            margin-bottom: 8px;
          }
          p:last-child {
            margin-bottom: 0;
          }
          .quote {
            font-size: ${fontSizes.quote}px;
            line-height: ${fontSizes.quoteLineHeight / fontSizes.quote};
            color: ${theme.secondaryText};
            background-color: ${theme.quoteBackground};
            padding: 8px 12px;
            padding-top: 4px;
            padding-bottom: 4px;
            border-left: 3px solid ${theme.quoteBorder || '#dee2e6'};
            margin: 0;
          }
          .quote:first-of-type {
            padding-top: 8px;
            border-top-left-radius: 4px;
            border-top-right-radius: 4px;
          }
          .quote:last-of-type {
            padding-bottom: 8px;
            border-bottom-left-radius: 4px;
            border-bottom-right-radius: 4px;
          }
          .quote:only-of-type {
            border-radius: 4px;
          }
        </style>
      </head>
      <body>${htmlContent}</body>
      </html>
    `;
  };

  // 计算 WebView 内容高度的状态
  const [contentHeights, setContentHeights] = useState<{[key: string]: number}>({});

  const renderContent = (content: string, contentKey?: string) => {
    if (!content) return null;

    // 清理HTML标签和检查内容是否为空
    const cleanedContent = content
      .replace(/<[^>]*>/g, '') // 移除HTML标签
      .replace(/&nbsp;/g, ' ') // 替换&nbsp;
      .trim();
    
    // 如果清理后内容为空，不渲染任何内容
    if (!cleanedContent) return null;

    const key = contentKey || content.substring(0, 50);
    const height = contentHeights[key] || 100;
    const html = generateSelectableHtml(content);

    return (
      <WebView
        key={`${key}-${webViewKey}`}
        source={{ html }}
        style={[styles.selectableWebView, { height }]}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        originWhitelist={['*']}
        onMessage={(event) => {
          const newHeight = parseInt(event.nativeEvent.data, 10);
          if (newHeight && newHeight > 0 && newHeight !== contentHeights[key]) {
            setContentHeights(prev => ({ ...prev, [key]: newHeight }));
          }
        }}
        onLoadEnd={() => {
          // WebView加载完成后，确保触发高度计算
          // 这是一个备用机制，防止injectedJavaScript没有正常执行
        }}
        injectedJavaScript={`
          (function() {
            function sendHeight() {
              const height = document.body.scrollHeight;
              if (height > 0) {
                window.ReactNativeWebView.postMessage(String(height));
              }
            }
            // 立即执行一次
            sendHeight();
            // 延迟执行，确保DOM完全渲染
            setTimeout(sendHeight, 100);
            setTimeout(sendHeight, 300);
            // 监听内容变化
            const observer = new MutationObserver(sendHeight);
            observer.observe(document.body, { childList: true, subtree: true });
            // 图片加载完成后重新计算
            document.querySelectorAll('img').forEach(img => {
              img.onload = sendHeight;
            });
          })();
          true;
        `}
      />
    );
  };

  const handleImagePress = (imageUri: string) => {
    // 检查图片是否加载失败
    if (failedImages.has(imageUri)) {
      console.log('🖼️ 图片加载失败，禁止查看原图:', imageUri);
      return;
    }

    // 标准化图片URL作为最后的安全保障（通常dataFetcher已经处理过了）
    const normalizedUri = normalizeImageUrl(imageUri);
    setSelectedImageUri(normalizedUri);
    setImageViewerVisible(true);
  };

  // 根据图片实际尺寸计算显示高度
  const calculateImageHeight = (imageUri: string, imageSize?: {width: number; height: number}) => {
    if (!imageSize || imageSize.width === 0 || imageSize.height === 0) {
      return 200; // 默认最小高度
    }

    const containerWidth = SCREEN_WIDTH;
    const aspectRatio = imageSize.width / imageSize.height;
    const calculatedHeight = containerWidth / aspectRatio;

    // 返回计算出的高度，但不设置最大限制，让图片按实际比例显示
    return Math.max(200, calculatedHeight); // 只设置最小高度200
  };

  // 处理图片加载完成
  const handleImageLoad = (imageUri: string, imageSize: {width: number; height: number}) => {
    setImageSizes(prev => ({
      ...prev,
      [imageUri]: imageSize
    }));
  };

  // 处理图片加载失败
  const handleImageLoadError = (imageUri: string) => {
    setFailedImages(prev => new Set(prev).add(imageUri));
  };

  const renderAttachments = (attachments: Attachment[]) => {
    if (!attachments || attachments.length === 0) return null;

    return (
      <View style={styles.attachmentsContainer}>
        {attachments.map((item, index) => {
          // dataFetcher 已经处理过URL，直接使用
          const url = item.url;
          
          if (isImage(item)) {
            const imageSize = imageSizes[url];
            const dynamicHeight = calculateImageHeight(url, imageSize);
            
            return (
              <TouchableOpacity 
                key={index} 
                style={styles.imageContainer}
                onPress={() => handleImagePress(url)}
                activeOpacity={0.9}
                disabled={failedImages.has(url)} // 加载失败的图片禁止点击
              >
                <ImageWithPlaceholder
                  uri={url}
                  style={[
                    styles.attachmentImage,
                    { height: dynamicHeight }
                  ]}
                  resizeMode="contain"
                  showLoadingIndicator={true}
                  onImageLoad={(imageSize) => {
                    handleImageLoad(url, imageSize);
                  }}
                  onLoadError={() => {
                    handleImageLoadError(url);
                  }}
                />
              </TouchableOpacity>
            );
          } else if (isVideo(item)) {
            return (
              <View key={index} style={styles.videoContainer}>
                <WebView
                  source={{uri: url}}
                  style={styles.attachmentVideo}
                  allowsFullscreenVideo={true}
                  playsInline={true}
                  scrollEnabled={false}
                  mediaPlaybackRequiresUserAction={true}
                />
                <Text style={styles.videoTip}>点击播放视频</Text>
              </View>
            );
          } else {
            return (
              <TouchableOpacity
                key={index}
                style={styles.fileAttachment}
                onPress={() => {/* Handle other file types */}}>
                <Text style={styles.fileName}>{item.name || '未知附件'}</Text>
              </TouchableOpacity>
            );
          }
        })}
      </View>
    );
  };

  const renderLikes = (likes: Like[]) => {
    if (!likes || likes.length === 0) return null;

    const showCollapse = likes.length > 5;
    const displayedLikes = showCollapse && !likesExpanded ? likes.slice(0, 5) : likes;

    return (
      <View style={[styles.likesContainer, {borderTopColor: theme.border}]}>
        <View style={styles.likesHeader}>
          <Text style={[styles.likesTitle, {color: theme.secondaryText}]}>点赞/点评 ({likes.length})</Text>
        </View>
        {displayedLikes.map((like, index) => {
          const isCurrentUser = currentUsername && like.author === currentUsername;
          
          return (
            <View key={like.id || index} style={styles.likeItem}>
              <View style={styles.likeUserInfo}>
                <TouchableOpacity
                  onPress={() => {
                    navigation.navigate('UserProfile', { username: like.author });
                  }}
                  activeOpacity={0.7}
                >
                  {like.avatar ? (
                    <ImageWithPlaceholder
                      uri={like.avatar}
                      style={styles.likeAvatar}
                      resizeMode="cover"
                      isAvatar={true}
                    />
                  ) : (
                    <View style={[styles.likeAvatar, styles.likeAvatarPlaceholder]}>
                      <Text style={styles.likeAvatarText}>
                        {like.author.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                <View style={styles.likeTextContainer}>
                  <Text style={[styles.likeContent, {color: theme.text}]}>
                    <Text style={[styles.likeAuthor, {color: theme.text}]}>
                      {like.author}
                    </Text>
                    {like.score !== undefined && like.score !== null && like.score !== 0 && (
                      <Text style={[styles.likeScore, {color: theme.error}]}>
                        {' '}[{like.score > 0 ? '+' : ''}{like.score}分]
                      </Text>
                    )}
                    <Text style={[styles.likeColon, {color: theme.secondaryText}]}>: </Text>
                    <Text style={[styles.likeBody, {color: theme.text}]}>{like.body}</Text>
                  </Text>
                </View>
                {isCurrentUser && (
                  <TouchableOpacity
                    style={[styles.likeDeleteButton, {borderColor: theme.border}]}
                    onPress={() => handleRemoveLike(like.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.likeDeleteButtonText, {color: theme.error}]}>删除</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
        {showCollapse && (
          <TouchableOpacity
            style={[styles.likesExpandButton, {borderTopColor: theme.border}]}
            onPress={() => setLikesExpanded(!likesExpanded)}>
            <Text style={[styles.likesExpandText, {color: theme.primary}]}>
              {likesExpanded ? '收起更多点评' : `查看更多 ${likes.length - 5} 条点评...`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // 根据排序顺序处理回复列表
  const getSortedReplies = () => {
    if (sortOrder === 'desc') {
      return [...replies].reverse();
    }
    return replies;
  };

  const renderReply = ({item}: {item: Reply}) => {
    const isAuthor = post && item.author === post.author;
    
    return (
    <View style={[styles.replyContainer, {backgroundColor: theme.cardBackground}]}>
      <View style={styles.replyHeader}>
        <View style={styles.replyAuthorInfo}>
          <TouchableOpacity
            onPress={() => {
              navigation.navigate('UserProfile', { username: item.author });
            }}
            activeOpacity={0.7}
          >
            {item.avatar ? (
              <ImageWithPlaceholder
                uri={item.avatar}
                style={styles.avatar}
                resizeMode="cover"
                isAvatar={true}
              />
            ) : (
              <View style={[styles.authorAvatarPlaceholder, {backgroundColor: theme.primary}]}>
                <Text style={styles.authorAvatarText}>
                  {item.author.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.authorText}>
              <View style={styles.authorNameRow}>
                <Text style={[styles.authorName, {color: theme.text}]}>
                  {item.nickname || item.author}
                  {item.levelTitle ? ` · ${item.levelTitle}` : ''}
                </Text>
                {isAuthor && (
                  <View style={styles.authorBadge}>
                    <Text style={styles.authorBadgeText}>楼主</Text>
                  </View>
                )}
              </View>
              <View style={styles.authorMetaRow}>
                <Text style={[styles.authorID, {color: theme.secondaryText}]}>@{item.author}</Text>
                {(item.city || item.location) && (
                  <>
                    <Text style={[styles.authorMetaSeparator, {color: theme.secondaryText}]}> · </Text>
                    <Text style={[styles.location, {color: theme.secondaryText}]}>{item.city || item.location}</Text>
                  </>
                )}
              </View>
          </View>
        </View>
          {item.floor && (
            <Text style={[styles.floor, {color: theme.secondaryText}]}>#{item.floor}</Text>
          )}
      </View>
      {item.signature && (
        <Text style={[styles.signature, {color: theme.secondaryText}]}>{item.signature}</Text>
      )}
      <View style={styles.replyContentBody}>
        {renderContent(item.content, `reply-${item.id}`)}
      </View>
      {renderAttachments(item.attachments || [])}
      <View style={styles.replyFooter}>
        <Text style={[styles.replyTime, {color: theme.secondaryText}]}>{formatRelativeTime(item.postTime)}</Text>
        <View style={styles.replyActions}>
          {currentUsername && item.author === currentUsername && (
            <TouchableOpacity
              style={[styles.deleteReplyButton, {borderColor: theme.border}]}
              onPress={() => handleDeleteReply(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteReplyButtonText}>删除</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.quoteReplyButton, {borderColor: theme.border}]}
            onPress={() => handleQuoteReply(item)}
            activeOpacity={0.7}
          >
            <Text style={[styles.quoteReplyButtonText, {color: theme.primary}]}>💬</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
  };

  if (loading && !post) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: theme.background}]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: theme.background}]}>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, {color: theme.secondaryText}]}>帖子不存在</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderFooter = () => {
    if (!hasMore) return null;
    
    return (
      <View style={styles.footerContainer}>
        {loadingMore ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : (
          <TouchableOpacity 
            style={[styles.loadMoreButton, {backgroundColor: theme.cardBackground, borderColor: theme.border}]}
            onPress={loadMore}>
            <Text style={[styles.loadMoreText, {color: theme.primary}]}>加载更多回复</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.background}]}>
      <FlatList
        data={getSortedReplies()}
        renderItem={renderReply}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListHeaderComponent={
          <View style={[styles.postContainer, {backgroundColor: theme.cardBackground}]}>
            <Text style={[styles.postTitle, {color: theme.text}]}>{post.title}</Text>
            <View style={styles.postMeta}>
              <Text style={[styles.metaText, {color: theme.secondaryText}]}>{post.boardName || post.board}</Text>
              <Text style={[styles.metaText, {color: theme.secondaryText}]}>回复: {post.replyCount}</Text>
              <Text style={[styles.metaText, {color: theme.secondaryText}]}>{formatDateTime(post.postTime)}</Text>
            </View>
            <View style={[styles.divider, {backgroundColor: theme.border}]} />
            <View style={styles.authorContainer}>
              {post.author && (
                <View style={styles.authorInfo}>
                  <TouchableOpacity
                    onPress={() => {
                      navigation.navigate('UserProfile', { username: post.author });
                    }}
                    activeOpacity={0.7}
                  >
                    {post.avatar ? (
                      <ImageWithPlaceholder
                        uri={post.avatar}
                        style={styles.avatar}
                        resizeMode="cover"
                        isAvatar={true}
                      />
                    ) : (
                    <View style={[styles.authorAvatarPlaceholder, {backgroundColor: theme.primary}]}>
                      <Text style={styles.authorAvatarText}>
                        {post.author.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    )}
                  </TouchableOpacity>
                  <View style={styles.authorDetails}>
                    <Text style={[styles.authorName, {color: theme.text}]}>
                      {post.nick || post.author}
                      {post.levelTitle ? ` · ${post.levelTitle}` : ''}
                    </Text>
                    <View style={styles.authorMetaRow}>
                      <Text style={[styles.authorID, {color: theme.secondaryText}]}>@{post.author}</Text>
                      {post.city && (
                        <>
                          <Text style={[styles.authorMetaSeparator, {color: theme.secondaryText}]}> · </Text>
                          <Text style={[styles.authorCity, {color: theme.secondaryText}]}>{post.city}</Text>
                        </>
                      )}
                    </View>
                  </View>
                </View>
              )}
            </View>
            <View style={styles.contentBody}>
              {renderContent(post.contentText || post.content || '', `post-${post.id}`)}
            </View>
            {renderAttachments(post.attachments || [])}
            {renderLikes(post.likes || [])}
            <View style={[styles.divider, {backgroundColor: theme.border}]} />
            
            {/* 回复标题和操作按钮 */}
            <View style={styles.repliesTitleRow}>
              <Text style={[styles.repliesTitle, {color: theme.text}]}>回复 ({post.replyCount})</Text>
              <View style={styles.replyActions}>
                <TouchableOpacity
                  style={[styles.actionIconButton, {backgroundColor: theme.background, borderColor: theme.border}]}
                  onPress={handleLikePress}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionIconEmoji}>👍</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  ref={eggButtonRef}
                  style={[styles.actionIconButton, {backgroundColor: theme.background, borderColor: theme.border}]}
                  onPress={handleDislikePress}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionIconEmoji}>🥚</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.sortIconButton, {backgroundColor: theme.background, borderColor: theme.border}]}
                  onPress={toggleSortOrder}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sortTriangleIcon, {color: theme.text}]}>
                    {sortOrder === 'asc' ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        }
        ListFooterComponent={renderFooter}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        contentContainerStyle={styles.content}
      />
      
      <ImageViewer
        visible={imageViewerVisible}
        imageUri={selectedImageUri}
        onClose={() => setImageViewerVisible(false)}
      />

      {/* 评价弹窗 */}
      <Modal
        visible={ratingModalVisible}
        transparent={true}
        animationType="none"
        onRequestClose={closeModal}
      >
        {/* 飞行的鸡蛋动画（带旋转） */}
        {throwingEgg && eggButtonLayout.x !== 0 && (
          <Animated.View
            style={[
              styles.flyingEgg,
              {
                left: eggButtonLayout.x,
                top: eggButtonLayout.y,
                opacity: eggOpacity,
                transform: [
                  { translateX: eggAnimX },
                  { translateY: eggAnimY },
                  { rotate: eggRotate.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '-720deg']
                    }) 
                  }
                ]
              }
            ]}
          >
            <Text style={styles.flyingEggEmoji}>🥚</Text>
          </Animated.View>
        )}
        
        {/* 爆炸效果 */}
        {exploding && (
          <>
            <Animated.View
              style={[
                styles.explosion,
                {
                  left: explosionPosition.x - 20,
                  top: explosionPosition.y - 20,
                  opacity: explosionOpacity,
                  transform: [
                    { scale: explosionScale }
                  ]
                }
              ]}
            >
              <Text style={styles.explosionEmoji}>💥</Text>
            </Animated.View>
            
            {/* 蛋清飞溅粒子（前5个蛋黄，后15个蛋清） */}
            {splashParticles.map((particle, index) => {
              const isYolk = index < 5;
              return (
                <Animated.View
                  key={`splash-${index}`}
                  style={[
                    styles.splashParticle,
                    {
                      left: explosionPosition.x,
                      top: explosionPosition.y,
                      opacity: particle.opacity,
                      transform: [
                        { translateX: particle.x },
                        { translateY: particle.y },
                        { scale: particle.scale },
                      ]
                    }
                  ]}
                >
                  <View style={[
                    styles.splashDot,
                    { 
                      backgroundColor: isYolk ? '#FF8C00' : '#FFFFE0', // 深橙色蛋黄，淡黄色蛋清
                      width: isYolk ? 16 : 10,
                      height: isYolk ? 16 : 10,
                      borderRadius: isYolk ? 8 : 5,
                      opacity: isYolk ? 1 : 0.8,
                    }
                  ]} />
                </Animated.View>
              );
            })}
            
            {/* 蛋壳碎片（白色） */}
            {shellParticles.map((particle, index) => (
              <Animated.View
                key={`shell-${index}`}
                style={[
                  styles.shellParticle,
                  {
                    left: explosionPosition.x,
                    top: explosionPosition.y,
                    opacity: particle.opacity,
                    transform: [
                      { translateX: particle.x },
                      { translateY: particle.y },
                      { rotate: particle.rotate.interpolate({
                        inputRange: [0, 360],
                        outputRange: ['0deg', '360deg']
                      })},
                    ]
                  }
                ]}
              >
                <View style={styles.shellFragment} />
              </Animated.View>
            ))}
          </>
        )}

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.ratingModalWrapper}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.ratingModalBackdrop, {opacity: modalAnim}]}>
            <TouchableOpacity
              style={{flex: 1}}
              activeOpacity={1}
              onPress={closeModal}
            />
          </Animated.View>
          <Animated.View style={[
            styles.ratingModalContainer, 
            {backgroundColor: theme.cardBackground},
            {
              transform: [{
                translateY: modalAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [300, 0]
                })
              }]
            }
          ]}>
            <View style={styles.ratingModalHeader}>
              <Text style={[styles.ratingModalTitle, {color: theme.text}]}>
                {ratingType === 'like' ? '👍 点赞' : '🥚 扔鸡蛋'}
              </Text>
              <TouchableOpacity
                onPress={closeModal}
                style={styles.ratingModalClose}
              >
                <Text style={[styles.ratingModalCloseText, {color: theme.secondaryText}]}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* 评分选择（可选） */}
              <View style={styles.scoreSelector}>
                <Text style={[styles.scoreSelectorLabel, {color: theme.secondaryText}]}>评分（可选）：</Text>
                <View style={styles.scoreButtons}>
                  {[1, 2, 3, 4, 5].map((score) => {
                    const actualScore = ratingType === 'like' ? score : -score;
                    const isSelected = ratingScore === actualScore;
                    const prefix = ratingType === 'like' ? '+' : '-';
                    return (
                      <TouchableOpacity
                        key={score}
                        style={[
                          styles.scoreButton,
                          {borderColor: theme.border},
                          isSelected && {backgroundColor: theme.primary, borderColor: theme.primary}
                        ]}
                        onPress={() => setRatingScore(isSelected ? null : actualScore)}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          styles.scoreButtonText,
                          {color: isSelected ? '#fff' : theme.text}
                        ]}>
                          {prefix}{score}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              
              {/* 评论输入框 */}
              <View style={[styles.commentInputContainer, {borderColor: theme.border}]}>
                <TextInput
                  style={[styles.commentInput, {color: theme.text}]}
                  placeholder="请留下你的评论，最多30个字"
                  placeholderTextColor={theme.secondaryText}
                  multiline
                  numberOfLines={3}
                  value={ratingComment}
                  onChangeText={setRatingComment}
                  maxLength={30}
                />
              </View>
              
              {/* 提交按钮 */}
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                  style={[styles.submitButtonFull, {backgroundColor: theme.primary}]}
                  onPress={handleSubmitRating}
                  activeOpacity={0.7}
                >
                  <Text style={styles.submitButtonText}>
                    {captchaVerified ? '✅ 提交' : '提交'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 验证码弹窗 - 放在最后确保显示在最上层 */}
      <Modal
        visible={showCaptchaModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCaptchaCancel}
      >
        <View style={styles.captchaModalOverlay}>
          <View style={styles.captchaModalContent}>
            <PostCaptchaScreen
              onCaptchaSuccess={handleCaptchaSuccess}
              onCancel={handleCaptchaCancel}
              captchaId={LIKE_CAPTCHA_ID}
            />
          </View>
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
  headerMenuButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  headerMenuButtonText: {
    fontSize: FONT_SIZE.xxxl,
    color: '#007AFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  ratingModalWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  ratingModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: SPACING.lg,
  },
  postContainer: {
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  postTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: SPACING.md,
  },
  postMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: SPACING.md,
  },
  metaText: {
    fontSize: FONT_SIZE.sm,
    color: '#666',
    marginRight: SPACING.md,
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: SPACING.lg,
  },
  authorContainer: {
    marginBottom: SPACING.lg,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  authorAvatarPlaceholder: {
    width: responsiveSize(44, 50, 54, 60),
    height: responsiveSize(44, 50, 54, 60),
    borderRadius: responsiveSize(22, 25, 27, 30),
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  authorAvatarText: {
    color: '#fff',
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
  },
  authorDetails: {
    flex: 1,
  },
  authorName: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#333',
    marginBottom: SPACING.xs / 2,
  },
  authorID: {
    fontSize: FONT_SIZE.xs,
    color: '#999',
  },
  authorMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs / 2,
  },
  authorMetaSeparator: {
    fontSize: FONT_SIZE.xs,
    color: '#999',
  },
  authorCity: {
    fontSize: FONT_SIZE.xs,
    color: '#666',
  },
  signature: {
    fontSize: FONT_SIZE.sm,
    color: '#999',
    fontStyle: 'italic',
    marginBottom: SPACING.sm,
  },
  contentBody: {
    marginBottom: SPACING.lg,
  },
  replyContentBody: {
    marginBottom: SPACING.sm,
  },
  textContainer: {
    marginVertical: SPACING.xs,
  },
  quoteContainer: {
    backgroundColor: '#f8f9fa',
    borderLeftWidth: SPACING.xs,
    borderLeftColor: '#dee2e6',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  contentText: {
    fontSize: FONT_SIZE.lg,
    color: '#333',
    lineHeight: scaleModerate(26),
  },
  quoteText: {
    fontSize: FONT_SIZE.md,
    color: '#666',
    lineHeight: scaleModerate(22),
  },
  selectableWebView: {
    backgroundColor: 'transparent',
    width: '100%',
    minHeight: 20,
  },
  attachmentsContainer: {
    marginTop: SPACING.lg,
  },
  imageContainer: {
    marginBottom: SPACING.lg,
    marginHorizontal: -SPACING.lg,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#000',
    alignItems: 'center',
  },
  attachmentImage: {
    width: SCREEN_WIDTH,
    minHeight: responsiveSize(180, 200, 220, 250),
    backgroundColor: '#eee',
  },
  videoContainer: {
    width: SCREEN_WIDTH - scaleModerate(64),
    height: responsiveSize(180, 200, 220, 250),
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    backgroundColor: '#000',
  },
  attachmentVideo: {
    flex: 1,
  },
  videoTip: {
    position: 'absolute',
    bottom: SPACING.sm,
    right: SPACING.sm,
    color: '#fff',
    fontSize: FONT_SIZE.xs,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: SPACING.xs,
    borderRadius: BORDER_RADIUS.xs,
  },
  fileAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    padding: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: SPACING.sm,
  },
  fileName: {
    fontSize: FONT_SIZE.md,
    color: '#007AFF',
  },
  likesContainer: {
    marginTop: SPACING.xl,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  likesHeader: {
    marginBottom: SPACING.md,
  },
  likesTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: '#666',
  },
  likeItem: {
    marginBottom: SPACING.md,
  },
  likeUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  likeAvatar: {
    width: scaleModerate(32),
    height: scaleModerate(32),
    borderRadius: scaleModerate(16),
    marginRight: SPACING.sm + 2,
  },
  likeAvatarPlaceholder: {
    backgroundColor: '#E1E1E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  likeAvatarText: {
    fontSize: FONT_SIZE.md,
    color: '#fff',
    fontWeight: 'bold',
  },
  likeTextContainer: {
    flex: 1,
  },
  likeDeleteButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    marginLeft: SPACING.sm,
  },
  likeDeleteButtonText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '500',
  },
  likeContent: {
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.xl,
  },
  likeAuthor: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#333',
  },
  likeScore: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  likeColon: {
    fontSize: FONT_SIZE.sm,
    color: '#666',
  },
  likeBody: {
    fontSize: FONT_SIZE.sm,
    color: '#444',
  },
  likeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  likeMetaSeparator: {
    fontSize: FONT_SIZE.xs - 1,
    color: '#999',
  },
  likeTime: {
    fontSize: FONT_SIZE.xs - 1,
    color: '#999',
  },
  likeCity: {
    fontSize: FONT_SIZE.xs - 1,
    color: '#999',
  },
  likesExpandButton: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: '#f0f0f0',
    marginTop: SPACING.sm,
  },
  likesExpandText: {
    fontSize: FONT_SIZE.sm,
    color: '#007AFF',
    fontWeight: '500',
  },
  repliesTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  repliesTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  replyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  actionIconButton: {
    width: responsiveSize(36, 40, 44, 48),
    height: responsiveSize(36, 40, 44, 48),
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  actionIconEmoji: {
    fontSize: responsiveSize(18, 20, 22, 24),
  },
  sortIconButton: {
    width: responsiveSize(36, 40, 44, 48),
    height: responsiveSize(36, 40, 44, 48),
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sortTriangleIcon: {
    fontSize: responsiveSize(16, 18, 20, 22),
    fontWeight: 'bold',
  },
  replyContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  replyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  replyAuthorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  authorText: {
    flex: 1,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  authorBadge: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    marginLeft: 6,
  },
  authorBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  replyTime: {
    fontSize: 10,
    color: '#999',
    marginTop: 8,
    textAlign: 'right',
  },
  replyFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  deleteReplyButton: {
    paddingHorizontal: 12,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  deleteReplyButtonText: {
    fontSize: 12,
    color: '#FF3B30',
    fontWeight: '500',
  },
  quoteReplyButton: {
    paddingHorizontal: 16,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  quoteReplyButtonText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
  },
  location: {
    fontSize: 10,
    color: '#666',
  },
  floor: {
    fontSize: 12,
    color: '#999',
    fontWeight: '400',
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
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: SPACING.lg,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  actionButtonIcon: {
    fontSize: FONT_SIZE.xl,
    marginRight: SPACING.xs,
  },
  actionButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '500',
  },
  sortButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  sortButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '500',
  },
  ratingModalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    maxHeight: SCREEN_HEIGHT * 0.8,
  },
  ratingModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  ratingModalTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
  },
  ratingModalClose: {
    padding: SPACING.sm,
  },
  ratingModalCloseText: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
  },
  scoreSelector: {
    marginBottom: SPACING.xl,
  },
  scoreSelectorLabel: {
    fontSize: FONT_SIZE.md,
    marginBottom: SPACING.md,
  },
  scoreButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  scoreButton: {
    width: responsiveSize(44, 48, 52, 56),
    height: responsiveSize(44, 48, 52, 56),
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
  },
  commentInputContainer: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.xl,
    minHeight: responsiveSize(100, 120, 140, 160),
  },
  commentInput: {
    fontSize: FONT_SIZE.md,
    textAlignVertical: 'top',
    minHeight: responsiveSize(80, 100, 120, 140),
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    alignItems: 'center',
  },
  captchaButton: {
    flex: 1,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
  },
  captchaButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  submitButtonFull: {
    width: '100%',
    backgroundColor: '#007AFF',
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
  },
  permissionNotice: {
    marginTop: SPACING.lg,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#f8f9fa',
  },
  permissionText: {
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.xl,
    marginBottom: SPACING.xs,
  },
  flyingEgg: {
    position: 'absolute',
    zIndex: 99999,
    elevation: 99999,
  },
  flyingEggEmoji: {
    fontSize: responsiveSize(32, 36, 40, 44),
  },
  explosion: {
    position: 'absolute',
    zIndex: 100000,
    elevation: 100000,
  },
  explosionEmoji: {
    fontSize: responsiveSize(48, 56, 64, 72),
  },
  splashParticle: {
    position: 'absolute',
    zIndex: 100001,
    elevation: 100001,
  },
  splashDot: {
    width: responsiveSize(10, 12, 14, 16),
    height: responsiveSize(10, 12, 14, 16),
    borderRadius: responsiveSize(5, 6, 7, 8),
    backgroundColor: '#FFD700',
    shadowColor: '#FFA500',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 8,
  },
  shellParticle: {
    position: 'absolute',
    zIndex: 100002,
    elevation: 100002,
  },
  shellFragment: {
    width: responsiveSize(12, 14, 16, 18),
    height: responsiveSize(8, 10, 12, 14),
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  captchaModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captchaModalContent: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
});

export default PostDetailScreen;

