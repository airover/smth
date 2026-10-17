import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getMessages, getReplyNotifications, markReplyNotificationAsRead} from '../services/api';
import {getCacheWithTimestamp, setCache, setCacheWithTimestamp, clearCache} from '../services/cacheManager';
import {getAccountCacheContext, isAccountCacheCurrent, subscribeAccountCacheChange} from '../services/accountCache';
import {Mail, ReplyNotification} from '../types';
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
import {useFocusRefresh} from '../hooks/useFocusRefresh';
import {useUnreadCounts} from '../hooks/useUnreadCounts';
import {
  applyReplyNotificationRead,
  getUnreadCounts,
  refreshUnreadCounts,
  syncMailUnreadFromList,
} from '../services/unreadCounts';

const MAIL_MEMORY_FRESH_TTL = 30 * 1000;
const MAIL_REFRESH_INTERVAL = 30 * 1000;

type ReplyNotificationsSnapshot = {
  items: ReplyNotification[];
  total: number;
  page: number;
  pageSize?: number;
  totalPages?: number;
  hasMore: boolean;
};

const MailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const theme = useTheme();
  const [mails, setMails] = useState<Mail[]>([]);
  const [replyNotifications, setReplyNotifications] = useState<ReplyNotification[]>([]);
  // 未指定 Tab 时，只有回复未读就直接打开回复 Tab。
  const [activeTab, setActiveTab] = useState<'mail' | 'reply'>(() => {
    if (route.params?.tab === 'reply' || route.params?.tab === 'mail') return route.params.tab;
    const {mail, reply} = getUnreadCounts();
    return mail === 0 && reply > 0 ? 'reply' : 'mail';
  });
  const unreadCounts = useUnreadCounts();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mailLoaded, setMailLoaded] = useState(false);
  const [replyLoaded, setReplyLoaded] = useState(false);
  const [replyLoading, setReplyLoading] = useState(false);
  const [replyLoadingMore, setReplyLoadingMore] = useState(false);
  const [replyPage, setReplyPage] = useState(1);
  const [replyHasMore, setReplyHasMore] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const replyRequestGenerationRef = useRef(0);
  const replyLoadingMoreRef = useRef(false);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const reloadForAccountRef = useRef<() => void>(() => {});
  const requestGenerationRef = useRef(0);

  useEffect(() => subscribeAccountCacheChange(() => {
    const requestGeneration = ++requestGenerationRef.current;
    replyRequestGenerationRef.current += 1;
    refreshInFlightRef.current = null;
    setMails([]);
    setReplyNotifications([]);
    setMailLoaded(false);
    setReplyLoaded(false);
    setReplyPage(1);
    setReplyHasMore(true);
    setIsLoggedIn(false);
    setRefreshing(false);
    setLoading(true);
    void getAccountCacheContext().then(context => {
      if (requestGeneration !== requestGenerationRef.current) return;
      if (context) reloadForAccountRef.current();
      else setLoading(false);
    }).catch(error => {
      console.error('Reload messages after account change error:', error);
      if (requestGeneration === requestGenerationRef.current) setLoading(false);
    });
  }), []);

  // 从内存缓存（cacheManager，模块级单例，跨组件挂载/卸载存活）里先取上次快照；
  // 页面进入时会再按 MAIL_MEMORY_FRESH_TTL 判断是否需要静默刷新。
  const seedMailsFromCache = (): boolean => {
    const cached = getCacheWithTimestamp<Mail[]>('mailConversations');
    if (!cached) return false;
    setMails(cached.data);
    setMailLoaded(true);
    return true;
  };

  const seedReplyNotificationsFromCache = (): boolean => {
    const cached = getCacheWithTimestamp<ReplyNotificationsSnapshot>('replyNotificationsFirstPage');
    if (!cached) return false;
    setReplyNotifications(cached.data.items);
    setReplyPage(cached.data.page || 1);
    setReplyHasMore(cached.data.hasMore);
    setReplyLoaded(true);
    return true;
  };

  useEffect(() => {
    if (route.params?.tab === 'reply' || route.params?.tab === 'mail') setActiveTab(route.params.tab);
  }, [route.params?.tab]);

  const getMailCacheAge = useCallback((): number | null => {
    const cached = getCacheWithTimestamp<Mail[]>('mailConversations');
    return cached ? Date.now() - cached.timestamp : null;
  }, []);

  const getReplyCacheAge = useCallback((): number | null => {
    const cached = getCacheWithTimestamp<ReplyNotificationsSnapshot>('replyNotificationsFirstPage');
    return cached ? Date.now() - cached.timestamp : null;
  }, []);

  const checkLoginAndLoadMails = async (forceRefresh = false, silent = false): Promise<void> => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const requestGeneration = ++requestGenerationRef.current;
    const request = (async () => {
      try {
        const accountContext = await getAccountCacheContext();
        if (requestGeneration !== requestGenerationRef.current
          || (accountContext && !isAccountCacheCurrent(accountContext))) return;
        if (!silent) {
          setLoading(true);
        }

        const loginStatus = await AsyncStorage.getItem('isLoggedIn');
        if (requestGeneration !== requestGenerationRef.current
          || (accountContext && !isAccountCacheCurrent(accountContext))) return;
        const loggedIn = loginStatus === 'true' && !!accountContext;
        setIsLoggedIn(loggedIn);

        if (!loggedIn) {
          // 未登录，清空数据（含内存缓存，避免下次登录后先闪一下上一个账号的消息）
          setMails([]);
          setMailLoaded(false);
          setReplyNotifications([]);
          setReplyLoaded(false);
          replyRequestGenerationRef.current += 1;
          replyLoadingMoreRef.current = false;
          setReplyLoadingMore(false);
          setReplyPage(1);
          setReplyHasMore(true);
          clearCache('mailConversations');
          clearCache('replyNotificationsFirstPage');
          setLoading(false);
          return;
        }

        // 没有当前数据时先用会话内快照首屏展示；已有数据不重复覆盖，避免用户
        // 在深页阅读时因为重新获得焦点而被拉回第一页。
        const hasSeededMails = mailLoaded || seedMailsFromCache();
        const hasSeededReplies = replyLoaded || seedReplyNotificationsFromCache();
        if (!silent && (hasSeededMails || hasSeededReplies)) {
          setLoading(false);
        }

        const mailAge = getMailCacheAge();
        const replyAge = getReplyCacheAge();
        const shouldRefreshMails = forceRefresh || mailAge === null || mailAge >= MAIL_MEMORY_FRESH_TTL;
        const shouldRefreshReplies = forceRefresh || replyAge === null || replyAge >= MAIL_MEMORY_FRESH_TTL;

        if (!shouldRefreshMails && !shouldRefreshReplies) {
          return;
        }

        await Promise.all([
          shouldRefreshMails ? loadMails(silent) : Promise.resolve(),
          shouldRefreshReplies
            ? loadReplyNotifications(1, false, silent && replyLoaded, silent)
            : Promise.resolve(),
        ]);
      } catch (error) {
        if (requestGeneration !== requestGenerationRef.current) return;
        console.error('Check login and load mails error:', error);
      } finally {
        if (!silent && requestGeneration === requestGenerationRef.current) {
          setLoading(false);
        }
      }
    })();

    refreshInFlightRef.current = request;
    try {
      await request;
    } finally {
      if (refreshInFlightRef.current === request) {
        refreshInFlightRef.current = null;
      }
    }
  };

  reloadForAccountRef.current = () => {
    void checkLoginAndLoadMails(false, false);
  };

  useEffect(() => {
    checkLoginAndLoadMails(false, false);
    // 首次加载只执行一次；后续刷新由 useFocusRefresh 负责。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMails = async (silent = false) => {
    const accountContext = await getAccountCacheContext();
    if (!accountContext) return;
    try {
      const data = await getMessages();
      if (!isAccountCacheCurrent(accountContext)) return;
      console.log('Loaded messages:', data.length);
      setMails(data);
      setMailLoaded(true);
      setCache('mailConversations', undefined, data);
      syncMailUnreadFromList(accountContext, data);
    } catch (error: any) {
      if (!isAccountCacheCurrent(accountContext)) return;
      console.error('Load mails error:', error);

      // 处理登录过期错误
      if (error.message === 'NOT_LOGGED_IN' || error.message === 'LOGIN_EXPIRED') {
        if (silent) return;
        console.log('Login expired, clearing login status');
        setIsLoggedIn(false);
        setMails([]);
        setMailLoaded(false);
        setReplyLoaded(false);
        clearCache('mailConversations');
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
      // 接口失败时不标记私信已加载，避免把错误误显示为“暂无私信”。
    }
  };

  const loadReplyNotifications = async (
    page: number = 1,
    append: boolean = false,
    preserveExisting: boolean = false,
    silent: boolean = false,
  ) => {
    const accountContext = await getAccountCacheContext();
    if (!accountContext) return;
    if (append && (!replyHasMore || replyLoadingMore || replyLoadingMoreRef.current)) {
      return;
    }

    const requestGeneration = page === 1
      ? replyRequestGenerationRef.current + 1
      : replyRequestGenerationRef.current;
    if (page === 1) {
      replyRequestGenerationRef.current = requestGeneration;
      replyLoadingMoreRef.current = false;
      setReplyLoadingMore(false);
      setReplyLoading(true);
    } else {
      replyLoadingMoreRef.current = true;
      setReplyLoadingMore(true);
    }

    try {
      const result = await getReplyNotifications(0, page);
      if (requestGeneration !== replyRequestGenerationRef.current || !isAccountCacheCurrent(accountContext)) {
        return;
      }

      setReplyNotifications(previous => {
        if (!append && !preserveExisting) {
          return result.items;
        }
        const merged = new Map<string, ReplyNotification>();
        [...result.items, ...previous].forEach(item => merged.set(item.id, item));
        return Array.from(merged.values());
      });
      if (append || !preserveExisting) {
        setReplyPage(result.page || page);
      }
      setReplyHasMore(result.hasMore);
      setReplyLoaded(true);
      if (!append) {
        // 只缓存第一页快照，用于下次进入时先展示；深页只在当次会话内使用，不缓存。
        setCache('replyNotificationsFirstPage', undefined, result);
      }
    } catch (error: any) {
      if (!isAccountCacheCurrent(accountContext)) return;
      console.error('Load reply notifications error:', error);
      if (
        !silent &&
        requestGeneration === replyRequestGenerationRef.current
        && (error.message === 'NOT_LOGGED_IN' || error.message === 'LOGIN_EXPIRED')
      ) {
        setReplyNotifications([]);
        setReplyLoaded(false);
        clearCache('replyNotificationsFirstPage');
      }
    } finally {
      if (requestGeneration === replyRequestGenerationRef.current) {
        if (page === 1) {
          setReplyLoading(false);
        } else {
          replyLoadingMoreRef.current = false;
          setReplyLoadingMore(false);
        }
      }
    }
  };

  const loadMoreReplyNotifications = () => {
    if (!replyLoading && !replyLoadingMore && replyHasMore) {
      loadReplyNotifications(replyPage + 1, true);
    }
  };

  const refreshMessagesSilently = () => Promise.all([
    checkLoginAndLoadMails(false, true),
    refreshUnreadCounts(),
  ]).then(() => undefined);

  useFocusRefresh(refreshMessagesSilently, {
    intervalMs: MAIL_REFRESH_INTERVAL,
  });

  const handleLogin = () => {
    navigation.navigate('Login');
  };

  const onRefresh = async () => {
    setRefreshing(true);
    void refreshUnreadCounts({force: true});
    const request = checkLoginAndLoadMails(true, false);
    const requestGeneration = requestGenerationRef.current;
    await request;
    if (requestGeneration === requestGenerationRef.current) setRefreshing(false);
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
          // 详情页负责调用已读接口和扣减计数；列表与快照先同步显示为已读。
          if (hasUnread) {
            const markRead = (list: Mail[]) => list.map(mail => (mail.id === item.id ? {...mail, unread: 0} : mail));
            setMails(markRead);
            const cached = getCacheWithTimestamp<Mail[]>('mailConversations');
            if (cached) setCacheWithTimestamp('mailConversations', undefined, markRead(cached.data), cached.timestamp);
          }
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

  const handleNotificationPress = async (item: ReplyNotification) => {
    const accountContext = await getAccountCacheContext();
    if (!accountContext || !isAccountCacheCurrent(accountContext)) return;
    const previousStatus = item.status;
    if (item.status === 1) {
      setReplyNotifications(prev => prev.map(notification => (
        notification.id === item.id ? {...notification, status: 0} : notification
      )));
      // 缓存的是页面快照，不会跟着这次乐观更新同步；直接失效它，避免下次重新进入
      // 这个页面时，从缓存里先闪一下这条“未读”，再被后续请求纠正回来。
      clearCache('replyNotificationsFirstPage');
      applyReplyNotificationRead(accountContext);
      try {
        await markReplyNotificationAsRead(item.id, accountContext);
      } catch (error) {
        if (!isAccountCacheCurrent(accountContext)) return;
        console.error('Mark reply notification read error:', error);
        setReplyNotifications(prev => prev.map(notification => (
          notification.id === item.id ? {...notification, status: previousStatus} : notification
        )));
      } finally {
        // 无论成功失败都以服务端为准对账一次，纠正乐观扣减。
        void refreshUnreadCounts({force: true});
      }
    }

    if (!isAccountCacheCurrent(accountContext)) return;

    if (!item.topicId) {
      Alert.alert('提示', '该回复关联的帖子已不可查看');
      return;
    }

    const resolvedBoard = item.boardId || item.boardName;
    if (!resolvedBoard) {
      Alert.alert('提示', '无法获取该回复所属版面，请稍后从帖子列表进入');
      return;
    }

    navigation.navigate('PostDetail', {
      board: resolvedBoard,
      postId: item.topicId,
      articleId: item.articleId,
    });
  };

  const renderReplyNotificationItem = ({item}: {item: ReplyNotification}) => {
    const unread = item.status === 1;
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        style={[
          styles.mailItem,
          {backgroundColor: theme.cardBackground},
          getCardElevation(theme),
          unread && [styles.unreadMail, {backgroundColor: theme.primary + '10', borderLeftColor: theme.primary}],
        ]}
        onPress={() => handleNotificationPress(item)}>
        <View style={styles.mailContent}>
          <View style={styles.mailTextContent}>
            <View style={styles.mailHeader}>
              <Text style={[styles.mailFrom, {color: theme.text}]} numberOfLines={1}>
                {item.fromNickname || item.from || '有人回复了你'}
              </Text>
              <Text style={[styles.mailTime, {color: theme.secondaryText}]}>{formatRelativeTime(item.sendTime)}</Text>
            </View>
            <Text style={[styles.mailSubject, {color: theme.text}]} numberOfLines={1}>
              {item.subject}
            </Text>
            {!!item.body && (
              <Text style={[styles.notificationPreview, {color: theme.secondaryText}]} numberOfLines={2}>
                {item.body.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')}
              </Text>
            )}
            {unread && (
              <View style={styles.unreadBadge}>
                <Text style={[styles.unreadText, {color: theme.primary}]}>未读</Text>
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
          <Text style={[styles.emptyText, {color: theme.secondaryText}]}>请先登录查看消息</Text>
          <TouchableOpacity style={[styles.loginButton, {backgroundColor: theme.primary}]} onPress={handleLogin}>
            <Text style={styles.loginButtonText}>前往登录</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={[styles.container, {backgroundColor: theme.background}]}> 
      <View style={styles.tabBarArea}>
        <View style={[styles.tabContainer, {backgroundColor: theme.placeholderBackground}]}> 
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'mail' && {backgroundColor: theme.primary}]}
          onPress={() => setActiveTab('mail')}
          accessibilityRole="tab"
          accessibilityState={{selected: activeTab === 'mail'}}>
          <View style={styles.tabLabelRow}>
            <Text style={[styles.tabText, {color: activeTab === 'mail' ? '#fff' : theme.secondaryText}]}>私信</Text>
            {unreadCounts.mail > 0 && (
              <View style={[styles.tabDot, {backgroundColor: activeTab === 'mail' ? '#fff' : theme.primary}]} />
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'reply' && {backgroundColor: theme.primary}]}
          onPress={() => setActiveTab('reply')}
          accessibilityRole="tab"
          accessibilityState={{selected: activeTab === 'reply'}}>
          <View style={styles.tabLabelRow}>
            <Text style={[styles.tabText, {color: activeTab === 'reply' ? '#fff' : theme.secondaryText}]}>回复</Text>
            {unreadCounts.reply > 0 && (
              <View style={[styles.tabDot, {backgroundColor: activeTab === 'reply' ? '#fff' : theme.primary}]} />
            )}
          </View>
        </TouchableOpacity>
        </View>
      </View>
      <FlatList<Mail | ReplyNotification>
        data={activeTab === 'mail' ? mails : replyNotifications}
        renderItem={({item}) => activeTab === 'mail'
          ? renderMailItem({item: item as Mail})
          : renderReplyNotificationItem({item: item as ReplyNotification})}
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
          (activeTab === 'mail' ? mailLoaded : replyLoaded) ? (
            <EmptyState
              icon={<MailIcon size={48} color={theme.secondaryText} />}
              title={activeTab === 'mail' ? '暂无站内信' : '暂无回复'}
              subtitle={activeTab === 'mail' ? '新消息会显示在这里' : '有回复时会显示在这里'}
            />
          ) : activeTab === 'reply' && replyLoading ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : null
        }
        onEndReached={activeTab === 'reply' ? loadMoreReplyNotifications : undefined}
        onEndReachedThreshold={0.3}
        ListFooterComponent={activeTab === 'reply' && replyLoadingMore ? (
          <View style={styles.inlineLoading}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        ) : null}
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
  inlineLoading: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  tabBarArea: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  tabContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    padding: 3,
    borderRadius: 18,
  },
  tabItem: {
    flex: 1,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
  },
  tabText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  tabLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 4,
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
  notificationPreview: {
    fontSize: FONT_SIZE.sm,
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
