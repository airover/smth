/**
 * 缓存管理界面
 * 
 * 功能概览：
 * 1. 显示缓存统计信息
 * 2. 提供多层级的缓存清理功能
 * 
 * 清理功能层级（从小到大）：
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 层级1：分类清理（最小单位）                                      │
 * │ - 清除"帖子类缓存"：hotPosts, postDetail, topicReplies 等     │
 * │ - 清除"版面类缓存"：boards, boardPosts, favoriteBoards 等     │
 * │ - 清除"其他缓存"：userInfo 等                                 │
 * │ - 清除"已读记录"：read_posts_ids, read_posts_details         │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 层级2：内存缓存清理（中等范围）                                  │
 * │ - 清除所有内存缓存 = 清除所有分类（帖子+版面+其他）                │
 * │ - 不影响持久化数据（登录信息、已读记录、设置）                      │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 层级3：全部清理（最大范围）⚠️                                   │
 * │ - 清除所有数据 = 内存缓存 + 持久化数据                           │
 * │ - 包括：登录信息、已读记录、用户设置、浏览历史、搜索历史等          │
 * │ - 需要重新登录                                                │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * 详细说明请参考：CACHE_CLEANUP_GUIDE.md
 */
import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import {getCacheStats, clearCache} from '../services/cacheManager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useAuth} from '../context/AuthContext';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  // scaleModerate - 预留用于响应式布局
} from '../utils/responsive';

