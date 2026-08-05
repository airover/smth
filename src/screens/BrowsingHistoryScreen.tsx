import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SwipeListView} from 'react-native-swipe-list-view';
import {formatRelativeTime} from '../utils/timeFormat';
import {useTheme, SkeletonList, EmptyState} from '../components/ThemedComponents';
import {HistoryIcon, ChevronRightIcon} from '../components/SvgIcons';
import {getCardElevation} from '../utils/theme';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  scaleModerate,
} from '../utils/responsive';

interface BrowsingHistoryItem {
  postId: string;
  board: string;
  title: string;
  author: string;
  boardName?: string;
  replyCount?: number;
  timestamp: number; // 加入缓存的时间
}

const BROWSING_HISTORY_KEY = 'read_posts_details';
const READ_POSTS_IDS_KEY = 'read_posts_ids';
const MAX_HISTORY_ITEMS = 100; // 最多保存100条历史记录

const BrowsingHistoryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const [history, setHistory] = useState<BrowsingHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  // 页面获得焦点时重新加载
  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const loadHistory = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(BROWSING_HISTORY_KEY);
      if (jsonValue != null) {
        const historyData: BrowsingHistoryItem[] = JSON.parse(jsonValue);
        // 按时间倒序排序
        historyData.sort((a, b) => b.timestamp - a.timestamp);
        setHistory(historyData);
      }
    } catch (e) {
      console.error('Failed to load browsing history:', e);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  const handleClearAll = () => {
    Alert.alert(
      '清除浏览历史',
      '确定要清除所有浏览历史吗？',
      [
        {text: '取消', style: 'cancel'},
        {
          text: '确定',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem(BROWSING_HISTORY_KEY);
              await AsyncStorage.removeItem(READ_POSTS_IDS_KEY);
              setHistory([]);
              Alert.alert('成功', '浏览历史已清除');
            } catch (error) {
              console.error('Clear history error:', error);
              Alert.alert('错误', '清除失败');
            }
          },
        },
      ]
    );
  };

  const handleDeleteItem = async (postId: string) => {
    try {
      // 1. 从详细信息中删除
      const newHistory = history.filter(item => item.postId !== postId);
      await AsyncStorage.setItem(BROWSING_HISTORY_KEY, JSON.stringify(newHistory));
      setHistory(newHistory);
      
      // 2. 从已读ID集合中删除
      const idsJsonValue = await AsyncStorage.getItem(READ_POSTS_IDS_KEY);
      if (idsJsonValue) {
        const readPostsIds: string[] = JSON.parse(idsJsonValue);
        const newIds = readPostsIds.filter(id => id !== postId);
        await AsyncStorage.setItem(READ_POSTS_IDS_KEY, JSON.stringify(newIds));
      }
    } catch (error) {
      console.error('Delete history item error:', error);
      Alert.alert('错误', '删除失败');
    }
  };

  const handlePostPress = (item: BrowsingHistoryItem) => {
    navigation.navigate('PostDetail', {
      board: item.board,
      postId: item.postId,
    });
  };

  const renderItem = ({item}: {item: BrowsingHistoryItem}) => (
    <TouchableOpacity
      style={[styles.historyItem, {backgroundColor: theme.cardBackground}, getCardElevation(theme)]}
      onPress={() => handlePostPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.itemContent}>
        <Text style={[styles.title, {color: theme.text}]} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.metaText, {color: theme.secondaryText}]}>
            {item.boardName || item.board}
          </Text>
          <Text style={[styles.metaText, {color: theme.secondaryText}]}>·</Text>
          <Text style={[styles.metaText, {color: theme.secondaryText}]}>{item.author}</Text>
          {item.replyCount !== undefined && (
            <>
              <Text style={[styles.metaText, {color: theme.secondaryText}]}>·</Text>
              <Text style={[styles.metaText, {color: theme.secondaryText}]}>{item.replyCount} 回复</Text>
            </>
          )}
        </View>
        <Text style={[styles.timeText, {color: theme.secondaryText}]}>
          浏览于 {formatRelativeTime(new Date(item.timestamp).toISOString())}
        </Text>
      </View>
      <View style={styles.chevron}>
        <ChevronRightIcon size={18} color={theme.chevron} />
      </View>
    </TouchableOpacity>
  );

  const renderHiddenItem = ({item}: {item: BrowsingHistoryItem}) => (
    <View style={[styles.rowBack, {backgroundColor: theme.background}]}>
      <TouchableOpacity
        style={[styles.deleteButton, {backgroundColor: theme.error}]}
        onPress={() => handleDeleteItem(item.postId)}
      >
        <Text style={styles.deleteButtonText}>删除</Text>
      </TouchableOpacity>
    </View>
  );

  const renderEmpty = () => (
    <EmptyState
      icon={<HistoryIcon size={48} color={theme.secondaryText} />}
      title="暂无浏览记录"
      subtitle="看过的帖子会出现在这里"
      actionLabel="去首页看看"
      onAction={() => navigation.navigate('MainTabs', {screen: 'Home'})}
    />
  );

  const renderHeader = () => {
    if (history.length === 0) return null;
    
    return (
      <View style={styles.header}>
        <Text style={[styles.headerText, {color: theme.secondaryText}]}>共 {history.length} 条记录</Text>
        <TouchableOpacity onPress={handleClearAll}>
          <Text style={[styles.clearAllText, {color: theme.error}]}>清空</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, {backgroundColor: theme.background}]}>
        <SkeletonList count={6} />
      </View>
    );
  }

  return (
    <View style={[styles.container, {backgroundColor: theme.background}]}>
      <SwipeListView
        data={history}
        renderItem={renderItem}
        renderHiddenItem={renderHiddenItem}
        keyExtractor={(item) => item.postId}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={history.length === 0 ? styles.emptyList : styles.list}
        rightOpenValue={-75}
        disableRightSwipe
        closeOnRowPress
        closeOnScroll
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.primary]}
            tintColor={theme.primary}
          />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    padding: SPACING.md,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.md,
  },
  headerText: {
    fontSize: FONT_SIZE.sm,
  },
  clearAllText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
  },
  historyItem: {
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemContent: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '500',
    marginBottom: SPACING.sm,
    lineHeight: FONT_SIZE.xxl,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs + 2,
  },
  metaText: {
    fontSize: FONT_SIZE.sm,
    marginRight: SPACING.xs + 2,
  },
  timeText: {
    fontSize: FONT_SIZE.xs,
  },
  chevron: {
    marginLeft: SPACING.sm,
    justifyContent: 'center',
  },
  rowBack: {
    alignItems: 'flex-end',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingRight: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  deleteButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: scaleModerate(75),
    height: '100%',
    borderTopRightRadius: BORDER_RADIUS.md,
    borderBottomRightRadius: BORDER_RADIUS.md,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
});

