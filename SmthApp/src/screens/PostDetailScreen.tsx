import React, {useState, useEffect} from 'react';
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
} from 'react-native';
import {useRoute, useNavigation} from '@react-navigation/native';
import {WebView} from 'react-native-webview';
import {getPostDetail, getTopicReplies, deletePost, getUserInfo, addFavoriteTopic, likePost, getPostPermissions, PostPermissions} from '../services/api';
import {Post, Reply, Attachment, Like} from '../types';
import {formatRelativeTime} from '../utils/timeFormat';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import ImageViewer from '../components/ImageViewer';
import {cacheManager} from '../services/cacheManager';
import {saveBrowsingHistory} from './BrowsingHistoryScreen';
import {useSettings} from '../context/SettingsContext';
import {getTheme, getFontSizes} from '../utils/theme';
import {normalizeImageUrl, isImageUrl, isVideoUrl} from '../utils/imageUtils';
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
  const [menuVisible, setMenuVisible] = useState(false);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [ratingType, setRatingType] = useState<'like' | 'dislike'>('like');
  const [ratingComment, setRatingComment] = useState('');
  const [ratingScore, setRatingScore] = useState<number | null>(null); // null表示未选择评分
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc'); // 回复排序：asc=正序，desc=倒序
  const [permissions, setPermissions] = useState<PostPermissions | null>(null);

  useEffect(() => {
    loadPostDetail(1);
    loadCurrentUser();
    loadPermissions();
  }, []);

  // 设置导航栏右侧按钮
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          style={styles.headerMenuButton}
          onPress={() => setMenuVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.headerMenuButtonText}>⋯</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

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
              detailData ? Promise.resolve(detailData) : getPostDetail(board, postId),
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
          // 过滤掉第一层（主贴），因为已经在 ListHeaderComponent 中显示了
          const filteredReplies = (repliesData as {replies: any[], totalItems: number}).replies.filter((r: any) => r.floor !== 1);
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
            const newReplies = (repliesData as {replies: any[], totalItems: number}).replies.filter((r: any) => !existingIds.has(r.id));
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
    setMenuVisible(false);
    
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
    setMenuVisible(false);
    
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
    setMenuVisible(false);
    
    // 检查写权限
    if (permissions && !permissions.write.hasPerm) {
      Alert.alert(
        '权限不足',
        permissions.write.cause || '您没有权限进行此操作',
        [{text: '确定'}]
      );
      return;
    }
    
    Alert.alert('提示', '回复功能开发中');
  };

  const handleShare = () => {
    setMenuVisible(false);
    Alert.alert('提示', '分享功能开发中');
  };

  const handleLikePress = () => {
    // 检查写权限
    if (permissions && !permissions.write.hasPerm) {
      Alert.alert(
        '权限不足',
        permissions.write.cause || '您没有权限进行此操作',
        [{text: '确定'}]
      );
      return;
    }
    
    setRatingType('like');
    setRatingScore(null); // 默认不选择评分
    setRatingComment('');
    setRatingModalVisible(true);
  };

  const handleDislikePress = () => {
    // 检查写权限
    if (permissions && !permissions.write.hasPerm) {
      Alert.alert(
        '权限不足',
        permissions.write.cause || '您没有权限进行此操作',
        [{text: '确定'}]
      );
      return;
    }
    
    setRatingType('dislike');
    setRatingScore(null); // 默认不选择评分
    setRatingComment('');
    setRatingModalVisible(true);
  };

  const handleSubmitRating = async () => {
    if (!post?.articleId) {
      Alert.alert('错误', '无法获取帖子ID');
      return;
    }

    if (!ratingComment.trim()) {
      Alert.alert('提示', '请输入评价内容');
      return;
    }

    try {
      // 如果没有选择评分，根据类型使用默认值：喜欢=1，不喜欢=-1
      const finalScore = ratingScore !== null ? ratingScore : (ratingType === 'like' ? 1 : -1);
      const result = await likePost(post.articleId, finalScore, ratingComment.trim());
      setRatingModalVisible(false);
      
      if (result.success) {
        Alert.alert('成功', result.message || '评价成功');
        // 刷新帖子详情以显示新的点评
        await loadPostDetail(1, true);
      } else {
        Alert.alert('失败', result.message || '评价失败');
      }
    } catch (error) {
      Alert.alert('错误', '评价失败，请稍后重试');
    }
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  const isImage = (url: string, name?: string) => {
    return isImageUrl(url, name);
  };

  const isVideo = (url: string, name?: string) => {
    return isVideoUrl(url, name);
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
            border-left: 3px solid ${theme.quoteBorder || '#dee2e6'};
            border-radius: 4px;
            margin: 8px 0;
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
        key={key}
        source={{ html }}
        style={[styles.selectableWebView, { height }]}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        originWhitelist={['*']}
        onMessage={(event) => {
          const newHeight = parseInt(event.nativeEvent.data, 10);
          if (newHeight && newHeight !== contentHeights[key]) {
            setContentHeights(prev => ({ ...prev, [key]: newHeight }));
          }
        }}
        injectedJavaScript={`
          (function() {
            function sendHeight() {
              const height = document.body.scrollHeight;
              window.ReactNativeWebView.postMessage(String(height));
            }
            sendHeight();
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
          const name = item.name;
          
          if (isImage(url, name)) {
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
          } else if (isVideo(url, name)) {
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
        {displayedLikes.map((like, index) => (
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
            </View>
          </View>
        ))}
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
      <Text style={[styles.replyTime, {color: theme.secondaryText}]}>{formatRelativeTime(item.postTime)}</Text>
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
                  style={styles.iconButton}
                  onPress={handleLikePress}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.actionIcon, {color: theme.secondaryText}]}>👍</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={handleDislikePress}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.actionIcon, {color: theme.secondaryText}]}>👎</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={toggleSortOrder}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sortIcon, {color: theme.secondaryText}]}>
                    {sortOrder === 'asc' ? '↓' : '↑'}
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
        animationType="slide"
        onRequestClose={() => setRatingModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.ratingModalWrapper}
        >
          <TouchableOpacity
            style={styles.ratingModalBackdrop}
            activeOpacity={1}
            onPress={() => setRatingModalVisible(false)}
          />
          <View style={[styles.ratingModalContainer, {backgroundColor: theme.cardBackground}]}>
            <View style={styles.ratingModalHeader}>
              <Text style={[styles.ratingModalTitle, {color: theme.text}]}>
                {ratingType === 'like' ? '👍 喜欢' : '👎 不喜欢'}
              </Text>
              <TouchableOpacity
                onPress={() => setRatingModalVisible(false)}
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
                          {score}
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
                  placeholder="请留下你的评论"
                  placeholderTextColor={theme.secondaryText}
                  multiline
                  numberOfLines={4}
                  value={ratingComment}
                  onChangeText={setRatingComment}
                  maxLength={200}
                />
              </View>
              
              {/* 提交按钮 */}
              <TouchableOpacity
                style={[styles.submitButton, {backgroundColor: theme.primary}]}
                onPress={handleSubmitRating}
                activeOpacity={0.7}
              >
                <Text style={styles.submitButtonText}>发送</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 菜单弹窗 */}
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={[styles.menuContainer, {backgroundColor: theme.cardBackground}]}>
            {/* 只有当前用户是发帖人时才显示删除选项 */}
            {currentUsername && post && currentUsername === post.author && (
              <TouchableOpacity
                style={[styles.menuItem, {borderBottomColor: theme.border}]}
                onPress={handleDeletePost}
                activeOpacity={0.7}
              >
                <Text style={[styles.menuItemText, styles.deleteText]}>🗑️ 删除</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.menuItem, {borderBottomColor: theme.border}]}
              onPress={handleReply}
              activeOpacity={0.7}
            >
              <Text style={[styles.menuItemText, {color: theme.text}]}>💬 回复</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.menuItem, {borderBottomColor: theme.border}]}
              onPress={handleFavorite}
              activeOpacity={0.7}
            >
              <Text style={[styles.menuItemText, {color: theme.text}]}>⭐ 收藏</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleShare}
              activeOpacity={0.7}
            >
              <Text style={[styles.menuItemText, {color: theme.text}]}>📤 分享</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cancelButton, {borderTopColor: theme.border}]}
              onPress={() => setMenuVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelButtonText, {color: theme.secondaryText}]}>取消</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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
  menuContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    paddingBottom: SPACING.xl,
  },
  menuItem: {
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
  },
  menuItemText: {
    fontSize: FONT_SIZE.lg,
    color: '#333',
    textAlign: 'center',
  },
  deleteText: {
    color: '#FF3B30',
  },
  cancelButton: {
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.sm,
    borderTopWidth: SPACING.xs + 2,
    borderTopColor: '#f0f0f0',
  },
  cancelButtonText: {
    fontSize: FONT_SIZE.lg,
    color: '#666',
    textAlign: 'center',
    fontWeight: '500',
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
    gap: SPACING.xs,
  },
  iconButton: {
    padding: SPACING.sm,
  },
  actionIcon: {
    fontSize: FONT_SIZE.xl,
  },
  sortIcon: {
    fontSize: FONT_SIZE.xxl,
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
  submitButton: {
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
});

export default PostDetailScreen;

