import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  Modal,
  Switch,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {logout} from '../services/api';
import {useSettings} from '../context/SettingsContext';
import {useTheme} from '../components/ThemedComponents';

const SettingsDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const [username, setUsername] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const {settings, updateSettings} = useSettings();
  const [showFontSizeModal, setShowFontSizeModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);

  useEffect(() => {
    loadUserStatus();
  }, []);

  const loadUserStatus = async () => {
    try {
      const storedUsername = await AsyncStorage.getItem('username');
      const loginStatus = await AsyncStorage.getItem('isLoggedIn');
      
      if (storedUsername) {
        setUsername(storedUsername);
      }
      setIsLoggedIn(loginStatus === 'true');
    } catch (error) {
      console.error('Load user status error:', error);
    }
  };

  const handleLogout = () => {
    Alert.alert('确认', '确定要退出登录吗？', [
      {
        text: '取消',
        style: 'cancel',
      },
      {
        text: '确定',
        style: 'destructive',
        onPress: async () => {
          await logout();
          setUsername('');
          setIsLoggedIn(false);
          // 返回上一页
          navigation.goBack();
        },
      },
    ]);
  };

  const getFontSizeLabel = () => {
    switch (settings.fontSize) {
      case 'small':
        return '小';
      case 'medium':
        return '中';
      case 'large':
        return '大';
      default:
        return '中';
    }
  };

  const getThemeLabel = () => {
    switch (settings.themeMode) {
      case 'light':
        return '日间模式';
      case 'dark':
        return '夜间模式';
      case 'auto':
        return '跟随系统';
      default:
        return '日间模式';
    }
  };

  const handleSortToggle = async (value: boolean) => {
    await updateSettings({defaultBoardSort: value ? 'reply' : 'post'});
  };

  const renderSelectionModal = (
    visible: boolean,
    onClose: () => void,
    title: string,
    options: Array<{label: string; value: any; current: boolean}>,
    onSelect: (value: any) => void,
  ) => (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}>
      <TouchableOpacity 
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}>
        <View style={[styles.modalContent, {backgroundColor: theme.cardBackground}]} onStartShouldSetResponder={() => true}>
          <View style={[styles.modalHeader, {borderBottomColor: theme.border}]}>
            <Text style={[styles.modalTitle, {color: theme.text}]}>{title}</Text>
          </View>
          {options.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.modalOption,
                {borderBottomColor: theme.border},
                index === options.length - 1 && styles.modalOptionLast,
              ]}
              onPress={() => {
                onSelect(option.value);
                onClose();
              }}>
              <Text style={[
                styles.modalOptionText,
                {color: theme.text},
                option.current && {color: theme.primary, fontWeight: '600'},
              ]}>
                {option.label}
              </Text>
              {option.current && (
                <Text style={[styles.modalCheckmark, {color: theme.primary}]}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.background}]}>
      <ScrollView style={styles.content}>
        {/* 个人中心 */}
        {username && (
          <View style={styles.firstSection}>
            <View style={[styles.card, {backgroundColor: theme.cardBackground}]}>
              <TouchableOpacity 
                style={styles.menuItem}
                onPress={() => navigation.navigate('UserProfile', { username })}>
                <View style={styles.menuItemLeft}>
                  <Text style={styles.menuIcon}>👤</Text>
                  <Text style={[styles.menuItemText, {color: theme.text}]}>个人资料</Text>
                </View>
                <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 显示与阅读 */}
        <View style={username ? styles.section : styles.firstSection}>
          <Text style={[styles.sectionTitle, {color: theme.secondaryText}]}>显示与阅读</Text>
          <View style={[styles.card, {backgroundColor: theme.cardBackground}]}>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => setShowFontSizeModal(true)}>
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuIcon}>🔤</Text>
                <Text style={[styles.menuItemText, {color: theme.text}]}>帖子字体大小</Text>
              </View>
              <View style={styles.menuItemRight}>
                <Text style={[styles.menuValue, {color: theme.secondaryText}]}>{getFontSizeLabel()}</Text>
                <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
              </View>
            </TouchableOpacity>
            <View style={[styles.divider, {backgroundColor: theme.border}]} />
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => setShowThemeModal(true)}>
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuIcon}>🌙</Text>
                <Text style={[styles.menuItemText, {color: theme.text}]}>主题模式</Text>
              </View>
              <View style={styles.menuItemRight}>
                <Text style={[styles.menuValue, {color: theme.secondaryText}]}>{getThemeLabel()}</Text>
                <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* 浏览偏好 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, {color: theme.secondaryText}]}>浏览偏好</Text>
          <View style={[styles.card, {backgroundColor: theme.cardBackground}]}>
            <View style={styles.menuItem}>
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuIcon}>📊</Text>
                <View style={styles.switchItemContent}>
                  <Text style={[styles.menuItemText, {color: theme.text}]}>按回复时间排序</Text>
                  <Text style={[styles.switchItemDescription, {color: theme.secondaryText}]}>
                    {settings.defaultBoardSort === 'reply' 
                      ? '显示最近有回复的帖子' 
                      : '显示最新发布的帖子'}
                  </Text>
                </View>
              </View>
              <Switch
                value={settings.defaultBoardSort === 'reply'}
                onValueChange={handleSortToggle}
                trackColor={{false: theme.border, true: '#34C759'}}
                thumbColor="#fff"
                ios_backgroundColor={theme.border}
              />
            </View>
          </View>
        </View>

        {/* 数据管理 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, {color: theme.secondaryText}]}>数据管理</Text>
          <View style={[styles.card, {backgroundColor: theme.cardBackground}]}>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigation.navigate('CacheManagement')}>
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuIcon}>🗂</Text>
                <Text style={[styles.menuItemText, {color: theme.text}]}>缓存管理</Text>
              </View>
              <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 关于 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, {color: theme.secondaryText}]}>关于</Text>
          <View style={[styles.card, {backgroundColor: theme.cardBackground}]}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, {color: theme.text}]}>应用版本</Text>
              <Text style={[styles.infoValue, {color: theme.secondaryText}]}>1.0.0</Text>
            </View>
            <View style={[styles.divider, {backgroundColor: theme.border}]} />
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, {color: theme.text}]}>缓存策略</Text>
              <Text style={[styles.infoValue, {color: theme.secondaryText}]}>1分钟自动过期</Text>
            </View>
          </View>
        </View>

        {/* 账号操作 */}
        {isLoggedIn && (
          <>
            {/* 切换帐号 */}
            <View style={styles.section}>
              <TouchableOpacity 
                style={[styles.switchAccountButton, {backgroundColor: theme.cardBackground}]}
                onPress={() => navigation.navigate('AccountSwitch')}
                activeOpacity={0.8}
              >
                <Text style={[styles.switchAccountButtonText, {color: theme.primary}]}>切换帐号</Text>
              </TouchableOpacity>
            </View>

            {/* 退出登录 */}
            <View style={styles.section}>
              <TouchableOpacity 
                style={[styles.logoutButton, {backgroundColor: theme.cardBackground}]}
                onPress={handleLogout}
                activeOpacity={0.8}
              >
                <Text style={[styles.logoutButtonText, {color: theme.error}]}>退出登录</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* 底部留白 */}
        <View style={{height: 40}} />
      </ScrollView>

      {/* 字体大小选择模态框 */}
      {renderSelectionModal(
        showFontSizeModal,
        () => setShowFontSizeModal(false),
        '帖子字体大小',
        [
          {label: '小', value: 'small', current: settings.fontSize === 'small'},
          {label: '中', value: 'medium', current: settings.fontSize === 'medium'},
          {label: '大', value: 'large', current: settings.fontSize === 'large'},
        ],
        async (value) => {
          await updateSettings({fontSize: value});
        },
      )}

      {/* 主题模式选择模态框 */}
      {renderSelectionModal(
        showThemeModal,
        () => setShowThemeModal(false),
        '主题模式',
        [
          {label: '日间模式', value: 'light', current: settings.themeMode === 'light'},
          {label: '夜间模式', value: 'dark', current: settings.themeMode === 'dark'},
          {label: '跟随系统', value: 'auto', current: settings.themeMode === 'auto'},
        ],
        async (value) => {
          await updateSettings({themeMode: value});
        },
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor 由主题动态控制
  },
  content: {
    flex: 1,
  },
  firstSection: {
    marginTop: 12,
    paddingHorizontal: 12,
  },
  section: {
    marginTop: 16,
    paddingHorizontal: 12,
  },
  sectionTitle: {
    fontSize: 13,
    // color 由主题动态控制
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    // backgroundColor 由主题动态控制
    borderRadius: 8,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuIcon: {
    fontSize: 22,
    marginRight: 14,
    width: 28,
    textAlign: 'center',
  },
  menuItemText: {
    fontSize: 17,
    // color 由主题动态控制
  },
  menuValue: {
    fontSize: 15,
    // color 由主题动态控制
    marginRight: 8,
  },
  chevron: {
    fontSize: 20,
    // color 由主题动态控制
    fontWeight: '300',
  },
  switchItemContent: {
    flex: 1,
  },
  switchItemDescription: {
    fontSize: 13,
    // color 由主题动态控制
    marginTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  infoLabel: {
    fontSize: 17,
    // color 由主题动态控制
  },
  infoValue: {
    fontSize: 17,
    // color 由主题动态控制
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    // backgroundColor 由主题动态控制
    marginLeft: 16,
  },
  // 切换帐号按钮
  switchAccountButton: {
    // backgroundColor 由主题动态控制
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  switchAccountButtonText: {
    fontSize: 17,
    // color 由主题动态控制
  },
  // 退出登录按钮
  logoutButton: {
    // backgroundColor 由主题动态控制
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutButtonText: {
    fontSize: 17,
    // color 由主题动态控制
  },
  // 模态框样式
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    // backgroundColor 由主题动态控制
    borderRadius: 12,
    width: '80%',
    maxWidth: 320,
    overflow: 'hidden',
  },
  modalHeader: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    // borderBottomColor 由主题动态控制
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    // color 由主题动态控制
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    // borderBottomColor 由主题动态控制
  },
  modalOptionLast: {
    borderBottomWidth: 0,
  },
  modalOptionText: {
    fontSize: 16,
    // color 由主题动态控制
  },
  modalCheckmark: {
    fontSize: 18,
    // color 由主题动态控制
    fontWeight: 'bold',
  },
});

export default SettingsDetailScreen;
