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
// import {logout} from '../services/api'; // 移除直接导入
import {useSettings} from '../context/SettingsContext';
import {useAuth} from '../context/AuthContext'; // 导入 useAuth
import {loginMSite, logoutMSite, checkMSiteLoginStatus} from '../services/api';
import {getSavedCredentials} from '../utils/storage';
import CaptchaScreen from './CaptchaScreen';
import {useTheme} from '../components/ThemedComponents';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  scaleModerate,
} from '../utils/responsive';

const SettingsDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const [username, setUsername] = useState<string>('');
  // const [isLoggedIn, setIsLoggedIn] = useState(false); // 移除本地状态
  const {isLoggedIn, logout} = useAuth(); // 使用 AuthContext
  const {settings, updateSettings} = useSettings();
  const [showFontSizeModal, setShowFontSizeModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false);
  const [isMSiteLoggedIn, setIsMSiteLoggedIn] = useState(false);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [savedPassword, setSavedPassword] = useState('');

  useEffect(() => {
    loadUserStatus();
    checkMSiteStatus();
  }, [isLoggedIn]);

  const checkMSiteStatus = async () => {
    const status = await checkMSiteLoginStatus();
    setIsMSiteLoggedIn(status);
  };

  const loadUserStatus = async () => {
    try {
      const storedUsername = await AsyncStorage.getItem('username');
      // const loginStatus = await AsyncStorage.getItem('isLoggedIn'); // 不需要手动读取
      
      if (storedUsername) {
        setUsername(storedUsername);
      }
      // setIsLoggedIn(loginStatus === 'true'); // 不需要手动设置
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
          await logoutMSite(); // 同时清除 M 站登录状态
          await logout(); // 使用 AuthContext 的 logout
          setUsername('');
          setIsMSiteLoggedIn(false); // 重置 M 站登录开关状态
          // 不需要手动导航，App.tsx 会自动切换到登录界面
          // 这样重新登录后会回到首页而不是当前页面
        },
      },
    ]);
  };

  const handleMSiteToggle = async (value: boolean) => {
    if (value) {
      // 开启 M 站登录
      const credentials = await getSavedCredentials();
      if (credentials.password) {
        setSavedPassword(credentials.password);
        setShowCaptcha(true);
      } else {
        Alert.alert('提示', '未找到保存的密码，请重新登录主站并勾选"记住密码"');
      }
    } else {
      // 关闭 M 站登录
      await logoutMSite();
      setIsMSiteLoggedIn(false);
      Alert.alert('提示', '已断开 M 站连接');
    }
  };

  const handleCaptchaSuccess = async (ticket: string, randstr: string) => {
    setShowCaptcha(false);
    
    // 构造极验参数
    // ticket 格式: lot_number|captcha_output|pass_token|gen_time
    const parts = ticket.split('|');
    let captchaParams;
    
    if (parts.length >= 4) {
      captchaParams = {
        captcha_id: 'b01299f3ff24047dc399e650eec51a81',
        lot_number: parts[0],
        captcha_output: parts[1],
        pass_token: parts[2],
        gen_time: parts[3],
      };
    } else {
      // 兼容处理
      captchaParams = {
        captcha_id: 'b01299f3ff24047dc399e650eec51a81',
        lot_number: ticket,
        captcha_output: randstr,
        pass_token: ticket,
        gen_time: Math.floor(Date.now() / 1000).toString(),
      };
    }

    try {
      const result = await loginMSite(username, savedPassword, captchaParams);
      if (result.success) {
        setIsMSiteLoggedIn(true);
        // 登录成功，只更新开关状态，不弹窗不跳转
        console.log('[M站登录] 登录成功，开关已开启');
      } else {
        Alert.alert('失败', result.message || 'M 站登录失败');
      }
    } catch (error) {
      console.error('M 站登录异常:', error);
      Alert.alert('错误', 'M 站登录发生异常');
    }
  };

  const handleFeedback = async () => {
    const email = 'airover@gmail.com';
    const subject = encodeURIComponent('水母用户反馈');
    const body = encodeURIComponent(
      `感谢您使用水母！\n\n请在下方描述您的问题或建议：\n\n\n\n---\n应用版本：1.0.0\n用户ID：${username || '未登录'}\n系统信息：${Platform.OS} ${Platform.Version}`
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
      case 'spring':
        return '🐴 马年新春';
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
              onPress={() => setShowDisclaimerModal(true)}>
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
            {/* 账号管理 */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, {color: theme.secondaryText}]}>账号管理</Text>
              <View style={[styles.card, {backgroundColor: theme.cardBackground}]}>
                <View style={styles.menuItem}>
                  <View style={styles.menuItemLeft}>
                    <Text style={styles.menuIcon}>🔗</Text>
                    <View style={styles.switchItemContent}>
                  <Text style={[styles.menuItemText, {color: theme.text}]}>登录 M 站</Text>
                      <Text style={[styles.switchItemDescription, {color: theme.secondaryText}]}>
                        {isMSiteLoggedIn 
                          ? '已登录，可改善帖子图片加载' 
                          : '开启后可改善部分帖子图片加载失败的情况'}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={isMSiteLoggedIn}
                    onValueChange={handleMSiteToggle}
                    trackColor={{false: theme.border, true: '#34C759'}}
                    thumbColor="#fff"
                    ios_backgroundColor={theme.border}
                  />
                </View>
                <View style={[styles.divider, {backgroundColor: theme.border}]} />
                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={() => navigation.navigate('ChangePassword')}>
                  <View style={styles.menuItemLeft}>
                    <Text style={styles.menuIcon}>🔒</Text>
                    <Text style={[styles.menuItemText, {color: theme.text}]}>修改密码</Text>
                  </View>
                  <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
                </TouchableOpacity>
                <View style={[styles.divider, {backgroundColor: theme.border}]} />
                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={() => navigation.navigate('AccountSwitch')}>
                  <View style={styles.menuItemLeft}>
                    <Text style={styles.menuIcon}>👥</Text>
                    <Text style={[styles.menuItemText, {color: theme.text}]}>切换账号</Text>
                  </View>
                  <Text style={[styles.chevron, {color: theme.border}]}>›</Text>
                </TouchableOpacity>
              </View>
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
          {label: '🐴 马年新春', value: 'spring', current: settings.themeMode === 'spring'},
        ],
        async (value) => {
          await updateSettings({themeMode: value});
        },
      )}

      {/* 免责声明模态框 */}
      <Modal
        visible={showDisclaimerModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowDisclaimerModal(false)}>
        <View style={styles.disclaimerOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setShowDisclaimerModal(false)}
          />
          <View
            style={[styles.disclaimerModalContent, {backgroundColor: theme.cardBackground}]}>
            <View style={[styles.modalHeader, {borderBottomColor: theme.border}]}>
              <Text style={[styles.modalTitle, {color: theme.text}]}>免责声明</Text>
            </View>
            <ScrollView
              style={styles.disclaimerScrollView}
              showsVerticalScrollIndicator={true}
              bounces={true}
              nestedScrollEnabled={true}>
              <Text style={[styles.disclaimerText, {color: theme.text}]}>
{'一、应用性质\n\n本应用（水母）是基于水木社区（newsmth.net）开发的非官方第三方移动客户端，与水木社区官方无任何隶属或合作关系。\n\n二、隐私保护\n\n1. 本应用仅在用户本地设备上加密存储登录所需的账号凭证（用户名、Cookie），用于维持登录状态，不会上传至任何第三方服务器\n2. 所有数据请求均直接与水木社区官方服务器通信，不经过任何中间服务器\n3. 本应用不包含任何用户行为追踪、数据采集或广告分析功能\n4. 用户可随时在设置中清除本地缓存和登录信息\n\n三、服务免责\n\n1. 本应用按"现状"提供，不对服务的稳定性、可靠性、准确性作任何明示或暗示的保证\n2. 因使用本应用产生的任何直接或间接损失，开发者不承担责任\n3. 本应用可能因维护、升级或其他原因暂停服务，恕不另行通知\n4. 用户在使用本应用时应遵守水木社区的各项管理规定和中国法律法规\n\n四、内容免责\n\n1. 本应用展示的所有内容均来自水木社区，版权归原作者及水木社区所有，开发者不对内容的真实性、合法性负责\n2. 如发现违法违规内容，请直接联系水木社区官方处理\n\n五、知识产权\n\n1. 本应用的程序代码为开源项目，代码托管于公开平台，接受社区监督\n2. "水木社区"相关名称及标识的知识产权归水木社区所有\n\n六、其他\n\n1. 使用本应用即表示您已阅读并同意本免责声明\n2. 开发者保留随时修改或更新本声明的权利，更新后的声明将随应用版本发布\n\n如有疑问，请通过用户反馈渠道联系开发者。'}
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={[styles.disclaimerButton, {borderTopColor: theme.border}]}
              onPress={() => setShowDisclaimerModal(false)}>
              <Text style={[styles.disclaimerButtonText, {color: theme.primary}]}>我已知晓</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 验证码模态框 */}
      <Modal
        visible={showCaptcha}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCaptcha(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: '80%', width: '90%', maxWidth: '90%' }]}>
            <CaptchaScreen
              username={username}
              password={savedPassword}
              onCaptchaSuccess={handleCaptchaSuccess}
              onCancel={() => setShowCaptcha(false)}
            />
          </View>
        </View>
      </Modal>
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
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  section: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    // color 由主题动态控制
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  card: {
    // backgroundColor 由主题动态控制
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
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
    fontSize: FONT_SIZE.xxl,
    marginRight: SPACING.md,
    width: scaleModerate(28),
    textAlign: 'center',
  },
  menuItemText: {
    fontSize: FONT_SIZE.xl,
    // color 由主题动态控制
  },
  menuValue: {
    fontSize: FONT_SIZE.lg,
    // color 由主题动态控制
    marginRight: SPACING.sm,
  },
  chevron: {
    fontSize: FONT_SIZE.xl,
    // color 由主题动态控制
    fontWeight: '300',
  },
  switchItemContent: {
    flex: 1,
  },
  switchItemDescription: {
    fontSize: FONT_SIZE.sm,
    // color 由主题动态控制
    marginTop: SPACING.xs,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  infoLabel: {
    fontSize: FONT_SIZE.xl,
    // color 由主题动态控制
  },
  infoValue: {
    fontSize: FONT_SIZE.xl,
    // color 由主题动态控制
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    // backgroundColor 由主题动态控制
    marginLeft: SPACING.lg,
  },
  // 退出登录按钮
  logoutButton: {
    // backgroundColor 由主题动态控制
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  logoutButtonText: {
    fontSize: FONT_SIZE.xl,
    // color 由主题动态控制
  },
  // 模态框样式
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent', // 去掉背景浮层
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    // backgroundColor 由主题动态控制
    borderRadius: BORDER_RADIUS.lg,
    width: '80%',
    maxWidth: scaleModerate(320),
    overflow: 'hidden',
    // 添加阴影以区分背景
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalHeader: {
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    // borderBottomColor 由主题动态控制
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '600',
    // color 由主题动态控制
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    // borderBottomColor 由主题动态控制
  },
  modalOptionLast: {
    borderBottomWidth: 0,
  },
  modalOptionText: {
    fontSize: FONT_SIZE.lg,
    // color 由主题动态控制
  },
  modalCheckmark: {
    fontSize: FONT_SIZE.xxl,
    // color 由主题动态控制
    fontWeight: 'bold',
  },
  disclaimerModalContent: {
    borderRadius: BORDER_RADIUS.lg,
    width: '80%',
    maxHeight: '70%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  disclaimerOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disclaimerScrollView: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  disclaimerText: {
    fontSize: FONT_SIZE.md,
    lineHeight: FONT_SIZE.md * 1.6,
  },
  disclaimerButton: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  disclaimerButtonText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
  },
});

export default SettingsDetailScreen;
