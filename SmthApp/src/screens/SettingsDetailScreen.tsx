import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {logout} from '../services/api';

const SettingsDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [username, setUsername] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    loadUserStatus();
  }, []);

  const loadUserStatus = async () => {
    try {
      const storedUsername = await AsyncStorage.getItem('username');
      const loginStatus = await AsyncStorage.getItem('isLoggedIn');
      
      if (storedUsername) {
        setUsername(storedUsername);
      }
      setIsLoggedIn(loginStatus === 'true');
    } catch (error) {
      console.error('Load user status error:', error);
    }
  };

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
          setUsername('');
          setIsLoggedIn(false);
          // 返回上一页
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        {/* 个人中心 */}
        {username && (
          <View style={styles.firstSection}>
            <View style={styles.card}>
              <TouchableOpacity 
                style={styles.menuItem}
                onPress={() => navigation.navigate('UserProfile', { username })}>
                <View style={styles.menuItemLeft}>
                  <Text style={styles.menuIcon}>👤</Text>
                  <Text style={styles.menuItemText}>个人资料</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 数据管理 */}
        <View style={username ? styles.section : styles.firstSection}>
          <View style={styles.card}>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigation.navigate('CacheManagement')}>
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuIcon}>🗂</Text>
                <Text style={styles.menuItemText}>缓存管理</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 关于 */}
        <View style={styles.section}>
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

        {/* 账号操作 */}
        {isLoggedIn && (
          <>
            {/* 切换帐号 */}
            <View style={styles.section}>
              <TouchableOpacity 
                style={styles.switchAccountButton}
                onPress={() => navigation.navigate('AccountSwitch')}
                activeOpacity={0.8}
              >
                <Text style={styles.switchAccountButtonText}>切换帐号</Text>
              </TouchableOpacity>
            </View>

            {/* 退出登录 */}
            <View style={styles.section}>
              <TouchableOpacity 
                style={styles.logoutButton}
                onPress={handleLogout}
                activeOpacity={0.8}
              >
                <Text style={styles.logoutButtonText}>退出登录</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* 底部留白 */}
        <View style={{height: 40}} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EDEDED',
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
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
    color: '#000',
  },
  chevron: {
    fontSize: 20,
    color: '#C7C7CC',
    fontWeight: '300',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  infoLabel: {
    fontSize: 17,
    color: '#000',
  },
  infoValue: {
    fontSize: 17,
    color: '#888',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E5E5',
    marginLeft: 16,
  },
  // 切换帐号按钮
  switchAccountButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  switchAccountButtonText: {
    fontSize: 17,
    color: '#007AFF',
  },
  // 退出登录按钮
  logoutButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutButtonText: {
    fontSize: 17,
    color: '#FF3B30',
  },
});

export default SettingsDetailScreen;
