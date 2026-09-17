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
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useFocusEffect, useRoute} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getMessages, getReplyNotifications, markReplyNotificationAsRead} from '../services/api';
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

const MailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const theme = useTheme();
  const [mails, setMails] = useState<Mail[]>([]);
  const [replyNotifications, setReplyNotifications] = useState<ReplyNotification[]>([]);
  const [activeTab, setActiveTab] = useState<'mail' | 'reply'>(route.params?.tab === 'reply' ? 'reply' : 'mail');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mailLoaded, setMailLoaded] = useState(false);
  const [replyLoaded, setReplyLoaded] = useState(false);
  const [replyLoading, setReplyLoading] = useState(false);
  const [replyLoadingMore, setReplyLoadingMore] = useState(false);
  const [replyPage, setReplyPage] = useState(1);
  const [replyHasMore, setReplyHasMore] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const replyRequestGenerationRef = React.useRef(0);
  const replyLoadingMoreRef = React.useRef(false);

  useEffect(() => {
    checkLoginAndLoadMails();
  }, []);

  useEffect(() => {
    if (route.params?.tab === 'reply') setActiveTab('reply');
  }, [route.params?.tab]);

  // 页面获得焦点时检查登录状态并刷新消息列表
  useFocusEffect(
    React.useCallback(() => {
      const task = InteractionManager.runAfterInteractions(async () => {
        await checkLoginStatus();
        // 如果已登录，刷新私信和回复提醒。
        if (isLoggedIn) {
          await Promise.all([loadMails(), loadReplyNotifications()]);
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
        setMailLoaded(false);
        setReplyNotifications([]);
        setReplyLoaded(false);
        replyRequestGenerationRef.current += 1;
        replyLoadingMoreRef.current = false;
        setReplyLoadingMore(false);
        setReplyPage(1);
        setReplyHasMore(true);
        setLoading(false);
        return;
      }

      // 已登录，加载消息中心。
      await Promise.all([loadMails(), loadReplyNotifications()]);
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
        setReplyNotifications([]);
        setMailLoaded(false);
        setReplyLoaded(false);
        replyRequestGenerationRef.current += 1;
        replyLoadingMoreRef.current = false;
        setReplyLoadingMore(false);
        setReplyPage(1);
        setReplyHasMore(true);
      } else if (!wasLoggedIn && loggedIn) {
        // 如果从未登录变为已登录，自动加载信箱数据
        console.log('Login status changed from false to true, loading mails...');
        await Promise.all([loadMails(), loadReplyNotifications()]);
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
      setMailLoaded(true);
    } catch (error: any) {
      console.error('Load mails error:', error);
      
      // 处理登录过期错误
      if (error.message === 'NOT_LOGGED_IN' || error.message === 'LOGIN_EXPIRED') {
        console.log('Login expired, clearing login status');
        setIsLoggedIn(false);
        setMails([]);
        setMailLoaded(false);
        setReplyLoaded(false);
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

  const loadReplyNotifications = async (page: number = 1, append: boolean = false) => {
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
      if (requestGeneration !== replyRequestGenerationRef.current) {
        return;
      }

      setReplyNotifications(previous => {
        if (!append) {
          return result.items;
        }
        const merged = new Map<string, ReplyNotification>();
        [...previous, ...result.items].forEach(item => merged.set(item.id, item));
        return Array.from(merged.values());
      });
      setReplyPage(result.page || page);
      setReplyHasMore(result.hasMore);
      setReplyLoaded(true);
    } catch (error: any) {
      console.error('Load reply notifications error:', error);
      if (
        requestGeneration === replyRequestGenerationRef.current
        && (error.message === 'NOT_LOGGED_IN' || error.message === 'LOGIN_EXPIRED')
      ) {
        setReplyNotifications([]);
        setReplyLoaded(false);
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

  const handleNotificationPress = async (item: ReplyNotification) => {
    const previousStatus = item.status;
    if (item.status === 1) {
      setReplyNotifications(prev => prev.map(notification => (
        notification.id === item.id ? {...notification, status: 0} : notification
      )));
      try {
        await markReplyNotificationAsRead(item.id);
      } catch (error) {
        console.error('Mark reply notification read error:', error);
        setReplyNotifications(prev => prev.map(notification => (
          notification.id === item.id ? {...notification, status: previousStatus} : notification
        )));
      }
    }

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
          <Text style={[styles.tabText, {color: activeTab === 'mail' ? '#fff' : theme.secondaryText}]}>私信</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'reply' && {backgroundColor: theme.primary}]}
          onPress={() => setActiveTab('reply')}
          accessibilityRole="tab"
          accessibilityState={{selected: activeTab === 'reply'}}>
          <Text style={[styles.tabText, {color: activeTab === 'reply' ? '#fff' : theme.secondaryText}]}>回复</Text>
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
