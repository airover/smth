import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  SafeAreaView,
  Alert,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getMessages} from '../services/api';
import {Mail} from '../types';
import {formatRelativeTime} from '../utils/timeFormat';

const MailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [mails, setMails] = useState<Mail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    checkLoginAndLoadMails();
  }, []);

  // 页面获得焦点时检查登录状态
  useFocusEffect(
    React.useCallback(() => {
      checkLoginStatus();
    }, [])
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
        style={[styles.mailItem, hasUnread && styles.unreadMail]}
        onPress={() => {
          navigation.navigate('MailDetail', {
            mail: item,
          });
        }}>
        <View style={styles.mailContent}>
          <View style={styles.mailTextContent}>
            <View style={styles.mailHeader}>
              <Text style={styles.mailFrom} numberOfLines={1}>
                {item.fromNickname || item.from}
              </Text>
              <Text style={styles.mailTime}>{formatRelativeTime(item.sendTime)}</Text>
            </View>
            <Text style={styles.mailSubject} numberOfLines={1}>
              {item.subject}
            </Text>
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unread} 条未读</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };


  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>未登录</Text>
          <Text style={styles.emptyText}>请先登录以查看信箱</Text>
          <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
            <Text style={styles.loginButtonText}>前往登录</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={mails}
        renderItem={renderMailItem}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          dataLoaded ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>暂无邮件</Text>
            </View>
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
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mailItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  unreadMail: {
    backgroundColor: '#f0f7ff',
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
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
    marginBottom: 4,
  },
  mailFrom: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    flex: 1,
  },
  mailTime: {
    fontSize: 11,
    color: '#999',
    marginLeft: 8,
  },
  mailSubject: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
    fontWeight: '500',
  },
  mailPreview: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  unreadBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  unreadText: {
    fontSize: 11,
    color: '#007AFF',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginBottom: 24,
  },
  loginButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default MailScreen;

