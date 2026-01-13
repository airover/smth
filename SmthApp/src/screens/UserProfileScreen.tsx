import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ImageBackground,
  Dimensions,
} from 'react-native';
import {useRoute, useNavigation} from '@react-navigation/native';
import {getUserInfo, fetchUserInfo} from '../services/api';
import {User} from '../types';
import {formatRelativeTime} from '../utils/timeFormat';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SCREEN_WIDTH = Dimensions.get('window').width;

// 辅助函数：移除HTML标签
const stripHtmlTags = (html: string): string => {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '') // 移除HTML标签
    .replace(/&nbsp;/g, ' ') // 替换&nbsp;
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim();
};

// 辅助函数：计算字符串长度（中文算2，英文算1）
const getStringLength = (str: string): number => {
  if (!str) return 0;
  let length = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // 中文字符范围
    if (code >= 0x4e00 && code <= 0x9fff) {
      length += 2;
    } else {
      length += 1;
    }
  }
  return length;
};

// 辅助函数：判断昵称是否过长（超过6个英文或4个中文，即长度>8）
const isNicknameTooLong = (nickname: string): boolean => {
  return getStringLength(nickname) > 8;
};

const UserProfileScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const {username} = route.params as {username?: string};
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isCurrentUser, setIsCurrentUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);

  const checkAndLoadUserInfo = async () => {
    try {
      // 检查是否查看自己的资料
      const currentUsername = await AsyncStorage.getItem('username');
      const isSelf = !username || username === currentUsername;
      setIsCurrentUser(isSelf);
      
      // 加载背景图片配置
      if (isSelf) {
        const savedBg = await AsyncStorage.getItem('profile_background_image');
        if (savedBg) {
          setBackgroundImage(savedBg);
        }
      }
      
      await loadUserInfo(isSelf);
    } catch (err) {
      console.error('Check and load user info error:', err);
    }
  };

  useEffect(() => {
    checkAndLoadUserInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const loadUserInfo = async (isSelf: boolean = isCurrentUser) => {
    try {
      setLoading(true);
      setError(null);
      
      let userInfo;
      if (isSelf) {
        // 查看自己的资料，使用getUserInfo
        userInfo = await getUserInfo();
        console.log('UserProfileScreen getUserInfo result:', userInfo);
      } else {
        // 查看他人资料，使用fetchUserInfo
        console.log('Fetching user info for:', username);
        userInfo = await fetchUserInfo(username!);
        console.log('UserProfileScreen fetchUserInfo result:', userInfo);
      }
      
      if (userInfo) {
        setUser(userInfo);
        console.log('UserProfileScreen loaded:', userInfo.username, 'isSelf:', isSelf, 'posts:', userInfo.recentPosts?.length || 0);
      } else {
        setError('无法加载用户信息');
      }
    } catch (err: any) {
      console.error('Load user info error:', err);
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUserInfo(isCurrentUser);
    setRefreshing(false);
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

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorHint}>下拉刷新重试</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#007AFF']}
            tintColor="#007AFF"
          />
        }
      >
        {/* 顶部背景图片区域 */}
        <View style={styles.headerBackground}>
          {backgroundImage && (
            <ImageBackground
              source={{uri: backgroundImage}}
              style={StyleSheet.absoluteFill}
              imageStyle={styles.headerBackgroundImage}
            />
          )}
          {/* 返回按钮和更多按钮 */}
          <View style={styles.headerTopBar}>
            <TouchableOpacity 
              style={styles.topBarButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.topBarIcon}>←</Text>
            </TouchableOpacity>
            <View style={styles.topBarActions}>
              <TouchableOpacity 
                style={styles.topBarButton}
                onPress={() => Alert.alert('提示', '搜索功能开发中')}
              >
                <Text style={styles.topBarIcon}>🔍</Text>
              </TouchableOpacity>
              <View style={styles.topBarSpacer} />
              <TouchableOpacity 
                style={styles.topBarButton}
                onPress={() => {
                  if (isCurrentUser) {
                    Alert.alert('更多功能', '编辑资料\n更换背景图片\n设置', [
                      {text: '取消', style: 'cancel'},
                      {text: '编辑资料', onPress: () => Alert.alert('提示', '编辑资料功能开发中')},
                      {text: '更换背景图片', onPress: () => Alert.alert('提示', '更换背景图片功能开发中')},
                    ]);
                  } else {
                    Alert.alert('提示', '更多功能开发中');
                  }
                }}
              >
                <Text style={styles.topBarIcon}>⋮</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 底部用户信息区域 */}
          <View style={styles.headerBottomSection}>
            <View style={styles.avatarAndNicknameRow}>
              {/* 头像 */}
              <View style={styles.avatarWrapper}>
                {user?.avatar ? (
                  <ImageWithPlaceholder
                    uri={user.avatar}
                    style={styles.avatar}
                    resizeMode="cover"
                    isAvatar={true}
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>
                      {(user?.username || username)?.charAt(0).toUpperCase() || 'U'}
                    </Text>
                  </View>
                )}
              </View>
              
              {/* 昵称（如果存在且与用户名不同且不太长） */}
              {user?.nickname && user.nickname !== user.username && !isNicknameTooLong(user.nickname) && (
                <View style={styles.nicknameContainer}>
                  <Text style={styles.nicknameOnHeader}>{user.nickname}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* 用户名和签名信息区域 */}
        <View style={styles.userInfoSection}>
          {/* 用户名行 */}
          <View style={styles.userNameRow}>
            <Text style={styles.username}>{user?.username || username}</Text>
            {user?.gender !== undefined && user.gender !== 0 && (
              <Text style={[
                styles.genderIcon,
                user.gender === 1 ? styles.genderMale : styles.genderFemale
              ]}>
                {user.gender === 1 ? '♂' : '♀'}
              </Text>
            )}
          </View>

          {/* 头衔标签和注册时间行 */}
          <View style={styles.badgesRow}>
            {user?.levelTitle && (
              <View style={styles.levelBadge}>
                <Text style={styles.levelText}>Lv{user.levelTitle}</Text>
              </View>
            )}
            {user?.title && (
              <Text style={styles.titleText}>⭐{user.title}</Text>
            )}
            {user?.createTime && (
              <View style={styles.registerTimeBadge}>
                <Text style={styles.registerTimeText}>
                  注册 {new Date(user.createTime).toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                  }).replace(/\//g, '-')}
                </Text>
              </View>
            )}
          </View>

          {/* 长昵称（如果存在、与用户名不同且太长） */}
          {user?.nickname && user.nickname !== user.username && isNicknameTooLong(user.nickname) && (
            <Text style={styles.longNickname}>{user.nickname}</Text>
          )}

          {/* 最近登录信息 */}
          {user?.loginTime && (() => {
            // 客人态且有文章列表时，判断是否使用文章发布时间
            if (!isCurrentUser && user?.recentPosts && user.recentPosts.length > 0) {
              const latestPost = user.recentPosts[0];
              if (latestPost?.postTime) {
                const loginTime = new Date(user.loginTime).getTime();
                const postTime = new Date(latestPost.postTime).getTime();
                const oneDayInMs = 24 * 60 * 60 * 1000;
                
                // 如果登录时间早于文章发布时间1天以上，使用文章发布时间
                if (postTime - loginTime > oneDayInMs) {
                  return (
                    <Text style={styles.loginTimeText}>
                      最近登录: {formatRelativeTime(latestPost.postTime)}
                    </Text>
                  );
                }
              }
            }
            
            // 默认显示登录时间
            return (
              <Text style={styles.loginTimeText}>
                最近登录: {formatRelativeTime(user.loginTime)}
              </Text>
            );
          })()}

          {/* 个性签名 */}
          {user?.signature && (
            <Text style={styles.signatureText} numberOfLines={2}>
              {stripHtmlTags(user.signature)}
            </Text>
          )}

          {/* IP属地 */}
          {user?.city && (
            <Text style={styles.locationText}>📍IP属地: {user.city}</Text>
          )}
        </View>

        {/* 统计数据行 */}
        <View style={styles.statsSection}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{Math.floor((user?.fansCount || 0) / 1000) / 10}万</Text>
            <Text style={styles.statLabel}>粉丝</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{user?.friendCount || 0}</Text>
            <Text style={styles.statLabel}>关注</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{user?.score || 0}</Text>
            <Text style={styles.statLabel}>积分</Text>
          </View>
        </View>

        {/* 操作按钮行 */}
        <View style={styles.actionButtonsRow}>
          {isCurrentUser ? (
            <TouchableOpacity style={styles.fullWidthButton}>
              <Text style={styles.secondaryButtonText}>编辑资料</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity 
                style={styles.primaryButton}
                onPress={() => Alert.alert('提示', '关注功能开发中')}
              >
                <Text style={styles.primaryButtonText}>+ 关注</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.secondaryButton}
                onPress={() => Alert.alert('提示', '发消息功能开发中')}
              >
                <Text style={styles.secondaryButtonText}>✉️ 发消息</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* 个性签名（如果在上面没有显示） */}
        {user?.signature ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>个性签名</Text>
            <View style={styles.card}>
              <Text style={styles.signatureText}>{user.signature}</Text>
            </View>
          </View>
        ) : null}

        {/* 其他信息 */}
        {(user?.city || user?.email || user?.mobile) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>其他信息</Text>
            <View style={styles.card}>
              {user?.city ? (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>地区</Text>
                    <Text style={styles.infoValue}>{user.city}</Text>
                  </View>
                  {(user?.mobile || user?.email) ? <View style={styles.divider} /> : null}
                </>
              ) : null}
              {user?.mobile ? (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>手机号</Text>
                    <Text style={styles.infoValue}>{user.mobile}</Text>
                  </View>
                  {user?.email ? <View style={styles.divider} /> : null}
                </>
              ) : null}
              {user?.email ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>邮箱</Text>
                  <Text style={styles.infoValue}>{user.email}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* TA的帖子（仅客人态显示） */}
        {!isCurrentUser && user?.recentPosts && user.recentPosts.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>TA的帖子</Text>
              <Text style={styles.postCountBadge}>{user.postCount || 0}篇</Text>
            </View>
            <View style={styles.card}>
              {user.recentPosts.map((post: any, index: number) => (
                <View key={post.id}>
                  <TouchableOpacity
                    style={styles.postItem}
                    onPress={() => {
                      // 导航到帖子详情
                      if (post.boardName && (post.topicId || post.id)) {
                        (navigation as any).navigate('PostDetail', {
                          board: post.boardName,
                          postId: post.topicId || post.id,
                        });
                      } else {
                        Alert.alert('提示', '帖子信息不完整，无法跳转');
                      }
                    }}
                  >
                    <Text style={styles.postSubject} numberOfLines={2}>
                      {post.subject}
                    </Text>
                    {post.body ? (
                      <Text style={styles.postBody} numberOfLines={3}>
                        {stripHtmlTags(post.body)}
                      </Text>
                    ) : null}
                    <View style={styles.postMeta}>
                      <Text style={styles.postBoard}>{post.boardTitle || post.boardName}</Text>
                      <Text style={styles.postTime}>
                        {post.postTime ? formatRelativeTime(post.postTime) : ''}
                      </Text>
                      {post.replyCount > 0 ? (
                        <Text style={styles.postReplyCount}>{post.replyCount}回复</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                  {index < (user.recentPosts?.length || 0) - 1 ? (
                    <View style={styles.divider} />
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  errorHint: {
    fontSize: 14,
    color: '#999',
  },
  content: {
    flex: 1,
  },
  // 新的背景图片区域
  headerBackground: {
    width: SCREEN_WIDTH,
    height: 240,
    backgroundColor: '#E8F4FF', // 淡蓝色背景，与项目主题一致
  },
  headerBackgroundImage: {
    resizeMode: 'cover',
  },
  // 顶部工具栏
  headerTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50, // 状态栏高度
    paddingBottom: 8,
  },
  topBarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)', // 更不透明的白色背景
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  topBarIcon: {
    fontSize: 20,
    color: '#333',
  },
  topBarActions: {
    flexDirection: 'row',
  },
  topBarSpacer: {
    width: 12,
  },
  // 底部头像区域
  headerBottomSection: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 20,
    paddingLeft: 20,
  },
  avatarAndNicknameRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '600',
    color: '#fff',
  },
  nicknameContainer: {
    marginLeft: 16,
    flex: 1,
  },
  nicknameOnHeader: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: {width: 0, height: 0},
    textShadowRadius: 8,
  },
  // 用户信息区域
  userInfoSection: {
    backgroundColor: '#fff',
    padding: 20,
    paddingTop: 16,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  username: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
    marginRight: 8,
  },
  genderIcon: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  genderMale: {
    color: '#1890ff',
  },
  genderFemale: {
    color: '#ff4d8f',
  },
  // 标签行
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  levelBadge: {
    backgroundColor: '#E8F4FF', // 淡蓝色背景
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  levelText: {
    fontSize: 11,
    color: '#007AFF', // 蓝色文字
    fontWeight: '600',
  },
  titleText: {
    fontSize: 12,
    color: '#FF8C00', // 橙色
    fontWeight: '600',
    marginRight: 6,
    marginBottom: 4,
  },
  customBadge: {
    backgroundColor: '#FFF7E6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  customBadgeText: {
    fontSize: 11,
    color: '#FF8C00',
    fontWeight: '600',
  },
  verifiedBadge: {
    backgroundColor: '#E6F7FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  verifiedText: {
    fontSize: 12,
    color: '#1890FF', // 蓝色
    fontWeight: '600',
    marginRight: 6,
    marginBottom: 4,
  },
  emojiIcon: {
    fontSize: 14,
    marginLeft: 4,
  },
  registerTimeBadge: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
    marginBottom: 4,
  },
  registerTimeText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  longNickname: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 8,
  },
  loginTimeText: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  postLocationText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  signatureText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 8,
  },
  locationText: {
    fontSize: 13,
    color: '#999',
  },
  // 统计数据区域
  statsSection: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 40,
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#666',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#e0e0e0',
  },
  // 操作按钮区域
  actionButtonsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#007AFF', // 蓝色主按钮
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#007AFF', // 蓝色边框
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007AFF', // 蓝色文字
  },
  fullWidthButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoLabel: {
    fontSize: 15,
    color: '#000',
  },
  infoValue: {
    fontSize: 15,
    color: '#666',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#f0f0f0',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  postCountBadge: {
    fontSize: 13,
    color: '#666',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  emptyPostsContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyPostsText: {
    fontSize: 15,
    color: '#999',
    marginBottom: 8,
  },
  emptyPostsHint: {
    fontSize: 13,
    color: '#ccc',
  },
  postItem: {
    paddingVertical: 12,
  },
  postSubject: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
    marginBottom: 6,
    lineHeight: 20,
  },
  postBody: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 8,
  },
  postMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  postBoard: {
    fontSize: 13,
    color: '#007AFF',
    marginRight: 12,
  },
  postTime: {
    fontSize: 13,
    color: '#999',
    marginRight: 12,
  },
  postReplyCount: {
    fontSize: 13,
    color: '#999',
  },
});

export default UserProfileScreen;

