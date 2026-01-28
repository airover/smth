import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ImageBackground,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActionSheetIOS,
  PixelRatio,
  Linking,
  NativeModules,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import ImageCropPicker from 'react-native-image-crop-picker';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import {Camera, useCameraDevice, useCodeScanner} from 'react-native-vision-camera';
import {useRoute, useNavigation} from '@react-navigation/native';
import {getUserInfo, fetchUserInfo, sendMessage, addBlack, removeBlack, addFriend, removeFriend, checkIsHerBlack, getFriendsList, getBlackList} from '../services/api';
import {User} from '../types';
import {formatRelativeTime} from '../utils/timeFormat';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFetchBlob from 'rn-fetch-blob';
import {getCache, setCache, getCacheWithTimestamp} from '../services/cacheManager';
import {
  RESPONSIVE,
  scaleWidth,
  scaleHeight,
  scaleFont,
  scaleModerate,
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  responsiveSize,
} from '../utils/responsive';
import {isQRCodeSafe, sanitizeForDisplay} from '../utils/securityUtils';

const SCREEN_WIDTH = RESPONSIVE.SCREEN_WIDTH;
const HEADER_HEIGHT = responsiveSize(200, 240, 260, 300);

// 用户数据目录（独立于缓存，不会被清除）
const USER_DATA_DIR = `${RNFetchBlob.fs.dirs.DocumentDir}/user_data`;
const BACKGROUND_IMAGE_PATH = `${USER_DATA_DIR}/profile_background.jpg`;

// 辅助函数：移除HTML标签
const stripHtmlTags = (html: string): string => {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '') // 移除HTML标签
    .replace(/&nbsp;/g, ' ') // 替换&nbsp;
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim();
};

// 辅助函数：计算字符串长度（中文算2，英文算1）
const getStringLength = (str: string): number => {
  if (!str) return 0;
  let length = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // 中文字符范围
    if (code >= 0x4e00 && code <= 0x9fff) {
      length += 2;
    } else {
      length += 1;
    }
  }
  return length;
};

// 辅助函数：判断昵称是否过长（超过6个英文或4个中文，即长度>8）
const isNicknameTooLong = (nickname: string): boolean => {
  return getStringLength(nickname) > 8;
};

const UserProfileScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const {username} = route.params as {username?: string};
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isCurrentUser, setIsCurrentUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [isInBlacklist, setIsInBlacklist] = useState(false);
  const [blacklistLoading, setBlacklistLoading] = useState(false);
  const [showImageSourceModal, setShowImageSourceModal] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const isProcessingQR = useRef(false); // 使用 ref 防止重复处理
  const device = useCameraDevice('back');

  const checkAndLoadUserInfo = async () => {
    try {
      // 检查是否查看自己的资料
      const currentUsername = await AsyncStorage.getItem('username');
      const isSelf = !username || username === currentUsername;
      setIsCurrentUser(isSelf);
      
      // 加载背景图片配置
      if (isSelf) {
        const bgExists = await RNFetchBlob.fs.exists(BACKGROUND_IMAGE_PATH);
        if (bgExists) {
          setBackgroundImage(`file://${BACKGROUND_IMAGE_PATH}`);
        }
      }
      
      const userInfo = await loadUserInfo(isSelf);
      
      // 如果是查看他人资料，检查关注状态和黑名单状态
      // 传入userInfo，因为此时user状态可能还没更新
      if (!isSelf && username) {
        await checkFollowingStatus(username, false, userInfo);
        await checkBlacklistStatus(username, false, userInfo);
      }
    } catch (err) {
      console.error('Check and load user info error:', err);
    }
  };

  // 检查目标用户是否在当前用户的黑名单中
  // userInfo参数用于传入刚获取的用户信息，避免user状态未更新的问题
  const checkBlacklistStatus = async (targetUsername: string, forceRefresh: boolean = false, userInfo?: User | null) => {
    try {
      const currentUsername = await AsyncStorage.getItem('username');
      if (!currentUsername) {
        console.log('Not logged in, skip checking blacklist status');
        return;
      }
      
      const result = await getBlackList(forceRefresh);
      if (result.success && result.blacklist) {
        // 检查目标用户的ID或用户名是否在黑名单中
        // 优先使用传入的userInfo，其次使用user状态
        const targetUserId = userInfo?.id || user?.id || '';
        const isInList = result.blacklist.some(
          (item: any) => item.id === targetUserId || item.username === targetUsername
        );
        setIsInBlacklist(isInList);
        console.log('Blacklist status for', targetUsername, ':', isInList, 'userId:', targetUserId);
      }
    } catch (error) {
      console.error('Check blacklist status error:', error);
    }
  };

  // 检查是否已关注该用户
  // userInfo参数用于传入刚获取的用户信息，避免user状态未更新的问题
  const checkFollowingStatus = async (targetUsername: string, forceRefresh: boolean = false, userInfo?: User | null) => {
    try {
      const currentUsername = await AsyncStorage.getItem('username');
      if (!currentUsername) {
        console.log('Not logged in, skip checking following status');
        return;
      }
      
      const result = await getFriendsList(currentUsername, 1, forceRefresh);
      if (result.success && result.friends) {
        // 检查目标用户的ID或用户名是否在关注列表中
        // friends现在是用户对象数组，包含id和username字段
        // 优先使用传入的userInfo，其次使用user状态
        const targetUserId = userInfo?.id || user?.id || '';
        const isInList = result.friends.some(
          (friend: any) => friend.id === targetUserId || friend.username === targetUsername
        );
        setIsFollowing(isInList);
        console.log('Following status for', targetUsername, ':', isInList, 'userId:', targetUserId, 'friends count:', result.friends.length);
      }
    } catch (error) {
      console.error('Check following status error:', error);
    }
  };

  // 处理拉黑/移除黑名单
  const handleBlockUser = async () => {
    const userId = user?.id || username || '';
    const targetUsername = user?.username || username || '';

    if (isInBlacklist) {
      // 移除黑名单
      Alert.alert(
        '移除黑名单',
        `确定要将 ${targetUsername} 从黑名单中移除吗？`,
        [
          {text: '取消', style: 'cancel'},
          {
            text: '确定',
            onPress: async () => {
              try {
                setBlacklistLoading(true);
                const result = await removeBlack(userId);
                if (result.success) {
                  setIsInBlacklist(false);
                  Alert.alert('成功', result.message || '已移除黑名单');
                  // 强制刷新黑名单缓存
                  await checkBlacklistStatus(targetUsername, true, user);
                } else {
                  Alert.alert('失败', result.message || '移除失败');
                }
              } catch (err: any) {
                console.error('Remove from blacklist error:', err);
                if (err.message === 'LOGIN_EXPIRED') {
                  Alert.alert(
                    '登录已过期',
                    '请重新登录后操作',
                    [
                      {text: '去登录', onPress: () => navigation.navigate('Login' as never)},
                      {text: '取消', style: 'cancel'},
                    ]
                  );
                } else {
                  Alert.alert('错误', '移除失败，请稍后重试');
                }
              } finally {
                setBlacklistLoading(false);
              }
            },
          },
        ]
      );
    } else {
      // 拉黑
      Alert.alert(
        '确认拉黑',
        `确定要拉黑 ${targetUsername} 吗？拉黑后对方将无法关注您或给您发送消息。`,
        [
          {text: '取消', style: 'cancel'},
          {
            text: '确定',
            style: 'destructive',
            onPress: async () => {
              try {
                setBlacklistLoading(true);
                const result = await addBlack(userId);
                if (result.success) {
                  setIsInBlacklist(true);
                  Alert.alert('成功', result.message || '拉黑成功');
                  // 强制刷新黑名单缓存
                  await checkBlacklistStatus(targetUsername, true, user);
                } else {
                  Alert.alert('失败', result.message || '拉黑失败');
                }
              } catch (err: any) {
                console.error('Block user error:', err);
                if (err.message === 'LOGIN_EXPIRED') {
                  Alert.alert(
                    '登录已过期',
                    '请重新登录后操作',
                    [
                      {text: '去登录', onPress: () => navigation.navigate('Login' as never)},
                      {text: '取消', style: 'cancel'},
                    ]
                  );
                } else {
                  Alert.alert('错误', '拉黑失败，请稍后重试');
                }
              } finally {
                setBlacklistLoading(false);
              }
            },
          },
        ]
      );
    }
  };

  // 处理关注/取消关注
  const handleFollowUser = async () => {
    if (!user?.id && !username) {
      Alert.alert('错误', '无法获取用户信息');
      return;
    }

    const userId = user?.id || '';
    const targetUsername = user?.username || username || '';

    if (isFollowing) {
      // 取消关注
      Alert.alert(
        '取消关注',
        `确定要取消关注 ${targetUsername} 吗？`,
        [
          {text: '取消', style: 'cancel'},
          {
            text: '确定',
            onPress: async () => {
              try {
                setFollowingLoading(true);
                const result = await removeFriend(userId);
                if (result.success) {
                  setIsFollowing(false);
                  Alert.alert('成功', result.message || '已取消关注');
                  // 强制刷新关注列表缓存
                  await checkFollowingStatus(targetUsername, true, user);
                } else {
                  Alert.alert('失败', result.message || '取消关注失败');
                }
              } catch (err: any) {
                console.error('Unfollow error:', err);
                if (err.message === 'LOGIN_EXPIRED') {
                  Alert.alert(
                    '登录已过期',
                    '请重新登录后操作',
                    [
                      {text: '去登录', onPress: () => navigation.navigate('Login' as never)},
                      {text: '取消', style: 'cancel'},
                    ]
                  );
                } else {
                  Alert.alert('错误', '取消关注失败，请稍后重试');
                }
              } finally {
                setFollowingLoading(false);
              }
            },
          },
        ]
      );
    } else {
      // 关注：先检查是否被对方拉黑
      try {
        setFollowingLoading(true);
        
        // 检查是否被对方拉黑
        const blackResult = await checkIsHerBlack(userId);
        if (blackResult.isBlack) {
          Alert.alert('无法关注', '对方已将您拉黑，无法关注');
          return;
        }
        
        // 执行关注
        const result = await addFriend(userId);
        if (result.success) {
          setIsFollowing(true);
          Alert.alert('成功', result.message || '关注成功');
          // 强制刷新关注列表缓存
          await checkFollowingStatus(targetUsername, true, user);
        } else {
          Alert.alert('失败', result.message || '关注失败');
        }
      } catch (err: any) {
        console.error('Follow error:', err);
        if (err.message === 'LOGIN_EXPIRED') {
          Alert.alert(
            '登录已过期',
            '请重新登录后操作',
            [
              {text: '去登录', onPress: () => navigation.navigate('Login' as never)},
              {text: '取消', style: 'cancel'},
            ]
          );
        } else {
          Alert.alert('错误', '关注失败，请稍后重试');
        }
      } finally {
        setFollowingLoading(false);
      }
    }
  };

  useEffect(() => {
    checkAndLoadUserInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  // 检查相机权限
  useEffect(() => {
    (async () => {
      const status = await Camera.requestCameraPermission();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // 二维码扫描器
  const codeScanner = useCodeScanner({
    codeTypes: ['qr', 'ean-13'],
    onCodeScanned: (codes) => {
      if (codes.length > 0 && codes[0].value) {
        // 防抖处理，避免重复扫描
        handleQRCodeScanned(codes[0].value);
      }
    },
  });

  // 处理扫描到的二维码
  const handleQRCodeScanned = (data: string) => {
    // 防止重复处理
    if (isProcessingQR.current) {
      console.log('正在处理二维码，忽略重复扫描');
      return;
    }
    
    isProcessingQR.current = true;
    setShowScanner(false);
    
    // 安全检查
    const safetyCheck = isQRCodeSafe(data);
    if (!safetyCheck.safe) {
      console.warn('二维码安全检查未通过:', {
        reason: safetyCheck.reason,
        dataLength: data.length,
        dataPreview: data.substring(0, 50)
      });
      Alert.alert('安全提示', safetyCheck.reason || '该二维码内容不安全，已被拦截', [
        {
          text: '确定',
          // onPress: () => setIsProcessingQR(false) // 移除重置
        }
      ]);
      return;
    }
    
    // 尝试解析为JSON格式
    try {
      const qrData = JSON.parse(data);
      
      // 类型1: 本应用的关注用户二维码
      if (qrData.type === 'follow_user' && qrData.username) {
        Alert.alert(
          '关注用户',
          `确定要关注 ${qrData.nickname || qrData.username} 吗？`,
          [
            {
              text: '取消', 
              style: 'cancel',
              // onPress: () => setIsProcessingQR(false) // 移除重置
            },
            {
              text: '确定',
              onPress: async () => {
                try {
                  const result = await addFriend(qrData.userId);
                  if (result.success) {
                    Alert.alert('成功', result.message || '关注成功');
                  } else {
                    Alert.alert('失败', result.message || '关注失败');
                  }
                } catch (err: any) {
                  console.error('Follow user error:', err);
                  if (err.message === 'LOGIN_EXPIRED') {
                    Alert.alert(
                      '登录已过期',
                      '请重新登录后操作',
                      [
                        {text: '去登录', onPress: () => {
                          // setIsProcessingQR(false); // 移除重置
                          navigation.navigate('Login' as never);
                        }},
                        {text: '取消', style: 'cancel'},
                      ]
                    );
                  } else {
                    Alert.alert('错误', '关注失败，请稍后重试');
                  }
                }
              },
            },
          ]        );
        return;
      }
      
      // 类型2: 其他JSON格式的二维码（记录日志，不提示）
      console.log('扫描到其他JSON格式二维码:', {
        type: qrData.type,
        data: qrData,
        rawData: data
      });
      
    } catch (error) {
      // 不是JSON格式，尝试其他格式
      
      // 类型3: 网址二维码 (http/https)
      if (data.startsWith('http://') || data.startsWith('https://')) {
        Alert.alert(
          '打开链接',
          `是否在浏览器中打开此链接？\n\n${data.length > 50 ? data.substring(0, 50) + '...' : data}`,
          [
            {
              text: '取消', 
              style: 'cancel',
              onPress: () => {
                console.log('用户取消打开链接');
                // setIsProcessingQR(false); // 移除重置
              }
            },
            {
              text: '打开',
              onPress: () => {
                Linking.openURL(data).catch(err => {
                  console.error('打开链接失败:', err);
                  Alert.alert('错误', '无法打开此链接');
                });
              },
            },
          ],
          { cancelable: true }
        );
        return;
      }
      
      // 类型4: 其他格式的二维码（纯文本、电话号码等，显示在界面上）
      console.log('扫描到非JSON格式二维码:', {
        dataType: typeof data,
        dataLength: data.length,
        dataPreview: data.substring(0, 100),
        rawData: data
      });
      
      // 安全过滤后显示文本内容
      const safeContent = sanitizeForDisplay(data);
      const displayContent = safeContent.length > 200 ? safeContent.substring(0, 200) + '...' : safeContent;
      
      Alert.alert(
        '二维码内容',
        displayContent,
        [
          {
            text: '关闭', 
            style: 'cancel',
            // onPress: () => setIsProcessingQR(false) // 移除重置
          },
          {
            text: '复制',
            onPress: () => {
              // 复制原始内容（已通过安全检查）
              Clipboard.setString(data);
              Alert.alert('提示', '内容已复制到剪贴板');
            },
          },
        ],
        { cancelable: true }
      );
    }
  };

  // 从相册选择二维码图片
  const handleSelectQRFromGallery = async () => {
    try {
      // 选择图片并获取base64数据
      const image = await ImageCropPicker.openPicker({
        mediaType: 'photo',
        cropping: false,
        includeBase64: false,
      });

      if (image && image.path) {
        try {
          const qrData = await recognizeQRCodeFromImage(image.path);
          
          if (qrData) {
            // 识别成功，处理二维码数据
            handleQRCodeScanned(qrData);
          } else {
            Alert.alert('提示', '未能识别到二维码');
          }
        } catch (recognizeError: any) {
          console.error('识别二维码失败:', recognizeError);
          Alert.alert('提示', '识别失败，请重试');
        }
      }
    } catch (error: any) {
      if (error.code !== 'E_PICKER_CANCELLED') {
        console.error('选择图片失败:', error);
        Alert.alert('错误', '选择图片失败');
      }
    }
  };

  // 从图片中识别二维码（优先使用原生模块，回退到jsQR）
  const recognizeQRCodeFromImage = async (imagePath: string): Promise<string | null> => {
    const { QRCodeScanner } = NativeModules;
    
    // 如果原生模块可用，使用原生模块
    if (QRCodeScanner && typeof QRCodeScanner.detectQRCode === 'function') {
      try {
        const result = await QRCodeScanner.detectQRCode(imagePath);
        return result;
      } catch (error: any) {
        console.error('原生模块识别失败:', error);
        // 原生模块失败，尝试jsQR
      }
    }
    
    // 回退方案：使用jsQR（需要重新选择图片获取base64）
    console.log('原生模块不可用，尝试使用jsQR');
    
    try {
      // 读取图片为base64
      const cleanPath = imagePath.replace('file://', '');
      const base64Data = await RNFetchBlob.fs.readFile(cleanPath, 'base64');
      
      // 由于React Native没有Canvas API，jsQR无法在这里直接使用
      // 需要原生模块支持，提示用户重新构建应用
      console.warn('jsQR在React Native中需要Canvas支持，请重新构建应用以启用原生二维码识别');
      
      // 返回null，上层会提示用户
      return null;
    } catch (error) {
      console.error('读取图片失败:', error);
      return null;
    }
  };

  // 打开扫一扫
  const handleOpenScanner = async () => {
    if (!hasPermission) {
      Alert.alert(
        '需要相机权限',
        '请在设置中允许访问相机',
        [
          {text: '取消', style: 'cancel'},
          {text: '去设置', onPress: () => Linking.openSettings()},
        ]
      );
      return;
    }
    isProcessingQR.current = false; // 重置防抖状态
    setTorchOn(false); // 关闭手电筒
    setShowScanner(true);
  };

  const loadUserInfo = async (isSelf: boolean = isCurrentUser, forceRefresh: boolean = false): Promise<User | null> => {
    try {
      setLoading(true);
      setError(null);
      
      let userInfo;
      if (isSelf) {
        // 查看自己的资料，使用getUserInfo
        userInfo = await getUserInfo();
        console.log('UserProfileScreen getUserInfo result:', userInfo);
      } else {
        // 查看他人资料，使用fetchUserInfo
        console.log('Fetching user info for:', username);
        
        // 如果不是强制刷新，先尝试从缓存获取
        if (!forceRefresh) {
          const cachedData = getCacheWithTimestamp<any>('otherUserInfo', username!);
          if (cachedData) {
            console.log('UserProfileScreen: Using cached data for', username, 'age:', Math.floor((Date.now() - cachedData.timestamp) / 1000), 's');
            setUser(cachedData.data);
            setLoading(false);
            
            // 异步更新缓存
            fetchUserInfo(username!).then(freshData => {
              if (freshData) {
                console.log('UserProfileScreen: Background update for', username);
                setUser(freshData);
                setCache('otherUserInfo', username!, freshData);
                // 使用新数据重新检查关注状态，确保状态同步
                checkFollowingStatus(username!, false, freshData);
              }
            }).catch(err => {
              console.error('Background update error:', err);
            });
            
            return cachedData.data; // 返回缓存数据
          }
        }
        
        // 没有缓存或强制刷新，从API获取
        userInfo = await fetchUserInfo(username!);
        console.log('UserProfileScreen fetchUserInfo result:', userInfo);
        
        // 保存到缓存
        if (userInfo) {
          setCache('otherUserInfo', username!, userInfo);
        }
      }
      
      if (userInfo) {
        setUser(userInfo);
        console.log('UserProfileScreen loaded:', userInfo.username, 'isSelf:', isSelf, 'posts:', userInfo.recentPosts?.length || 0);
        return userInfo; // 返回用户信息
      } else {
        setError('无法加载用户信息');
        return null;
      }
    } catch (err: any) {
      console.error('Load user info error:', err);
      setError(err.message || '加载失败');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // 下拉刷新时强制从API获取最新数据
    const userInfo = await loadUserInfo(isCurrentUser, true);
    // 如果是查看他人资料，强制刷新关注状态和黑名单状态
    if (!isCurrentUser && username) {
      await checkFollowingStatus(username, true, userInfo);
      await checkBlacklistStatus(username, true, userInfo);
    }
    setRefreshing(false);
  };

  // 选择背景图片来源
  const handleChangeBackgroundImage = () => {
    const hasBackground = backgroundImage !== null;
    
    if (Platform.OS === 'ios') {
      const options = hasBackground 
        ? ['取消', '拍照', '从相册选择', '删除背景图片']
        : ['取消', '拍照', '从相册选择'];
      
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          destructiveButtonIndex: hasBackground ? 3 : undefined,
          title: '选择背景图片',
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            handleTakePhoto();
          } else if (buttonIndex === 2) {
            handleSelectFromGallery();
          } else if (buttonIndex === 3 && hasBackground) {
            handleDeleteBackgroundImage();
          }
        }
      );
    } else {
      setShowImageSourceModal(true);
    }
  };

  // 删除背景图片
  const handleDeleteBackgroundImage = () => {
    Alert.alert(
      '删除背景图片',
      '确定要删除背景图片吗？',
      [
        {text: '取消', style: 'cancel'},
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              const exists = await RNFetchBlob.fs.exists(BACKGROUND_IMAGE_PATH);
              if (exists) {
                await RNFetchBlob.fs.unlink(BACKGROUND_IMAGE_PATH);
              }
              setBackgroundImage(null);
              Alert.alert('成功', '背景图片已删除');
            } catch (error) {
              console.error('删除背景图片失败:', error);
              Alert.alert('失败', '删除背景图片失败，请稍后重试');
            }
          },
        },
      ]
    );
  };

  // 从相册选择图片
  const handleSelectFromGallery = async () => {
    setShowImageSourceModal(false);
    
    try {
      // 获取屏幕像素密度
      const pixelRatio = PixelRatio.get();
      // 设置裁剪框尺寸与展示区域一致，但乘以像素密度以保证高清
      const cropWidth = Math.round(SCREEN_WIDTH * pixelRatio);
      const cropHeight = Math.round(HEADER_HEIGHT * pixelRatio);
      
      const image = await ImageCropPicker.openPicker({
        width: cropWidth,
        height: cropHeight,
        cropping: true,
        cropperToolbarTitle: '调整背景图片',
        freeStyleCropEnabled: false, // 禁用自由裁剪，固定裁剪框大小
        includeBase64: false,
        compressImageQuality: 1.0, // 使用最高质量，不压缩
        mediaType: 'photo',
      });

      if (image && image.path) {
        await saveBackgroundImage(image.path);
      }
    } catch (error: any) {
      if (error.code !== 'E_PICKER_CANCELLED') {
        console.error('选择图片失败:', error);
        Alert.alert('失败', '选择图片失败，请稍后重试');
      }
    }
  };

  // 拍照
  const handleTakePhoto = async () => {
    setShowImageSourceModal(false);
    
    try {
      // 获取屏幕像素密度
      const pixelRatio = PixelRatio.get();
      // 设置裁剪框尺寸与展示区域一致，但乘以像素密度以保证高清
      const cropWidth = Math.round(SCREEN_WIDTH * pixelRatio);
      const cropHeight = Math.round(HEADER_HEIGHT * pixelRatio);
      
      const image = await ImageCropPicker.openCamera({
        width: cropWidth,
        height: cropHeight,
        cropping: true,
        cropperToolbarTitle: '调整背景图片',
        freeStyleCropEnabled: false, // 禁用自由裁剪，固定裁剪框大小
        includeBase64: false,
        compressImageQuality: 1.0, // 使用最高质量，不压缩
        mediaType: 'photo',
      });

      if (image && image.path) {
        await saveBackgroundImage(image.path);
      }
    } catch (error: any) {
      if (error.code !== 'E_PICKER_CANCELLED') {
        console.error('拍照失败:', error);
        Alert.alert('失败', '拍照失败，请稍后重试');
      }
    }
  };

  // 保存背景图片到独立目录
  const saveBackgroundImage = async (sourcePath: string) => {
    try {
      // 确保用户数据目录存在
      const dirExists = await RNFetchBlob.fs.exists(USER_DATA_DIR);
      if (!dirExists) {
        await RNFetchBlob.fs.mkdir(USER_DATA_DIR);
      }

      // 如果旧图片存在，先删除
      const oldImageExists = await RNFetchBlob.fs.exists(BACKGROUND_IMAGE_PATH);
      if (oldImageExists) {
        await RNFetchBlob.fs.unlink(BACKGROUND_IMAGE_PATH);
        console.log('已删除旧背景图片');
      }

      // 移除 file:// 前缀（如果有）
      const cleanPath = sourcePath.replace('file://', '');

      // 复制新图片到用户数据目录
      await RNFetchBlob.fs.cp(cleanPath, BACKGROUND_IMAGE_PATH);
      
      setBackgroundImage(`file://${BACKGROUND_IMAGE_PATH}`);
      Alert.alert('成功', '背景图片已更换');
    } catch (error) {
      console.error('保存背景图片失败:', error);
      Alert.alert('失败', '保存背景图片失败，请稍后重试');
    }
  };

  // 发送消息
  const handleSendMessage = async () => {
    if (!messageSubject.trim()) {
      Alert.alert('提示', '请输入主题');
      return;
    }
    if (!messageBody.trim()) {
      Alert.alert('提示', '请输入消息内容');
      return;
    }

    try {
      setSendingMessage(true);
      const result = await sendMessage(
        user?.username || username || '',
        messageBody.trim(),
        messageSubject.trim()
      );

      if (result.success) {
        Alert.alert('成功', result.message || '消息发送成功');
        setShowMessageModal(false);
        setMessageSubject('');
        setMessageBody('');
      } else {
        Alert.alert('失败', result.message || '消息发送失败');
      }
    } catch (err: any) {
      console.error('Send message error:', err);
      if (err.message === 'LOGIN_EXPIRED') {
        Alert.alert(
          '登录已过期',
          '请重新登录后发送消息',
          [
            {
              text: '去登录',
              onPress: () => navigation.navigate('Login' as never),
            },
            {
              text: '取消',
              style: 'cancel',
            },
          ]
        );
      } else {
        Alert.alert('错误', '发送消息失败，请稍后重试');
      }
    } finally {
      setSendingMessage(false);
    }
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

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorHint}>下拉刷新重试</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#007AFF']}
            tintColor="#007AFF"
          />
        }
      >
        {/* 顶部背景图片区域 */}
        <TouchableOpacity 
          style={styles.headerBackground}
          activeOpacity={0.9}
          onPress={() => {
            if (isCurrentUser) {
              handleChangeBackgroundImage();
            }
          }}
          disabled={!isCurrentUser}
        >
          {backgroundImage && (
            <ImageBackground
              source={{uri: backgroundImage}}
              style={StyleSheet.absoluteFill}
              imageStyle={styles.headerBackgroundImage}
            />
          )}
          {/* 返回按钮和更多按钮 */}
          <View style={styles.headerTopBar}>
            <TouchableOpacity 
              style={styles.topBarButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.topBarIcon}>←</Text>
            </TouchableOpacity>
            <View style={styles.topBarActions}>
              <TouchableOpacity 
                style={styles.topBarButton}
                onPress={() => navigation.navigate('SearchInput' as never)}
              >
                <Text style={styles.topBarIcon}>🔍</Text>
              </TouchableOpacity>
              <View style={styles.topBarSpacer} />
              <TouchableOpacity 
                style={styles.topBarButton}
                onPress={handleOpenScanner}
              >
                <Text style={styles.topBarIcon}>📷</Text>
              </TouchableOpacity>
              <View style={styles.topBarSpacer} />
              <TouchableOpacity 
                style={styles.topBarButton}
                onPress={() => {
                  if (isCurrentUser) {
                    if (Platform.OS === 'ios') {
                      ActionSheetIOS.showActionSheetWithOptions(
                        {
                          options: ['取消', '编辑资料', '更换背景图片'],
                          cancelButtonIndex: 0,
                          title: '更多功能',
                        },
                        (buttonIndex) => {
                          if (buttonIndex === 1) {
                            Alert.alert('提示', '编辑资料功能开发中');
                          } else if (buttonIndex === 2) {
                            handleChangeBackgroundImage();
                          }
                        }
                      );
                    } else {
                      Alert.alert('更多功能', '', [
                        {text: '编辑资料', onPress: () => Alert.alert('提示', '编辑资料功能开发中')},
                        {text: '更换背景图片', onPress: handleChangeBackgroundImage},
                        {text: '取消', style: 'cancel'},
                      ]);
                    }
                  } else {
                    // 使用ActionSheetIOS实现垂直菜单
                    const blockActionText = isInBlacklist ? '移除黑名单' : '拉黑';
                    if (Platform.OS === 'ios') {
                      ActionSheetIOS.showActionSheetWithOptions(
                        {
                          options: ['取消', blockActionText],
                          destructiveButtonIndex: isInBlacklist ? undefined : 1,
                          cancelButtonIndex: 0,
                          title: '更多操作',
                        },
                        (buttonIndex) => {
                          if (buttonIndex === 1) {
                            handleBlockUser();
                          }
                        }
                      );
                    } else {
                      // Android使用Alert
                      Alert.alert('更多操作', '', [
                        {
                          text: blockActionText,
                          style: isInBlacklist ? undefined : 'destructive',
                          onPress: handleBlockUser,
                        },
                        {text: '取消', style: 'cancel'},
                      ]);
                    }
                  }
                }}
              >
                <Text style={styles.topBarIcon}>⋮</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 底部用户信息区域 */}
          <View style={styles.headerBottomSection}>
            <View style={styles.avatarAndNicknameRow}>
              {/* 头像 */}
              <View style={styles.avatarWrapper}>
                {user?.avatar ? (
                  <ImageWithPlaceholder
                    uri={user.avatar}
                    style={styles.avatar}
                    resizeMode="cover"
                    isAvatar={true}
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>
                      {(user?.username || username)?.charAt(0).toUpperCase() || 'U'}
                    </Text>
                  </View>
                )}
              </View>
              
              {/* 昵称（如果存在且与用户名不同且不太长） */}
              {user?.nickname && user.nickname !== user.username && !isNicknameTooLong(user.nickname) && (
                <View style={styles.nicknameContainer}>
                  <Text style={styles.nicknameOnHeader}>{user.nickname}</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>

        {/* 用户名和签名信息区域 */}
        <View style={styles.userInfoSection}>
          {/* 用户名行 */}
          <View style={styles.userNameRow}>
            <Text style={styles.username}>{user?.username || username}</Text>
            {user?.gender !== undefined && user.gender !== 0 && (
              <Text style={[
                styles.genderIcon,
                user.gender === 1 ? styles.genderMale : styles.genderFemale
              ]}>
                {user.gender === 1 ? '♂' : '♀'}
              </Text>
            )}
          </View>

          {/* 头衔标签和注册时间行 */}
          <View style={styles.badgesRow}>
            {user?.levelTitle && (
              <View style={styles.levelBadge}>
                <Text style={styles.levelText}>Lv{user.levelTitle}</Text>
              </View>
            )}
            {user?.title && (
              <Text style={styles.titleText}>⭐{user.title}</Text>
            )}
            {user?.createTime && (
              <View style={styles.registerTimeBadge}>
                <Text style={styles.registerTimeText}>
                  注册 {new Date(user.createTime).toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                  }).replace(/\//g, '-')}
                </Text>
              </View>
            )}
          </View>

          {/* 长昵称（如果存在、与用户名不同且太长） */}
          {user?.nickname && user.nickname !== user.username && isNicknameTooLong(user.nickname) && (
            <Text style={styles.longNickname}>{user.nickname}</Text>
          )}

          {/* 最近登录信息 */}
          {user?.loginTime && (() => {
            // 客人态且有文章列表时，判断是否使用文章发布时间
            if (!isCurrentUser && user?.recentPosts && user.recentPosts.length > 0) {
              const latestPost = user.recentPosts[0];
              if (latestPost?.postTime) {
                const loginTime = new Date(user.loginTime).getTime();
                const postTime = new Date(latestPost.postTime).getTime();
                const oneDayInMs = 24 * 60 * 60 * 1000;
                
                // 如果登录时间早于文章发布时间1天以上，使用文章发布时间
                if (postTime - loginTime > oneDayInMs) {
                  return (
                    <Text style={styles.loginTimeText}>
                      最近登录: {formatRelativeTime(latestPost.postTime)}
                    </Text>
                  );
                }
              }
            }
            
            // 默认显示登录时间
            return (
              <Text style={styles.loginTimeText}>
                最近登录: {formatRelativeTime(user.loginTime)}
              </Text>
            );
          })()}

          {/* 个性签名 */}
          {user?.signature && (
            <Text style={styles.signatureText} numberOfLines={2}>
              {stripHtmlTags(user.signature)}
            </Text>
          )}

          {/* IP属地 */}
          {user?.city && (
            <Text style={styles.locationText}>📍IP属地: {user.city}</Text>
          )}
        </View>

        {/* 统计数据行 */}
        <View style={styles.statsSection}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{Math.floor((user?.fansCount || 0) / 1000) / 10}万</Text>
            <Text style={styles.statLabel}>粉丝</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{user?.friendCount || 0}</Text>
            <Text style={styles.statLabel}>关注</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{user?.score || 0}</Text>
            <Text style={styles.statLabel}>积分</Text>
          </View>
        </View>

        {/* 二维码展示区域（仅主人态显示） */}
        {isCurrentUser && (
          <View style={styles.qrcodeSection}>
            <TouchableOpacity 
              style={styles.qrcodeToggleButton}
              onPress={() => setShowQRCode(!showQRCode)}
            >
              <Text style={styles.qrcodeToggleText}>
                {showQRCode ? '▲ 收起二维码' : '▼ 展开我的二维码'}
              </Text>
            </TouchableOpacity>
            {showQRCode && (
              <View style={styles.qrcodeContainer}>
                <View style={styles.qrcodeWrapper}>
                  <QRCode
                    value={JSON.stringify({
                      type: 'follow_user',
                      username: user?.username || '',
                      userId: user?.id || '',
                      nickname: user?.nickname || '',
                    })}
                    size={responsiveSize(180, 200, 220, 240)}
                    backgroundColor="white"
                    color="black"
                  />
                </View>
                <Text style={styles.qrcodeHint}>扫描二维码关注我</Text>
              </View>
            )}
          </View>
        )}

        {/* 操作按钮行 */}
        <View style={styles.actionButtonsRow}>
          {isCurrentUser ? (
            <TouchableOpacity style={styles.fullWidthButton}>
              <Text style={styles.secondaryButtonText}>编辑资料</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity 
                style={[styles.primaryButton, isFollowing && styles.primaryButtonFollowed]}
                onPress={handleFollowUser}
                disabled={followingLoading}
              >
                {followingLoading ? (
                  <ActivityIndicator size="small" color={isFollowing ? '#007AFF' : '#fff'} />
                ) : (
                  <Text style={[styles.primaryButtonText, isFollowing && styles.primaryButtonTextFollowed]}>
                    {isFollowing ? '✓ 已关注' : '+ 关注'}
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.secondaryButton}
                onPress={() => setShowMessageModal(true)}
              >
                <Text style={styles.secondaryButtonText}>✉️ 发消息</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* 个性签名（如果在上面没有显示） */}
        {user?.signature ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>个性签名</Text>
            <View style={styles.card}>
              <Text style={styles.signatureText}>{user.signature}</Text>
            </View>
          </View>
        ) : null}

        {/* 其他信息 */}
        {(user?.city || user?.email || user?.mobile) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>其他信息</Text>
            <View style={styles.card}>
              {user?.city ? (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>地区</Text>
                    <Text style={styles.infoValue}>{user.city}</Text>
                  </View>
                  {(user?.mobile || user?.email) ? <View style={styles.divider} /> : null}
                </>
              ) : null}
              {user?.mobile ? (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>手机号</Text>
                    <Text style={styles.infoValue}>{user.mobile}</Text>
                  </View>
                  {user?.email ? <View style={styles.divider} /> : null}
                </>
              ) : null}
              {user?.email ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>邮箱</Text>
                  <Text style={styles.infoValue}>{user.email}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* TA的帖子（仅客人态显示） */}
        {!isCurrentUser && user?.recentPosts && user.recentPosts.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>TA的帖子</Text>
              <Text style={styles.postCountBadge}>{user.postCount || 0}篇</Text>
            </View>
            <View style={styles.card}>
              {user.recentPosts.map((post: any, index: number) => (
                <View key={post.id}>
                  <TouchableOpacity
                    style={styles.postItem}
                    onPress={() => {
                      // 导航到帖子详情
                      if (post.boardName && (post.topicId || post.id)) {
                        (navigation as any).navigate('PostDetail', {
                          board: post.boardName,
                          postId: post.topicId || post.id,
                        });
                      } else {
                        Alert.alert('提示', '帖子信息不完整，无法跳转');
                      }
                    }}
                  >
                    <Text style={styles.postSubject} numberOfLines={2}>
                      {post.subject}
                    </Text>
                    {post.body ? (
                      <Text style={styles.postBody} numberOfLines={3}>
                        {stripHtmlTags(post.body)}
                      </Text>
                    ) : null}
                    <View style={styles.postMeta}>
                      <Text style={styles.postBoard}>{post.boardTitle || post.boardName}</Text>
                      <Text style={styles.postTime}>
                        {post.postTime ? formatRelativeTime(post.postTime) : ''}
                      </Text>
                      {post.replyCount > 0 ? (
                        <Text style={styles.postReplyCount}>{post.replyCount}回复</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                  {index < (user.recentPosts?.length || 0) - 1 ? (
                    <View style={styles.divider} />
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* 发消息弹窗 */}
      <Modal
        visible={showMessageModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMessageModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackground}
            activeOpacity={1}
            onPress={() => setShowMessageModal(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              style={styles.modalContainer}
            >
              {/* 标题栏 */}
              <View style={styles.modalHeader}>
                <TouchableOpacity
                  onPress={() => setShowMessageModal(false)}
                  style={styles.modalCloseButton}
                >
                  <Text style={styles.modalCloseText}>取消</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>发送消息</Text>
                <View style={styles.modalPlaceholder} />
              </View>

              {/* 收件人 */}
              <View style={styles.modalRecipient}>
                <Text style={styles.modalRecipientLabel}>收件人：</Text>
                <Text style={styles.modalRecipientName}>{user?.username || username}</Text>
              </View>

              {/* 主题输入框 */}
              <View style={styles.modalInputContainer}>
                <TextInput
                  style={styles.modalSubjectInput}
                  placeholder="主题"
                  placeholderTextColor="#999"
                  value={messageSubject}
                  onChangeText={setMessageSubject}
                  maxLength={100}
                />
              </View>

              {/* 内容输入框 */}
              <View style={styles.modalBodyContainer}>
                <TextInput
                  style={styles.modalBodyInput}
                  placeholder="请输入消息内容"
                  placeholderTextColor="#999"
                  value={messageBody}
                  onChangeText={setMessageBody}
                  multiline
                  textAlignVertical="top"
                  maxLength={5000}
                />
                {/* 发送按钮 */}
                <TouchableOpacity
                  style={[
                    styles.modalSendButton,
                    (!messageSubject.trim() || !messageBody.trim() || sendingMessage) && styles.modalSendButtonDisabled
                  ]}
                  onPress={handleSendMessage}
                  disabled={!messageSubject.trim() || !messageBody.trim() || sendingMessage}
                >
                  {sendingMessage ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.modalSendButtonText}>发送</Text>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* 图片来源选择弹窗（仅Android使用） */}
      {Platform.OS === 'android' && (
        <Modal
          visible={showImageSourceModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowImageSourceModal(false)}
        >
          <TouchableOpacity
            style={styles.imageSourceOverlay}
            activeOpacity={1}
            onPress={() => setShowImageSourceModal(false)}
          >
            <View style={styles.imageSourceModal}>
              <TouchableOpacity
                style={styles.imageSourceButton}
                onPress={handleTakePhoto}
              >
                <Text style={styles.imageSourceButtonText}>📷 拍照</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.imageSourceButton}
                onPress={handleSelectFromGallery}
              >
                <Text style={styles.imageSourceButtonText}>🖼️ 从相册选择</Text>
              </TouchableOpacity>
              {backgroundImage && (
                <TouchableOpacity
                  style={styles.imageSourceButton}
                  onPress={() => {
                    setShowImageSourceModal(false);
                    handleDeleteBackgroundImage();
                  }}
                >
                  <Text style={[styles.imageSourceButtonText, styles.imageSourceDeleteText]}>🗑️ 删除背景图片</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.imageSourceButton, styles.imageSourceCancelButton]}
                onPress={() => setShowImageSourceModal(false)}
              >
                <Text style={[styles.imageSourceButtonText, styles.imageSourceCancelText]}>取消</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* 扫一扫相机界面 */}
      <Modal
        visible={showScanner}
        transparent={false}
        animationType="slide"
        onRequestClose={() => {
          setShowScanner(false);
          isProcessingQR.current = false; // 重置防抖状态
        }}
      >
        <View style={styles.scannerContainer}>
          {device && hasPermission ? (
            <>
              <Camera
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={showScanner}
                codeScanner={codeScanner}
                torch={torchOn ? 'on' : 'off'}
                enableZoomGesture={true}
                photo={false}
                video={false}
                audio={false}
              />
              {/* 扫描框 */}
              <View style={styles.scannerOverlay}>
                <View style={styles.scannerTopMask} />
                <View style={styles.scannerMiddleRow}>
                  <View style={styles.scannerSideMask} />
                  <View style={styles.scannerFrame}>
                    <View style={[styles.scannerCorner, styles.scannerCornerTopLeft]} />
                    <View style={[styles.scannerCorner, styles.scannerCornerTopRight]} />
                    <View style={[styles.scannerCorner, styles.scannerCornerBottomLeft]} />
                    <View style={[styles.scannerCorner, styles.scannerCornerBottomRight]} />
                  </View>
                  <View style={styles.scannerSideMask} />
                </View>
                <View style={styles.scannerBottomMask}>
                  <Text style={styles.scannerHint}>将二维码放入框内，即可自动扫描</Text>
                </View>
              </View>
              {/* 关闭按钮 */}
              <TouchableOpacity
                style={styles.scannerCloseButton}
                onPress={() => {
                  setShowScanner(false);
                  setTorchOn(false);
                  isProcessingQR.current = false; // 重置防抖状态
                }}
              >
                <Text style={styles.scannerCloseText}>✕</Text>
              </TouchableOpacity>
              {/* 手电筒按钮 */}
              <TouchableOpacity
                style={styles.scannerTorchButton}
                onPress={() => setTorchOn(!torchOn)}
              >
                <Text style={styles.scannerTorchText}>{torchOn ? '🔦' : '💡'}</Text>
              </TouchableOpacity>
              {/* 相册按钮 */}
              <TouchableOpacity
                style={styles.scannerGalleryButton}
                onPress={handleSelectQRFromGallery}
              >
                <View style={styles.scannerGalleryIcon}>
                  <Svg width={scaleModerate(24)} height={scaleModerate(24)} viewBox="0 0 24 24" fill="none">
                    <Rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="#fff" strokeWidth="2" />
                    <Circle cx="8.5" cy="8.5" r="1.5" fill="#fff" />
                    <Path d="M21 15l-5-5L5 21" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </View>
                <Text style={styles.scannerGalleryText}>相册</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.scannerErrorContainer}>
              <Text style={styles.scannerErrorText}>无法访问相机</Text>
              <TouchableOpacity
                style={styles.scannerErrorButton}
                onPress={() => {
                  setShowScanner(false);
                  isProcessingQR.current = false; // 重置防抖状态
                }}
              >
                <Text style={styles.scannerErrorButtonText}>关闭</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  errorHint: {
    fontSize: 14,
    color: '#999',
  },
  content: {
    flex: 1,
  },
  // 新的背景图片区域
  headerBackground: {
    width: SCREEN_WIDTH,
    height: HEADER_HEIGHT,
    backgroundColor: '#E8F4FF', // 淡蓝色背景，与项目主题一致
  },
  headerBackgroundImage: {
    resizeMode: 'cover',
  },
  // 顶部工具栏
  headerTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: RESPONSIVE.STATUS_BAR_HEIGHT + SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  topBarButton: {
    width: scaleModerate(40),
    height: scaleModerate(40),
    borderRadius: scaleModerate(20),
    backgroundColor: 'rgba(255, 255, 255, 0.9)', // 更不透明的白色背景
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  topBarIcon: {
    fontSize: FONT_SIZE.xl,
    color: '#333',
  },
  topBarActions: {
    flexDirection: 'row',
  },
  topBarSpacer: {
    width: SPACING.md,
  },
  // 底部头像区域
  headerBottomSection: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: SPACING.xl,
    paddingLeft: SPACING.xl,
  },
  avatarAndNicknameRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: responsiveSize(80, 100, 110, 120),
    height: responsiveSize(80, 100, 110, 120),
    borderRadius: responsiveSize(40, 50, 55, 60),
  },
  avatarPlaceholder: {
    width: responsiveSize(80, 100, 110, 120),
    height: responsiveSize(80, 100, 110, 120),
    borderRadius: responsiveSize(40, 50, 55, 60),
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: responsiveSize(32, 40, 44, 48),
    fontWeight: '600',
    color: '#fff',
  },
  nicknameContainer: {
    marginLeft: SPACING.lg,
    flex: 1,
  },
  nicknameOnHeader: {
    fontSize: responsiveSize(20, 24, 26, 28),
    fontWeight: 'bold',
    color: '#000',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: {width: 0, height: 0},
    textShadowRadius: 8,
  },
  // 用户信息区域
  userInfoSection: {
    backgroundColor: '#fff',
    padding: SPACING.xl,
    paddingTop: SPACING.lg,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  username: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: '#000',
    marginRight: SPACING.sm,
  },
  genderIcon: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
  },
  genderMale: {
    color: '#1890ff',
  },
  genderFemale: {
    color: '#ff4d8f',
  },
  // 标签行
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    flexWrap: 'wrap',
  },
  levelBadge: {
    backgroundColor: '#E8F4FF', // 淡蓝色背景
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    marginRight: SPACING.xs + 2,
    marginBottom: SPACING.xs,
  },
  levelText: {
    fontSize: FONT_SIZE.xs,
    color: '#007AFF', // 蓝色文字
    fontWeight: '600',
  },
  titleText: {
    fontSize: FONT_SIZE.sm,
    color: '#FF8C00', // 橙色
    fontWeight: '600',
    marginRight: SPACING.xs + 2,
    marginBottom: SPACING.xs,
  },
  customBadge: {
    backgroundColor: '#FFF7E6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  customBadgeText: {
    fontSize: 11,
    color: '#FF8C00',
    fontWeight: '600',
  },
  verifiedBadge: {
    backgroundColor: '#E6F7FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  verifiedText: {
    fontSize: 12,
    color: '#1890FF', // 蓝色
    fontWeight: '600',
    marginRight: 6,
    marginBottom: 4,
  },
  emojiIcon: {
    fontSize: 14,
    marginLeft: 4,
  },
  registerTimeBadge: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    marginLeft: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  registerTimeText: {
    fontSize: FONT_SIZE.xs,
    color: '#666',
    fontWeight: '500',
  },
  longNickname: {
    fontSize: FONT_SIZE.md,
    color: '#666',
    lineHeight: FONT_SIZE.xl,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  loginTimeText: {
    fontSize: FONT_SIZE.sm,
    color: '#666',
    marginBottom: SPACING.sm,
  },
  postLocationText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  signatureText: {
    fontSize: FONT_SIZE.md,
    color: '#666',
    lineHeight: FONT_SIZE.xl,
    marginBottom: SPACING.sm,
  },
  locationText: {
    fontSize: FONT_SIZE.sm,
    color: '#999',
  },
  // 统计数据区域
  statsSection: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xxxl + 8,
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: SPACING.xs,
  },
  statLabel: {
    fontSize: FONT_SIZE.sm,
    color: '#666',
  },
  statDivider: {
    width: 1,
    height: scaleModerate(30),
    backgroundColor: '#e0e0e0',
  },
  // 操作按钮区域
  actionButtonsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#007AFF', // 蓝色主按钮
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  primaryButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: '#fff',
  },
  primaryButtonFollowed: {
    backgroundColor: '#E8F4FF',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  primaryButtonTextFollowed: {
    color: '#007AFF',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#007AFF', // 蓝色边框
  },
  secondaryButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: '#007AFF', // 蓝色文字
  },
  fullWidthButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
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
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  infoLabel: {
    fontSize: FONT_SIZE.lg,
    color: '#000',
  },
  infoValue: {
    fontSize: FONT_SIZE.lg,
    color: '#666',
    textAlign: 'right',
    flex: 1,
    marginLeft: SPACING.lg,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#f0f0f0',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  postCountBadge: {
    fontSize: FONT_SIZE.sm,
    color: '#666',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
  },
  emptyPostsContainer: {
    paddingVertical: SPACING.xxxl + 8,
    alignItems: 'center',
  },
  emptyPostsText: {
    fontSize: FONT_SIZE.lg,
    color: '#999',
    marginBottom: SPACING.sm,
  },
  emptyPostsHint: {
    fontSize: FONT_SIZE.sm,
    color: '#ccc',
  },
  postItem: {
    paddingVertical: SPACING.md,
  },
  postSubject: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '500',
    color: '#333',
    marginBottom: SPACING.xs + 2,
    lineHeight: FONT_SIZE.xl,
  },
  postBody: {
    fontSize: FONT_SIZE.md,
    color: '#666',
    lineHeight: FONT_SIZE.xl,
    marginBottom: SPACING.sm,
  },
  postMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  postBoard: {
    fontSize: FONT_SIZE.sm,
    color: '#007AFF',
    marginRight: SPACING.md,
  },
  postTime: {
    fontSize: FONT_SIZE.sm,
    color: '#999',
    marginRight: SPACING.md,
  },
  postReplyCount: {
    fontSize: FONT_SIZE.sm,
    color: '#999',
  },
  // 发消息弹窗样式
  modalOverlay: {
    flex: 1,
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: SCREEN_WIDTH * 0.9,
    maxWidth: responsiveSize(400, 500, 550, 600),
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  modalCloseButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  modalCloseText: {
    fontSize: FONT_SIZE.lg,
    color: '#007AFF',
  },
  modalTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    color: '#000',
  },
  modalPlaceholder: {
    width: scaleModerate(50),
  },
  modalRecipient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: '#f8f8f8',
  },
  modalRecipientLabel: {
    fontSize: FONT_SIZE.lg,
    color: '#666',
  },
  modalRecipientName: {
    fontSize: FONT_SIZE.lg,
    color: '#000',
    fontWeight: '500',
  },
  modalInputContainer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  modalSubjectInput: {
    fontSize: FONT_SIZE.lg,
    color: '#000',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: '#f8f8f8',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  modalBodyContainer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    minHeight: responsiveSize(180, 200, 220, 250),
  },
  modalBodyInput: {
    fontSize: FONT_SIZE.lg,
    color: '#000',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: '#f8f8f8',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minHeight: responsiveSize(130, 150, 170, 200),
    maxHeight: responsiveSize(250, 300, 350, 400),
  },
  modalSendButton: {
    position: 'absolute',
    right: SPACING.xxl + 8,
    bottom: SPACING.xxl + 8,
    backgroundColor: '#007AFF',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.md,
    minWidth: scaleModerate(70),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  modalSendButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  modalSendButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: '#fff',
  },
  // 图片来源选择弹窗样式
  imageSourceOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  imageSourceModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    paddingBottom: RESPONSIVE.BOTTOM_SAFE_AREA_HEIGHT + SPACING.lg,
  },
  imageSourceButton: {
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
    alignItems: 'center',
  },
  imageSourceButtonText: {
    fontSize: FONT_SIZE.xl,
    color: '#007AFF',
    fontWeight: '500',
  },
  imageSourceCancelButton: {
    borderBottomWidth: 0,
    marginTop: SPACING.sm,
    backgroundColor: '#f8f8f8',
  },
  imageSourceCancelText: {
    color: '#666',
  },
  imageSourceDeleteText: {
    color: '#FF3B30',
  },
  // 二维码区域样式
  qrcodeSection: {
    backgroundColor: '#fff',
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  qrcodeToggleButton: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  qrcodeToggleText: {
    fontSize: FONT_SIZE.md,
    color: '#007AFF',
    fontWeight: '500',
  },
  qrcodeContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  qrcodeWrapper: {
    padding: SPACING.lg,
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS.lg,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  qrcodeHint: {
    marginTop: SPACING.lg,
    fontSize: FONT_SIZE.md,
    color: '#666',
    textAlign: 'center',
  },
  // 扫一扫相机样式
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  scannerTopMask: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  scannerMiddleRow: {
    flexDirection: 'row',
    height: responsiveSize(250, 280, 300, 320),
  },
  scannerSideMask: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  scannerFrame: {
    width: responsiveSize(250, 280, 300, 320),
    height: responsiveSize(250, 280, 300, 320),
    position: 'relative',
  },
  scannerCorner: {
    position: 'absolute',
    width: scaleModerate(30),
    height: scaleModerate(30),
    borderColor: '#fff',
  },
  scannerCornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  scannerCornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  scannerCornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  scannerCornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  scannerBottomMask: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: SPACING.xl,
  },
  scannerHint: {
    fontSize: FONT_SIZE.lg,
    color: '#fff',
    textAlign: 'center',
  },
  scannerCloseButton: {
    position: 'absolute',
    top: RESPONSIVE.STATUS_BAR_HEIGHT + SPACING.lg,
    right: SPACING.xl,
    width: scaleModerate(44),
    height: scaleModerate(44),
    borderRadius: scaleModerate(22),
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerCloseText: {
    fontSize: FONT_SIZE.xxxl,
    color: '#fff',
    fontWeight: 'bold',
  },
  scannerTorchButton: {
    position: 'absolute',
    top: RESPONSIVE.STATUS_BAR_HEIGHT + SPACING.lg,
    left: SPACING.xl,
    width: scaleModerate(44),
    height: scaleModerate(44),
    borderRadius: scaleModerate(22),
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerTorchText: {
    fontSize: FONT_SIZE.xxl,
  },
  scannerGalleryButton: {
    position: 'absolute',
    bottom: SPACING.xxl,
    right: SPACING.xl,
    alignItems: 'center',
  },
  scannerGalleryIcon: {
    width: scaleModerate(48),
    height: scaleModerate(48),
    borderRadius: scaleModerate(24),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  scannerGalleryText: {
    fontSize: FONT_SIZE.xs,
    color: '#fff',
    marginTop: SPACING.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },
  scannerErrorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  scannerErrorText: {
    fontSize: FONT_SIZE.xl,
    color: '#fff',
    marginBottom: SPACING.xl,
  },
  scannerErrorButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: SPACING.xxxl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  scannerErrorButtonText: {
    fontSize: FONT_SIZE.lg,
    color: '#fff',
    fontWeight: '600',
  },
});

export default UserProfileScreen;