const CacheManagementScreen: React.FC = () => {
  const {logout} = useAuth();
  const [cacheStats, setCacheStats] = useState<{
    categories: {name: string; count: number; size: string}[];
    total: number;
  }>({categories: [], total: 0});
  const [asyncStorageStats, setAsyncStorageStats] = useState<{
    readPostsCount: number;
    readPostsSize: number;
  }>({readPostsCount: 0, readPostsSize: 0});
  const [storageSize, setStorageSize] = useState<string>('计算中...');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    // 获取缓存统计
    const stats = getCacheStats();
    setCacheStats(stats);

    // 获取 AsyncStorage 大小（估算）
    try {
      const keys = await AsyncStorage.getAllKeys();
      const items = await AsyncStorage.multiGet(keys);
      let totalSize = 0;
      let readPostsCount = 0;
      let readPostsSize = 0;

      items.forEach(([key, value]) => {
        if (value) {
          const size = value.length;
          totalSize += size;

          if (key === 'read_posts_ids' || key === 'read_posts_details') {
            if (key === 'read_posts_ids') {              try {
                const ids = JSON.parse(value);
                readPostsCount = Array.isArray(ids) ? ids.length : 0;
              } catch {
                readPostsCount = 0;
              }
            }
            readPostsSize += size;
          }
        }
      });
      
      setStorageSize(`${(totalSize / 1024).toFixed(2)} KB`);
      setAsyncStorageStats({
        readPostsCount,
        readPostsSize,
      });
    } catch {
      console.error('Get storage size error');
      setStorageSize('未知');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  /**
   * 清除内存缓存
   * 范围：清除所有内存中的缓存（帖子类、版面类、其他）
   * 不影响：登录信息、已读记录、用户设置等持久化数据
   * 层级：中层清理（包含所有分类的内存缓存）
   */
  const handleClearMemoryCache = () => {
    Alert.alert(
      '清除内存缓存',
      '确定要清除所有内存缓存吗？这不会删除已登录的账号信息。',
      [
        {text: '取消', style: 'cancel'},
        {
          text: '确定',
          style: 'destructive',
          onPress: () => {
            clearCache(); // 清除所有内存缓存
            loadStats();
            Alert.alert('成功', '内存缓存已清除');
          },
        },
      ]
    );
  };

  /**
   * 清除已读帖子记录
   * 范围：仅清除已读帖子的记录（持久化缓存）
   * 不影响：内存缓存、登录信息、用户设置
   * 层级：独立功能（只针对已读记录）
   */
  const handleClearReadPosts = async () => {
    try {
      await AsyncStorage.removeItem('read_posts_ids');
      await AsyncStorage.removeItem('read_posts_details');
      loadStats();
      Alert.alert('成功', '已清除已读记录');
    } catch (error) {
      console.error('Clear read posts error:', error);
      Alert.alert('错误', '清除已读记录失败');
    }
  };

  /**
   * 清除所有数据
   * 范围：清除所有缓存和数据（内存+持久化）
   * 包括：内存缓存、登录信息、已读记录、用户设置、浏览历史、搜索历史等
   * 层级：最高层清理（相当于恢复应用到初始状态）
   * ⚠️ 需要重新登录
   */
  const handleClearAllData = () => {
    Alert.alert(
      '清除所有数据',
      '⚠️ 这将清除所有缓存和登录信息，您需要重新登录。确定继续吗？',
      [
        {text: '取消', style: 'cancel'},
        {
          text: '确定',
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. 清除所有内存缓存
              clearCache();
              // 2. 清除所有持久化数据（包括登录信息）
              await AsyncStorage.clear();
              // 3. 同步更新 AuthContext 登录状态，使依赖 isLoggedIn 的界面正确响应
              await logout();
              loadStats();
              Alert.alert('成功', '所有数据已清除，请重新登录');
            } catch {
              Alert.alert('错误', '清除数据失败');
            }
          },
        },
      ]
    );
  };

  const getCategorizedData = () => {
    const categoryNames: {[key: string]: string} = {
      // 帖子类
      hotPosts: '热门帖子',
      postDetail: '帖子详情',
      topicReplies: '帖子回复',
      channelPosts: '频道帖子',
      albumPosts: '图览帖子',
      topTen: '今日十大',
      // 版面类
      boards: '版面分区',
      subBoards: '子版面',
      boardPosts: '版面帖子',
      hotBoards: '热门版面',
      favoriteBoards: '收藏版面',
      // 其他
      userInfo: '用户信息',
    };

    // 帖子类缓存
    const postCategories = ['hotPosts', 'postDetail', 'topicReplies', 'channelPosts', 'albumPosts', 'topTen'];
    const postData = cacheStats.categories.filter(cat => postCategories.includes(cat.name));
    const postTotal = postData.reduce((sum, cat) => sum + cat.count, 0);
    const postCacheKeys = postData.map(cat => cat.name);

    // 版面类缓存
    const boardCategories = ['boards', 'subBoards', 'boardPosts', 'hotBoards', 'favoriteBoards'];
    const boardData = cacheStats.categories.filter(cat => boardCategories.includes(cat.name));
    const boardTotal = boardData.reduce((sum, cat) => sum + cat.count, 0);
    const boardCacheKeys = boardData.map(cat => cat.name);

    // 其他缓存
    const otherData = cacheStats.categories.filter(
      cat => !postCategories.includes(cat.name) && !boardCategories.includes(cat.name)
    );

    return {
      categoryNames,
      postData: {items: postData, total: postTotal, keys: postCacheKeys},
      boardData: {items: boardData, total: boardTotal, keys: boardCacheKeys},
      otherData,
    };
  };

  /**
   * 渲染分类缓存组
   * 功能：显示单个缓存分类（帖子类/版面类/其他）及其清除按钮
   * 
   * 清除范围：
   * - "帖子类缓存"：清除所有帖子相关的内存缓存
   * - "版面类缓存"：清除所有版面相关的内存缓存
   * - "其他缓存"：清除其他内存缓存（如用户信息）
   * 
   * 不影响：持久化数据、登录信息、其他分类的缓存
   * 层级：最小单位清理（只针对特定分类）
   */
  const renderCategoryGroup = (
    title: string,
    data: {items: {name: string; count: number; size: string}[]; total: number; keys: string[]},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _categoryNames: {[key: string]: string}
  ) => {
    if (data.total === 0) return null;

    // 计算总大小
    const totalSizeKB = data.items.reduce((sum, item) => {
      const sizeMatch = item.size.match(/([\d.]+)\s*KB/);
      return sum + (sizeMatch ? parseFloat(sizeMatch[1]) : 0);
    }, 0);
    const sizeDisplay = totalSizeKB >= 1024 
      ? `${(totalSizeKB / 1024).toFixed(2)} MB` 
      : `${totalSizeKB.toFixed(2)} KB`;

    return (
      <View style={styles.statItem}>
        <View style={styles.statItemLeft}>
          <Text style={styles.statItemName}>{title}</Text>
          <Text style={styles.statItemValue}>
            {data.total} 项 · {sizeDisplay}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.clearButton}
          onPress={() => {
            Alert.alert('清除缓存', `确定要清除所有${title}吗？`, [
              {text: '取消', style: 'cancel'},
              {
                text: '确定',
                onPress: () => {
                  // 清除该分类下的所有缓存项
                  data.keys.forEach(key => clearCache(key as any));
                  loadStats();
                  Alert.alert('成功', `${title}已清除`);
                },
              },
            ]);
          }}>
          <Text style={styles.clearButtonText}>清除</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#007AFF']}
            tintColor="#007AFF"
          />
        }
      >
        {/* 缓存统计 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>缓存统计</Text>
          <View style={styles.card}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>内存缓存项</Text>
              <Text style={styles.summaryValue}>{cacheStats.total} 项</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>本地存储大小</Text>
              <Text style={styles.summaryValue}>{storageSize}</Text>
            </View>
          </View>
        </View>

        {/* 持久化缓存详情 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>持久化缓存</Text>
          <View style={styles.card}>
            <View style={styles.statItem}>
              <View style={styles.statItemLeft}>
                <Text style={styles.statItemName}>已读帖子记录</Text>
                <Text style={styles.statItemValue}>
                  {asyncStorageStats.readPostsCount} 条记录 ({(asyncStorageStats.readPostsSize / 1024).toFixed(2)} KB)
                </Text>
              </View>
              {asyncStorageStats.readPostsCount > 0 && (
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={() => {
                    Alert.alert(
                      '清除记录',
                      '确定要清除所有已读帖子记录吗？',
                      [
                        {text: '取消', style: 'cancel'},
                        {text: '确定', onPress: handleClearReadPosts},
                      ]
                    );
                  }}>
                  <Text style={styles.clearButtonText}>清除</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* 内存缓存详情 - 归类显示 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>内存缓存详情</Text>
          <View style={styles.card}>
            {(() => {
              const {categoryNames, postData, boardData, otherData} = getCategorizedData();
              const hasData = postData.total > 0 || boardData.total > 0 || otherData.length > 0;
              
              if (!hasData) {
                return (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>暂无缓存</Text>
                  </View>
                );
              }

              return (
                <>
                  {postData.total > 0 && renderCategoryGroup('帖子类缓存', postData, categoryNames)}
                  {postData.total > 0 && boardData.total > 0 && <View style={styles.divider} />}
                  {boardData.total > 0 && renderCategoryGroup('版面类缓存', boardData, categoryNames)}
                  {otherData.length > 0 && (postData.total > 0 || boardData.total > 0) && (
                    <View style={styles.divider} />
                  )}
                  {otherData.length > 0 &&
                    renderCategoryGroup(
                      '其他缓存',
                      {
                        items: otherData,
                        total: otherData.reduce((sum, cat) => sum + cat.count, 0),
                        keys: otherData.map(cat => cat.name),
                      },
                      categoryNames
                    )}
                </>
              );
            })()}
          </View>
        </View>

        {/* 操作按钮 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>缓存管理</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.actionButton} onPress={handleClearMemoryCache}>
              <View style={styles.actionButtonContent}>
                <View>
                  <Text style={styles.actionButtonText}>清除内存缓存</Text>
                  <Text style={styles.actionButtonDesc}>不影响登录状态</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.actionButton} onPress={handleClearAllData}>
              <View style={styles.actionButtonContent}>
                <View>
                  <Text style={[styles.actionButtonText, styles.dangerText]}>清除所有数据</Text>
                  <Text style={styles.actionButtonDesc}>包括登录信息，需重新登录</Text>
                </View>
                <Text style={[styles.chevron, styles.dangerText]}>›</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  summaryLabel: {
    fontSize: FONT_SIZE.lg,
    color: '#000',
  },
  summaryValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: '#007AFF',
  },
  statItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  statItemLeft: {
    flex: 1,
  },
  statItemName: {
    fontSize: FONT_SIZE.md,
    color: '#000',
    marginBottom: SPACING.xs,
  },
  statItemValue: {
    fontSize: FONT_SIZE.sm,
    color: '#8E8E93',
  },
  clearButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    backgroundColor: '#f0f0f0',
    borderRadius: BORDER_RADIUS.xs + 2,
  },
  clearButtonText: {
    fontSize: FONT_SIZE.sm,
    color: '#007AFF',
  },
  emptyState: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    color: '#8E8E93',
  },
  actionButton: {
    paddingVertical: SPACING.md,
  },
  actionButtonContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: FONT_SIZE.lg,
    color: '#000',
    fontWeight: '500',
    marginBottom: SPACING.xs,
  },
  actionButtonDesc: {
    fontSize: FONT_SIZE.sm,
    color: '#8E8E93',
  },
  chevron: {
    fontSize: FONT_SIZE.xxxl,
    color: '#C7C7CC',
    fontWeight: '300',
  },
  dangerText: {
    color: '#FF3B30',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#f0f0f0',
    marginVertical: SPACING.sm,
  },
});

export default CacheManagementScreen;
