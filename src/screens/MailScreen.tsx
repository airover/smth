import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  InteractionManager,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getMessages} from '../services/api';
import {Mail} from '../types';
import {formatRelativeTime} from '../utils/timeFormat';
import {useTheme, SkeletonList, EmptyState} from '../components/ThemedComponents';
import {MailIcon} from '../components/SvgIcons';
import {getCardElevation} from '../utils/theme';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  scaleModerate,
} from '../utils/responsive';

const MailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const [mails, setMails] = useState<Mail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    checkLoginAndLoadMails();
  }, []);

  // 页面获得焦点时检查登录状态并刷新消息列表
  useFocusEffect(
    React.useCallback(() => {
      const task = InteractionManager.runAfterInteractions(async () => {
        await checkLoginStatus();
        // 如果已登录，刷新消息列表
        if (isLoggedIn) {
          await loadMails();
        }
      });
      return () => task.cancel();
    }, [isLoggedIn])
  );

  const checkLoginAndLoadMails = async () => {
    try {
      setLoading(true);
      // 检查登录状态
      const loginStatus = await AsyncStorage.getItem('isLoggedIn');
      const loggedIn = loginStatus === 'true';
      setIsLoggedIn(loggedIn);

      if (!loggedIn) {
        // 未登录，清空数据
        setMails([]);
        setDataLoaded(false);
        setLoading(false);
        return;
      }

      // 已登录，加载信箱
      await loadMails();
    } catch (error) {
      console.error('Check login and load mails error:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkLoginStatus = async () => {
    try {
      const loginStatus = await AsyncStorage.getItem('isLoggedIn');
      const loggedIn = loginStatus === 'true';
      const wasLoggedIn = isLoggedIn;
      
      setIsLoggedIn(loggedIn);
      
      if (!loggedIn) {
        // 如果退出登录，清空信箱数据
        setMails([]);
        setDataLoaded(false);
      } else if (!wasLoggedIn && loggedIn) {
        // 如果从未登录变为已登录，自动加载信箱数据
        console.log('Login status changed from false to true, loading mails...');
        await loadMails();
      }
    } catch (error) {
      console.error('Check login status error:', error);
    }
  };

  const loadMails = async () => {
    try {
      const data = await getMessages();
      console.log('Loaded messages:', data.length);
      setMails(data);
      setDataLoaded(true);
    } catch (error: any) {
      console.error('Load mails error:', error);
      
      // 处理登录过期错误
      if (error.message === 'NOT_LOGGED_IN' || error.message === 'LOGIN_EXPIRED') {
        console.log('Login expired, clearing login status');
        setIsLoggedIn(false);
        setMails([]);
        setDataLoaded(false);
        // 提示用户重新登录
        Alert.alert(
          '登录已过期',
          '请重新登录后查看邮件',
          [
            {
              text: '去登录',
              onPress: handleLogin,
            },
            {
              text: '取消',
              style: 'cancel',
            },
          ]
        );
      }
      // 接口失败时不设置dataLoaded，避免显示"暂无邮件"
    }
  };

  const handleLogin = () => {
    navigation.navigate('Login');
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await checkLoginAndLoadMails();
    setRefreshing(false);
  };

  const renderMailItem = ({item}: {item: Mail}) => {
    const hasUnread = item.unread > 0;
    
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        style={[
          styles.mailItem,
          {backgroundColor: theme.cardBackground},
          getCardElevation(theme),
          hasUnread && [styles.unreadMail, {backgroundColor: theme.primary + '10', borderLeftColor: theme.primary}]
        ]}
        onPress={() => {
          navigation.navigate('MailDetail', {
            mail: item,
          });
        }}>
        <View style={styles.mailContent}>
          <View style={styles.mailTextContent}>
            <View style={styles.mailHeader}>
              <Text style={[styles.mailFrom, {color: theme.text}]} numberOfLines={1}>
                {item.fromNickname || item.from}
              </Text>
              <Text style={[styles.mailTime, {color: theme.secondaryText}]}>{formatRelativeTime(item.sendTime)}</Text>
            </View>
            <Text style={[styles.mailSubject, {color: theme.text}]} numberOfLines={1}>
              {item.subject}
            </Text>
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={[styles.unreadText, {color: theme.primary}]}>{item.unread} 条未读</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };


  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={[styles.container, {backgroundColor: theme.background}]}>
        <SkeletonList count={6} showAvatar />
      </SafeAreaView>
    );
  }

  if (!isLoggedIn) {
    return (
      <SafeAreaView edges={['bottom']} style={[styles.container, {backgroundColor: theme.background}]}>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyTitle, {color: theme.text}]}>未登录</Text>
          <Text style={[styles.emptyText, {color: theme.secondaryText}]}>请先登录以查看信箱</Text>
          <TouchableOpacity style={[styles.loginButton, {backgroundColor: theme.primary}]} onPress={handleLogin}>
            <Text style={styles.loginButtonText}>前往登录</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={[styles.container, {backgroundColor: theme.background}]}>
      <FlatList
        data={mails}
        renderItem={renderMailItem}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.primary]}
            tintColor={theme.primary}
          />
        }
        ListEmptyComponent={
          dataLoaded ? (
            <EmptyState
              icon={<MailIcon size={48} color={theme.secondaryText} />}
              title="暂无站内信"
              subtitle="新消息会出现在这里"
            />
          ) : null
        }
        contentContainerStyle={styles.content}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: SPACING.md,
  },
  mailItem: {
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  unreadMail: {
    borderLeftWidth: 3,
  },
  mailContent: {
    flexDirection: 'row',
  },
  mailTextContent: {
    flex: 1,
  },
  mailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  mailFrom: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    flex: 1,
  },
  mailTime: {
    fontSize: FONT_SIZE.xs,
    marginLeft: SPACING.sm,
  },
  mailSubject: {
    fontSize: FONT_SIZE.md,
    marginBottom: SPACING.xs,
    fontWeight: '500',
  },
  mailPreview: {
    fontSize: FONT_SIZE.sm,
    color: '#666',
    lineHeight: FONT_SIZE.xl,
  },
  unreadBadge: {
    marginTop: SPACING.xs + 2,
    alignSelf: 'flex-start',
  },
  unreadText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: scaleModerate(60),
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    marginBottom: SPACING.xxl,
  },
  loginButton: {
    paddingHorizontal: SPACING.xxxl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  loginButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: '#fff',
  },
});

export default MailScreen;
