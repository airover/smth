import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  Image,
  RefreshControl,
} from 'react-native';
import {useRoute} from '@react-navigation/native';
import {getUserInfo} from '../services/api';
import {User} from '../types';
import {formatRelativeTime} from '../utils/timeFormat';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';

const UserProfileScreen: React.FC = () => {
  const route = useRoute();
  const {username} = route.params as {username: string};
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      setLoading(true);
      const userInfo = await getUserInfo();
      console.log('UserProfileScreen getUserInfo result:', userInfo);
      if (userInfo) {
        setUser(userInfo);
      }
    } catch (error) {
      console.error('Load user info error:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUserInfo();
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
        {/* 头像和基本信息 */}
        <View style={styles.headerSection}>
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
          <Text style={styles.nickname}>
            {user?.nickname || user?.username || username || '未知用户'}
          </Text>
          <Text style={styles.username}>@{user?.username || username}</Text>
        </View>

        {/* 详细信息 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>基本信息</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>用户名</Text>
              <Text style={styles.infoValue}>{user?.username || username || '-'}</Text>
            </View>
            {user?.nickname && (
              <>
                <View style={styles.divider} />
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>昵称</Text>
                  <Text style={styles.infoValue}>{user.nickname}</Text>
                </View>
              </>
            )}
            {user?.title && (
              <>
                <View style={styles.divider} />
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>头衔</Text>
                  <Text style={styles.infoValue}>{user.title}</Text>
                </View>
              </>
            )}
            {user?.levelTitle && (
              <>
                <View style={styles.divider} />
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>等级</Text>
                  <Text style={styles.infoValue}>{user.levelTitle}</Text>
                </View>
              </>
            )}
            {user?.score !== undefined && (
              <>
                <View style={styles.divider} />
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>积分</Text>
                  <Text style={styles.infoValue}>{user.score}</Text>
                </View>
              </>
            )}
            {user?.postCount !== undefined && (
              <>
                <View style={styles.divider} />
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>发帖数</Text>
                  <Text style={styles.infoValue}>{user.postCount}</Text>
                </View>
              </>
            )}
            {user?.loginTime && (
              <>
                <View style={styles.divider} />
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>上次登录</Text>
                  <Text style={styles.infoValue}>{formatRelativeTime(user.loginTime)}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {user?.signature && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>个性签名</Text>
            <View style={styles.card}>
              <Text style={styles.signatureText}>{user.signature}</Text>
            </View>
          </View>
        )}

        {/* 其他信息 */}
        {(user?.gender !== undefined || user?.city || user?.email || user?.mobile) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>其他信息</Text>
            <View style={styles.card}>
              {user?.gender !== undefined && (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>性别</Text>
                    <Text style={styles.infoValue}>
                      {user.gender === 1 ? '男' : user.gender === 2 ? '女' : '保密'}
                    </Text>
                  </View>
                  <View style={styles.divider} />
                </>
              )}
              {user?.city && (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>地区</Text>
                    <Text style={styles.infoValue}>{user.city}</Text>
                  </View>
                  <View style={styles.divider} />
                </>
              )}
              {user?.mobile && (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>手机号</Text>
                    <Text style={styles.infoValue}>{user.mobile}</Text>
                  </View>
                  {user?.email && <View style={styles.divider} />}
                </>
              )}
              {user?.email && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>邮箱</Text>
                  <Text style={styles.infoValue}>{user.email}</Text>
                </View>
              )}
            </View>
          </View>
        )}
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
  headerSection: {
    backgroundColor: '#fff',
    paddingVertical: 32,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '600',
    color: '#fff',
  },
  nickname: {
    fontSize: 22,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  username: {
    fontSize: 14,
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
    color: '#666',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#f0f0f0',
  },
  signatureText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    fontStyle: 'italic',
  },
});

export default UserProfileScreen;

