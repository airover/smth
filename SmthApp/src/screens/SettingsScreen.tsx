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

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
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
      
      // 立即设置本地存储的状态，避免显示未登录
      setIsLoggedIn(isStoredLoggedIn);
      if (storedUsername) {
        setUsername(storedUsername);
        // 如果有本地用户名，先显示基本信息
        setUser({
          username: storedUsername,
        });
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
          // 但仍然显示用户名
          setUser({
            username: userInfo.username,
          });
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

  const handleLogout = () => {
    Alert.alert('确认', '确定要退出登录吗？', [
      {
        text: '取消',
        style: 'cancel',
      },
      {
        text: '确定',
        style: 'destructive',
        onPress: async () => {
          await logout();
          // 清除所有本地状态
          setUser(null);
          setUsername('');
          setIsLoggedIn(false);
        },
      },
    ]);
  };

  const handleLogin = () => {
    navigation.navigate('Login');
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

  return (
    <SafeAreaView style={styles.container}>
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
        {/* 个人信息 */}
        <View style={styles.profileSection}>
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
                {user?.username?.charAt(0).toUpperCase() || username?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
          )}
          <Text style={styles.username}>
            {user?.nickname || user?.username || username || '未登录'}
          </Text>
          {(user?.username || username) && (
            <Text style={styles.userId}>@{user?.username || username}</Text>
          )}
          <View style={styles.loginStatusContainer}>
            <View style={[styles.statusDot, isLoggedIn ? styles.statusOnline : styles.statusOffline]} />
            <Text style={styles.loginStatusText}>
              {isLoggedIn ? '已登录' : '未登录'}
            </Text>
          </View>
        </View>

        {/* 个人资料 */}
        {isLoggedIn && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>账号</Text>
            <View style={styles.card}>
              <TouchableOpacity 
                style={styles.menuItem}
                onPress={() => navigation.navigate('UserProfile', { username: user?.username || username })}>
                <View style={styles.menuItemLeft}>
                  <Text style={styles.menuIcon}>👤</Text>
                  <View>
                    <Text style={styles.menuItemText}>个人资料</Text>
                    <Text style={styles.menuItemDesc}>查看详细信息</Text>
                  </View>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 数据与隐私 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>数据与隐私</Text>
          <View style={styles.card}>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigation.navigate('CacheManagement')}>
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuIcon}>🗂</Text>
                <View>
                  <Text style={styles.menuItemText}>缓存管理</Text>
                  <Text style={styles.menuItemDesc}>清理缓存、查看统计</Text>
                </View>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 账号操作 */}
        <View style={styles.section}>
          <View style={styles.card}>
            {isLoggedIn ? (
              <TouchableOpacity style={styles.actionButton} onPress={handleLogout}>
                <Text style={[styles.actionButtonText, styles.dangerText]}>退出登录</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.actionButton} onPress={handleLogin}>
                <Text style={[styles.actionButtonText, styles.primaryText]}>登录</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 关于 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>关于</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>应用版本</Text>
              <Text style={styles.infoValue}>1.0.0</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>缓存策略</Text>
              <Text style={styles.infoValue}>1分钟自动过期</Text>
            </View>
          </View>
        </View>
      </ScrollView>
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
    flex: 1,
  },
  profileSection: {
    backgroundColor: '#fff',
    paddingVertical: 32,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 16,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '600',
    color: '#fff',
  },
  username: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  userId: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  loginStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusOnline: {
    backgroundColor: '#34C759',
  },
  statusOffline: {
    backgroundColor: '#8E8E93',
  },
  loginStatusText: {
    fontSize: 13,
    color: '#666',
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
    color: '#8E8E93',
  },
  textGreen: {
    color: '#34C759',
  },
  textRed: {
    color: '#FF3B30',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: '#000',
    fontWeight: '500',
    marginBottom: 2,
  },
  menuItemDesc: {
    fontSize: 13,
    color: '#8E8E93',
  },
  chevron: {
    fontSize: 24,
    color: '#C7C7CC',
    fontWeight: '300',
  },
  dangerText: {
    color: '#FF3B30',
  },
  primaryText: {
    color: '#007AFF',
  },
  actionButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#f0f0f0',
    marginVertical: 8,
  },
});

export default SettingsScreen;
