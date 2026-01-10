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
  Linking,
  Platform,
  Clipboard,
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

  const handleFeedback = async () => {
    const email = 'airover@gmail.com';
    const subject = encodeURIComponent('My Smth 用户反馈');
    const body = encodeURIComponent(
      `感谢您使用 My Smth（我的水木）！\n\n请在下方描述您的问题或建议：\n\n\n\n---\n应用版本：1.0.0\n用户ID：${username || '未登录'}\n系统信息：${Platform.OS} ${Platform.Version}`
    );
    
    const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;
    
    try {
      const supported = await Linking.canOpenURL(mailtoUrl);
      if (supported) {
        await Linking.openURL(mailtoUrl);
      } else {
        Alert.alert(
          '无法打开邮件应用',
          `请手动发送邮件至：\n${email}\n\n或复制邮箱地址`,
          [
            {text: '取消', style: 'cancel'},
            {
              text: '复制邮箱',
              onPress: () => {
                Clipboard.setString(email);
                Alert.alert('成功', `邮箱地址已复制：\n${email}`);
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('Open email error:', error);
      Alert.alert('错误', '打开邮件应用失败，请稍后重试');
    }
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
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={handleFeedback}>
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuIcon}>💬</Text>
                <Text style={[styles.menuItemText, {color: theme.text}]}>用户反馈</Text>
              </View>
              <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
            </TouchableOpacity>
            <View style={[styles.divider, {backgroundColor: theme.border}]} />
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => Alert.alert(
                '免责声明',
                '一、应用性质\n\n本应用（My Smth/我的水木）是基于水木社区（newsmth.net）开发的非官方第三方移动客户端，与水木社区官方无任何直属关系。\n\n二、隐私保护\n\n1. 本应用不收集、不存储、不上传任何用户个人信息或隐私数据\n2. 用户登录凭证（Cookie）仅加密存储于用户本地设备，不会上传至任何第三方服务器\n3. 所有数据请求均直接与水木社区官方服务器通信\n4. 本应用不包含任何用户行为追踪或数据统计功能\n\n三、服务免责\n\n1. 本应用按"现状"提供，不对服务的稳定性、可靠性、准确性作任何明示或暗示的保证\n2. 因使用本应用产生的任何直接或间接损失，开发者不承担责任\n3. 本应用可能因维护、升级或其他原因暂停服务，恕不另行通知\n4. 用户在使用本应用时应遵守水木社区的各项管理规定和中国法律法规\n\n四、内容免责\n\n1. 本应用展示的所有内容均来自水木社区，开发者不对内容的真实性、合法性负责\n2. 如发现违法违规内容，请直接联系水木社区官方处理\n\n五、其他\n\n1. 本应用为开源项目，代码托管于公开平台，接受社区监督\n2. 使用本应用即表示您已阅读并同意本免责声明\n3. 开发者保留随时修改或更新本声明的权利\n\n如有疑问，请通过用户反馈渠道联系开发者。',
                [{text: '我已知晓', style: 'default'}]
              )}>
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuIcon}>📄</Text>
                <Text style={[styles.menuItemText, {color: theme.text}]}>免责声明</Text>
              </View>
              <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
            </TouchableOpacity>
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
