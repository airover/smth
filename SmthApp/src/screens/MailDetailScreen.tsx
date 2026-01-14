import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {useRoute, useNavigation} from '@react-navigation/native';
import {Mail} from '../types';
import {formatRelativeTime} from '../utils/timeFormat';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import {getConversationMessages, markMessageAsRead, sendMessage} from '../services/api';
import {useTheme} from '../components/ThemedComponents';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  scaleModerate,
} from '../utils/responsive';

interface Message {
  id: string;
  senderId: string;
  recipientId?: string;
  senderName: string;
  senderNick: string;
  senderAvatar: string;
  subject: string;
  body: string;
  sendTime: number;
  status?: number;
  isMe: boolean;
}

const MailDetailScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const theme = useTheme();
  
  // 获取传入的mail对象，从中提取speakerId
  const {mail} = route.params as {mail: Mail};
  const speakerId = mail.fromId;
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [speaker, setSpeaker] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  
  const isLoadingRef = useRef(false);

  // 监控messages状态变化
  useEffect(() => {
    console.log(`[MailDetail] 消息状态更新 - 当前消息数: ${messages.length}`);
    if (messages.length > 0) {
      console.log(`[MailDetail] 消息时间范围 - 最新: ${new Date(messages[0].sendTime).toLocaleString()}, 最旧: ${new Date(messages[messages.length - 1].sendTime).toLocaleString()}`);
    }
  }, [messages]);

  // 清理消息正文中的ANSI转义序列和HTML标签
  const cleanBody = (body: string) => {
    return body
      // 移除ANSI转义序列（如 \u001B[1;31m 等）
      .replace(/\u001B\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .trim();
  };

  // 加载消息
  const loadMessages = useCallback(async (pageNum: number = 1, isRefresh: boolean = false) => {
    if (isLoadingRef.current && !isRefresh) {
      console.log('[MailDetail] 正在加载中，跳过重复请求');
      return;
    }
    
    isLoadingRef.current = true;
    console.log(`[MailDetail] 开始加载消息 - 页码: ${pageNum}, 刷新: ${isRefresh}, speakerId: ${speakerId}`);
    
    try {
      const result = await getConversationMessages(speakerId, pageNum);
      console.log(`[MailDetail] 接口返回 - 消息数: ${result.messages.length}, hasMore: ${result.hasMore}, total: ${result.total || 'N/A'}`);
      
      // 按时间降序排序：新消息在前，旧消息在后
      // 因为使用了inverted，所以数组中新消息在前，显示时会自动反转，新消息显示在底部
      const sortedMessages = [...result.messages].sort((a, b) => b.sendTime - a.sendTime);
      console.log(`[MailDetail] 排序后消息数: ${sortedMessages.length}`);
      
      if (pageNum === 1) {
        setMessages(sortedMessages);
        setSpeaker(result.speaker);
        console.log(`[MailDetail] 第一页 - 设置消息数: ${sortedMessages.length}`);
      } else {
        // 加载更多旧消息，追加到数组后面（因为是降序，旧消息在后面）
        setMessages(prev => {
          const newMessages = [...prev, ...sortedMessages];
          console.log(`[MailDetail] 加载更多 - 原有: ${prev.length}, 新增: ${sortedMessages.length}, 合并后: ${newMessages.length}`);
          return newMessages;
        });
      }
      
      setPage(pageNum);
      setHasMore(result.hasMore);
    } catch (error: any) {
      console.error('[MailDetail] 加载消息失败:', error);
      
      if (error.message === 'NOT_LOGGED_IN' || error.message === 'LOGIN_EXPIRED') {
        Alert.alert(
          '登录已过期',
          '请重新登录后查看消息',
          [
            {
              text: '去登录',
              onPress: () => navigation.navigate('Login'),
            },
            {
              text: '取消',
              style: 'cancel',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      isLoadingRef.current = false;
      console.log(`[MailDetail] 加载完成 - loading: false, refreshing: false, loadingMore: false`);
    }
  }, [speakerId, navigation]);

  // 初始加载
  useEffect(() => {
    console.log(`[MailDetail] 初始化 - speakerId: ${speakerId}, unread: ${mail.unread}`);
    loadMessages(1);
    
    // 只在有未读消息时才标记已读
    if (mail.unread > 0) {
      console.log(`[MailDetail] 标记消息已读 - speakerId: ${speakerId}`);
      markMessageAsRead(speakerId).catch(error => {
        console.error('[MailDetail] 标记已读失败:', error);
      });
    }
  }, [loadMessages, speakerId, mail.unread]);

  // 设置导航标题
  useEffect(() => {
    if (speaker?.nick || speaker?.name || mail.fromNickname || mail.from) {
      navigation.setOptions({
        title: speaker?.nick || speaker?.name || mail.fromNickname || mail.from,
      });
    }
  }, [speaker, mail, navigation]);

  // 下拉刷新
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMessages(1, true);
  }, [loadMessages]);

  // 加载更多
  const onLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || isLoadingRef.current) {
      return;
    }
    setLoadingMore(true);
    loadMessages(page + 1);
  }, [hasMore, loadingMore, page, loadMessages]);

  // 渲染单条消息
  const renderMessage = ({item}: {item: Message}) => {
    const isMe = item.isMe;
    
    return (
      <View style={[styles.messageContainer, isMe && styles.myMessageContainer]}>
        {!isMe && (
          <View style={styles.avatarContainer}>
            {item.senderAvatar ? (
              <ImageWithPlaceholder
                uri={item.senderAvatar}
                style={styles.avatar}
                resizeMode="cover"
                isAvatar={true}
              />
            ) : (
              <View style={[styles.avatarPlaceholder, {backgroundColor: theme.border}]}>
                <Text style={styles.avatarText}>
                  {(item.senderNick || item.senderName).charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        )}
        
        <View style={[
          styles.messageBubble,
          isMe ? [styles.myBubble, {backgroundColor: theme.primary}] : [styles.otherBubble, {backgroundColor: theme.cardBackground}],
        ]}>
          {item.subject && item.subject !== '(无主题)' && (
            <Text style={[
              styles.messageSubject,
              isMe ? styles.myMessageText : {color: theme.text}
            ]}>
              {item.subject}
            </Text>
          )}
          <Text style={[
            styles.messageBody,
            isMe ? styles.myMessageText : {color: theme.text}
          ]}>
            {cleanBody(item.body)}
          </Text>
          <Text style={[
            styles.messageTime,
            isMe ? styles.myTimeText : {color: theme.secondaryText}
          ]}>
            {formatRelativeTime(item.sendTime)}
          </Text>
        </View>
        
        {isMe && <View style={styles.avatarContainer} />}
      </View>
    );
  };

  // 渲染底部加载
  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View style={styles.footerContainer}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.footerText, {color: theme.secondaryText}]}>加载中...</Text>
        </View>
      );
    }
    
    if (!hasMore && messages.length > 0) {
      return (
        <View style={styles.footerContainer}>
          <Text style={[styles.footerText, {color: theme.secondaryText}]}>没有更多消息了</Text>
        </View>
      );
    }
    
    return null;
  };

  // 渲染空状态
  const renderEmpty = () => {
    if (loading) {
      return null;
    }
    
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, {color: theme.secondaryText}]}>暂无消息</Text>
      </View>
    );
  };

  // 发送回复
  const handleSend = useCallback(async () => {
    if (!replyText.trim()) {
      return;
    }
    
    if (sending) {
      return;
    }
    
    // 获取收件人用户名
    const recipientName = speaker?.name || mail.from;
    if (!recipientName) {
      Alert.alert('错误', '无法获取收件人信息');
      return;
    }
    
    // 构造回复的subject：从对方最新消息中获取subject
    // 消息数组是降序排列的（新消息在前），找到第一条对方发送的消息
    const latestOtherMessage = messages.find(msg => !msg.isMe);
    let replySubject = '';
    
    if (latestOtherMessage?.subject && latestOtherMessage.subject !== '(无主题)') {
      // 如果已经是Re:开头，直接使用，否则添加Re:前缀
      if (latestOtherMessage.subject.startsWith('Re:')) {
        replySubject = latestOtherMessage.subject;
      } else {
        replySubject = `Re: ${latestOtherMessage.subject}`;
      }
    }
    
    setSending(true);
    
    try {
      const result = await sendMessage(recipientName, replyText.trim(), replySubject);
      
      if (result.success) {
        // 发送成功，清空输入框并刷新消息列表
        setReplyText('');
        // 刷新消息列表
        await loadMessages(1);
      } else {
        Alert.alert('发送失败', result.message || '请稍后重试');
      }
    } catch (error: any) {
      console.error('Send reply error:', error);
      if (error.message === 'LOGIN_EXPIRED') {
        Alert.alert('登录已过期', '请重新登录');
      } else {
        Alert.alert('发送失败', '请稍后重试');
      }
    } finally {
      setSending(false);
    }
  }, [replyText, sending, speaker, mail, loadMessages, messages]);

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
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          ListEmptyComponent={renderEmpty}
          ListHeaderComponent={renderFooter}
          contentContainerStyle={messages.length === 0 ? styles.emptyList : styles.list}
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.3}
          inverted
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }
        />
        
        {/* 回复输入框 */}
        <View style={[styles.replyContainer, {backgroundColor: theme.cardBackground, borderTopColor: theme.border}]}>
          <TextInput
            style={[styles.replyInput, {color: theme.text, backgroundColor: theme.background}]}
            placeholder="输入回复内容..."
            placeholderTextColor={theme.secondaryText}
            value={replyText}
            onChangeText={setReplyText}
            multiline
            maxLength={1000}
            editable={!sending}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              {backgroundColor: replyText.trim() && !sending ? theme.primary : theme.border}
            ]}
            onPress={handleSend}
            disabled={!replyText.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendButtonText}>发送</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  list: {
    padding: SPACING.md,
  },
  emptyList: {
    flex: 1,
  },
  // 消息容器
  messageContainer: {
    flexDirection: 'row',
    marginBottom: SPACING.lg,
    alignItems: 'flex-end',
  },
  myMessageContainer: {
    flexDirection: 'row-reverse',
  },
  // 头像
  avatarContainer: {
    width: scaleModerate(36),
    marginHorizontal: SPACING.sm,
  },
  avatar: {
    width: scaleModerate(36),
    height: scaleModerate(36),
    borderRadius: scaleModerate(18),
  },
  avatarPlaceholder: {
    width: scaleModerate(36),
    height: scaleModerate(36),
    borderRadius: scaleModerate(18),
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: '#fff',
  },
  // 消息气泡
  messageBubble: {
    maxWidth: '70%',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
  },
  myBubble: {
    borderBottomRightRadius: BORDER_RADIUS.xs,
  },
  otherBubble: {
    borderBottomLeftRadius: BORDER_RADIUS.xs,
  },
  messageSubject: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    marginBottom: SPACING.xs + 2,
  },
  messageBody: {
    fontSize: FONT_SIZE.lg,
    lineHeight: scaleModerate(22),
  },
  messageTime: {
    fontSize: FONT_SIZE.xs,
    marginTop: SPACING.xs + 2,
    textAlign: 'right',
  },
  myMessageText: {
    color: '#fff',
  },
  myTimeText: {
    color: 'rgba(255,255,255,0.7)',
  },
  // 底部
  footerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  footerText: {
    fontSize: FONT_SIZE.sm,
    marginLeft: SPACING.sm,
  },
  // 空状态
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FONT_SIZE.lg,
  },
  // 回复输入框
  replyContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  replyInput: {
    flex: 1,
    minHeight: scaleModerate(36),
    maxHeight: scaleModerate(100),
    borderRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.lg,
    marginRight: SPACING.sm,
  },
  sendButton: {
    width: scaleModerate(60),
    height: scaleModerate(36),
    borderRadius: BORDER_RADIUS.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
});

export default MailDetailScreen;
