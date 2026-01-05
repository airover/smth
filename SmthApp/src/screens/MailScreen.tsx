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
  Image,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {getMessages} from '../services/api';
import {Mail} from '../types';
import {formatRelativeTime} from '../utils/timeFormat';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';

const MailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [mails, setMails] = useState<Mail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadMails();
  }, []);

  const loadMails = async () => {
    try {
      const data = await getMessages();
      console.log('Loaded messages:', data.length);
      setMails(data);
    } catch (error) {
      console.error('Load mails error:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMails();
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
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>暂无邮件</Text>
          </View>
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
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
});

export default MailScreen;

