import React, {useState, useEffect, useRef} from 'react';
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
} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import {useNavigation, useRoute} from '@react-navigation/native';
import {createPost, replyPost, getDraft, saveDraft, clearDraft, checkPublish, getUploadToken, uploadImages} from '../services/postApi';
import PostCaptchaScreen from './PostCaptchaScreen';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  scaleModerate,
  responsiveSize,
} from '../utils/responsive';

interface RouteParams {
  boardId: string; // 版面ID (hash格式)
  boardName?: string; // 版面名称（显示用）
  reId?: string; // 如果是回复，传入被回复的帖子ID
  reTitle?: string; // 被回复的帖子标题
  mode?: 'create' | 'reply'; // 发帖模式
  quotedContent?: string; // 引用的内容
}

const CreatePostScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = (route.params as RouteParams) || {};

  const isReplyMode = params.mode === 'reply' || !!params.reId;

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
  useEffect(() => {
    navigation.setOptions({
      title: isReplyMode ? '回复' : '发帖',
      headerRight: () => (
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          style={styles.headerButton}>
          {submitting ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : (
            <Text style={styles.submitText}>发布</Text>
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, isReplyMode, submitting, title, content, captchaVerified, captchaTicket, captchaRandstr, selectedImages, uploadToken, uploading]);

  // 加载草稿
  useEffect(() => {
    const loadDraft = async () => {
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
  }, [params.boardId, isReplyMode, params.reTitle, params.quotedContent]);

  // 自动保存草稿
  useEffect(() => {
    if (!isReplyMode && !loadingDraft && (title || content)) {
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

    // 检查验证码是否已验证
    if (!captchaVerified || !captchaTicket || !captchaRandstr) {
      Alert.alert('提示', '请先完成人机验证');
      return;
    }

    // 如果有选中的图片但还未上传完成，不允许发布
    if (selectedImages.length > 0 && (!uploadToken || uploading)) {
      Alert.alert('提示', uploading ? '图片正在上传中，请稍候' : '请先完成人机验证以上传图片');
      return;
    }

    // 解析验证码参数
    let captchaParams;
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

    setSubmitting(true);
    try {
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

      Alert.alert('成功', isReplyMode ? '回复成功' : '发帖成功', [
        {
          text: '确定',
          onPress: () => {
            navigation.goBack();
          },
        },
      ]);
    } catch (error: any) {
      console.error('提交失败:', error);
      Alert.alert('失败', error.message || (isReplyMode ? '回复失败' : '发帖失败'));
      // 验证码失败后清除，需要重新验证
      setCaptchaTicket(null);
      setCaptchaRandstr(null);
      setCaptchaVerified(false);
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
    setShowImageSourceModal(true);
  };

  // 从相册选择图片
  const handleSelectFromGallery = async () => {
    // 先关闭弹窗，延迟一下再打开相册，避免弹窗和相册冲突
    setShowImageSourceModal(false);
    
    // 最多选择9张图片
    if (selectedImages.length >= 9) {
      Alert.alert('提示', '最多只能选择9张图片');
      return;
    }

    // 延迟执行，确保弹窗完全关闭
    setTimeout(async () => {
      try {
        const options = {
          mediaType: 'photo' as const,
          selectionLimit: 9 - selectedImages.length, // 剩余可选数量
          quality: 0.8 as const,
        };
        
        const result = await launchImageLibrary(options);

        if (result.didCancel) {
          return;
        }
        
        if (result.errorCode) {
          console.error('选择图片失败, errorCode:', result.errorCode, 'errorMessage:', result.errorMessage);
          Alert.alert('失败', '选择图片失败: ' + result.errorMessage);
          return;
        }
        
        if (result.assets && result.assets.length > 0) {
          // 保存完整的 asset 对象，包含 uri, originalPath, fileName, type 等信息
          const newAssets = result.assets.filter((asset: any) => asset.uri);
          const newImages = [...selectedImages, ...newAssets];
          setSelectedImages(newImages);
          
          // 清除之前的上传状态
          setUploadToken(null);
        }
      } catch (error: any) {
        console.error('选择图片异常:', error);
        console.error('错误堆栈:', error.stack);
        Alert.alert('失败', '选择图片失败: ' + error.message);
      }
    }, 300);
  };

  // 从相机拍照
  const handleTakePhoto = async () => {
    setShowImageSourceModal(false);
    // TODO: 实现相机拍照功能
    Alert.alert('提示', '相机功能开发中，请先使用相册选择');
  };

  // 删除选中的图片
  const handleRemoveImage = (index: number) => {
    if (uploading) {
      Alert.alert('提示', '图片正在上传中，无法删除');
      return;
    }
    const newImages = selectedImages.filter((_, i) => i !== index);
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
        <ActivityIndicator size="large" color="#007AFF" style={{marginTop: 100}} />
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
  const renderImageSourceModal = () => (
    <Modal
      visible={showImageSourceModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowImageSourceModal(false)}>
      <TouchableOpacity 
        style={styles.imageSourceOverlay} 
        activeOpacity={1}
        onPress={() => setShowImageSourceModal(false)}>
        <View style={styles.imageSourceModal}>
          <TouchableOpacity
            style={styles.imageSourceButton}
            onPress={handleTakePhoto}>
            <Text style={styles.imageSourceButtonText}>📷 拍照</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.imageSourceButton}
            onPress={handleSelectFromGallery}>
            <Text style={styles.imageSourceButtonText}>🖼️ 从相册选择</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.imageSourceButton, styles.imageSourceCancelButton]}
            onPress={() => setShowImageSourceModal(false)}>
            <Text style={[styles.imageSourceButtonText, styles.imageSourceCancelText]}>取消</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  return (
    <View style={styles.container}>
      {renderCaptchaModal()}
      {renderImageSourceModal()}
      
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {/* 键盘工具栏 - 移到ScrollView内部，确保与TextInput在同一渲染上下文中，提高稳定性 */}
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
              {isReplyMode ? '回复到：' : '发帖到：'}
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
              placeholderTextColor="#999"
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
                style={styles.contentInput}
                value={content}
                onChangeText={setContent}
                placeholder="请输入内容"
                placeholderTextColor="#999"
                multiline
                textAlignVertical="top"
                maxLength={10000}
                editable={!submitting}
                inputAccessoryViewID={inputAccessoryViewID}
              />
              {/* 图片选择按钮（左下角） */}
              <TouchableOpacity
                style={styles.imagePickerButton}
                onPress={handleShowImageSourcePicker}
                disabled={submitting || uploading || selectedImages.length >= 9}
                activeOpacity={0.6}>
                <Text style={styles.imagePickerButtonText}>🖼️</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.counter}>{content.length}/10000</Text>
          </View>

          {/* 已选择的图片列表 */}
          {selectedImages.length > 0 && (
            <View style={styles.inputGroup}>
              <View style={styles.imageListHeader}>
                <Text style={styles.sectionTitle}>已选择 {selectedImages.length}/9 张图片</Text>
                {uploadToken && (
                  <Text style={styles.uploadSuccessText}>✓ 上传完成</Text>
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
                      <Text style={styles.removeImageText}>×</Text>
                    </TouchableOpacity>
                    {uploadToken && (
                      <View style={styles.uploadedBadge}>
                        <Text style={styles.uploadedBadgeText}>✓</Text>
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

          {/* 人机验证 */}
          <View style={styles.inputGroup}>
            <TouchableOpacity
              style={[
                styles.captchaButton,
                {
                  backgroundColor: captchaVerified ? '#f0fff0' : '#f9f9f9',
                  borderColor: captchaVerified ? '#34C759' : '#ddd',
                },
              ]}
              onPress={() => setShowCaptchaModal(true)}
              disabled={submitting}>
              <Text
                style={{
                  fontSize: 16,
                  color: captchaVerified ? '#34C759' : '#666',
                }}>
                {captchaVerified ? '✅ 验证码已验证' : '点击进行人机验证'}
              </Text>
              {!captchaVerified && (
                <Text style={{fontSize: 14, color: '#007AFF'}}>去验证</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* 提示信息 */}
          <View style={styles.tipContainer}>
            <Text style={styles.tipText}>💡 提示：</Text>
            <Text style={styles.tipText}>• 点击发布前先完成人机验证</Text>
            <Text style={styles.tipText}>• 点击内容框左下角图标可添加图片（最多9张）</Text>
            <Text style={styles.tipText}>• 图片上传完成后才能发布</Text>
            <Text style={styles.tipText}>• 草稿会自动保存（不含图片）</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerButton: {
    paddingHorizontal: SPACING.sm,
  },
  submitText: {
    fontSize: FONT_SIZE.lg,
    color: '#007AFF',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: SPACING.lg,
  },
  boardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
  },
  boardLabel: {
    fontSize: FONT_SIZE.md,
    color: '#666',
  },
  boardName: {
    fontSize: FONT_SIZE.md,
    color: '#007AFF',
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: SPACING.lg,
  },
  titleInput: {
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZE.lg,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  contentInputContainer: {
    position: 'relative',
  },
  contentInput: {
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    paddingBottom: responsiveSize(44, 48, 52, 56), // 为左下角按钮留出空间
    fontSize: FONT_SIZE.lg,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minHeight: responsiveSize(180, 200, 220, 250),
    maxHeight: responsiveSize(350, 400, 450, 500),
  },
  imagePickerButton: {
    position: 'absolute',
    left: SPACING.sm,
    bottom: SPACING.sm,
    padding: SPACING.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePickerButtonText: {
    fontSize: scaleModerate(22),
  },
  counter: {
    fontSize: FONT_SIZE.sm,
    color: '#999',
    textAlign: 'right',
    marginTop: SPACING.xs,
  },
  captchaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    minHeight: responsiveSize(46, 50, 54, 58),
  },
  tipContainer: {
    backgroundColor: '#fff9e6',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  tipText: {
    fontSize: FONT_SIZE.sm,
    color: '#666',
    lineHeight: FONT_SIZE.xl,
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
    color: '#333',
  },
  imageListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  uploadSuccessText: {
    fontSize: FONT_SIZE.sm,
    color: '#34C759',
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
    backgroundColor: '#e0e0e0',
    borderRadius: BORDER_RADIUS.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: BORDER_RADIUS.sm,
  },
  progressText: {
    fontSize: FONT_SIZE.sm,
    color: '#007AFF',
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
    backgroundColor: '#f0f0f0',
  },
  removeImageButton: {
    position: 'absolute',
    top: -SPACING.sm,
    right: -SPACING.sm,
    width: scaleModerate(24),
    height: scaleModerate(24),
    borderRadius: scaleModerate(12),
    backgroundColor: '#FF3B30',
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
    backgroundColor: '#34C759',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadedBadgeText: {
    color: '#fff',
    fontSize: FONT_SIZE.sm,
    fontWeight: 'bold',
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
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  imageActionButtonDisabled: {
    opacity: 0.5,
  },
  uploadButton: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  imageActionButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: '#333',
  },
  imageSourceOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  imageSourceModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  imageSourceButton: {
    backgroundColor: '#f9f9f9',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    alignItems: 'center',
  },
  imageSourceCancelButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  imageSourceButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: '#333',
  },
  imageSourceCancelText: {
    color: '#666',
  },
  keyboardAccessory: {
    backgroundColor: '#f9f9f9',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
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
    color: '#007AFF',
    fontWeight: '600',
  },
});

export default CreatePostScreen;
