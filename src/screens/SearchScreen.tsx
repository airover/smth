import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {searchArticles, searchBoards, searchAccounts} from '../services/api';
import {formatRelativeTime} from '../utils/timeFormat';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  scaleModerate,
} from '../utils/responsive';

// 搜索相关常量
const DEFAULT_PAGE = 1; // 默认页码
const DEFAULT_PAGE_SIZE = 20; // 默认每页数量
const LOAD_MORE_THRESHOLD = 0.3; // 触底加载阈值
const SEARCH_HISTORY_KEY = 'search_history'; // 搜索历史存储key
const MAX_HISTORY_COUNT = 10; // 最多保存10条搜索历史

// 搜索结果文章类型
interface SearchArticle {
  id: string;
  subject: string;
  body: string;
  groupId: string;
  postTime: number;
  score: number;
  replyId: string;
  topicId: string;
  topicOrder: number;
  account: {
    id: string;
    name: string;
    nick: string;
    gender: number;
    level: number;
    levelTitle: string;
    avatarUrl?: string;
  };
  board: {
    id: string;
    name: string;
    title: string;
  };
  topic?: {
    id: string;
    subject: string;
    availables: number;
    flushTime: number;
    lastPostTime: number;
  };
}

// 搜索版面类型
interface SearchBoard {
  id: string;
  name: string;
  title: string;
  articleCount: number;
  todayPostCount: number;
  status: number;
}

// 搜索用户类型
interface SearchAccount {
  id: string;
  name: string;
  nick: string;
  gender: number;
  level: number;
  levelTitle: string;
  avatarUrl?: string;
  score: number;
  loginTime: number;
  createTime: number;
}

type SearchTab = 'article' | 'board' | 'account';

const SearchScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = route.params as {
    keyword?: string;
    searchArticle?: boolean;
    searchBoard?: boolean;
    searchUser?: boolean;
  } | undefined;
  
  const [keyword, setKeyword] = useState(params?.keyword || '');
  // 根据传入的搜索类型参数决定默认显示哪个tab
  const getDefaultTab = (): SearchTab => {
    if (params?.searchArticle !== false) return 'article';
    if (params?.searchBoard !== false) return 'board';
    if (params?.searchUser !== false) return 'account';
    return 'article';
  };
  const [activeTab, setActiveTab] = useState<SearchTab>(getDefaultTab());
  
  // 文章搜索状态
  const [articles, setArticles] = useState<SearchArticle[]>([]);
  const [articlePage, setArticlePage] = useState(DEFAULT_PAGE);
  const [articleTotal, setArticleTotal] = useState(0);
  const [articleHasMore, setArticleHasMore] = useState(true);
  
  // 版面搜索状态
  const [boards, setBoards] = useState<SearchBoard[]>([]);
  
  // 用户搜索状态
  const [accounts, setAccounts] = useState<SearchAccount[]>([]);
  const [accountPage, setAccountPage] = useState(DEFAULT_PAGE);
  const [accountTotal, setAccountTotal] = useState(0);
  const [accountHasMore, setAccountHasMore] = useState(true);
  
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [readPosts, setReadPosts] = useState<Set<string>>(new Set());
  const [searched, setSearched] = useState(false); // 是否已执行过搜索

  useEffect(() => {
    loadReadPosts();
    // 如果有初始关键词，自动搜索
    if (params?.keyword) {
      handleSearch();
    }
  }, []);

  // 动态更新导航栏
  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.headerContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="搜索文章/版面/用户"
            value={keyword}
            onChangeText={setKeyword}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
            autoFocus={!params?.keyword} // 如果没有初始关键词，自动聚焦
          />
        </View>
      ),
    });
  }, [keyword, navigation]);

  const loadReadPosts = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem('read_posts_ids');
      if (jsonValue != null) {
        const ids = JSON.parse(jsonValue);
        setReadPosts(new Set(ids));
      }
    } catch (e) {
      console.error('Failed to load read posts:', e);
    }
  };

  // 保存搜索历史
  const saveSearchHistory = async (searchKeyword: string) => {
    try {
      const history = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
      let searchHistory: string[] = history ? JSON.parse(history) : [];
      
      // 去重并添加到最前面
      searchHistory = [
        searchKeyword,
        ...searchHistory.filter(item => item !== searchKeyword),
      ].slice(0, MAX_HISTORY_COUNT);
      
      await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory));
    } catch (error) {
      console.error('Save search history error:', error);
    }
  };

  const markAsRead = async (postId: string) => {
    if (readPosts.has(postId)) return;

    const newReadPosts = new Set(readPosts);
    newReadPosts.add(postId);
    setReadPosts(newReadPosts);

    try {
      await AsyncStorage.setItem('read_posts_ids', JSON.stringify(Array.from(newReadPosts)));
    } catch (e) {
      console.error('Failed to save read post:', e);
    }
  };

  const handleSearch = async () => {
    if (!keyword.trim()) {
      return;
    }
    
    // 保存搜索历史
    await saveSearchHistory(keyword.trim());
    
    // 重置所有状态
    setArticles([]);
    setBoards([]);
    setAccounts([]);
    setArticlePage(DEFAULT_PAGE);
    setAccountPage(DEFAULT_PAGE);
    setArticleHasMore(true);
    setAccountHasMore(true);
    setLoading(true);
    setSearched(true);
    
    try {
      // 根据搜索类型参数决定调用哪些接口
      const shouldSearchArticle = params?.searchArticle !== false;
      const shouldSearchBoard = params?.searchBoard !== false;
      const shouldSearchUser = params?.searchUser !== false;
      
      const promises: Promise<any>[] = [];
      
      if (shouldSearchArticle) {
        promises.push(searchArticles(keyword.trim(), DEFAULT_PAGE, DEFAULT_PAGE_SIZE));
      } else {
        promises.push(Promise.resolve({ articles: [], total: 0, hasMore: false }));
      }
      
      if (shouldSearchBoard) {
        promises.push(searchBoards(keyword.trim()));
      } else {
        promises.push(Promise.resolve([]));
      }
      
      if (shouldSearchUser) {
        promises.push(searchAccounts(keyword.trim(), DEFAULT_PAGE, DEFAULT_PAGE_SIZE));
      } else {
        promises.push(Promise.resolve({ accounts: [], total: 0, hasMore: false }));
      }
      
      // 并行调用需要的搜索接口
      const [articleResult, boardResult, accountResult] = await Promise.all(promises);
      
      setArticles(articleResult.articles);
      setArticleTotal(articleResult.total);
      setArticleHasMore(articleResult.hasMore);
      
      setBoards(boardResult);
      
      setAccounts(accountResult.accounts);
      setAccountTotal(accountResult.total);
      setAccountHasMore(accountResult.hasMore);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (loading || !keyword.trim()) return;
    
    if (activeTab === 'article' && articleHasMore) {
      setLoading(true);
      const nextPage = articlePage + 1;
      
      try {
        const result = await searchArticles(keyword.trim(), nextPage, DEFAULT_PAGE_SIZE);
        setArticles(prev => [...prev, ...result.articles]);
        setArticlePage(nextPage);
        setArticleHasMore(result.hasMore);
      } catch (error) {
        console.error('Load more articles error:', error);
      } finally {
        setLoading(false);
      }
    } else if (activeTab === 'account' && accountHasMore) {
      setLoading(true);
      const nextPage = accountPage + 1;
      
      try {
        const result = await searchAccounts(keyword.trim(), nextPage, DEFAULT_PAGE_SIZE);
        setAccounts(prev => [...prev, ...result.accounts]);
        setAccountPage(nextPage);
        setAccountHasMore(result.hasMore);
      } catch (error) {
        console.error('Load more accounts error:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  const onRefresh = async () => {
    if (!keyword.trim()) return;
    
    setRefreshing(true);
    
    try {
      if (activeTab === 'article') {
        setArticlePage(DEFAULT_PAGE);
        const result = await searchArticles(keyword.trim(), DEFAULT_PAGE, DEFAULT_PAGE_SIZE);
        setArticles(result.articles);
        setArticleTotal(result.total);
        setArticleHasMore(result.hasMore);
      } else if (activeTab === 'board') {
        const result = await searchBoards(keyword.trim());
        setBoards(result);
      } else if (activeTab === 'account') {
        setAccountPage(DEFAULT_PAGE);
        const result = await searchAccounts(keyword.trim(), DEFAULT_PAGE, DEFAULT_PAGE_SIZE);
        setAccounts(result.accounts);
        setAccountTotal(result.total);
        setAccountHasMore(result.hasMore);
      }
    } catch (error) {
      console.error('Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const renderArticleItem = ({item}: {item: SearchArticle}) => {
    const isRead = readPosts.has(item.topicId);
    
    // 处理高亮的标题（移除HTML标签）
    const cleanSubject = item.subject.replace(/<[^>]*>/g, '');
    
    return (
      <TouchableOpacity
        style={styles.articleItem}
        onPress={() => {
          markAsRead(item.topicId);
          navigation.navigate('PostDetail', {
            board: item.board.name,
            postId: item.topicId,
          });
        }}>
        <View style={styles.articleHeader}>
          <Text 
            style={[
              styles.articleTitle,
              isRead && styles.readArticleTitle
            ]} 
            numberOfLines={2}
          >
            {cleanSubject}
          </Text>
        </View>
        
        {/* 文章预览内容 */}
        {item.body && (
          <Text style={styles.articleBody} numberOfLines={2}>
            {item.body}
          </Text>
        )}
        
        <View style={styles.articleMeta}>
          <View style={styles.articleAuthorInfo}>
            <Text style={styles.metaText}>
              {item.account.nick} ({item.account.name})
            </Text>
            {item.account.levelTitle && (
              <Text style={styles.levelTitle}> · {item.account.levelTitle}</Text>
            )}
          </View>
          <View style={styles.articleStats}>
            <Text style={styles.metaText}>{item.topic?.availables || 0} 回复</Text>
            <Text style={styles.statsText}>{formatRelativeTime(item.postTime)}</Text>
          </View>
        </View>
        
        {/* 版面信息 */}
        <View style={styles.articleBoard}>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              navigation.navigate('MainTabs', {
                screen: 'Board',
                params: {
                  board: item.board.id,
                  boardName: item.board.title,
                  source: 'search',
                },
              });
            }}>
            <Text style={styles.boardNameText}>📋 {item.board.title}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderBoardItem = ({item}: {item: SearchBoard}) => {
    // 清理HTML标签
    const cleanTitle = item.title.replace(/<[^>]*>/g, '');
    const cleanName = item.name.replace(/<[^>]*>/g, '');
    
    return (
      <TouchableOpacity
        style={styles.boardItem}
        onPress={() => {
          navigation.navigate('MainTabs', {
            screen: 'Board',
            params: {
              board: item.id,
              boardName: cleanTitle,
              source: 'search',
            },
          });
        }}>
        <View style={styles.boardHeader}>
          <Text style={styles.boardTitle}>{cleanTitle}</Text>
          <Text style={styles.boardName}>({cleanName})</Text>
        </View>
        <View style={styles.boardStats}>
          <Text style={styles.boardStatText}>📝 {item.articleCount} 篇文章</Text>
          <Text style={styles.boardStatText}>🔥 今日 {item.todayPostCount} 帖</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderAccountItem = ({item}: {item: SearchAccount}) => {
    const genderIcon = item.gender === 1 ? '♂' : item.gender === 2 ? '♀' : '';
    
    // 清理HTML标签
    const cleanNick = item.nick.replace(/<[^>]*>/g, '');
    const cleanName = item.name.replace(/<[^>]*>/g, '');
    const cleanLevelTitle = item.levelTitle ? item.levelTitle.replace(/<[^>]*>/g, '') : '';
    
    return (
      <TouchableOpacity
        style={styles.accountItem}
        onPress={() => {
          navigation.navigate('UserProfile', { username: cleanName });
        }}>
        <View style={styles.accountContainer}>
          {/* 用户头像 */}
          {item.avatarUrl ? (
            <ImageWithPlaceholder
              uri={item.avatarUrl}
              style={styles.accountAvatar}
              resizeMode="cover"
              isAvatar={true}
            />
          ) : (
            <View style={styles.accountAvatarPlaceholder}>
              <Text style={styles.accountAvatarText}>
                {cleanNick.charAt(0) || cleanName.charAt(0) || '?'}
              </Text>
            </View>
          )}
          
          {/* 用户信息 */}
          <View style={styles.accountContent}>
            <View style={styles.accountHeader}>
              <View style={styles.accountInfo}>
                <Text style={styles.accountNick}>
                  {cleanNick} {genderIcon}
                </Text>
                <Text style={styles.accountName}>@{cleanName}</Text>
              </View>
              {cleanLevelTitle && (
                <Text style={styles.accountLevel}>{cleanLevelTitle}</Text>
              )}
            </View>
            <View style={styles.accountMeta}>
              <Text style={styles.accountMetaText}>积分: {item.score}</Text>
              <Text style={styles.accountMetaText}>等级: {item.level}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    // 版面搜索不支持分页
    if (activeTab === 'board') return null;
    
    const hasMore = activeTab === 'article' ? articleHasMore : accountHasMore;
    
    if (!hasMore) return null;
    
    return (
      <View style={styles.footerContainer}>
        {loading ? (
          <ActivityIndicator size="small" color="#007AFF" />
        ) : (
          <TouchableOpacity 
            style={styles.loadMoreButton}
            onPress={loadMore}>
            <Text style={styles.loadMoreText}>加载更多</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderEmptyComponent = () => {
    if (loading) return null;
    
    if (!searched) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>请输入关键词进行搜索</Text>
          <Text style={styles.hintText}>支持搜索文章、版面和用户</Text>
        </View>
      );
    }
    
    const emptyMessages = {
      article: '未找到相关文章',
      board: '未找到相关版面',
      account: '未找到相关用户',
    };
    
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{emptyMessages[activeTab]}</Text>
        <Text style={styles.hintText}>试试其他关键词</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Tab切换 */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'article' && styles.activeTabItem]}
          onPress={() => setActiveTab('article')}>
          <Text style={[styles.tabText, activeTab === 'article' && styles.activeTabText]}>
            文章 {searched && articleTotal > 0 ? `(${articleTotal})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'board' && styles.activeTabItem]}
          onPress={() => setActiveTab('board')}>
          <Text style={[styles.tabText, activeTab === 'board' && styles.activeTabText]}>
            版面 {searched && boards.length > 0 ? `(${boards.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'account' && styles.activeTabItem]}
          onPress={() => setActiveTab('account')}>
          <Text style={[styles.tabText, activeTab === 'account' && styles.activeTabText]}>
            用户 {searched && accountTotal > 0 ? `(${accountTotal})` : ''}
          </Text>
        </TouchableOpacity>
      </View>
      
      {loading && !searched ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <>
          {activeTab === 'article' && (
            <FlatList
              data={articles}
              renderItem={renderArticleItem}
              keyExtractor={(item, index) => `article-${item.id}-${index}`}
              onEndReached={loadMore}
              onEndReachedThreshold={LOAD_MORE_THRESHOLD}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              ListEmptyComponent={renderEmptyComponent}
              ListFooterComponent={renderFooter}
            />
          )}
          
          {activeTab === 'board' && (
            <FlatList
              data={boards}
              renderItem={renderBoardItem}
              keyExtractor={(item, index) => `board-${item.id}-${index}`}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              ListEmptyComponent={renderEmptyComponent}
            />
          )}
          
          {activeTab === 'account' && (
            <FlatList
              data={accounts}
              renderItem={renderAccountItem}
              keyExtractor={(item, index) => `account-${item.id}-${index}`}
              onEndReached={loadMore}
              onEndReachedThreshold={LOAD_MORE_THRESHOLD}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              ListEmptyComponent={renderEmptyComponent}
              ListFooterComponent={renderFooter}
            />
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  headerContainer: {
    flex: 1,
    marginHorizontal: SPACING.lg,
  },
  searchInput: {
    height: scaleModerate(36),
    backgroundColor: '#f0f0f0',
    borderRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    fontSize: FONT_SIZE.md,
    color: '#333',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tabItem: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTabItem: {
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: FONT_SIZE.lg,
    color: '#666',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  articleItem: {
    backgroundColor: '#fff',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  articleHeader: {
    marginBottom: SPACING.sm,
  },
  articleTitle: {
    fontSize: FONT_SIZE.lg,
    color: '#000',
    fontWeight: '500',
    lineHeight: FONT_SIZE.xxl,
  },
  readArticleTitle: {
    color: '#999',
    fontWeight: 'normal',
  },
  articleBody: {
    fontSize: FONT_SIZE.md,
    color: '#666',
    lineHeight: FONT_SIZE.xl,
    marginBottom: SPACING.sm,
  },
  articleMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  articleAuthorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  levelTitle: {
    fontSize: FONT_SIZE.xs,
    color: '#999',
  },
  articleStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: FONT_SIZE.sm,
    color: '#666',
  },
  statsText: {
    fontSize: FONT_SIZE.sm,
    color: '#666',
    marginLeft: SPACING.md,
  },
  articleBoard: {
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f0f0f0',
  },
  boardNameText: {
    fontSize: FONT_SIZE.sm,
    color: '#1890ff',
  },
  boardItem: {
    backgroundColor: '#fff',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  boardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  boardTitle: {
    fontSize: FONT_SIZE.lg,
    color: '#000',
    fontWeight: '500',
    marginRight: SPACING.sm,
  },
  boardName: {
    fontSize: FONT_SIZE.md,
    color: '#666',
  },
  boardStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  boardStatText: {
    fontSize: FONT_SIZE.sm,
    color: '#999',
    marginRight: SPACING.lg,
  },
  accountItem: {
    backgroundColor: '#fff',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  accountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accountAvatar: {
    width: scaleModerate(50),
    height: scaleModerate(50),
    borderRadius: scaleModerate(25),
    marginRight: SPACING.md,
    backgroundColor: '#f0f0f0',
  },
  accountAvatarPlaceholder: {
    width: scaleModerate(50),
    height: scaleModerate(50),
    borderRadius: scaleModerate(25),
    marginRight: SPACING.md,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountAvatarText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    color: '#fff',
  },
  accountContent: {
    flex: 1,
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  accountInfo: {
    flex: 1,
  },
  accountNick: {
    fontSize: FONT_SIZE.lg,
    color: '#000',
    fontWeight: '500',
    marginBottom: SPACING.xs,
  },
  accountName: {
    fontSize: FONT_SIZE.md,
    color: '#666',
  },
  accountLevel: {
    fontSize: FONT_SIZE.sm,
    color: '#007AFF',
    backgroundColor: '#E8F4FF',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  accountMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accountMetaText: {
    fontSize: FONT_SIZE.sm,
    color: '#999',
    marginRight: SPACING.lg,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: scaleModerate(100),
  },
  emptyText: {
    fontSize: FONT_SIZE.lg,
    color: '#999',
    marginBottom: SPACING.sm,
  },
  hintText: {
    fontSize: FONT_SIZE.md,
    color: '#ccc',
    textAlign: 'center',
    paddingHorizontal: SPACING.xxxl,
    lineHeight: FONT_SIZE.xl,
  },
  footerContainer: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  loadMoreButton: {
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.sm + 2,
    backgroundColor: '#f9f9f9',
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  loadMoreText: {
    fontSize: FONT_SIZE.md,
    color: '#007AFF',
    fontWeight: '500',
  },
});

export default SearchScreen;