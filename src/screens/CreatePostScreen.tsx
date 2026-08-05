import React, {useState, useEffect, useMemo, useRef} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  Keyboard,
  InputAccessoryView,
  ActionSheetIOS,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import ImageCropPicker from 'react-native-image-crop-picker';
import {useNavigation, useRoute} from '@react-navigation/native';
import {createPost, replyPost, updateArticle, getDraft, saveDraft, clearDraft, checkPublish, getUploadToken, uploadImages} from '../services/postApi';
import PostCaptchaScreen from './PostCaptchaScreen';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  scaleModerate,
  responsiveSize,
} from '../utils/responsive';
import {ThemedHeaderButton, useFloatingHeader} from '../components/ThemeHeader';
import {useTheme} from '../components/ThemedComponents';
import {getCardElevation, ThemeColors} from '../utils/theme';
import {CameraIcon, ImageIcon, CheckCircleIcon, CheckIcon, LightbulbIcon, TrashIcon} from '../components/SvgIcons';
import {notifySuccess, impactLight} from '../utils/haptics';

// 在 Android 上启用 LayoutAnimation（仅需启用一次）
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface RouteParams {
  boardId: string; // 版面ID (hash格式)
  boardName?: string; // 版面名称（显示用）
  reId?: string; // 如果是回复，传入被回复的帖子ID
  reTitle?: string; // 被回复的帖子标题
  mode?: 'create' | 'reply' | 'edit'; // 发帖模式
  quotedContent?: string; // 引用的内容
  articleId?: string; // 编辑模式下的帖子ID
  editTitle?: string; // 编辑模式下的原始标题
  editContent?: string; // 编辑模式下的原始内容
}

const CreatePostScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = (route.params as RouteParams) || {};
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const isReplyMode = params.mode === 'reply' || !!params.reId;
  const isEditMode = params.mode === 'edit' && !!params.articleId;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [showCaptchaModal, setShowCaptchaModal] = useState(false);
  const [captchaTicket, setCaptchaTicket] = useState<string | null>(null);
  const [captchaRandstr, setCaptchaRandstr] = useState<string | null>(null);
  const [captchaVerified, setCaptchaVerified] = useState(false); // 验证码是否已验证
  const [selectedImages, setSelectedImages] = useState<any[]>([]); // 选中的图片asset对象列表
  const [uploadToken, setUploadToken] = useState<string | null>(null); // 上传token（多个图片共用）
  const [uploading, setUploading] = useState(false); // 是否正在上传图片
  const [uploadProgress, setUploadProgress] = useState<number>(0); // 上传进度（0-100）
  const [showImageSourceModal, setShowImageSourceModal] = useState(false); // 显示图片来源选择弹窗
  
  // 键盘工具栏ID - 使用useRef生成唯一ID，确保组件实例间不冲突，且在组件生命周期内保持不变
  const inputAccessoryViewID = useRef(`createPostKeyboardAccessory_${Date.now()}`).current;

  // 设置导航栏
  const setHeaderOptions = useFloatingHeader();
  useEffect(() => {
    setHeaderOptions({
      title: isEditMode ? '编辑' : (isReplyMode ? '回复' : '发帖'),
      headerRight: () => (
        <ThemedHeaderButton
          onPress={handleSubmit}
          accessibilityLabel={isEditMode ? '保存帖子' : '发布帖子'}
          style={submitting ? {opacity: 0.5} : undefined}>
          {submitting ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Text style={styles.submitText}>{isEditMode ? '保存' : '发布'}</Text>
          )}
        </ThemedHeaderButton>
      ),
    });
  }, [navigation, isReplyMode, isEditMode, submitting, title, content, captchaVerified, captchaTicket, captchaRandstr, selectedImages, uploadToken, uploading, theme, styles]);

  // 加载草稿 / 编辑模式填充原始内容
  useEffect(() => {
    const loadDraft = async () => {
      // 编辑模式：填充原始标题和内容
      if (isEditMode) {
        if (params.editTitle) {
          setTitle(params.editTitle);
        }
        if (params.editContent) {
          setContent(params.editContent);
        }
        setLoadingDraft(false);
        return;
      }
      if (!isReplyMode && params.boardId) {
        const draft = await getDraft(params.boardId);
        if (draft) {
          Alert.alert('提示', '检测到未发布的草稿，是否继续编辑？', [
            {
              text: '放弃',
              style: 'destructive',
              onPress: () => {
                clearDraft(params.boardId);
              },
            },
            {
              text: '继续编辑',
              onPress: () => {
                setTitle(draft.subject);
                setContent(draft.body);
              },
            },
          ]);
        }
      }
      // 如果是回复模式，自动填充Re:标题
      if (isReplyMode && params.reTitle) {
        const reTitle = params.reTitle.startsWith('Re: ')
          ? params.reTitle
          : `Re: ${params.reTitle}`;
        setTitle(reTitle);
      }
      // 如果有引用内容，自动填充到内容框，并在最上方预留一行空白
      if (isReplyMode && params.quotedContent) {
        setContent('\n' + params.quotedContent);
      }
      setLoadingDraft(false);
    };
    loadDraft();
  }, [params.boardId, isReplyMode, isEditMode, params.reTitle, params.quotedContent, params.editTitle, params.editContent]);

  // 自动保存草稿（编辑模式下不保存草稿）
  useEffect(() => {
    if (!isReplyMode && !isEditMode && !loadingDraft && (title || content)) {
      const timer = setTimeout(() => {
        saveDraft({
          boardId: params.boardId,
          boardName: params.boardName,
          subject: title,
          body: content,
        });
      }, 2000); // 2秒后自动保存
      return () => clearTimeout(timer);
    }
  }, [title, content, params.boardId, params.boardName, isReplyMode, loadingDraft]);

  const handleSubmit = async () => {
    // 验证输入
    if (!title.trim()) {
      Alert.alert('提示', '请输入标题');
      return;
    }
    if (!content.trim()) {
      Alert.alert('提示', '请输入内容');
      return;
    }

    // 编辑模式不需要验证码
    if (!isEditMode && (!captchaVerified || !captchaTicket || !captchaRandstr)) {
      Alert.alert('提示', '请先完成人机验证');
      return;
    }

    // 如果有选中的图片但还未上传完成，不允许发布
    if (selectedImages.length > 0 && (!uploadToken || uploading)) {
      Alert.alert('提示', uploading ? '图片正在上传中，请稍候' : '请先完成人机验证以上传图片');
      return;
    }

    // 解析验证码参数（编辑模式不需要）
    let captchaParams;
    if (!isEditMode && captchaTicket) {
      const parts = captchaTicket.split('|');
      if (parts.length >= 4) {
        captchaParams = {
          captcha_id: 'ade4a85345062fda4657d64aa3206cba', // 发帖专用的captcha_id
          lot_number: parts[0],
          captcha_output: parts[1],
          pass_token: parts[2],
          gen_time: parts[3],
        };
      }
    }

    setSubmitting(true);
    try {
      if (isEditMode) {
        // 编辑模式：调用 updateArticle 接口
        await updateArticle({
          articleId: params.articleId!,
          subject: title.trim(),
          body: content.trim(),
          uploadToken: uploadToken || undefined,
        });
      } else {
        const postParams = {
          boardId: params.boardId,
          boardName: params.boardName,
          subject: title.trim(),
          body: content.trim(),
          reId: params.reId,
          captchaParams, // 传递验证码参数
          uploadToken: uploadToken || undefined, // 传递图片上传token
        };

        await (isReplyMode
          ? replyPost(postParams)
          : createPost(postParams));

        // 发帖成功后清除草稿
        if (!isReplyMode) {
          await clearDraft(params.boardId);
        }
      }

      const successMsg = isEditMode ? '保存成功' : (isReplyMode ? '回复成功' : '发帖成功');
      notifySuccess();
      Alert.alert('成功', successMsg, [
        {
          text: '确定',
          onPress: () => {
            navigation.goBack();
          },
        },
      ]);
    } catch (error: any) {
      console.error('提交失败:', error);
      const failMsg = isEditMode ? '保存失败' : (isReplyMode ? '回复失败' : '发帖失败');
      Alert.alert('失败', error.message || failMsg);
      if (!isEditMode) {
        // 验证码失败后清除，需要重新验证
        setCaptchaTicket(null);
        setCaptchaRandstr(null);
        setCaptchaVerified(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 验证码验证成功
  const handleCaptchaSuccess = async (ticket: string, randstr: string) => {
    setCaptchaTicket(ticket);
    setCaptchaRandstr(randstr);
    setCaptchaVerified(true);
    setShowCaptchaModal(false);
    
    // 延迟关闭键盘，确保Modal完全关闭后再执行，避免焦点自动回到输入框
    setTimeout(() => {
      Keyboard.dismiss();
    }, 300);

    // 如果有选中的图片，自动开始上传
    if (selectedImages.length > 0 && !uploadToken) {
      await handleUploadImages();
    }
  };

  // 验证码取消
  const handleCaptchaCancel = () => {
    setShowCaptchaModal(false);
  };

  // 显示图片来源选择
  const handleShowImageSourcePicker = () => {
    if (selectedImages.length >= 9) {
      Alert.alert('提示', '最多只能选择9张图片');
      return;
    }
    
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['取消', '拍照', '从相册选择'],
          cancelButtonIndex: 0,
          title: '选择图片来源',
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            handleTakePhoto();
          } else if (buttonIndex === 2) {
            handleSelectFromGallery();
          }
        }
      );
    } else {
      setShowImageSourceModal(true);
    }
  };

  // 从相册选择图片
  const handleSelectFromGallery = async () => {
    // 先关闭弹窗
    setShowImageSourceModal(false);

    // 最多选择9张图片
    if (selectedImages.length >= 9) {
      Alert.alert('提示', '最多只能选择9张图片');
      return;
    }

    try {
      const images = await ImageCropPicker.openPicker({
        multiple: true,
        maxFiles: 9 - selectedImages.length, // 剩余可选数量
        mediaType: 'photo',
        compressImageQuality: 0.8,
        includeBase64: false,
        forceJpg: true, // 强制转换为 JPEG 格式（仅 iOS 有效）
      });

      if (images && images.length > 0) {
        // 转换为统一的 asset 格式
        const newAssets = images.map((image: any) => ({
          uri: image.path,
          fileName: image.filename || `image_${Date.now()}.jpg`,
          type: image.mime || 'image/jpeg',
          fileSize: image.size,
          width: image.width,
          height: image.height,
        }));
        const newImages = [...selectedImages, ...newAssets];
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        impactLight();
        setSelectedImages(newImages);

        // 清除之前的上传状态
        setUploadToken(null);
      }
    } catch (error: any) {
      if (error.code !== 'E_PICKER_CANCELLED') {
        console.error('选择图片失败:', error);
        Alert.alert('失败', '选择图片失败，请稍后重试');
      }
    }
  };

  // 从相机拍照
  const handleTakePhoto = async () => {
    // 先关闭弹窗
    setShowImageSourceModal(false);

    // 最多选择9张图片
    if (selectedImages.length >= 9) {
      Alert.alert('提示', '最多只能选择9张图片');
      return;
    }

    try {
      const image = await ImageCropPicker.openCamera({
        mediaType: 'photo',
        compressImageQuality: 0.8,
        includeBase64: false,
        forceJpg: true, // 强制转换为 JPEG 格式（仅 iOS 有效）
      });

      if (image && image.path) {
        // 转换为统一的 asset 格式
        const newAsset = {
          uri: image.path,
          fileName: image.filename || `photo_${Date.now()}.jpg`,
          type: image.mime || 'image/jpeg',
          fileSize: image.size,
          width: image.width,
          height: image.height,
        };
        const newImages = [...selectedImages, newAsset];
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        impactLight();
        setSelectedImages(newImages);

        // 清除之前的上传状态
        setUploadToken(null);
      }
    } catch (error: any) {
      if (error.code !== 'E_PICKER_CANCELLED') {
        console.error('拍照失败:', error);
        Alert.alert('失败', '拍照失败，请稍后重试');
      }
    }
  };

  // 删除选中的图片
  const handleRemoveImage = (index: number) => {
    if (uploading) {
      Alert.alert('提示', '图片正在上传中，无法删除');
      return;
    }
    const newImages = selectedImages.filter((_, i) => i !== index);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    impactLight();
    setSelectedImages(newImages);
    // 如果删除了所有图片，清除token和上传状态
    if (newImages.length === 0) {
      setUploadToken(null);
      setUploadProgress(0);
    } else {
      // 删除图片后需要重新上传
      setUploadToken(null);
      setUploadProgress(0);
    }
  };

  // 上传图片（批量上传）
  const handleUploadImages = async () => {
    if (selectedImages.length === 0) {
      return;
    }

    // 验证图片asset对象
    const validImages = selectedImages.filter(asset => {
      if (!asset || !asset.uri) {
        return false;
      }
      return true;
    });
    
    if (validImages.length === 0) {
      Alert.alert('提示', '没有有效的图片可上传');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      // 先检查发帖权限
      await checkPublish(params.boardId);
      
      // 请求两次token，使用第二次的结果
      await getUploadToken(params.boardId);
      const token2 = await getUploadToken(params.boardId);
      
      // 批量上传所有图片（一次HTTP请求），并监听进度
      await uploadImages(params.boardId, token2, validImages, (progress) => {
        setUploadProgress(progress);
      });

      setUploadToken(token2);
      setUploadProgress(100);
    } catch (error: any) {
      console.error('上传图片失败:', error);
      console.error('错误堆栈:', error.stack);
      setUploadProgress(0);
      Alert.alert('失败', '上传图片失败: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  // handleCancel 函数暂未使用，保留供未来使用
  // const handleCancel = () => { ... }

  if (loadingDraft) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={theme.primary} style={{marginTop: 100}} />
      </View>
    );
  }

  // 渲染验证码Modal
  const renderCaptchaModal = () => (
    <Modal
      visible={showCaptchaModal}
      transparent={true}
      animationType="fade"
      onRequestClose={handleCaptchaCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <PostCaptchaScreen
            onCaptchaSuccess={handleCaptchaSuccess}
            onCancel={handleCaptchaCancel}
          />
        </View>
      </View>
    </Modal>
  );

  // 渲染图片来源选择Modal
  const renderImageSourceModal = () => {
    if (Platform.OS !== 'android') return null;

    return (
      <Modal
        visible={showImageSourceModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowImageSourceModal(false)}>
        <View style={styles.imageSourceOverlay}>
          {/* 点击空白区域关闭弹窗 */}
          <TouchableOpacity 
            style={styles.imageSourceBackdrop} 
            activeOpacity={1}
            onPress={() => setShowImageSourceModal(false)}
          />
          {/* 底部选项容器 */}
          <View style={styles.imageSourceModalContainer}>
            <TouchableOpacity
              style={styles.imageSourceButton}
              onPress={handleTakePhoto}>
              <View style={styles.imageSourceButtonContent}>
                <CameraIcon size={20} color={theme.text} />
                <Text style={styles.imageSourceButtonText}> 拍照</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.imageSourceButton}
              onPress={handleSelectFromGallery}>
              <View style={styles.imageSourceButtonContent}>
                <ImageIcon size={20} color={theme.text} />
                <Text style={styles.imageSourceButtonText}> 从相册选择</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.imageSourceButton, styles.imageSourceCancelButton]}
              onPress={() => setShowImageSourceModal(false)}>
              <Text style={[styles.imageSourceButtonText, styles.imageSourceCancelText]}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      {renderCaptchaModal()}
      {renderImageSourceModal()}
      
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {/* 键盘工具栏 - 移到ScrollView内部，确保与TextInput在同一渲染上下文中，提高稳定性（编辑模式下不显示） */}
          {Platform.OS === 'ios' && (
            <InputAccessoryView nativeID={inputAccessoryViewID}>
              <View style={styles.keyboardAccessory}>
                <TouchableOpacity
                  style={styles.keyboardDoneButton}
                  onPress={() => Keyboard.dismiss()}>
                  <Text style={styles.keyboardDoneText}>完成</Text>
                </TouchableOpacity>
              </View>
            </InputAccessoryView>
          )}

          {/* 版面信息 */}
          <View style={styles.boardInfo}>
            <Text style={styles.boardLabel}>
              {isEditMode ? '编辑帖子：' : (isReplyMode ? '回复到：' : '发帖到：')}
            </Text>
            <Text style={styles.boardName}>
              {params.boardName || params.boardId}
            </Text>
          </View>

          {/* 标题输入 */}
          <View style={styles.inputGroup}>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="请输入标题"
              placeholderTextColor={theme.secondaryText}
              maxLength={80}
              returnKeyType="next"
              editable={!submitting}
            />
            <Text style={styles.counter}>{title.length}/80</Text>
          </View>

          {/* 内容输入 */}
          <View style={styles.inputGroup}>
            <View style={styles.contentInputContainer}>
              <TextInput
                style={[styles.contentInput, isEditMode && {paddingBottom: SPACING.md}]}
                value={content}
                onChangeText={setContent}
                placeholder="请输入内容"
                placeholderTextColor={theme.secondaryText}
                multiline
                textAlignVertical="top"
                maxLength={10000}
                editable={!submitting}
                inputAccessoryViewID={inputAccessoryViewID}
              />
              {/* 图片选择按钮（左下角），编辑模式下不显示 */}
              {!isEditMode && (
                <TouchableOpacity
                  style={styles.imagePickerButton}
                  onPress={handleShowImageSourcePicker}
                  disabled={submitting || uploading || selectedImages.length >= 9}
                  activeOpacity={0.6}>
                  <ImageIcon size={22} color={theme.secondaryText} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.counter}>{content.length}/10000</Text>
          </View>

          {/* 已选择的图片列表（编辑模式下不显示） */}
          {!isEditMode && selectedImages.length > 0 && (
            <View style={styles.inputGroup}>
              <View style={styles.imageListHeader}>
                <Text style={styles.sectionTitle}>已选择 {selectedImages.length}/9 张图片</Text>
                {uploadToken && (
                  <View style={styles.uploadSuccessContent}>
                    <CheckIcon size={14} color={theme.primary} />
                    <Text style={styles.uploadSuccessText}> 上传完成</Text>
                  </View>
                )}
              </View>
              
              {/* 上传进度条 */}
              {uploading && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, {width: `${uploadProgress}%`}]} />
                  </View>
                  <Text style={styles.progressText}>{uploadProgress}%</Text>
                </View>
              )}
              
              <ScrollView horizontal style={styles.imageList}>
                  {selectedImages.map((asset, index) => (
                  <View key={index} style={styles.imageItem}>
                    <Image source={{uri: asset.uri || asset}} style={styles.imagePreview} />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => handleRemoveImage(index)}
                      disabled={uploading}>
                      <TrashIcon size={14} color="#fff" />
                    </TouchableOpacity>
                    {uploadToken && (
                      <View style={styles.uploadedBadge}>
                      <CheckIcon size={12} color="#fff" />
                      </View>
                    )}
                    {uploading && (
                      <View style={styles.uploadingOverlay}>
                        <ActivityIndicator size="small" color="#fff" />
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* 人机验证（编辑模式下不显示） */}
          {!isEditMode && <View style={styles.inputGroup}>
            <TouchableOpacity
              style={[
                styles.captchaButton,
                {
                  backgroundColor: captchaVerified ? theme.quoteBackground : theme.placeholderBackground,
                  borderColor: captchaVerified ? theme.primary : theme.border,
                },
              ]}
              onPress={() => setShowCaptchaModal(true)}
              disabled={submitting}>
              {captchaVerified ? (
                <View style={styles.captchaVerifiedContent}>
                  <CheckCircleIcon size={18} color={theme.primary} />
                  <Text style={{fontSize: 16, color: theme.primary, marginLeft: 4}}>验证码已验证</Text>
                </View>
              ) : (
                <>
                  <Text style={{fontSize: 16, color: theme.secondaryText}}>点击进行人机验证</Text>
                  <Text style={{fontSize: 14, color: theme.primary}}>去验证</Text>
                </>
              )}
            </TouchableOpacity>
          </View>}

          {/* 提示信息 */}
          <View style={styles.tipContainer}>
            <View style={styles.tipHeader}>
              <LightbulbIcon size={16} color={theme.primary} />
              <Text style={styles.tipText}> 提示：</Text>
            </View>
            {isEditMode ? (
              <>
                <Text style={styles.tipText}>• 修改标题和内容后点击右上角保存</Text>
              </>
            ) : (
              <>
                <Text style={styles.tipText}>• 点击发布前先完成人机验证</Text>
                <Text style={styles.tipText}>• 点击内容框左下角图标可添加图片（最多9张）</Text>
                <Text style={styles.tipText}>• 图片上传完成后才能发布</Text>
                <Text style={styles.tipText}>• 草稿会自动保存（不含图片）</Text>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const createStyles = (theme: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  headerButton: {
    paddingHorizontal: SPACING.sm,
  },
  submitText: {
    fontSize: FONT_SIZE.lg,
    color: theme.primary,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: SPACING.lg,
  },
  boardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.cardBackground,
    ...getCardElevation(theme),
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
  },
  boardLabel: {
    fontSize: FONT_SIZE.md,
    color: theme.secondaryText,
  },
  boardName: {
    fontSize: FONT_SIZE.md,
    color: theme.primary,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: SPACING.lg,
  },
  titleInput: {
    backgroundColor: theme.cardBackground,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZE.lg,
    color: theme.text,
    borderWidth: 1,
    borderColor: theme.border,
  },
  contentInputContainer: {
    position: 'relative',
  },
  contentInput: {
    backgroundColor: theme.cardBackground,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    paddingBottom: responsiveSize(44, 48, 52, 56), // 为左下角按钮留出空间
    fontSize: FONT_SIZE.lg,
    color: theme.text,
    borderWidth: 1,
    borderColor: theme.border,
    minHeight: responsiveSize(180, 200, 220, 250),
    maxHeight: responsiveSize(350, 400, 450, 500),
  },
  imagePickerButton: {
    position: 'absolute',
    left: SPACING.sm,
    bottom: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  counter: {
    fontSize: FONT_SIZE.sm,
    color: theme.secondaryText,
    textAlign: 'right',
    marginTop: SPACING.xs,
  },
  captchaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.placeholderBackground,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    minHeight: responsiveSize(46, 50, 54, 58),
  },
  tipContainer: {
    backgroundColor: theme.quoteBackground,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tipText: {
    fontSize: FONT_SIZE.sm,
    color: theme.secondaryText,
    lineHeight: FONT_SIZE.xl,
  },
  captchaVerifiedContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: theme.text,
  },
  imageListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  uploadSuccessContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  uploadSuccessText: {
    fontSize: FONT_SIZE.sm,
    color: theme.primary,
    fontWeight: '600',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  progressBar: {
    flex: 1,
    height: SPACING.sm,
    backgroundColor: theme.border,
    borderRadius: BORDER_RADIUS.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.primary,
    borderRadius: BORDER_RADIUS.sm,
  },
  progressText: {
    fontSize: FONT_SIZE.sm,
    color: theme.primary,
    fontWeight: '600',
    minWidth: scaleModerate(40),
    textAlign: 'right',
  },
  imageList: {
    marginBottom: SPACING.md,
  },
  imageItem: {
    position: 'relative',
    marginRight: SPACING.sm,
  },
  imagePreview: {
    width: scaleModerate(80),
    height: scaleModerate(80),
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: theme.placeholderBackground,
  },
  removeImageButton: {
    position: 'absolute',
    top: -SPACING.sm,
    right: -SPACING.sm,
    width: scaleModerate(24),
    height: scaleModerate(24),
    borderRadius: scaleModerate(12),
    backgroundColor: theme.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeImageText: {
    color: '#fff',
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    lineHeight: FONT_SIZE.xl,
  },
  uploadedBadge: {
    position: 'absolute',
    bottom: SPACING.xs,
    right: SPACING.xs,
    width: scaleModerate(20),
    height: scaleModerate(20),
    borderRadius: scaleModerate(10),
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  imageActionButton: {
    flex: 1,
    backgroundColor: theme.placeholderBackground,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  imageActionButtonDisabled: {
    opacity: 0.5,
  },
  uploadButton: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  imageActionButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: theme.text,
  },
  imageSourceOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  imageSourceBackdrop: {
    flex: 1,
  },
  imageSourceModalContainer: {
    backgroundColor: theme.cardBackground,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  imageSourceButton: {
    backgroundColor: theme.placeholderBackground,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    alignItems: 'center',
  },
  imageSourceCancelButton: {
    backgroundColor: theme.cardBackground,
    borderWidth: 1,
    borderColor: theme.border,
  },
  imageSourceButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageSourceButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: theme.text,
  },
  imageSourceCancelText: {
    color: theme.secondaryText,
  },
  keyboardAccessory: {
    backgroundColor: theme.placeholderBackground,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  keyboardDoneButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  keyboardDoneText: {
    fontSize: FONT_SIZE.lg,
    color: theme.primary,
    fontWeight: '600',
  },
});

export default CreatePostScreen;
