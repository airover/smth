import React, {useState, useEffect, useMemo, useRef, useCallback} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
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
import {createPost, replyPost, updateArticle, getDraft, saveDraft, clearDraft, checkPublish, getUploadToken, getArticleFileToken, deleteUploadedFiles, uploadImages, buildCreatePostReferer, buildReplyPostReferer} from '../services/postApi';
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
import {useSettings} from '../context/SettingsContext';
import {getCardElevation, getFontSizes, ThemeColors} from '../utils/theme';
import {CameraIcon, ImageIcon, CheckCircleIcon, CheckIcon, LightbulbIcon, TrashIcon, SaveIcon, SendIcon, FileIcon} from '../components/SvgIcons';
import {notifySuccess} from '../utils/haptics';
import {Attachment} from '../types';
import {AccountCacheContext, getLocalCacheContext, isAccountCacheCurrent, subscribeAccountCacheChange} from '../services/accountCache';
import {isImageAttachment, isImageUrl} from '../utils/imageUtils';
import AiReplyConfigModal from '../components/AiReplyConfigModal';
import AiReplyDraftModal from '../components/AiReplyDraftModal';
import type {AiReplyContext} from '../services/aiReply';

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
  aiContext?: AiReplyContext; // AI 回复目标与必要上下文
  articleId?: string; // 编辑模式下的帖子ID
  topicId?: string; // 编辑页面的主题ID（Referer 使用）
  editTitle?: string; // 编辑模式下的原始标题
  editContent?: string; // 编辑模式下的原始内容
  editAttachments?: Attachment[]; // 编辑模式下的原始附件
}

const getAttachmentFileName = (attachment: Attachment): string | null => {
  const rawAttachment = attachment as Attachment & {
    fileName?: string;
    filename?: string;
    key?: string;
  };
  const fileName = rawAttachment.name || rawAttachment.fileName || rawAttachment.filename || rawAttachment.key;
  return typeof fileName === 'string' && fileName.trim() ? fileName.trim() : null;
};

const CreatePostScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = (route.params as RouteParams) || {};
  const theme = useTheme();
  const {settings} = useSettings();
  const fontSizes = useMemo(() => getFontSizes(settings.fontSize), [settings.fontSize]);
  const styles = useMemo(() => createStyles(theme, fontSizes), [theme, fontSizes]);

  const isReplyMode = params.mode === 'reply' || !!params.reId;
  const isEditMode = params.mode === 'edit' && !!params.articleId;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [draftContext, setDraftContext] = useState<AccountCacheContext | null>(null);
  const [accountChanged, setAccountChanged] = useState(false);
  const [showCaptchaModal, setShowCaptchaModal] = useState(false);
  const [captchaTicket, setCaptchaTicket] = useState<string | null>(null);
  const [captchaRandstr, setCaptchaRandstr] = useState<string | null>(null);
  const [captchaVerified, setCaptchaVerified] = useState(false); // 验证码是否已验证
  const [selectedImages, setSelectedImages] = useState<any[]>([]); // 选中的图片asset对象列表
  const [uploadToken, setUploadToken] = useState<string | null>(null); // 上传token（多个图片共用）
  const [uploading, setUploading] = useState(false); // 是否正在上传图片
  const [uploadProgress, setUploadProgress] = useState<number>(0); // 上传进度（0-100）
  const [showImageSourceModal, setShowImageSourceModal] = useState(false); // 显示图片来源选择弹窗
  const [showAiDraftModal, setShowAiDraftModal] = useState(false);
  const [showAiConfigModal, setShowAiConfigModal] = useState(false);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>(params.editAttachments || []);
  const [deletedAttachmentNames, setDeletedAttachmentNames] = useState<string[]>([]);

  const attachmentCount = (isEditMode ? existingAttachments.length : 0) + selectedImages.length;

  // 引用回复的正文结构为 `${用户输入}\n${引用}`，与手工在首行输入保持一致
  const quotedSuffix = params.quotedContent ? `\n${params.quotedContent}` : '';
  const splitReplyContent = (value: string): {draft: string; hasQuote: boolean} => (
    quotedSuffix && value.endsWith(quotedSuffix)
      ? {draft: value.slice(0, value.length - quotedSuffix.length), hasQuote: true}
      : {draft: value, hasQuote: false}
  );
  const getEditableReplyDraft = (value: string): string => splitReplyContent(value).draft;
  
  // 键盘工具栏ID - 使用useRef生成唯一ID，确保组件实例间不冲突，且在组件生命周期内保持不变
  const inputAccessoryViewID = useRef(`createPostKeyboardAccessory_${Date.now()}`).current;
  const contentInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const keyboardTopRef = useRef<number | null>(null);
  const contentFocusedRef = useRef(false);
  const contentSelectionEndRef = useRef(0);
  const draftLoadGenerationRef = useRef(0);
  const submitGenerationRef = useRef(0);

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
            isEditMode ? (
              <SaveIcon size={22} color={theme.headerBackgroundImage ? '#FFFFFF' : theme.headerTint} />
            ) : (
              <SendIcon size={22} color={theme.headerBackgroundImage ? '#FFFFFF' : theme.headerTint} />
            )
          )}
        </ThemedHeaderButton>
      ),
    });
  }, [navigation, isReplyMode, isEditMode, submitting, title, content, captchaVerified, captchaTicket, captchaRandstr, selectedImages, uploadToken, uploading, existingAttachments, deletedAttachmentNames, theme, styles]);

  // 加载当前账号的草稿 / 编辑模式原始内容。
  const loadDraftForCurrentContext = useCallback(async () => {
    const requestGeneration = ++draftLoadGenerationRef.current;
    setLoadingDraft(true);
    try {
      const context = await getLocalCacheContext();
      if (requestGeneration !== draftLoadGenerationRef.current || !isAccountCacheCurrent(context)) return;
      setDraftContext(context);
      setAccountChanged(false);

      if (isEditMode) {
        setExistingAttachments(params.editAttachments || []);
        setDeletedAttachmentNames([]);
        setTitle(params.editTitle || '');
        setContent(params.editContent || '');
        return;
      }

      if (!isReplyMode && params.boardId) {
        const draft = await getDraft(params.boardId, context);
        if (requestGeneration !== draftLoadGenerationRef.current || !isAccountCacheCurrent(context)) return;
        if (draft) {
          Alert.alert('提示', '检测到未发布的草稿，是否继续编辑？', [
            {
              text: '放弃',
              style: 'destructive',
              onPress: () => {
                if (isAccountCacheCurrent(context)) void clearDraft(params.boardId, context);
              },
            },
            {
              text: '继续编辑',
              onPress: () => {
                if (!isAccountCacheCurrent(context)) return;
                setTitle(draft.subject);
                setContent(draft.body);
              },
            },
          ]);
        }
      }

      if (isReplyMode && params.reTitle) {
        const reTitle = params.reTitle.startsWith('Re: ')
          ? params.reTitle
          : `Re: ${params.reTitle}`;
        setTitle(reTitle);
      } else if (!isReplyMode) {
        setTitle('');
      }
      if (isReplyMode && params.quotedContent) {
        setContent('\n' + params.quotedContent);
      } else if (!isReplyMode) {
        setContent('');
      }
    } catch (error) {
      console.error('加载草稿失败:', error);
    } finally {
      if (requestGeneration === draftLoadGenerationRef.current) setLoadingDraft(false);
    }
  }, [isEditMode, isReplyMode, params.boardId, params.editAttachments, params.editContent, params.editTitle, params.quotedContent, params.reTitle]);

  useEffect(() => {
    void loadDraftForCurrentContext();
  }, [loadDraftForCurrentContext]);

  // 切换账号时结束当前编辑会话，避免把旧账号的草稿留在屏幕上或保存到新账号。
  useEffect(() => subscribeAccountCacheChange(() => {
    draftLoadGenerationRef.current += 1;
    submitGenerationRef.current += 1;
    setDraftContext(null);
    setAccountChanged(true);
    setLoadingDraft(false);
    setTitle('');
    setContent('');
    setSelectedImages([]);
    setUploadToken(null);
    setUploading(false);
    setUploadProgress(0);
    setCaptchaTicket(null);
    setCaptchaRandstr(null);
    setCaptchaVerified(false);
    setExistingAttachments([]);
    setDeletedAttachmentNames([]);
    setSubmitting(false);
  }), []);

  // 记录键盘顶部位置，用于让正文末尾始终处于可见区域
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, e => {
      keyboardTopRef.current = e.endCoordinates.screenY;
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardTopRef.current = null;
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // 正文输入框随内容增高（自身不滚动），在末尾输入时让外层 ScrollView 跟随，避免光标被键盘遮挡。
  // Android 由 adjustResize + 系统 requestRectangleOnScreen 处理，这里只补 iOS。
  const keepContentCaretVisible = useCallback(() => {
    if (Platform.OS !== 'ios' || !contentFocusedRef.current || keyboardTopRef.current == null) return;
    if (contentSelectionEndRef.current < content.length) return;
    requestAnimationFrame(() => {
      contentInputRef.current?.measureInWindow((_x, y, _width, height) => {
        const keyboardTop = keyboardTopRef.current;
        if (keyboardTop == null) return;
        // 输入框底部留有图片按钮的空白，按文本末行计算可见性
        const textBottom = y + height - responsiveSize(44, 48, 52, 56) + SPACING.md;
        const overflow = textBottom - (keyboardTop - SPACING.md);
        if (overflow > 0) {
          scrollViewRef.current?.scrollTo({y: scrollOffsetRef.current + overflow, animated: true});
        }
      });
    });
  }, [content.length]);

  // 自动保存草稿（编辑模式下不保存草稿）
  useEffect(() => {
    if (!isReplyMode && !isEditMode && !loadingDraft && draftContext
      && isAccountCacheCurrent(draftContext) && (title || content)) {
      const context = draftContext;
      const timer = setTimeout(() => {
        if (!isAccountCacheCurrent(context)) return;
        saveDraft({
          boardId: params.boardId,
          boardName: params.boardName,
          subject: title,
          body: content,
        }, context);
      }, 2000); // 2秒后自动保存
      return () => clearTimeout(timer);
    }
  }, [title, content, params.boardId, params.boardName, isReplyMode, isEditMode, loadingDraft, draftContext]);

  const handleSubmit = async () => {
    if (accountChanged || !draftContext || !isAccountCacheCurrent(draftContext)) {
      Alert.alert('账号已切换', '请返回后重新进入发帖页面');
      return;
    }
    const submitContext = draftContext;
    const requestGeneration = ++submitGenerationRef.current;

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

    // 新发帖时，选中的图片需要先完成上传；编辑模式会在保存时统一处理附件。
    if (!isEditMode && selectedImages.length > 0 && (!uploadToken || uploading)) {
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
        // 编辑模式：在同一个附件 token 上先删除旧附件、再上传新增图片，最后更新文章。
        const articleId = params.articleId!;
        const topicId = params.topicId || articleId;
        const editUploadToken = await getArticleFileToken(articleId, topicId, submitContext);
        if (requestGeneration !== submitGenerationRef.current || !isAccountCacheCurrent(submitContext)) return;
        if (deletedAttachmentNames.length > 0) {
          await deleteUploadedFiles(editUploadToken, deletedAttachmentNames, submitContext);
          if (requestGeneration !== submitGenerationRef.current || !isAccountCacheCurrent(submitContext)) return;
        }
        if (selectedImages.length > 0) {
          setUploading(true);
          setUploadProgress(0);
          try {
            await uploadImages(
              params.boardId,
              editUploadToken,
              selectedImages,
              progress => {
                if (isAccountCacheCurrent(submitContext)) setUploadProgress(progress);
              },
              `https://wap.newsmth.net/post?id=${encodeURIComponent(topicId)}`,
              submitContext,
            );
            if (requestGeneration !== submitGenerationRef.current || !isAccountCacheCurrent(submitContext)) return;
            setUploadProgress(100);
          } finally {
            if (isAccountCacheCurrent(submitContext)) setUploading(false);
          }
        }

        await updateArticle({
          articleId,
          topicId,
          boardId: params.boardId,
          subject: title.trim(),
          body: content.trim(),
          uploadToken: editUploadToken,
        }, submitContext);
      } else {
        const postParams = {
          boardId: params.boardId,
          boardName: params.boardName,
          subject: title.trim(),
          body: content.trim(),
          reId: params.reId,
          topicId: params.topicId,
          captchaParams, // 传递验证码参数
          uploadToken: uploadToken || undefined, // 传递图片上传token
        };

        await (isReplyMode
          ? replyPost(postParams, submitContext)
          : createPost(postParams, submitContext));

        // 发帖成功后清除草稿
        if (!isReplyMode) {
          await clearDraft(params.boardId, submitContext);
        }
      }

      if (requestGeneration !== submitGenerationRef.current || !isAccountCacheCurrent(submitContext)) return;

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
      if (requestGeneration !== submitGenerationRef.current || !isAccountCacheCurrent(submitContext)) return;
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
      if (requestGeneration === submitGenerationRef.current && isAccountCacheCurrent(submitContext)) {
        setSubmitting(false);
      }
    }
  };

  const handleAiReplyApply = (generatedText: string, mode: 'replace' | 'prepend' | 'append') => {
    const generated = generatedText.trim();
    setContent(current => {
      const {draft, hasQuote} = splitReplyContent(current);

      let nextDraft: string;
      if (mode === 'prepend') {
        nextDraft = draft.trim() ? `${generated}\n\n${draft.trimStart()}` : generated;
      } else if (mode === 'replace') {
        nextDraft = generated;
      } else {
        const existingDraft = draft.trimEnd();
        nextDraft = existingDraft ? `${existingDraft}\n\n${generated}` : generated;
      }

      return hasQuote ? `${nextDraft}${quotedSuffix}` : nextDraft;
    });

    if (mode === 'prepend') {
      requestAnimationFrame(() => {
        contentInputRef.current?.setNativeProps({selection: {start: 0, end: 0}});
      });
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
    if (attachmentCount >= 9) {
      Alert.alert('提示', '附件总数最多为9个');
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
    if (attachmentCount >= 9) {
      Alert.alert('提示', '附件总数最多为9个');
      return;
    }

    try {
      const images = await ImageCropPicker.openPicker({
        multiple: true,
        maxFiles: 9 - attachmentCount, // 剩余可选数量
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
    if (attachmentCount >= 9) {
      Alert.alert('提示', '附件总数最多为9个');
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

  // 标记已有附件，保存时从服务端删除
  const handleRemoveExistingAttachment = (index: number) => {
    if (submitting || uploading) {
      return;
    }

    const attachment = existingAttachments[index];
    if (!attachment) {
      return;
    }

    const fileName = getAttachmentFileName(attachment);
    if (!fileName) {
      Alert.alert('提示', '无法识别该附件的文件名，暂不支持删除');
      return;
    }

    Alert.alert('删除附件', `保存后将删除“${fileName}”，是否继续？`, [
      {text: '取消', style: 'cancel'},
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setExistingAttachments(prev => prev.filter((_, attachmentIndex) => attachmentIndex !== index));
          setDeletedAttachmentNames(prev => prev.includes(fileName) ? prev : [...prev, fileName]);
        },
      },
    ]);
  };

  // 上传图片（批量上传）
  const handleUploadImages = async () => {
    const uploadContext = draftContext;
    if (accountChanged || !uploadContext || !isAccountCacheCurrent(uploadContext)) return;

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
      const pageReferer = isReplyMode
        ? buildReplyPostReferer(params.reId!, params.boardName)
        : buildCreatePostReferer(params.boardId, params.boardName);

      // 先检查发帖权限
      await checkPublish(params.boardId, pageReferer, uploadContext);
      if (!isAccountCacheCurrent(uploadContext)) return;
      
      // 回复场景请求一次 token；新发帖保留 WAP 的两次 token 请求流程。
      const firstToken = await getUploadToken(params.boardId, pageReferer, uploadContext);
      if (!isAccountCacheCurrent(uploadContext)) return;
      const uploadTokenForRequest = isReplyMode
        ? firstToken
        : await getUploadToken(params.boardId, pageReferer, uploadContext);
      if (!isAccountCacheCurrent(uploadContext)) return;
      
      // 批量上传所有图片（一次HTTP请求），并监听进度
      await uploadImages(
        params.boardId,
        uploadTokenForRequest,
        validImages,
        progress => {
          if (isAccountCacheCurrent(uploadContext)) setUploadProgress(progress);
        },
        pageReferer,
        uploadContext,
      );

      if (!isAccountCacheCurrent(uploadContext)) return;
      setUploadToken(uploadTokenForRequest);
      setUploadProgress(100);
    } catch (error: any) {
      if (!isAccountCacheCurrent(uploadContext) || error.message === 'ACCOUNT_CHANGED') return;
      console.error('上传图片失败:', error);
      console.error('错误堆栈:', error.stack);
      setUploadProgress(0);
      Alert.alert('失败', '上传图片失败: ' + error.message);
    } finally {
      if (isAccountCacheCurrent(uploadContext)) setUploading(false);
    }
  };

  // handleCancel 函数暂未使用，保留供未来使用
  // const handleCancel = () => { ... }

  if (accountChanged) {
    return (
      <View style={[styles.container, {justifyContent: 'center', alignItems: 'center', padding: SPACING.lg}]}>
        <Text style={{color: theme.secondaryText, fontSize: FONT_SIZE.lg, textAlign: 'center'}}>
          账号已切换，请返回后重新进入发帖页面
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{marginTop: SPACING.lg}}>
          <Text style={{color: theme.primary, fontSize: FONT_SIZE.lg}}>返回</Text>
        </TouchableOpacity>
      </View>
    );
  }

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

  const renderExistingAttachments = () => {
    if (!isEditMode || existingAttachments.length === 0) {
      return null;
    }

    return (
      <View style={styles.inputGroup}>
        <View style={styles.imageListHeader}>
          <Text style={styles.sectionTitle}>已有附件 {existingAttachments.length}/9</Text>
          <Text style={styles.attachmentHint}>点击删除，保存后生效</Text>
        </View>
        <ScrollView horizontal style={styles.imageList} showsHorizontalScrollIndicator={false}>
          {existingAttachments.map((attachment, index) => {
            const fileName = getAttachmentFileName(attachment) || '附件';
            const isImage = isImageAttachment(attachment) || isImageUrl(attachment.url || '', fileName);

            return (
              <View key={`${attachment.id || fileName}-${index}`} style={styles.existingAttachmentItem}>
                {isImage && attachment.url ? (
                  <Image source={{uri: attachment.url}} style={styles.imagePreview} resizeMode="cover" />
                ) : (
                  <View style={styles.existingAttachmentFile}>
                    <FileIcon size={28} color={theme.secondaryText} />
                    <Text style={styles.existingAttachmentFileLabel}>附件</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => handleRemoveExistingAttachment(index)}
                  disabled={submitting || uploading}>
                  <TrashIcon size={14} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.existingAttachmentName} numberOfLines={2}>{fileName}</Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {renderCaptchaModal()}
      {renderImageSourceModal()}
      <AiReplyConfigModal
        visible={showAiConfigModal}
        onClose={() => {
          setShowAiConfigModal(false);
          setShowAiDraftModal(true);
        }}
      />
      <AiReplyDraftModal
        visible={showAiDraftModal}
        context={params.aiContext}
        draftText={getEditableReplyDraft(content)}
        onClose={() => setShowAiDraftModal(false)}
        onRequestConfiguration={() => {
          setShowAiDraftModal(false);
          setShowAiConfigModal(true);
        }}
        onApply={handleAiReplyApply}
      />
      
      <ScrollView
        ref={scrollViewRef}
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
        automaticallyAdjustKeyboardInsets
        onScroll={e => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}>
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
              submitBehavior="submit"
              onSubmitEditing={() => contentInputRef.current?.focus()}
              editable={!submitting}
              inputAccessoryViewID={inputAccessoryViewID}
            />
            <Text style={styles.counter}>{title.length}/80</Text>
          </View>

          {/* 内容输入 */}
          <View style={styles.inputGroup}>
            <View style={styles.contentHeading}>
              <Text style={styles.sectionTitle}>{isReplyMode ? '回复内容' : '内容'}</Text>
              {isReplyMode ? (
                <TouchableOpacity
                  style={styles.aiReplyButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowAiDraftModal(true);
                  }}
                  disabled={submitting || uploading}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="AI 帮写回复">
                  <Text style={styles.aiReplyButtonText}>✦ AI 帮写</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.contentInputContainer}>
              <TextInput
                ref={contentInputRef}
                style={styles.contentInput}
                value={content}
                onChangeText={setContent}
                placeholder="请输入内容"
                placeholderTextColor={theme.secondaryText}
                multiline
                scrollEnabled={false}
                textAlignVertical="top"
                maxLength={10000}
                editable={!submitting}
                inputAccessoryViewID={inputAccessoryViewID}
                onFocus={() => {
                  contentFocusedRef.current = true;
                }}
                onBlur={() => {
                  contentFocusedRef.current = false;
                }}
                onSelectionChange={e => {
                  contentSelectionEndRef.current = e.nativeEvent.selection.end;
                }}
                onContentSizeChange={keepContentCaretVisible}
              />
              {/* 图片选择按钮（左下角） */}
              <TouchableOpacity
                style={styles.imagePickerButton}
                onPress={handleShowImageSourcePicker}
                disabled={submitting || uploading || attachmentCount >= 9}
                activeOpacity={0.6}>
                <ImageIcon size={22} color={theme.secondaryText} />
              </TouchableOpacity>
            </View>
            <Text style={styles.counter}>{content.length}/10000</Text>
          </View>

          {renderExistingAttachments()}

          {/* 待新增的图片列表 */}
          {selectedImages.length > 0 && (
            <View style={styles.inputGroup}>
              <View style={styles.imageListHeader}>
                <Text style={styles.sectionTitle}>
                  {isEditMode
                    ? `待新增 ${selectedImages.length} 张图片（共 ${attachmentCount}/9）`
                    : `已选择 ${selectedImages.length}/9 张图片`}
                </Text>
                {!isEditMode && uploadToken && (
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
                    {!isEditMode && uploadToken && (
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
                <Text style={styles.tipText}>• 可删除已有附件或添加图片，附件总数最多9个</Text>
                <Text style={styles.tipText}>• 附件修改会在保存时生效</Text>
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
    </View>
  );
};

const createStyles = (theme: ThemeColors, fontSizes: ReturnType<typeof getFontSizes>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  headerButton: {
    paddingHorizontal: SPACING.sm,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxxl,
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
  contentHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  aiReplyButton: {
    borderWidth: 1,
    borderColor: theme.primary,
    backgroundColor: theme.quoteBackground,
    borderRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  aiReplyButtonText: {
    color: theme.primary,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
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
    fontSize: fontSizes.content,
    lineHeight: fontSizes.lineHeight,
    color: theme.text,
    borderWidth: 1,
    borderColor: theme.border,
    minHeight: responsiveSize(220, 240, 260, 300),
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
  attachmentHint: {
    fontSize: FONT_SIZE.sm,
    color: theme.secondaryText,
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
  existingAttachmentItem: {
    position: 'relative',
    width: scaleModerate(100),
    marginRight: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  existingAttachmentFile: {
    width: scaleModerate(80),
    height: scaleModerate(80),
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: theme.placeholderBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  existingAttachmentFileLabel: {
    fontSize: FONT_SIZE.xs,
    color: theme.secondaryText,
    marginTop: SPACING.xs,
  },
  existingAttachmentName: {
    width: scaleModerate(88),
    fontSize: FONT_SIZE.xs,
    color: theme.secondaryText,
    marginTop: SPACING.xs,
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
