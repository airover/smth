import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {createPost, replyPost, getDraft, saveDraft, clearDraft} from '../services/postApi';
import PostCaptchaScreen from './PostCaptchaScreen';

interface RouteParams {
  boardId: string; // 版面ID (hash格式)
  boardName?: string; // 版面名称（显示用）
  reId?: string; // 如果是回复，传入被回复的帖子ID
  reTitle?: string; // 被回复的帖子标题
  mode?: 'create' | 'reply'; // 发帖模式
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
      setLoadingDraft(false);
    };
    loadDraft();
  }, [params.boardId, isReplyMode, params.reTitle]);

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

    // 解析验证码参数
    let captchaParams = undefined;
    const parts = captchaTicket.split('|');
    if (parts.length >= 4) {
      captchaParams = {
        captcha_id: 'ade4a85345062fda4657d64aa3206cba', // 发帖专用的captcha_id
        lot_number: parts[0],
        captcha_output: parts[1],
        pass_token: parts[2],
        gen_time: parts[3],
      };
      console.log('使用验证码参数:', {
        lot_number: parts[0],
        gen_time: parts[3],
      });
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
      };

      const result = isReplyMode
        ? await replyPost(postParams)
        : await createPost(postParams);

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
  const handleCaptchaSuccess = (ticket: string, randstr: string) => {
    console.log('验证码验证成功');
    setCaptchaTicket(ticket);
    setCaptchaRandstr(randstr);
    setCaptchaVerified(true);
    setShowCaptchaModal(false);
  };

  // 验证码取消
  const handleCaptchaCancel = () => {
    setShowCaptchaModal(false);
  };

  const handleCancel = () => {
    if (title || content) {
      Alert.alert('提示', '确定要放弃当前编辑吗？', [
        {text: '取消', style: 'cancel'},
        {
          text: '放弃',
          style: 'destructive',
          onPress: () => navigation.goBack(),
        },
      ]);
    } else {
      navigation.goBack();
    }
  };

  if (loadingDraft) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" style={{marginTop: 100}} />
      </SafeAreaView>
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

  return (
    <SafeAreaView style={styles.container}>
      {renderCaptchaModal()}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}>
        {/* 顶部操作栏 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
            <Text style={styles.cancelText}>取消</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isReplyMode ? '回复' : '发帖'}</Text>
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
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {/* 版面信息 */}
          <View style={styles.boardInfo}>
            <Text style={styles.boardLabel}>
              {isReplyMode ? '回复到：' : '发帖到：'}
            </Text>
            <Text style={styles.boardName}>
              {params.boardName || params.board}
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
            />
            <Text style={styles.counter}>{content.length}/10000</Text>
          </View>

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
            <Text style={styles.tipText}>• 发帖前需完成人机验证</Text>
            <Text style={styles.tipText}>• 草稿会自动保存</Text>
            <Text style={styles.tipText}>• 发帖前请遵守版面规则</Text>
            <Text style={styles.tipText}>• 发布后无法删除，请谨慎发言</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  headerButton: {
    width: 60,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
  },
  cancelText: {
    fontSize: 16,
    color: '#666',
  },
  submitText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    textAlign: 'right',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  boardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  boardLabel: {
    fontSize: 14,
    color: '#666',
  },
  boardName: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  titleInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  contentInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minHeight: 200,
    maxHeight: 400,
  },
  counter: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 4,
  },
  captchaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 16,
    minHeight: 50,
  },
  tipContainer: {
    backgroundColor: '#fff9e6',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  tipText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
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
});

export default CreatePostScreen;
