import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFetchBlob from 'rn-fetch-blob';
import {activateAccountCache, removeAllAccountData} from '../services/accountCache';
import {
  SavedAccount,
  loadSavedAccounts,
  normalizeAccounts,
  removeSavedAccount,
  sameAccount,
  saveAccount,
  saveAccountIfMissing,
  updateSavedAccountProfile,
} from '../services/savedAccounts';
import {waitForReadingProgressWrites} from '../utils/readingProgress';
import {clearSavedCredentials} from '../utils/storage';
import {clearMSiteCookieJar, fetchAuthenticatedUsername, invalidateMSiteLogin, removeMSiteAccountData, setLoggedIn} from '../services/auth';
import {fetchUserInfo, getUserInfo} from '../services/api';
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

const AccountSwitchScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUsername, setCurrentUsername] = useState<string>('');

  // 每次进入页面都重新读取，避免登录页写入后仍显示旧列表。
  useFocusEffect(
    React.useCallback(() => {
      loadAccounts().catch(error => console.error('Load accounts error:', error));
    }, []),
  );

  const loadAccounts = async () => {
    try {
      setLoading(true);

      // 登录和切换路径在提交前已验证凭证归属，这里只补登记旧版本遗留的当前账号，不覆盖已有条目。
      const [storedUsername, currentCookies, loginStatus] = await AsyncStorage.multiGet([
        'username',
        'cookies',
        'isLoggedIn',
      ]).then(entries => entries.map(([, value]) => value));
      const currentName = loginStatus === 'true' && currentCookies ? storedUsername?.trim() || '' : '';
      if (currentName && currentCookies) {
        await saveAccountIfMissing({username: currentName, cookies: currentCookies}, {markCurrent: true})
          .catch(error => console.error('Sync current account error:', error));
      }
      setCurrentUsername(currentName);
      const savedAccounts = normalizeAccounts(await loadSavedAccounts(), currentName || null);
      setAccounts(savedAccounts);
      void backfillProfiles(savedAccounts, currentName || null);
    } catch (error) {
      console.error('Load accounts error:', error);
    } finally {
      setLoading(false);
    }
  };

  // 旧记录缺少昵称或头像时，用公开资料接口在后台补齐，每个账号每次进入页面最多查一次。
  const backfillProfiles = async (list: SavedAccount[], currentName: string | null) => {
    const missing = list.filter(account => !account.avatar || !account.nickname);
    if (missing.length === 0) return;
    let updated = false;
    for (const account of missing) {
      try {
        const info = await fetchUserInfo(account.username);
        if (!info || !sameAccount(info.username, account.username)) continue;
        await updateSavedAccountProfile(account.username, {nickname: info.nickname, avatar: info.avatar});
        updated = true;
      } catch (error) {
        console.error('Backfill account profile error:', error);
      }
    }
    if (updated) setAccounts(normalizeAccounts(await loadSavedAccounts(), currentName));
  };

  const handleSwitchAccount = async (account: SavedAccount) => {
    if (account.isCurrent) {
      // 已经是当前账号
      return;
    }

    let previousUsername: string | null = null;
    let previousCookies: string | null = null;
    let switchStarted = false;
    try {
      // 保存当前账号信息（仅更新凭证，不改变当前标记）
      previousCookies = await AsyncStorage.getItem('cookies');
      previousUsername = await AsyncStorage.getItem('username');

      // 切换前核对保存的凭证归属，避免历史错配的 Cookie 让界面显示另一个账号的数据。
      const [targetCookieUsername, currentCookieUsername] = await Promise.all([
        fetchAuthenticatedUsername(account.cookies),
        previousUsername && previousCookies
          ? fetchAuthenticatedUsername(previousCookies)
          : Promise.resolve(null),
      ]);
      // 重新登录成功后，新凭证会覆盖列表里失效或错配的条目。
      const reloginButtons = [
        {text: '取消', style: 'cancel' as const},
        {text: '重新登录', onPress: () => navigation.navigate('Login', {reloginUsername: account.username})},
      ];
      if (!targetCookieUsername) {
        Alert.alert('无法验证账号', '该账号保存的登录凭证可能已失效，也可能是网络问题。可以重试，或重新登录该账号。', reloginButtons);
        return;
      }
      if (!sameAccount(targetCookieUsername, account.username)) {
        Alert.alert(
          '账号凭证不匹配',
          `本机保存的账号“${account.username}”的凭证实际属于“${targetCookieUsername}”，可能是旧版本留下的错误记录。请重新登录该账号。`,
          reloginButtons,
        );
        return;
      }

      if (previousUsername && previousCookies && sameAccount(currentCookieUsername, previousUsername)) {
        await saveCurrentAccount(previousUsername, previousCookies);
      } else if (previousUsername && previousCookies) {
        console.warn('Skip saving current account because its Cookie owner does not match the username');
      }

      // 切换到选中的账号
      invalidateMSiteLogin();
      switchStarted = true;
      await setLoggedIn(account.username, account.cookies);
      await saveAccount({username: account.username, cookies: account.cookies}, {markCurrent: true});
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
      if (switchStarted && previousUsername && previousCookies) {
        try {
          await setLoggedIn(previousUsername, previousCookies);
        } catch (rollbackError) {
          console.error('Restore previous account error:', rollbackError);
        }
      }
      if (switchStarted) activateAccountCache(previousUsername);
      console.error('Switch account error:', error);
      Alert.alert('错误', '切换账号失败，请重试');
    }
  };

  const saveCurrentAccount = async (username: string, cookies: string) => {
    await saveAccount({username, cookies}, {markCurrent: false}).catch(error =>
      console.error('Save current account error:', error));
  };

  const handleRemoveAccount = (account: SavedAccount) => {
    Alert.alert(
      '确认删除',
      `确定要删除账号 ${account.nickname || account.username} 吗？该账号在本机的历史记录、草稿、缓存、背景图和保存的密码也会清除。`,
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
              await waitForReadingProgressWrites();
              await removeAllAccountData(account.username);
              await removeMSiteAccountData(account.username);
              await clearSavedCredentials(account.username);
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

              // 数据清理都成功后再从列表移除，失败时保留可见的账号记录。
              await removeSavedAccount(account.username);
              
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
    navigation.navigate('Login', {addAccount: true});
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
