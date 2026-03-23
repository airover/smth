import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  RefreshControl,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getUserInfo, logout} from '../services/api';
import {getMessages} from '../services/dataFetcher';
import {User} from '../types';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import {useTheme} from '../components/ThemedComponents';
import {
  HistoryIcon,
  StarIcon,
  ArticleIcon,
  UsersIcon,
  UserIcon,
  BanIcon,
  MailIcon,
  SettingsIcon,
} from '../components/SvgIcons';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  scaleModerate,
} from '../utils/responsive';


const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [username, setUsername] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [unreadMailCount, setUnreadMailCount] = useState<number>(0);

  useEffect(() => {
    loadUserInfo(false);
  }, []);

  // 页面获得焦点时重新加载用户信息
  useFocusEffect(
    useCallback(() => {
      loadUserInfo(false);
      loadUnreadMailCount();
    }, [])
  );

  // 获取未读邮件数量
  const loadUnreadMailCount = async () => {
    try {
      const loginStatus = await AsyncStorage.getItem('isLoggedIn');
      if (loginStatus !== 'true') {
        setUnreadMailCount(0);
        return;
      }
      const messages = await getMessages(0);
      const count = messages.reduce((sum, mail) => sum + (mail.unread || 0), 0);
      setUnreadMailCount(count);
    } catch (error) {
      console.log('loadUnreadMailCount error:', error);
      // 静默失败，不影响页面显示
    }
  };

  const loadUserInfo = async (forceRefresh: boolean = false) => {
    try {
      // 先检查本地登录状态
      const loginStatus = await AsyncStorage.getItem('isLoggedIn');
      const isStoredLoggedIn = loginStatus === 'true';
      
      if (!isStoredLoggedIn) {
        // 如果明确未登录，清除状态并返回
        setIsLoggedIn(false);
        setUsername('');
        setUser(null);
        setLoading(false);
        return;
      }
      
      // 已登录，调用 getUserInfo（利用其内部的缓存机制）
      // getUserInfo 会自动处理：内存缓存 -> 持久化缓存 -> 服务器获取
      // forceRefresh=true 时会跳过缓存直接从服务器获取
      const userInfo = await getUserInfo(forceRefresh);
      console.log('SettingsScreen getUserInfo result:', userInfo);
      
      if (userInfo && userInfo.username) {
        // 更新UI状态
        setUser(userInfo);
        setUsername(userInfo.username);
        
        // 根据 API 返回的 isLoggedIn 字段更新登录状态
        if (userInfo.isLoggedIn === true) {
          setIsLoggedIn(true);
        } else if (userInfo.isLoggedIn === false) {
          // API 明确返回未登录，可能是 Cookie 过期
          setIsLoggedIn(false);
          setUser(null);
          setUsername('');
        } else {
          // isLoggedIn 未定义，保持已登录状态（因为本地存储显示已登录）
          setIsLoggedIn(true);
        }
      } else {
        // API 返回 null，但本地显示已登录，保持登录状态
        // 显示本地存储的用户名（如果有）
        const storedUsername = await AsyncStorage.getItem('username');
        if (storedUsername) {
          setUsername(storedUsername);
          setUser({username: storedUsername});
          setIsLoggedIn(true);
        } else {
          // 没有任何用户信息，清除登录状态
          setIsLoggedIn(false);
          setUser(null);
          setUsername('');
        }
      }
    } catch (error) {
      console.error('Load user info error:', error);
      
      // 出错时保持本地存储的状态不变（遵循项目规则）
      try {
        const storedUserInfo = await AsyncStorage.getItem('userInfo');
        const storedUsername = await AsyncStorage.getItem('username');
        
        if (storedUserInfo) {
          // 优先使用完整的用户信息缓存
          const cachedUser = JSON.parse(storedUserInfo);
          setUser(cachedUser);
          setUsername(cachedUser.username);
          setIsLoggedIn(true);
        } else if (storedUsername) {
          // 降级方案：只有用户名
          setUsername(storedUsername);
          setUser({username: storedUsername});
          setIsLoggedIn(true);
        }
      } catch (e) {
        console.error('恢复本地用户信息失败:', e);
      }
      
      // 如果是下拉刷新导致的错误，抛出异常让上层处理
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // 下拉刷新 - 遵循项目规则：同步等待后台返回最新数据
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // 使用 forceRefresh=true 强制从服务器获取最新数据
      // 如果服务器返回失败，getUserInfo 会抛出异常，旧缓存不会被清除
      await loadUserInfo(true);
      
      // 刷新成功
      console.log('用户信息刷新成功');
    } catch (error) {
      console.error('Refresh user info error:', error);
      
      // 遵循项目规则：访问接口失败时不更新本地数据
      // 给用户错误提示
      Alert.alert(
        '刷新失败',
        error instanceof Error ? error.message : '网络请求失败，请稍后重试',
        [{text: '确定'}]
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleLogin = () => {
    navigation.navigate('Login');
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

  return (
    <View style={[styles.container, {backgroundColor: theme.background}]}>
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.primary]}
            tintColor={theme.primary}
          />
        }
      >
        {/* 个人信息卡片 - 微信风格 */}
        <View style={styles.firstSection}>
          <TouchableOpacity 
            style={[styles.profileCard, {backgroundColor: theme.cardBackground}]}
            onPress={() => {
              if (isLoggedIn && (user?.username || username)) {
                navigation.navigate('UserProfile', { username: user?.username || username });
              } else if (!isLoggedIn) {
                handleLogin();
              }
            }}
            activeOpacity={0.8}
          >
            <View style={styles.profileLeft}>
              {user?.avatar ? (
                <ImageWithPlaceholder
                  uri={user.avatar}
                  style={styles.avatar}
                  resizeMode="cover"
                  isAvatar={true}
                />
              ) : (
                <View style={[styles.avatarPlaceholder, {backgroundColor: theme.primary}]}>
                  <Text style={styles.avatarText}>
                    {user?.username?.charAt(0).toUpperCase() || username?.charAt(0).toUpperCase() || 'U'}
                  </Text>
                </View>
              )}
              <View style={styles.profileInfo}>
                <Text style={[styles.username, {color: theme.text}]}>
                  {user?.nickname || user?.username || username || '未登录'}
                </Text>
                {(user?.username || username) && (
                  <Text style={[styles.userId, {color: theme.secondaryText}]}>水木社区ID: {user?.username || username}</Text>
                )}
              </View>
            </View>
            <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* 个人内容 */}
        <View style={styles.section}>
          <View style={[styles.card, {backgroundColor: theme.cardBackground}]}>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigation.navigate('BrowsingHistory')}>
              <View style={styles.menuItemLeft}>
              <View style={styles.menuIcon}>
                <HistoryIcon size={22} color={theme.text} />
              </View>
                <Text style={[styles.menuItemText, {color: theme.text}]}>浏览历史</Text>
              </View>
              <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
            </TouchableOpacity>
            <View style={[styles.divider, {backgroundColor: theme.border}]} />
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigation.navigate('Favorites')}>
              <View style={styles.menuItemLeft}>
              <View style={styles.menuIcon}>
                <StarIcon size={22} color={theme.text} />
              </View>
                <Text style={[styles.menuItemText, {color: theme.text}]}>我的收藏</Text>
              </View>
              <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
            </TouchableOpacity>
            <View style={[styles.divider, {backgroundColor: theme.border}]} />
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigation.navigate('MyArticles')}>
              <View style={styles.menuItemLeft}>
              <View style={styles.menuIcon}>
                <ArticleIcon size={22} color={theme.text} />
              </View>
                <Text style={[styles.menuItemText, {color: theme.text}]}>我的文章</Text>
              </View>
              <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 社交关系 */}
        <View style={styles.section}>
          <View style={[styles.card, {backgroundColor: theme.cardBackground}]}>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigation.navigate('MyFollowing')}>
              <View style={styles.menuItemLeft}>
              <View style={styles.menuIcon}>
                <UsersIcon size={22} color={theme.text} />
              </View>
                <Text style={[styles.menuItemText, {color: theme.text}]}>我的关注</Text>
              </View>
              <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
            </TouchableOpacity>
            <View style={[styles.divider, {backgroundColor: theme.border}]} />
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigation.navigate('MyFans')}>
              <View style={styles.menuItemLeft}>
              <View style={styles.menuIcon}>
                <UserIcon size={22} color={theme.text} />
              </View>
                <Text style={[styles.menuItemText, {color: theme.text}]}>我的粉丝</Text>
              </View>
              <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
            </TouchableOpacity>
            <View style={[styles.divider, {backgroundColor: theme.border}]} />
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigation.navigate('Blacklist')}>
              <View style={styles.menuItemLeft}>
              <View style={styles.menuIcon}>
                <BanIcon size={22} color={theme.text} />
              </View>
                <Text style={[styles.menuItemText, {color: theme.text}]}>黑名单</Text>
              </View>
              <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 站内邮箱 */}
        <View style={styles.section}>
          <View style={[styles.card, {backgroundColor: theme.cardBackground}]}>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigation.navigate('Mail')}>
              <View style={styles.menuItemLeft}>
              <View style={styles.menuIcon}>
                <MailIcon size={22} color={theme.text} />
              </View>
                <Text style={[styles.menuItemText, {color: theme.text}]}>站内邮箱</Text>
                {unreadMailCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {unreadMailCount > 99 ? '99+' : unreadMailCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 设置 */}
        <View style={styles.section}>
          <View style={[styles.card, {backgroundColor: theme.cardBackground}]}>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigation.navigate('SettingsDetail')}>
              <View style={styles.menuItemLeft}>
              <View style={styles.menuIcon}>
                <SettingsIcon size={22} color={theme.text} />
              </View>
                <Text style={[styles.menuItemText, {color: theme.text}]}>设置</Text>
              </View>
              <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 底部留白 */}
        <View style={{height: 40}} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor 由主题动态控制
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  firstSection: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  section: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  // 个人信息卡片 - 微信风格
  profileCard: {
    // backgroundColor 由主题动态控制
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: scaleModerate(64),
    height: scaleModerate(64),
    borderRadius: BORDER_RADIUS.xs + 2,
  },
  avatarPlaceholder: {
    width: scaleModerate(64),
    height: scaleModerate(64),
    borderRadius: BORDER_RADIUS.xs + 2,
    // backgroundColor 由主题动态控制
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: '600',
    color: '#fff',
  },
  profileInfo: {
    marginLeft: SPACING.lg,
    flex: 1,
  },
  username: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '600',
    // color 由主题动态控制
    marginBottom: SPACING.xs,
  },
  userId: {
    fontSize: FONT_SIZE.md,
    // color 由主题动态控制
  },
  // 功能卡片
  card: {
    // backgroundColor 由主题动态控制
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuIcon: {
    marginRight: SPACING.md,
    width: scaleModerate(28),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  menuItemText: {
    fontSize: FONT_SIZE.xl,
    // color 由主题动态控制
  },
  badge: {
    backgroundColor: '#FF3B30',
    borderRadius: scaleModerate(10),
    minWidth: scaleModerate(20),
    height: scaleModerate(20),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scaleModerate(6),
    marginLeft: SPACING.sm,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZE.xs,
    fontWeight: 'bold',
  },
  chevron: {
    fontSize: FONT_SIZE.xl,
    // color 由主题动态控制
    fontWeight: '300',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    // backgroundColor 由主题动态控制
    marginLeft: SPACING.lg,
  },
});

export default SettingsScreen;