export default BrowsingHistoryScreen;

// 导出保存浏览历史的工具函数
export const saveBrowsingHistory = async (item: Omit<BrowsingHistoryItem, 'timestamp'>) => {
  try {
    // 1. 更新详细信息存储
    const jsonValue = await AsyncStorage.getItem(BROWSING_HISTORY_KEY);
    let history: BrowsingHistoryItem[] = jsonValue ? JSON.parse(jsonValue) : [];
    
    // 移除已存在的相同帖子（如果有）
    history = history.filter(h => h.postId !== item.postId);
    
    // 添加新记录到开头
    history.unshift({
      ...item,
      timestamp: Date.now(),
    });
    
    // 限制最大数量
    if (history.length > MAX_HISTORY_ITEMS) {
      history = history.slice(0, MAX_HISTORY_ITEMS);
    }
    
    await AsyncStorage.setItem(BROWSING_HISTORY_KEY, JSON.stringify(history));
    
    // 2. 使用读-改-写模式同步更新已读帖子ID集合，避免数据丢失
    const idsJsonValue = await AsyncStorage.getItem(READ_POSTS_IDS_KEY);
    const readPostsIds: string[] = idsJsonValue ? JSON.parse(idsJsonValue) : [];
    
    if (!readPostsIds.includes(item.postId)) {
      readPostsIds.push(item.postId);
      await AsyncStorage.setItem(READ_POSTS_IDS_KEY, JSON.stringify(readPostsIds));
    }
    
    console.log('[BrowsingHistory] Saved:', item.title);
  } catch (error) {
    console.error('[BrowsingHistory] Save error:', error);
  }
};
