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
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActionSheetIOS,
} from 'react-native';
import {useRoute, useNavigation} from '@react-navigation/native';
import {getUserInfo, fetchUserInfo, sendMessage, addBlack, removeBlack, addFriend, removeFriend, checkIsHerBlack, getFriendsList, getBlackList} from '../services/api';
import {User} from '../types';
import {formatRelativeTime} from '../utils/timeFormat';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getCache, setCache, getCacheWithTimestamp} from '../services/cacheManager';
import {
  RESPONSIVE,
  scaleWidth,
  scaleHeight,
  scaleFont,
  scaleModerate,
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  responsiveSize,
} from '../utils/responsive';

const SCREEN_WIDTH = RESPONSIVE.SCREEN_WIDTH;

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
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [isInBlacklist, setIsInBlacklist] = useState(false);
  const [blacklistLoading, setBlacklistLoading] = useState(false);

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
      
      const userInfo = await loadUserInfo(isSelf);
      
      // 如果是查看他人资料，检查关注状态和黑名单状态
      // 传入userInfo，因为此时user状态可能还没更新
      if (!isSelf && username) {
        await checkFollowingStatus(username, false, userInfo);
        await checkBlacklistStatus(username, false, userInfo);
      }
    } catch (err) {
      console.error('Check and load user info error:', err);
    }
  };

  // 检查目标用户是否在当前用户的黑名单中
  // userInfo参数用于传入刚获取的用户信息，避免user状态未更新的问题
  const checkBlacklistStatus = async (targetUsername: string, forceRefresh: boolean = false, userInfo?: User | null) => {
    try {
      const currentUsername = await AsyncStorage.getItem('username');
      if (!currentUsername) {
        console.log('Not logged in, skip checking blacklist status');
        return;
      }
      
      const result = await getBlackList(forceRefresh);
      if (result.success && result.blacklist) {
        // 检查目标用户的ID或用户名是否在黑名单中
        // 优先使用传入的userInfo，其次使用user状态
        const targetUserId = userInfo?.id || user?.id || '';
        const isInList = result.blacklist.some(
          (item: any) => item.id === targetUserId || item.username === targetUsername
        );
        setIsInBlacklist(isInList);
        console.log('Blacklist status for', targetUsername, ':', isInList, 'userId:', targetUserId);
      }
    } catch (error) {
      console.error('Check blacklist status error:', error);
    }
  };

  // 检查是否已关注该用户
  // userInfo参数用于传入刚获取的用户信息，避免user状态未更新的问题
  const checkFollowingStatus = async (targetUsername: string, forceRefresh: boolean = false, userInfo?: User | null) => {
    try {
      const currentUsername = await AsyncStorage.getItem('username');
      if (!currentUsername) {
        console.log('Not logged in, skip checking following status');
        return;
      }
      
      const result = await getFriendsList(currentUsername, 1, forceRefresh);
      if (result.success && result.friends) {
        // 检查目标用户的ID或用户名是否在关注列表中
        // friends现在是用户对象数组，包含id和username字段
        // 优先使用传入的userInfo，其次使用user状态
        const targetUserId = userInfo?.id || user?.id || '';
        const isInList = result.friends.some(
          (friend: any) => friend.id === targetUserId || friend.username === targetUsername
        );
        setIsFollowing(isInList);
        console.log('Following status for', targetUsername, ':', isInList, 'userId:', targetUserId, 'friends count:', result.friends.length);
      }
    } catch (error) {
      console.error('Check following status error:', error);
    }
  };

  // 处理拉黑/移除黑名单
  const handleBlockUser = async () => {
    const userId = user?.id || username || '';
    const targetUsername = user?.username || username || '';

    if (isInBlacklist) {
      // 移除黑名单
      Alert.alert(
        '移除黑名单',
        `确定要将 ${targetUsername} 从黑名单中移除吗？`,
        [
          {text: '取消', style: 'cancel'},
          {
            text: '确定',
            onPress: async () => {
              try {
                setBlacklistLoading(true);
                const result = await removeBlack(userId);
                if (result.success) {
                  setIsInBlacklist(false);
                  Alert.alert('成功', result.message || '已移除黑名单');
                  // 强制刷新黑名单缓存
                  await checkBlacklistStatus(targetUsername, true, user);
                } else {
                  Alert.alert('失败', result.message || '移除失败');
                }
              } catch (err: any) {
                console.error('Remove from blacklist error:', err);
                if (err.message === 'LOGIN_EXPIRED') {
                  Alert.alert(
                    '登录已过期',
                    '请重新登录后操作',
                    [
                      {text: '去登录', onPress: () => navigation.navigate('Login' as never)},
                      {text: '取消', style: 'cancel'},
                    ]
                  );
                } else {
                  Alert.alert('错误', '移除失败，请稍后重试');
                }
              } finally {
                setBlacklistLoading(false);
              }
            },
          },
        ]
      );
    } else {
      // 拉黑
      Alert.alert(
        '确认拉黑',
        `确定要拉黑 ${targetUsername} 吗？拉黑后对方将无法关注您或给您发送消息。`,
        [
          {text: '取消', style: 'cancel'},
          {
            text: '确定',
            style: 'destructive',
            onPress: async () => {
              try {
                setBlacklistLoading(true);
                const result = await addBlack(userId);
                if (result.success) {
                  setIsInBlacklist(true);
                  Alert.alert('成功', result.message || '拉黑成功');
                  // 强制刷新黑名单缓存
                  await checkBlacklistStatus(targetUsername, true, user);
                } else {
                  Alert.alert('失败', result.message || '拉黑失败');
                }
              } catch (err: any) {
                console.error('Block user error:', err);
                if (err.message === 'LOGIN_EXPIRED') {
                  Alert.alert(
                    '登录已过期',
                    '请重新登录后操作',
                    [
                      {text: '去登录', onPress: () => navigation.navigate('Login' as never)},
                      {text: '取消', style: 'cancel'},
                    ]
                  );
                } else {
                  Alert.alert('错误', '拉黑失败，请稍后重试');
                }
              } finally {
                setBlacklistLoading(false);
              }
            },
          },
        ]
      );
    }
  };

  // 处理关注/取消关注
  const handleFollowUser = async () => {
    if (!user?.id && !username) {
      Alert.alert('错误', '无法获取用户信息');
      return;
    }

    const userId = user?.id || '';
    const targetUsername = user?.username || username || '';

    if (isFollowing) {
      // 取消关注
      Alert.alert(
        '取消关注',
        `确定要取消关注 ${targetUsername} 吗？`,
        [
          {text: '取消', style: 'cancel'},
          {
            text: '确定',
            onPress: async () => {
              try {
                setFollowingLoading(true);
                const result = await removeFriend(userId);
                if (result.success) {
                  setIsFollowing(false);
                  Alert.alert('成功', result.message || '已取消关注');
                  // 强制刷新关注列表缓存
                  await checkFollowingStatus(targetUsername, true, user);
                } else {
                  Alert.alert('失败', result.message || '取消关注失败');
                }
              } catch (err: any) {
                console.error('Unfollow error:', err);
                if (err.message === 'LOGIN_EXPIRED') {
                  Alert.alert(
                    '登录已过期',
                    '请重新登录后操作',
                    [
                      {text: '去登录', onPress: () => navigation.navigate('Login' as never)},
                      {text: '取消', style: 'cancel'},
                    ]
                  );
                } else {
                  Alert.alert('错误', '取消关注失败，请稍后重试');
                }
              } finally {
                setFollowingLoading(false);
              }
            },
          },
        ]
      );
    } else {
      // 关注：先检查是否被对方拉黑
      try {
        setFollowingLoading(true);
        
        // 检查是否被对方拉黑
        const blackResult = await checkIsHerBlack(userId);
        if (blackResult.isBlack) {
          Alert.alert('无法关注', '对方已将您拉黑，无法关注');
          return;
        }
        
        // 执行关注
        const result = await addFriend(userId);
        if (result.success) {
          setIsFollowing(true);
          Alert.alert('成功', result.message || '关注成功');
          // 强制刷新关注列表缓存
          await checkFollowingStatus(targetUsername, true, user);
        } else {
          Alert.alert('失败', result.message || '关注失败');
        }
      } catch (err: any) {
        console.error('Follow error:', err);
        if (err.message === 'LOGIN_EXPIRED') {
          Alert.alert(
            '登录已过期',
            '请重新登录后操作',
            [
              {text: '去登录', onPress: () => navigation.navigate('Login' as never)},
              {text: '取消', style: 'cancel'},
            ]
          );
        } else {
          Alert.alert('错误', '关注失败，请稍后重试');
        }
      } finally {
        setFollowingLoading(false);
      }
    }
  };

  useEffect(() => {
    checkAndLoadUserInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const loadUserInfo = async (isSelf: boolean = isCurrentUser, forceRefresh: boolean = false): Promise<User | null> => {
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
        
        // 如果不是强制刷新，先尝试从缓存获取
        if (!forceRefresh) {
          const cachedData = getCacheWithTimestamp<any>('otherUserInfo', username!);
          if (cachedData) {
            console.log('UserProfileScreen: Using cached data for', username, 'age:', Math.floor((Date.now() - cachedData.timestamp) / 1000), 's');
            setUser(cachedData.data);
            setLoading(false);
            
            // 异步更新缓存
            fetchUserInfo(username!).then(freshData => {
              if (freshData) {
                console.log('UserProfileScreen: Background update for', username);
                setUser(freshData);
                setCache('otherUserInfo', username!, freshData);
                // 使用新数据重新检查关注状态，确保状态同步
                checkFollowingStatus(username!, false, freshData);
              }
            }).catch(err => {
              console.error('Background update error:', err);
            });
            
            return cachedData.data; // 返回缓存数据
          }
        }
        
        // 没有缓存或强制刷新，从API获取
        userInfo = await fetchUserInfo(username!);
        console.log('UserProfileScreen fetchUserInfo result:', userInfo);
        
        // 保存到缓存
        if (userInfo) {
          setCache('otherUserInfo', username!, userInfo);
        }
      }
      
      if (userInfo) {
        setUser(userInfo);
        console.log('UserProfileScreen loaded:', userInfo.username, 'isSelf:', isSelf, 'posts:', userInfo.recentPosts?.length || 0);
        return userInfo; // 返回用户信息
      } else {
        setError('无法加载用户信息');
        return null;
      }
    } catch (err: any) {
      console.error('Load user info error:', err);
      setError(err.message || '加载失败');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // 下拉刷新时强制从API获取最新数据
    const userInfo = await loadUserInfo(isCurrentUser, true);
    // 如果是查看他人资料，强制刷新关注状态和黑名单状态
    if (!isCurrentUser && username) {
      await checkFollowingStatus(username, true, userInfo);
      await checkBlacklistStatus(username, true, userInfo);
    }
    setRefreshing(false);
  };

  // 发送消息
  const handleSendMessage = async () => {
    if (!messageSubject.trim()) {
      Alert.alert('提示', '请输入主题');
      return;
    }
    if (!messageBody.trim()) {
      Alert.alert('提示', '请输入消息内容');
      return;
    }

    try {
      setSendingMessage(true);
      const result = await sendMessage(
        user?.username || username || '',
        messageBody.trim(),
        messageSubject.trim()
      );

      if (result.success) {
        Alert.alert('成功', result.message || '消息发送成功');
        setShowMessageModal(false);
        setMessageSubject('');
        setMessageBody('');
      } else {
        Alert.alert('失败', result.message || '消息发送失败');
      }
    } catch (err: any) {
      console.error('Send message error:', err);
      if (err.message === 'LOGIN_EXPIRED') {
        Alert.alert(
          '登录已过期',
          '请重新登录后发送消息',
          [
            {
              text: '去登录',
              onPress: () => navigation.navigate('Login' as never),
            },
            {
              text: '取消',
              style: 'cancel',
            },
          ]
        );
      } else {
        Alert.alert('错误', '发送消息失败，请稍后重试');
      }
    } finally {
      setSendingMessage(false);
    }
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
                    // 使用ActionSheetIOS实现垂直菜单
                    const blockActionText = isInBlacklist ? '移除黑名单' : '拉黑';
                    if (Platform.OS === 'ios') {
                      ActionSheetIOS.showActionSheetWithOptions(
                        {
                          options: ['取消', blockActionText],
                          destructiveButtonIndex: isInBlacklist ? undefined : 1,
                          cancelButtonIndex: 0,
                          title: '更多操作',
                        },
                        (buttonIndex) => {
                          if (buttonIndex === 1) {
                            handleBlockUser();
                          }
                        }
                      );
                    } else {
                      // Android使用Alert
                      Alert.alert('更多操作', '', [
                        {
                          text: blockActionText,
                          style: isInBlacklist ? undefined : 'destructive',
                          onPress: handleBlockUser,
                        },
                        {text: '取消', style: 'cancel'},
                      ]);
                    }
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
                style={[styles.primaryButton, isFollowing && styles.primaryButtonFollowed]}
                onPress={handleFollowUser}
                disabled={followingLoading}
              >
                {followingLoading ? (
                  <ActivityIndicator size="small" color={isFollowing ? '#007AFF' : '#fff'} />
                ) : (
                  <Text style={[styles.primaryButtonText, isFollowing && styles.primaryButtonTextFollowed]}>
                    {isFollowing ? '✓ 已关注' : '+ 关注'}
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.secondaryButton}
                onPress={() => setShowMessageModal(true)}
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

      {/* 发消息弹窗 */}
      <Modal
        visible={showMessageModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMessageModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackground}
            activeOpacity={1}
            onPress={() => setShowMessageModal(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              style={styles.modalContainer}
            >
              {/* 标题栏 */}
              <View style={styles.modalHeader}>
                <TouchableOpacity
                  onPress={() => setShowMessageModal(false)}
                  style={styles.modalCloseButton}
                >
                  <Text style={styles.modalCloseText}>取消</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>发送消息</Text>
                <View style={styles.modalPlaceholder} />
              </View>

              {/* 收件人 */}
              <View style={styles.modalRecipient}>
                <Text style={styles.modalRecipientLabel}>收件人：</Text>
                <Text style={styles.modalRecipientName}>{user?.username || username}</Text>
              </View>

              {/* 主题输入框 */}
              <View style={styles.modalInputContainer}>
                <TextInput
                  style={styles.modalSubjectInput}
                  placeholder="主题"
                  placeholderTextColor="#999"
                  value={messageSubject}
                  onChangeText={setMessageSubject}
                  maxLength={100}
                />
              </View>

              {/* 内容输入框 */}
              <View style={styles.modalBodyContainer}>
                <TextInput
                  style={styles.modalBodyInput}
                  placeholder="请输入消息内容"
                  placeholderTextColor="#999"
                  value={messageBody}
                  onChangeText={setMessageBody}
                  multiline
                  textAlignVertical="top"
                  maxLength={5000}
                />
                {/* 发送按钮 */}
                <TouchableOpacity
                  style={[
                    styles.modalSendButton,
                    (!messageSubject.trim() || !messageBody.trim() || sendingMessage) && styles.modalSendButtonDisabled
                  ]}
                  onPress={handleSendMessage}
                  disabled={!messageSubject.trim() || !messageBody.trim() || sendingMessage}
                >
                  {sendingMessage ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.modalSendButtonText}>发送</Text>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
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
    height: responsiveSize(200, 240, 260, 300),
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
    paddingHorizontal: SPACING.lg,
    paddingTop: RESPONSIVE.STATUS_BAR_HEIGHT + SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  topBarButton: {
    width: scaleModerate(40),
    height: scaleModerate(40),
    borderRadius: scaleModerate(20),
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
    fontSize: FONT_SIZE.xl,
    color: '#333',
  },
  topBarActions: {
    flexDirection: 'row',
  },
  topBarSpacer: {
    width: SPACING.md,
  },
  // 底部头像区域
  headerBottomSection: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: SPACING.xl,
    paddingLeft: SPACING.xl,
  },
  avatarAndNicknameRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: responsiveSize(80, 100, 110, 120),
    height: responsiveSize(80, 100, 110, 120),
    borderRadius: responsiveSize(40, 50, 55, 60),
  },
  avatarPlaceholder: {
    width: responsiveSize(80, 100, 110, 120),
    height: responsiveSize(80, 100, 110, 120),
    borderRadius: responsiveSize(40, 50, 55, 60),
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: responsiveSize(32, 40, 44, 48),
    fontWeight: '600',
    color: '#fff',
  },
  nicknameContainer: {
    marginLeft: SPACING.lg,
    flex: 1,
  },
  nicknameOnHeader: {
    fontSize: responsiveSize(20, 24, 26, 28),
    fontWeight: 'bold',
    color: '#000',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: {width: 0, height: 0},
    textShadowRadius: 8,
  },
  // 用户信息区域
  userInfoSection: {
    backgroundColor: '#fff',
    padding: SPACING.xl,
    paddingTop: SPACING.lg,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  username: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: '#000',
    marginRight: SPACING.sm,
  },
  genderIcon: {
    fontSize: FONT_SIZE.xl,
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
    marginBottom: SPACING.md,
    flexWrap: 'wrap',
  },
  levelBadge: {
    backgroundColor: '#E8F4FF', // 淡蓝色背景
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    marginRight: SPACING.xs + 2,
    marginBottom: SPACING.xs,
  },
  levelText: {
    fontSize: FONT_SIZE.xs,
    color: '#007AFF', // 蓝色文字
    fontWeight: '600',
  },
  titleText: {
    fontSize: FONT_SIZE.sm,
    color: '#FF8C00', // 橙色
    fontWeight: '600',
    marginRight: SPACING.xs + 2,
    marginBottom: SPACING.xs,
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
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    marginLeft: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  registerTimeText: {
    fontSize: FONT_SIZE.xs,
    color: '#666',
    fontWeight: '500',
  },
  longNickname: {
    fontSize: FONT_SIZE.md,
    color: '#666',
    lineHeight: FONT_SIZE.xl,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  loginTimeText: {
    fontSize: FONT_SIZE.sm,
    color: '#666',
    marginBottom: SPACING.sm,
  },
  postLocationText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  signatureText: {
    fontSize: FONT_SIZE.md,
    color: '#666',
    lineHeight: FONT_SIZE.xl,
    marginBottom: SPACING.sm,
  },
  locationText: {
    fontSize: FONT_SIZE.sm,
    color: '#999',
  },
  // 统计数据区域
  statsSection: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xxxl + 8,
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: SPACING.xs,
  },
  statLabel: {
    fontSize: FONT_SIZE.sm,
    color: '#666',
  },
  statDivider: {
    width: 1,
    height: scaleModerate(30),
    backgroundColor: '#e0e0e0',
  },
  // 操作按钮区域
  actionButtonsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#007AFF', // 蓝色主按钮
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  primaryButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: '#fff',
  },
  primaryButtonFollowed: {
    backgroundColor: '#E8F4FF',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  primaryButtonTextFollowed: {
    color: '#007AFF',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#007AFF', // 蓝色边框
  },
  secondaryButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: '#007AFF', // 蓝色文字
  },
  fullWidthButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  section: {
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
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
    paddingVertical: SPACING.md,
  },
  infoLabel: {
    fontSize: FONT_SIZE.lg,
    color: '#000',
  },
  infoValue: {
    fontSize: FONT_SIZE.lg,
    color: '#666',
    textAlign: 'right',
    flex: 1,
    marginLeft: SPACING.lg,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#f0f0f0',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  postCountBadge: {
    fontSize: FONT_SIZE.sm,
    color: '#666',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
  },
  emptyPostsContainer: {
    paddingVertical: SPACING.xxxl + 8,
    alignItems: 'center',
  },
  emptyPostsText: {
    fontSize: FONT_SIZE.lg,
    color: '#999',
    marginBottom: SPACING.sm,
  },
  emptyPostsHint: {
    fontSize: FONT_SIZE.sm,
    color: '#ccc',
  },
  postItem: {
    paddingVertical: SPACING.md,
  },
  postSubject: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '500',
    color: '#333',
    marginBottom: SPACING.xs + 2,
    lineHeight: FONT_SIZE.xl,
  },
  postBody: {
    fontSize: FONT_SIZE.md,
    color: '#666',
    lineHeight: FONT_SIZE.xl,
    marginBottom: SPACING.sm,
  },
  postMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  postBoard: {
    fontSize: FONT_SIZE.sm,
    color: '#007AFF',
    marginRight: SPACING.md,
  },
  postTime: {
    fontSize: FONT_SIZE.sm,
    color: '#999',
    marginRight: SPACING.md,
  },
  postReplyCount: {
    fontSize: FONT_SIZE.sm,
    color: '#999',
  },
  // 发消息弹窗样式
  modalOverlay: {
    flex: 1,
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: SCREEN_WIDTH * 0.9,
    maxWidth: responsiveSize(400, 500, 550, 600),
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  modalCloseButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  modalCloseText: {
    fontSize: FONT_SIZE.lg,
    color: '#007AFF',
  },
  modalTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    color: '#000',
  },
  modalPlaceholder: {
    width: scaleModerate(50),
  },
  modalRecipient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: '#f8f8f8',
  },
  modalRecipientLabel: {
    fontSize: FONT_SIZE.lg,
    color: '#666',
  },
  modalRecipientName: {
    fontSize: FONT_SIZE.lg,
    color: '#000',
    fontWeight: '500',
  },
  modalInputContainer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  modalSubjectInput: {
    fontSize: FONT_SIZE.lg,
    color: '#000',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: '#f8f8f8',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  modalBodyContainer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    minHeight: responsiveSize(180, 200, 220, 250),
  },
  modalBodyInput: {
    fontSize: FONT_SIZE.lg,
    color: '#000',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: '#f8f8f8',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minHeight: responsiveSize(130, 150, 170, 200),
    maxHeight: responsiveSize(250, 300, 350, 400),
  },
  modalSendButton: {
    position: 'absolute',
    right: SPACING.xxl + 8,
    bottom: SPACING.xxl + 8,
    backgroundColor: '#007AFF',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.md,
    minWidth: scaleModerate(70),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  modalSendButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  modalSendButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: '#fff',
  },
});

export default UserProfileScreen;

