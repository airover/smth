import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import {getCacheStats, clearCache, cleanExpiredCache} from '../services/cacheManager';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CacheManagementScreen: React.FC = () => {
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
            if (key === 'read_posts_ids') {
              try {
                const ids = JSON.parse(value);
                readPostsCount = Array.isArray(ids) ? ids.length : 0;
              } catch (e) {
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
    } catch (error) {
      console.error('Get storage size error:', error);
      setStorageSize('未知');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

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
            clearCache();
            loadStats();
            Alert.alert('成功', '内存缓存已清除');
          },
        },
      ]
    );
  };

  const handleClearExpiredCache = () => {
    const cleaned = cleanExpiredCache();
    loadStats();
    Alert.alert('成功', `已清理 ${cleaned} 个过期缓存项`);
  };

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
              // 清除内存缓存
              clearCache();
              // 清除 AsyncStorage
              await AsyncStorage.clear();
              loadStats();
              Alert.alert('成功', '所有数据已清除，请重新登录');
            } catch (error) {
              Alert.alert('错误', '清除数据失败');
            }
          },
        },
      ]
    );
  };

  const renderCategoryItem = (category: {name: string; count: number; size: string}) => {
    const categoryNames: {[key: string]: string} = {
      boards: '版面分区',
      subBoards: '子版面',
      boardPosts: '版面帖子',
      userInfo: '用户信息',
      favoriteBoards: '收藏版面',
      topTen: '今日十大',
      hotBoards: '热门版面',
      postDetail: '帖子详情',
      topicReplies: '帖子回复',
    };

    return (
      <View key={category.name} style={styles.statItem}>
        <View style={styles.statItemLeft}>
          <Text style={styles.statItemName}>{categoryNames[category.name] || category.name}</Text>
          <Text style={styles.statItemValue}>{category.size}</Text>
        </View>
        {category.count > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => {
              Alert.alert(
                '清除缓存',
                `确定要清除"${categoryNames[category.name]}"的缓存吗？`,
                [
                  {text: '取消', style: 'cancel'},
                  {
                    text: '确定',
                    onPress: () => {
                      clearCache(category.name as any);
                      loadStats();
                      Alert.alert('成功', '缓存已清除');
                    },
                  },
                ]
              );
            }}>
            <Text style={styles.clearButtonText}>清除</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
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

        {/* 内存缓存详情 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>内存缓存详情</Text>
          <View style={styles.card}>
            {cacheStats.categories.map(renderCategoryItem)}
          </View>
        </View>

        {/* 操作按钮 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>缓存管理</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.actionButton} onPress={handleClearExpiredCache}>
              <View style={styles.actionButtonContent}>
                <View>
                  <Text style={styles.actionButtonText}>清理过期缓存</Text>
                  <Text style={styles.actionButtonDesc}>清理超过1分钟的缓存项</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.divider} />

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

        {/* 说明 */}
        <View style={styles.section}>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>缓存策略</Text>
              <Text style={styles.infoValue}>1分钟自动过期</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>清理建议</Text>
              <Text style={styles.infoValue}>每周一次</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
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
    paddingVertical: 12,
  },
  summaryLabel: {
    fontSize: 15,
    color: '#000',
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007AFF',
  },
  statItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  statItemLeft: {
    flex: 1,
  },
  statItemName: {
    fontSize: 14,
    color: '#000',
    marginBottom: 4,
  },
  statItemValue: {
    fontSize: 12,
    color: '#8E8E93',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  clearButtonText: {
    fontSize: 13,
    color: '#007AFF',
  },
  actionButton: {
    paddingVertical: 12,
  },
  actionButtonContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 16,
    color: '#000',
    fontWeight: '500',
    marginBottom: 4,
  },
  actionButtonDesc: {
    fontSize: 13,
    color: '#8E8E93',
  },
  chevron: {
    fontSize: 24,
    color: '#C7C7CC',
    fontWeight: '300',
  },
  dangerText: {
    color: '#FF3B30',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#f0f0f0',
    marginVertical: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoLabel: {
    fontSize: 15,
    color: '#000',
  },
  infoValue: {
    fontSize: 15,
    color: '#8E8E93',
  },
});

export default CacheManagementScreen;




