import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import {useRoute} from '@react-navigation/native';
import {Mail} from '../types';
import {formatRelativeTime} from '../utils/timeFormat';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';

const MailDetailScreen: React.FC = () => {
  const route = useRoute();
  const {mail} = route.params as {mail: Mail};

  // 清理消息正文中的HTML标签和格式
  const cleanBody = (body: string) => {
    return body
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .trim();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        {/* 发件人信息 */}
        <View style={styles.headerCard}>
          <View style={styles.senderInfo}>
            {mail.fromAvatar ? (
              <ImageWithPlaceholder
                uri={mail.fromAvatar}
                style={styles.avatar}
                resizeMode="cover"
                isAvatar={true}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {(mail.fromNickname || mail.from).charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.senderDetails}>
              <Text style={styles.senderName}>
                {mail.fromNickname || mail.from}
              </Text>
              <Text style={styles.sendTime}>
                {formatRelativeTime(mail.sendTime)}
              </Text>
            </View>
          </View>
        </View>

        {/* 消息主题 */}
        <View style={styles.subjectCard}>
          <Text style={styles.subjectLabel}>主题</Text>
          <Text style={styles.subjectText}>{mail.subject}</Text>
        </View>

        {/* 消息正文 */}
        <View style={styles.bodyCard}>
          <Text style={styles.bodyLabel}>内容</Text>
          <Text style={styles.bodyText}>{cleanBody(mail.body)}</Text>
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
  content: {
    flex: 1,
    padding: 16,
  },
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  senderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E1E1E1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#fff',
  },
  senderDetails: {
    flex: 1,
  },
  senderName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  sendTime: {
    fontSize: 13,
    color: '#666',
  },
  subjectCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  subjectLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  subjectText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    lineHeight: 24,
  },
  bodyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  bodyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  bodyText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 24,
  },
});

export default MailDetailScreen;

