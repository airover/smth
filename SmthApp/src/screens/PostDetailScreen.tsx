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
} from 'react-native';
import {useRoute, useNavigation} from '@react-navigation/native';
import {WebView} from 'react-native-webview';
import {getPostDetail, getTopicReplies} from '../services/api';
import {Post, Reply, Attachment, Like} from '../types';
import {formatRelativeTime} from '../utils/timeFormat';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import ImageViewer from '../components/ImageViewer';
import {cacheManager} from '../services/cacheManager';
import {saveBrowsingHistory} from './BrowsingHistoryScreen';
import {useSettings} from '../context/SettingsContext';
import {getTheme, getFontSizes} from '../utils/theme';

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

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

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

  useEffect(() => {
    loadPostDetail(1);
  }, []);

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
          const [apiDetailData, apiRepliesData] = await Promise.all([
            detailData ? Promise.resolve(detailData) : getPostDetail(board, postId),
            repliesData ? Promise.resolve(repliesData) : getTopicReplies(postId, 1)
          ]);
          
          // 缓存新获取的数据
          if (apiDetailData && !detailData) {
            cacheManager.set('postDetail', postCacheKey, apiDetailData);
            detailData = apiDetailData;
          }
          if (apiRepliesData && !repliesData) {
            cacheManager.set('topicReplies', repliesCacheKey, apiRepliesData);
            repliesData = apiRepliesData;
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
          repliesData = await getTopicReplies(postId, pageNum);
          if (repliesData) {
            cacheManager.set('topicReplies', repliesCacheKey, repliesData);
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

  const isImage = (url: string, name?: string) => {
    const imageReg = /\.(jpg|jpeg|png|gif|webp|bmp)($|\?)/i;
    // 如果文件名或 URL 包含图片后缀，或者 URL 包含特定的文件路径
    return imageReg.test(url) || (name ? imageReg.test(name) : false) || url.includes('/file/') || url.includes('/attachment/');
  };

  const isVideo = (url: string, name?: string) => {
    const videoReg = /\.(mp4|mov|m4v|webm)($|\?)/i;
    // 视频必须匹配后缀，不能误认包含 /file/ 的图片为视频
    return videoReg.test(url) || (name ? videoReg.test(name) : false);
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
    setSelectedImageUri(imageUri);
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

  const renderAttachments = (attachments: Attachment[]) => {
    if (!attachments || attachments.length === 0) return null;
    
    console.log('Rendering attachments:', JSON.stringify(attachments));

    return (
      <View style={styles.attachmentsContainer}>
        {attachments.map((item, index) => {
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
  content: {
    padding: 16,
  },
  postContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  postTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12,
  },
  postMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  metaText: {
    fontSize: 12,
    color: '#666',
    marginRight: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 16,
  },
  authorContainer: {
    marginBottom: 16,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  authorAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  authorAvatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  authorDetails: {
    flex: 1,
  },
  authorName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  authorID: {
    fontSize: 10,
    color: '#999',
  },
  authorMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  authorMetaSeparator: {
    fontSize: 10,
    color: '#999',
  },
  authorCity: {
    fontSize: 10,
    color: '#666',
  },
  signature: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  contentBody: {
    marginBottom: 16,
  },
  replyContentBody: {
    marginBottom: 8,
  },
  textContainer: {
    marginVertical: 4,
  },
  quoteContainer: {
    backgroundColor: '#f8f9fa',
    borderLeftWidth: 4,
    borderLeftColor: '#dee2e6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 8,
    borderRadius: 4,
  },
  contentText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 26,
  },
  quoteText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },
  attachmentsContainer: {
    marginTop: 16,
  },
  imageContainer: {
    marginBottom: 16,
    marginHorizontal: -16,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#000',
    alignItems: 'center',
  },
  attachmentImage: {
    width: SCREEN_WIDTH,
    minHeight: 200,
    backgroundColor: '#eee',
  },
  videoContainer: {
    width: SCREEN_WIDTH - 64,
    height: 200,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#000',
  },
  attachmentVideo: {
    flex: 1,
  },
  videoTip: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    color: '#fff',
    fontSize: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 4,
    borderRadius: 2,
  },
  fileAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 4,
    marginBottom: 8,
  },
  fileName: {
    fontSize: 14,
    color: '#007AFF',
  },
  likesContainer: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  likesHeader: {
    marginBottom: 12,
  },
  likesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  likeItem: {
    marginBottom: 12,
  },
  likeUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  likeAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  likeAvatarPlaceholder: {
    backgroundColor: '#E1E1E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  likeAvatarText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: 'bold',
  },
  likeTextContainer: {
    flex: 1,
  },
  likeContent: {
    fontSize: 13,
    lineHeight: 18,
  },
  likeAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  likeScore: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  likeColon: {
    fontSize: 13,
    color: '#666',
  },
  likeBody: {
    fontSize: 13,
    color: '#444',
  },
  likeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  likeMetaSeparator: {
    fontSize: 9,
    color: '#999',
  },
  likeTime: {
    fontSize: 9,
    color: '#999',
  },
  likeCity: {
    fontSize: 9,
    color: '#999',
  },
  likesExpandButton: {
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: '#f0f0f0',
    marginTop: 4,
  },
  likesExpandText: {
    fontSize: 13,
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
    gap: 6,
  },
  authorBadge: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
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

