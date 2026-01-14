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
} from 'react-native';
import {useRoute, useNavigation} from '@react-navigation/native';
import {WebView} from 'react-native-webview';
import {getPostDetail, getTopicReplies, deletePost, getUserInfo} from '../services/api';
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
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState('');
  const [imageSizes, setImageSizes] = useState<{[key: string]: {width: number; height: number}}>({});
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set()); // 跟踪加载失败的图片
  const [menuVisible, setMenuVisible] = useState(false);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);

  useEffect(() => {
    loadPostDetail(1);
    loadCurrentUser();
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

  const loadPostDetail = async (pageNum: number) => {
    try {
      if (pageNum > 1) {
        setLoadingMore(true);
      }
      
      if (pageNum === 1) {
        // 第一页：检查缓存并获取主题详情和回复列表
        const postCacheKey = `${board}-${postId}`;
        const repliesCacheKey = `${postId}-1`;
        
        // 尝试从缓存获取数据
        let detailData = cacheManager.get('postDetail', postCacheKey, 60 * 1000); // 1分钟缓存
        let repliesData = cacheManager.get('topicReplies', repliesCacheKey, 60 * 1000);
        
        // 如果缓存中没有数据，则从API获取
        if (!detailData || !repliesData) {
          console.log('[PostDetail] Cache miss, fetching from API');
          
          try {
            const [apiDetailData, apiRepliesData] = await Promise.all([
              detailData ? Promise.resolve(detailData) : getPostDetail(board, postId),
              repliesData ? Promise.resolve(repliesData) : getTopicReplies(postId, 1)
            ]);
            
            // 🔴 修复：只有成功获取且数据有效时才缓存
            if (apiDetailData && !detailData) {
              cacheManager.set('postDetail', postCacheKey, apiDetailData);
              detailData = apiDetailData;
            }
            if (apiRepliesData && !repliesData) {
              // 检查是否是真实的空数据（totalItems为0）还是错误返回
              if (apiRepliesData.totalItems >= 0) {
                cacheManager.set('topicReplies', repliesCacheKey, apiRepliesData);
                repliesData = apiRepliesData;
              }
            }
          } catch (error: any) {
            console.error('[PostDetail] Failed to fetch data:', error.message);
            // 失败时不更新数据，保留缓存或空状态
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
            // 🔴 修复：只有成功获取且数据有效时才缓存
            if (repliesData && repliesData.totalItems >= 0) {
              cacheManager.set('topicReplies', repliesCacheKey, repliesData);
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
      } else {
        setLoadingMore(false);
      }
    }
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

  const handleReply = () => {
    setMenuVisible(false);
    Alert.alert('提示', '回复功能开发中');
  };

  const handleShare = () => {
    setMenuVisible(false);
    Alert.alert('提示', '分享功能开发中');
  };

  const isImage = (url: string, name?: string) => {
    return isImageUrl(url, name);
  };

  const isVideo = (url: string, name?: string) => {
    return isVideoUrl(url, name);
  };

  const renderContent = (content: string) => {
    if (!content) return null;

    // 清理HTML标签和检查内容是否为空
    const cleanedContent = content
      .replace(/<[^>]*>/g, '') // 移除HTML标签
      .replace(/&nbsp;/g, ' ') // 替换&nbsp;
      .trim();
    
    // 如果清理后内容为空，不渲染任何内容
    if (!cleanedContent) return null;

    const lines = content.split('\n');
    const segments: {type: 'text' | 'quote'; text: string}[] = [];
    let currentSegment: {type: 'text' | 'quote'; text: string} | null = null;

    lines.forEach(line => {
      const isQuote = line.trim().startsWith(':') || line.includes('在大作中提到:');
      const type = isQuote ? 'quote' : 'text';

      if (!currentSegment || currentSegment.type !== type) {
        currentSegment = {type, text: line};
        segments.push(currentSegment);
      } else {
        currentSegment.text += '\n' + line;
      }
    });

    return segments
      .filter(segment => segment.text.trim()) // 过滤掉空的段落
      .map((segment, index) => (
        <View
          key={index}
          style={[
            segment.type === 'quote' ? styles.quoteContainer : styles.textContainer,
            segment.type === 'quote' && {
              backgroundColor: theme.quoteBackground,
              borderLeftColor: theme.quoteBorder,
            }
          ]}>
          <Text style={[
            segment.type === 'quote' ? styles.quoteText : styles.contentText,
            {
              fontSize: segment.type === 'quote' ? fontSizes.quote : fontSizes.content,
              lineHeight: segment.type === 'quote' ? fontSizes.quoteLineHeight : fontSizes.lineHeight,
              color: segment.type === 'quote' ? theme.secondaryText : theme.text,
            }
          ]}>
            {segment.text.trim()}
          </Text>
        </View>
      ));
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
        {renderContent(item.content)}
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
        data={replies}
        renderItem={renderReply}
        keyExtractor={(item, index) => `${item.id}-${index}`}
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
              {renderContent(post.contentText || post.content || '')}
            </View>
            {renderAttachments(post.attachments || [])}
            {renderLikes(post.likes || [])}
            <View style={[styles.divider, {backgroundColor: theme.border}]} />
            <Text style={[styles.repliesTitle, {color: theme.text}]}>回复 ({post.replyCount})</Text>
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
  repliesTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginTop: 8,
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
});

export default PostDetailScreen;

