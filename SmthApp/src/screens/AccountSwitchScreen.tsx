import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {logout} from '../services/api';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  scaleModerate,
} from '../utils/responsive';

interface SavedAccount {
  username: string;
  nickname?: string;
  avatar?: string;
  cookies: string;
  isCurrent: boolean;
}

const AccountSwitchScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUsername, setCurrentUsername] = useState<string>('');

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      
      // 获取当前登录的用户
      const username = await AsyncStorage.getItem('username');
      setCurrentUsername(username || '');
      
      // 获取保存的账号列表
      const savedAccountsJson = await AsyncStorage.getItem('savedAccounts');
      let savedAccounts: SavedAccount[] = savedAccountsJson ? JSON.parse(savedAccountsJson) : [];
      
      // 标记当前账号
      savedAccounts = savedAccounts.map(acc => ({
        ...acc,
        isCurrent: acc.username === username,
      }));
      
      setAccounts(savedAccounts);
    } catch (error) {
      console.error('Load accounts error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchAccount = async (account: SavedAccount) => {
    if (account.isCurrent) {
      // 已经是当前账号
      return;
    }

    try {
      // 保存当前账号信息
      const currentCookies = await AsyncStorage.getItem('cookies');
      const currentUsername = await AsyncStorage.getItem('username');
      
      if (currentUsername && currentCookies) {
        await saveCurrentAccount(currentUsername, currentCookies);
      }

      // 切换到选中的账号
      await AsyncStorage.setItem('username', account.username);
      await AsyncStorage.setItem('cookies', account.cookies);
      await AsyncStorage.setItem('isLoggedIn', 'true');

      Alert.alert('成功', `已切换到账号 ${account.nickname || account.username}`, [
        {
          text: '确定',
          onPress: () => {
            // 返回到"我"页面并刷新
            navigation.goBack();
          },
        },
      ]);
    } catch (error) {
      console.error('Switch account error:', error);
      Alert.alert('错误', '切换账号失败，请重试');
    }
  };

  const saveCurrentAccount = async (username: string, cookies: string) => {
    try {
      const savedAccountsJson = await AsyncStorage.getItem('savedAccounts');
      let savedAccounts: SavedAccount[] = savedAccountsJson ? JSON.parse(savedAccountsJson) : [];
      
      // 检查是否已存在
      const existingIndex = savedAccounts.findIndex(acc => acc.username === username);
      
      const accountInfo: SavedAccount = {
        username,
        cookies,
        isCurrent: false,
      };
      
      if (existingIndex >= 0) {
        // 更新现有账号
        savedAccounts[existingIndex] = {
          ...savedAccounts[existingIndex],
          ...accountInfo,
        };
      } else {
        // 添加新账号
        savedAccounts.push(accountInfo);
      }
      
      await AsyncStorage.setItem('savedAccounts', JSON.stringify(savedAccounts));
    } catch (error) {
      console.error('Save current account error:', error);
    }
  };

  const handleRemoveAccount = (account: SavedAccount) => {
    Alert.alert(
      '确认删除',
      `确定要删除账号 ${account.nickname || account.username} 吗？`,
      [
        {
          text: '取消',
          style: 'cancel',
        },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              const savedAccountsJson = await AsyncStorage.getItem('savedAccounts');
              let savedAccounts: SavedAccount[] = savedAccountsJson ? JSON.parse(savedAccountsJson) : [];
              
              // 删除指定账号
              savedAccounts = savedAccounts.filter(acc => acc.username !== account.username);
              await AsyncStorage.setItem('savedAccounts', JSON.stringify(savedAccounts));
              
              // 刷新列表
              await loadAccounts();
            } catch (error) {
              console.error('Remove account error:', error);
              Alert.alert('错误', '删除账号失败');
            }
          },
        },
      ]
    );
  };

  const handleAddAccount = () => {
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
      <ScrollView style={styles.content}>
        {/* 当前账号 */}
        {currentUsername && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>当前账号</Text>
            {accounts.filter(acc => acc.isCurrent).map((account, index) => (
              <View key={index} style={styles.currentAccountCard}>
                <View style={styles.accountLeft}>
                  {account.avatar ? (
                    <ImageWithPlaceholder
                      uri={account.avatar}
                      style={styles.avatar}
                      resizeMode="cover"
                      isAvatar={true}
                    />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarText}>
                        {account.username.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountName}>
                      {account.nickname || account.username}
                    </Text>
                    <Text style={styles.accountUsername}>@{account.username}</Text>
                  </View>
                </View>
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>当前</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* 其他账号 */}
        {accounts.filter(acc => !acc.isCurrent).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>其他账号</Text>
            <View style={styles.card}>
              {accounts.filter(acc => !acc.isCurrent).map((account, index) => (
                <View key={index}>
                  {index > 0 && <View style={styles.divider} />}
                  <TouchableOpacity
                    style={styles.accountItem}
                    onPress={() => handleSwitchAccount(account)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.accountLeft}>
                      {account.avatar ? (
                        <ImageWithPlaceholder
                          uri={account.avatar}
                          style={styles.avatar}
                          resizeMode="cover"
                          isAvatar={true}
                        />
                      ) : (
                        <View style={styles.avatarPlaceholder}>
                          <Text style={styles.avatarText}>
                            {account.username.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={styles.accountInfo}>
                        <Text style={styles.accountName}>
                          {account.nickname || account.username}
                        </Text>
                        <Text style={styles.accountUsername}>@{account.username}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => handleRemoveAccount(account)}
                      hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                    >
                      <Text style={styles.removeButtonText}>✕</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 添加账号 */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={handleAddAccount}
            activeOpacity={0.8}
          >
            <Text style={styles.addButtonIcon}>+</Text>
            <Text style={styles.addButtonText}>添加账号</Text>
          </TouchableOpacity>
        </View>

        {/* 提示文字 */}
        <View style={styles.section}>
          <Text style={styles.hintText}>
            切换账号不会退出当前账号，你可以随时切换回来
          </Text>
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
    backgroundColor: '#EDEDED',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  // 当前账号卡片
  currentAccountCard: {
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // 账号列表卡片
  card: {
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
  },
  accountItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  accountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: scaleModerate(50),
    height: scaleModerate(50),
    borderRadius: BORDER_RADIUS.xs + 2,
  },
  avatarPlaceholder: {
    width: scaleModerate(50),
    height: scaleModerate(50),
    borderRadius: BORDER_RADIUS.xs + 2,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '600',
    color: '#fff',
  },
  accountInfo: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  accountName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    color: '#000',
    marginBottom: SPACING.xs,
  },
  accountUsername: {
    fontSize: FONT_SIZE.md,
    color: '#888',
  },
  currentBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  currentBadgeText: {
    fontSize: FONT_SIZE.sm,
    color: '#fff',
    fontWeight: '600',
  },
  removeButton: {
    width: scaleModerate(28),
    height: scaleModerate(28),
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    fontSize: FONT_SIZE.xl,
    color: '#C7C7CC',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E5E5',
    marginLeft: scaleModerate(78),
  },
  // 添加账号按钮
  addButton: {
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonIcon: {
    fontSize: FONT_SIZE.xl,
    color: '#007AFF',
    marginRight: SPACING.xs + 2,
  },
  addButtonText: {
    fontSize: FONT_SIZE.xl,
    color: '#007AFF',
    fontWeight: '600',
  },
  // 提示文字
  hintText: {
    fontSize: FONT_SIZE.sm,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: FONT_SIZE.xl,
  },
});

export default AccountSwitchScreen;
