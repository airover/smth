import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFetchBlob from 'rn-fetch-blob';
import {activateAccountCache, removeAllAccountData} from '../services/accountCache';
import {waitForReadingProgressWrites} from '../utils/readingProgress';
import {clearMSiteCookieJar, invalidateMSiteLogin, removeMSiteAccountData, setLoggedIn} from '../services/auth';
import {getUserInfo} from '../services/api';
// logout 功能暂时未使用
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import {useTheme} from '../components/ThemedComponents';
import {CheckIcon, PlusIcon, TrashIcon} from '../components/SvgIcons';
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

const sameAccount = (left: string | null | undefined, right: string | null | undefined): boolean =>
  !!left && !!right && left.trim().toLowerCase() === right.trim().toLowerCase();

const AccountSwitchScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const theme = useTheme();
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
      const currentCookies = await AsyncStorage.getItem('cookies');
      setCurrentUsername(username || '');
      
      // 获取保存的账号列表
      const savedAccountsJson = await AsyncStorage.getItem('savedAccounts');
      let savedAccounts: SavedAccount[] = savedAccountsJson ? JSON.parse(savedAccountsJson) : [];
      
      // 标记当前账号
      savedAccounts = savedAccounts.map(acc => ({
        ...acc,
        isCurrent: sameAccount(acc.username, username),
      }));
      
      // 如果当前登录的账号不在列表中，添加进去
      if (username && currentCookies) {
        const currentAccountExists = savedAccounts.some(acc => sameAccount(acc.username, username));
        if (!currentAccountExists) {
          savedAccounts.push({
            username,
            cookies: currentCookies,
            isCurrent: true,
          });
        }
      }
      
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

    invalidateMSiteLogin();

    let previousUsername: string | null = null;
    let previousCookies: string | null = null;
    try {
      // 保存当前账号信息
      previousCookies = await AsyncStorage.getItem('cookies');
      previousUsername = await AsyncStorage.getItem('username');
      
      if (previousUsername && previousCookies) {
        await saveCurrentAccount(previousUsername, previousCookies);
      }

      // 切换到选中的账号
      await setLoggedIn(account.username, account.cookies);
      // 绕过资料快照，后台重建当前账号的 set_identity Cookie。
      void getUserInfo(true).catch(error => console.error('Refresh switched account identity error:', error));
      try {
        await AsyncStorage.multiRemove(['mSiteCookies', 'mSiteLoggedIn', 'mSiteCookiesExpiry', 'mSiteCookiesTimestamp']);
        await clearMSiteCookieJar();
      } catch (error) {
        console.error('Clear previous M-site session error:', error);
      }

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
      if (previousUsername && previousCookies) {
        try {
          await setLoggedIn(previousUsername, previousCookies);
        } catch (rollbackError) {
          console.error('Restore previous account error:', rollbackError);
        }
      }
      activateAccountCache(previousUsername);
      console.error('Switch account error:', error);
      Alert.alert('错误', '切换账号失败，请重试');
    }
  };

  const saveCurrentAccount = async (username: string, cookies: string) => {
    try {
      const savedAccountsJson = await AsyncStorage.getItem('savedAccounts');
      let savedAccounts: SavedAccount[] = savedAccountsJson ? JSON.parse(savedAccountsJson) : [];
      
      // 检查是否已存在
      const existingIndex = savedAccounts.findIndex(acc => sameAccount(acc.username, username));
      
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
      `确定要删除账号 ${account.nickname || account.username} 吗？该账号在本机的历史记录、草稿、缓存和背景图也会清除。`,
      [
        {
          text: '取消',
          style: 'cancel',
        },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            let savedAccountsJson: string | null = null;
            try {
              savedAccountsJson = await AsyncStorage.getItem('savedAccounts');
              let savedAccounts: SavedAccount[] = savedAccountsJson ? JSON.parse(savedAccountsJson) : [];
              
              // 删除指定账号
              savedAccounts = savedAccounts.filter(acc => !sameAccount(acc.username, account.username));
              await AsyncStorage.setItem('savedAccounts', JSON.stringify(savedAccounts));
              await waitForReadingProgressWrites();
              await removeAllAccountData(account.username);
              await removeMSiteAccountData(account.username);
              const userDataDir = `${RNFetchBlob.fs.dirs.DocumentDir}/user_data`;
              if (await RNFetchBlob.fs.exists(userDataDir)) {
                const files = await RNFetchBlob.fs.ls(userDataDir);
                for (const file of files) {
                  if (!file.startsWith('profile_background_') || !file.endsWith('.jpg')) continue;
                  try {
                    const fileOwner = decodeURIComponent(file.slice('profile_background_'.length, -'.jpg'.length));
                    if (fileOwner.trim().toLowerCase() === account.username.trim().toLowerCase()) {
                      await RNFetchBlob.fs.unlink(`${userDataDir}/${file}`);
                    }
                  } catch (error) {
                    console.error('Skip invalid profile background filename:', error);
                  }
                }
              }
              
              // 刷新列表
              await loadAccounts();
            } catch (error) {
              if (savedAccountsJson !== null) {
                await AsyncStorage.setItem('savedAccounts', savedAccountsJson).catch(rollbackError =>
                  console.error('Restore account list error:', rollbackError));
              }
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
      <View style={[styles.container, {backgroundColor: theme.background}]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, {backgroundColor: theme.background}]}>
      <ScrollView style={styles.content}>
        {/* 当前账号 */}
        {currentUsername && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, {color: theme.secondaryText}]}>当前账号</Text>
            {accounts.filter(acc => acc.isCurrent).map((account, index) => (
              <View key={index} style={[styles.currentAccountCard, {backgroundColor: theme.cardBackground}]}>
                <View style={styles.accountLeft}>
                  {account.avatar ? (
                    <ImageWithPlaceholder
                      uri={account.avatar}
                      style={styles.avatar}
                      resizeMode="cover"
                      isAvatar={true}
                    />
                  ) : (
                    <View style={[styles.avatarPlaceholder, {backgroundColor: theme.primary}]}>
                      <Text style={styles.avatarText}>
                        {account.username.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.accountInfo}>
                    <Text style={[styles.accountName, {color: theme.text}]}>
                      {account.nickname || account.username}
                    </Text>
                    <Text style={[styles.accountUsername, {color: theme.secondaryText}]}>@{account.username}</Text>
                  </View>
                </View>
                <CheckIcon size={22} color={theme.primary} />
              </View>
            ))}
          </View>
        )}

        {/* 其他账号 */}
        {accounts.filter(acc => !acc.isCurrent).length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, {color: theme.secondaryText}]}>其他账号</Text>
            <View style={[styles.card, {backgroundColor: theme.cardBackground}]}>
              {accounts.filter(acc => !acc.isCurrent).map((account, index) => (
                <View key={index}>
                  {index > 0 && <View style={[styles.divider, {backgroundColor: theme.border}]} />}
                  <View style={styles.accountItem}>
                    <TouchableOpacity
                      style={styles.accountItemContent}
                      onPress={() => handleSwitchAccount(account)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`切换到账号 ${account.nickname || account.username}`}>
                      <View style={styles.accountLeft}>
                        {account.avatar ? (
                          <ImageWithPlaceholder
                            uri={account.avatar}
                            style={styles.avatar}
                            resizeMode="cover"
                            isAvatar={true}
                          />
                        ) : (
                          <View style={[styles.avatarPlaceholder, {backgroundColor: theme.primary}]}>
                            <Text style={styles.avatarText}>
                              {account.username.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={styles.accountInfo}>
                          <Text style={[styles.accountName, {color: theme.text}]}>
                            {account.nickname || account.username}
                          </Text>
                          <Text style={[styles.accountUsername, {color: theme.secondaryText}]}>@{account.username}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => handleRemoveAccount(account)}
                      hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                      accessibilityRole="button"
                      accessibilityLabel={`删除已保存账号 ${account.nickname || account.username}`}
                    >
                      <TrashIcon size={18} color={theme.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 添加账号 */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.addButton, {backgroundColor: theme.cardBackground}]}
            onPress={handleAddAccount}
            activeOpacity={0.8}
          >
            <View style={styles.addButtonIcon}>
              <PlusIcon size={20} color={theme.primary} />
            </View>
            <Text style={[styles.addButtonText, {color: theme.primary}]}>添加账号</Text>
          </TouchableOpacity>
        </View>

        {/* 提示文字 */}
        <View style={styles.section}>
          <Text style={[styles.hintText, {color: theme.secondaryText}]}>
            切换账号不会退出当前账号，你可以随时切换回来
          </Text>
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
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  // 当前账号卡片
  currentAccountCard: {
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // 账号列表卡片
  card: {
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
  accountItemContent: {
    flex: 1,
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
    marginBottom: SPACING.xs,
  },
  accountUsername: {
    fontSize: FONT_SIZE.md,
  },
  removeButton: {
    width: scaleModerate(28),
    height: scaleModerate(28),
    justifyContent: 'center',
    alignItems: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: scaleModerate(78),
  },
  // 添加账号按钮
  addButton: {
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonIcon: {
    marginRight: SPACING.xs + 2,
  },
  addButtonText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
  },
  // 提示文字
  hintText: {
    fontSize: FONT_SIZE.sm,
    textAlign: 'center',
    lineHeight: FONT_SIZE.xl,
  },
});

export default AccountSwitchScreen;
