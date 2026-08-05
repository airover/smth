import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useTheme} from '../components/ThemedComponents';
import {CheckIcon, HistoryIcon, SearchIcon, XIcon} from '../components/SvgIcons';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  scaleModerate,
} from '../utils/responsive';

const SEARCH_HISTORY_KEY = 'search_history';
const MAX_HISTORY_COUNT = 10;
const SEARCH_TYPE_KEY = 'search_type_selection'; // 搜索类型选择存储key

const SearchInputScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const [keyword, setKeyword] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [searchArticle, setSearchArticle] = useState(true);
  const [searchBoard, setSearchBoard] = useState(true);
  const [searchUser, setSearchUser] = useState(true);

  useEffect(() => {
    loadSearchHistory();
    loadSearchTypeSelection();
  }, []);

  // 加载搜索历史
  const loadSearchHistory = async () => {
    try {
      const history = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
      if (history) {
        setSearchHistory(JSON.parse(history));
      }
    } catch (error) {
      console.error('Load search history error:', error);
    }
  };

  // 加载搜索类型选择
  const loadSearchTypeSelection = async () => {
    try {
      const selection = await AsyncStorage.getItem(SEARCH_TYPE_KEY);
      if (selection) {
        const {article, board, user} = JSON.parse(selection);
        setSearchArticle(article ?? true);
        setSearchBoard(board ?? true);
        setSearchUser(user ?? true);
      }
    } catch (error) {
      console.error('Load search type selection error:', error);
    }
  };

  // 保存搜索类型选择
  const saveSearchTypeSelection = async (
    article: boolean,
    board: boolean,
    user: boolean,
  ) => {
    try {
      const selection = {
        article,
        board,
        user,
      };
      await AsyncStorage.setItem(SEARCH_TYPE_KEY, JSON.stringify(selection));
    } catch (error) {
      console.error('Save search type selection error:', error);
    }
  };

  // 保存搜索历史
  const saveSearchHistory = async (newKeyword: string) => {
    try {
      // 去重并添加到最前面
      const updatedHistory = [
        newKeyword,
        ...searchHistory.filter(item => item !== newKeyword),
      ].slice(0, MAX_HISTORY_COUNT);
      
      await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updatedHistory));
      setSearchHistory(updatedHistory);
    } catch (error) {
      console.error('Save search history error:', error);
    }
  };

  // 清空搜索历史
  const clearSearchHistory = () => {
    Alert.alert(
      '清空搜索历史',
      '确定要清空所有搜索历史吗？',
      [
        {text: '取消', style: 'cancel'},
        {
          text: '确定',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
              setSearchHistory([]);
            } catch (error) {
              console.error('Clear search history error:', error);
              Alert.alert('错误', '清空失败，请稍后重试');
            }
          },
        },
      ]
    );
  };

  // 删除单条搜索历史
  const deleteHistoryItem = async (item: string) => {
    try {
      const updatedHistory = searchHistory.filter(h => h !== item);
      await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updatedHistory));
      setSearchHistory(updatedHistory);
    } catch (error) {
      console.error('Delete history item error:', error);
    }
  };

  // 执行搜索
  const handleSearch = (searchKeyword?: string) => {
    const finalKeyword = searchKeyword || keyword.trim();
    
    if (!finalKeyword) {
      Alert.alert('提示', '请输入搜索关键词');
      return;
    }

    // 检查是否至少选择了一个搜索类型
    if (!searchArticle && !searchBoard && !searchUser) {
      Alert.alert('提示', '请至少选择一个搜索类型');
      return;
    }

    // 保存到搜索历史
    saveSearchHistory(finalKeyword);

    // 跳转到搜索结果页，传递搜索类型参数
    navigation.navigate('Search', {
      keyword: finalKeyword,
      searchArticle,
      searchBoard,
      searchUser,
    });
  };

  // 渲染搜索历史项
  const renderHistoryItem = ({item}: {item: string}) => (
    <View style={[styles.historyItem, {borderBottomColor: theme.border}]}>
      <TouchableOpacity
        style={styles.historyItemContent}
        onPress={() => handleSearch(item)}
        accessibilityRole="button"
        accessibilityLabel={`搜索历史：${item}`}>
        <View style={styles.historyIcon}>
          <HistoryIcon size={18} color={theme.secondaryText} />
        </View>
        <Text style={[styles.historyText, {color: theme.text}]} numberOfLines={1}>
          {item}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => deleteHistoryItem(item)}
        accessibilityRole="button"
        accessibilityLabel={`删除搜索历史：${item}`}>
        <XIcon size={18} color={theme.secondaryText} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.background}]}>
      {/* 搜索输入框 */}
      <View style={[styles.searchContainer, {backgroundColor: theme.cardBackground, borderBottomColor: theme.border}]}>
        <View style={[styles.searchInputWrapper, {backgroundColor: theme.background}]}>
          <View style={styles.searchIcon}>
            <SearchIcon size={18} color={theme.secondaryText} />
          </View>
          <TextInput
            style={[styles.searchInput, {color: theme.text}]}
            placeholder="搜索文章/版面/用户"
            placeholderTextColor={theme.secondaryText}
            value={keyword}
            onChangeText={setKeyword}
            returnKeyType="search"
            onSubmitEditing={() => handleSearch()}
            autoFocus={true}
          />
          {keyword.length > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => setKeyword('')}
              accessibilityRole="button"
              accessibilityLabel="清除搜索关键词">
              <XIcon size={18} color={theme.secondaryText} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}>
          <Text style={[styles.cancelText, {color: theme.primary}]}>取消</Text>
        </TouchableOpacity>
      </View>

      {/* 搜索类型选择 */}
      <View style={[styles.searchTypeContainer, {backgroundColor: theme.cardBackground, borderBottomColor: theme.border}]}>
        <TouchableOpacity
          style={styles.checkboxItem}
          onPress={() => {
            const newValue = !searchArticle;
            setSearchArticle(newValue);
            saveSearchTypeSelection(newValue, searchBoard, searchUser);
          }}
          activeOpacity={0.7}>
          <View style={[styles.checkbox, {borderColor: theme.primary}]}>
            {searchArticle && <CheckIcon size={14} color={theme.primary} />}
          </View>
          <Text style={[styles.checkboxLabel, {color: theme.text}]}>文章</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.checkboxItem}
          onPress={() => {
            const newValue = !searchBoard;
            setSearchBoard(newValue);
            saveSearchTypeSelection(searchArticle, newValue, searchUser);
          }}
          activeOpacity={0.7}>
          <View style={[styles.checkbox, {borderColor: theme.primary}]}>
            {searchBoard && <CheckIcon size={14} color={theme.primary} />}
          </View>
          <Text style={[styles.checkboxLabel, {color: theme.text}]}>版面</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.checkboxItem}
          onPress={() => {
            const newValue = !searchUser;
            setSearchUser(newValue);
            saveSearchTypeSelection(searchArticle, searchBoard, newValue);
          }}
          activeOpacity={0.7}>
          <View style={[styles.checkbox, {borderColor: theme.primary}]}>
            {searchUser && <CheckIcon size={14} color={theme.primary} />}
          </View>
          <Text style={[styles.checkboxLabel, {color: theme.text}]}>用户</Text>
        </TouchableOpacity>
      </View>

      {/* 搜索历史 */}
      {searchHistory.length > 0 && (
        <View style={[styles.historyContainer, {backgroundColor: theme.cardBackground}]}>
          <View style={[styles.historyHeader, {borderBottomColor: theme.border}]}>
            <Text style={[styles.historyTitle, {color: theme.text}]}>搜索历史</Text>
            <TouchableOpacity onPress={clearSearchHistory}>
              <Text style={[styles.clearHistoryText, {color: theme.primary}]}>清空</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={searchHistory}
            renderItem={renderHistoryItem}
            keyExtractor={(item, index) => `history-${index}`}
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}

      {/* 空状态提示 */}
      {searchHistory.length === 0 && (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <SearchIcon size={48} color={theme.secondaryText} />
          </View>
          <Text style={[styles.emptyText, {color: theme.secondaryText}]}>暂无搜索历史</Text>
          <Text style={[styles.emptyHint, {color: theme.secondaryText}]}>输入关键词开始搜索</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.md,
    height: scaleModerate(40),
  },
  searchIcon: {
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.lg,
    padding: 0,
  },
  clearButton: {
    padding: SPACING.xs,
  },
  cancelButton: {
    marginLeft: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  cancelText: {
    fontSize: FONT_SIZE.lg,
  },
  historyContainer: {
    flex: 1,
    marginTop: SPACING.md,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  historyTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
  },
  clearHistoryText: {
    fontSize: FONT_SIZE.md,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyIcon: {
    marginRight: SPACING.md,
  },
  historyText: {
    flex: 1,
    fontSize: FONT_SIZE.lg,
  },
  deleteButton: {
    padding: SPACING.sm,
    marginLeft: SPACING.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: scaleModerate(100),
  },
  emptyIcon: {
    fontSize: scaleModerate(60),
    marginBottom: SPACING.lg,
    opacity: 0.3,
  },
  emptyText: {
    fontSize: FONT_SIZE.xl,
    marginBottom: SPACING.sm,
  },
  emptyHint: {
    fontSize: FONT_SIZE.md,
  },
  searchTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: SPACING.xl,
  },
  checkbox: {
    width: scaleModerate(20),
    height: scaleModerate(20),
    borderWidth: 1.5,
    borderRadius: BORDER_RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  checkboxLabel: {
    fontSize: FONT_SIZE.lg,
  },
});

export default SearchInputScreen;
