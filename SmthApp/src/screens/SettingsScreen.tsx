import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Alert,
  RefreshControl,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getUserInfo, logout} from '../services/api';
import {User} from '../types';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import {useTheme} from '../components/ThemedComponents';

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [username, setUsername] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    loadUserInfo();
  }, []);

  // 页面获得焦点时重新加载用户信息
  useFocusEffect(
    useCallback(() => {
      loadUserInfo();
    }, [])
  );

  const loadUserInfo = async () => {
    try {
      // 先从本地存储读取登录状态和用户名
      const loginStatus = await AsyncStorage.getItem('isLoggedIn');
      const storedUsername = await AsyncStorage.getItem('username');
      const isStoredLoggedIn = loginStatus === 'true';
      
      // 立即设置本地存储的状态
      setIsLoggedIn(isStoredLoggedIn);
      
      if (isStoredLoggedIn && storedUsername) {
        setUsername(storedUsername);
        // 如果有本地用户名，先显示基本信息
        setUser({
          username: storedUsername,
        });
      } else {
        // 如果未登录，清除状态
        setUsername('');
        setUser(null);
        // 如果明确未登录，就不需要继续请求API了
        setLoading(false);
        return;
      }
      
      // 尝试从服务器获取用户信息
      const userInfo = await getUserInfo();
      console.log('SettingsScreen getUserInfo result:', userInfo);
      
      if (userInfo && userInfo.username) {
        // 只有当 API 明确返回 isLoggedIn 为 true 时才更新为已登录
        // 如果 API 返回 isLoggedIn 为 false，保持本地存储的状态
        if (userInfo.isLoggedIn === true) {
          setUser(userInfo);
          setUsername(userInfo.username);
          setIsLoggedIn(true);
        } else if (userInfo.isLoggedIn === false) {
          // API 明确返回未登录，可能是 Cookie 过期
          setIsLoggedIn(false);
          // 清除显示
          setUser(null);
          setUsername('');
        } else {
          // isLoggedIn 未定义，保持本地状态不变
          setUser(userInfo);
          setUsername(userInfo.username);
        }
      }
      // 如果 API 返回 null，保持本地存储的状态不变
    } catch (error) {
      console.error('Load user info error:', error);
      // 出错时保持本地存储的状态不变，不要清除登录状态
    } finally {
      setLoading(false);
    }
  };

  // 下拉刷新
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadUserInfo();
    setRefreshing(false);
  }, []);

  const handleLogin = () => {
    navigation.navigate('Login');
  };


  if (loading) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: theme.background}]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.background}]}>
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
                <Text style={styles.menuIcon}>📜</Text>
                <Text style={[styles.menuItemText, {color: theme.text}]}>浏览历史</Text>
              </View>
              <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
            </TouchableOpacity>
            <View style={[styles.divider, {backgroundColor: theme.border}]} />
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => Alert.alert('提示', '我的收藏功能开发中')}>
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuIcon}>⭐</Text>
                <Text style={[styles.menuItemText, {color: theme.text}]}>我的收藏</Text>
              </View>
              <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
            </TouchableOpacity>
            <View style={[styles.divider, {backgroundColor: theme.border}]} />
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => Alert.alert('提示', '我的文章功能开发中')}>
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuIcon}>📝</Text>
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
              onPress={() => Alert.alert('提示', '我的关注功能开发中')}>
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuIcon}>👥</Text>
                <Text style={[styles.menuItemText, {color: theme.text}]}>我的关注</Text>
              </View>
              <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
            </TouchableOpacity>
            <View style={[styles.divider, {backgroundColor: theme.border}]} />
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => Alert.alert('提示', '我的粉丝功能开发中')}>
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuIcon}>👤</Text>
                <Text style={[styles.menuItemText, {color: theme.text}]}>我的粉丝</Text>
              </View>
              <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
            </TouchableOpacity>
            <View style={[styles.divider, {backgroundColor: theme.border}]} />
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => Alert.alert('提示', '黑名单功能开发中')}>
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuIcon}>🚫</Text>
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
                <Text style={styles.menuIcon}>✉️</Text>
                <Text style={[styles.menuItemText, {color: theme.text}]}>站内邮箱</Text>
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
                <Text style={styles.menuIcon}>⚙️</Text>
                <Text style={[styles.menuItemText, {color: theme.text}]}>设置</Text>
              </View>
              <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 底部留白 */}
        <View style={{height: 40}} />
      </ScrollView>
    </SafeAreaView>
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
    marginTop: 12,
    paddingHorizontal: 12,
  },
  section: {
    marginTop: 16,
    paddingHorizontal: 12,
  },
  // 个人信息卡片 - 微信风格
  profileCard: {
    // backgroundColor 由主题动态控制
    borderRadius: 8,
    padding: 16,
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
    width: 64,
    height: 64,
    borderRadius: 6,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 6,
    // backgroundColor 由主题动态控制
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '600',
    color: '#fff',
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  username: {
    fontSize: 22,
    fontWeight: '600',
    // color 由主题动态控制
    marginBottom: 4,
  },
  userId: {
    fontSize: 14,
    // color 由主题动态控制
  },
  // 功能卡片
  card: {
    // backgroundColor 由主题动态控制
    borderRadius: 8,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuIcon: {
    fontSize: 22,
    marginRight: 14,
    width: 28,
    textAlign: 'center',
  },
  menuItemText: {
    fontSize: 17,
    // color 由主题动态控制
  },
  chevron: {
    fontSize: 20,
    // color 由主题动态控制
    fontWeight: '300',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    // backgroundColor 由主题动态控制
    marginLeft: 16,
  },
});

export default SettingsScreen;
