import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {useTheme} from './ThemedComponents';
import {BORDER_RADIUS, FONT_SIZE, SPACING} from '../utils/responsive';
import {
  AI_REPLY_STYLE_OPTIONS,
  DEFAULT_AI_REPLY_BASE_URL,
  DEFAULT_AI_REPLY_MODEL,
  clearAiReplyConfig,
  getAiReplyConfigSummary,
  loadAiReplyPreferences,
  saveAiReplyConfig,
  saveAiReplyPreferences,
  testAiReplyConfig,
} from '../services/aiReply';
import type {AiReplyConfigDraft, AiReplyPreferences, AiReplyStyle} from '../services/aiReply';

type AiReplyConfigModalProps = {
  visible: boolean;
  onClose: () => void;
};

const AiReplyConfigModal: React.FC<AiReplyConfigModalProps> = ({visible, onClose}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [defaultStyle, setDefaultStyle] = useState<AiReplyStyle>('brief');
  const [customStyle, setCustomStyle] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    setError('');
    setNotice('');
    Promise.all([getAiReplyConfigSummary(), loadAiReplyPreferences()])
      .then(([config, preferences]) => {
        if (!active) return;
        setBaseUrl(config.baseUrl);
        setModel(config.model);
        setHasToken(config.hasToken);
        setToken('');
        setDefaultStyle(preferences.defaultStyle);
        setCustomStyle(preferences.customStyle);
      })
      .catch((loadError: any) => {
        if (active) setError(loadError?.message || '读取 AI 配置失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible]);

  const toDraft = (): AiReplyConfigDraft => ({baseUrl, model, token});

  const savePreferences = (nextStyle: AiReplyStyle, nextCustomStyle = customStyle) => {
    saveAiReplyPreferences({defaultStyle: nextStyle, customStyle: nextCustomStyle})
      .then(() => setNotice('默认回复风格已保存'))
      .catch((saveError: any) => setError(saveError?.message || '保存回复风格失败'));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await saveAiReplyConfig(toDraft());
      const preferences: AiReplyPreferences = {defaultStyle, customStyle};
      await saveAiReplyPreferences(preferences);
      const config = await getAiReplyConfigSummary();
      setHasToken(config.hasToken);
      setToken('');
      setNotice('模型配置和默认风格已保存');
    } catch (saveError: any) {
      setError(saveError?.message || '保存 AI 配置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError('');
    setNotice('');
    try {
      await testAiReplyConfig(toDraft());
      setNotice('连接成功');
    } catch (testError: any) {
      setError(testError?.message || '连接测试失败');
    } finally {
      setTesting(false);
    }
  };

  const handleClear = () => {
    Alert.alert('清除模型配置', '这会从本机移除 AI 服务地址、模型名称和 API Key。', [
      {text: '取消', style: 'cancel'},
      {
        text: '清除',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          setError('');
          setNotice('');
          try {
            await clearAiReplyConfig();
            setBaseUrl('');
            setModel('');
            setToken('');
            setHasToken(false);
            setNotice('模型配置已清除');
          } catch (clearError: any) {
            setError(clearError?.message || '清除配置失败');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const saveDisabled = loading || saving || testing || !baseUrl.trim() || !model.trim() || (!token.trim() && !hasToken);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardArea}>
          <View style={styles.container}>
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>AI 回复设置</Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="关闭 AI 回复设置">
                <Text style={styles.close}>×</Text>
              </TouchableOpacity>
            </View>

            {loading ? (
              <ActivityIndicator color={theme.primary} style={styles.loader} />
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
                <Text style={styles.sectionTitle}>模型服务</Text>
                <Text style={styles.label}>Base URL</Text>
                <TextInput
                  value={baseUrl}
                  onChangeText={setBaseUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder={DEFAULT_AI_REPLY_BASE_URL}
                  placeholderTextColor={theme.secondaryText}
                  editable={!saving && !testing}
                  style={styles.input}
                />

                <Text style={styles.label}>模型名称</Text>
                <TextInput
                  value={model}
                  onChangeText={setModel}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={DEFAULT_AI_REPLY_MODEL}
                  placeholderTextColor={theme.secondaryText}
                  editable={!saving && !testing}
                  style={styles.input}
                />

                <Text style={styles.label}>API Key</Text>
                <TextInput
                  value={token}
                  onChangeText={setToken}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  placeholder={hasToken ? '已保存；留空则保留当前 Key' : '请输入 API Key'}
                  placeholderTextColor={theme.secondaryText}
                  editable={!saving && !testing}
                  style={styles.input}
                />
                <Text style={styles.hint}>API Key 仅加密保存在本机。</Text>

                <Text style={[styles.sectionTitle, styles.styleSection]}>默认回复风格</Text>
                <View style={styles.styleOptions}>
                  {AI_REPLY_STYLE_OPTIONS.map(option => (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.styleChip, defaultStyle === option.value && styles.selectedStyleChip]}
                      onPress={() => {
                        setDefaultStyle(option.value);
                        setNotice('');
                        savePreferences(option.value);
                      }}
                      disabled={saving || testing}
                      accessibilityRole="button"
                      accessibilityState={{selected: defaultStyle === option.value}}>
                      <Text style={[styles.styleText, defaultStyle === option.value && styles.selectedChoiceText]}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {defaultStyle === 'custom' ? (
                  <TextInput
                    value={customStyle}
                    onChangeText={setCustomStyle}
                    onEndEditing={event => savePreferences(defaultStyle, event.nativeEvent.text)}
                    multiline
                    maxLength={500}
                    placeholder="描述语气，例如：直率、有观点、少说套话。"
                    placeholderTextColor={theme.secondaryText}
                    editable={!saving && !testing}
                    style={[styles.input, styles.customStyleInput]}
                  />
                ) : null}

                {error ? <Text style={styles.error}>{error}</Text> : null}
                {notice ? <Text style={styles.success}>{notice}</Text> : null}

                <View style={styles.actions}>
                  <TouchableOpacity style={styles.secondaryAction} onPress={handleTest} disabled={loading || saving || testing}>
                    {testing ? <ActivityIndicator size="small" color={theme.primary} /> : <Text style={styles.secondaryActionText}>测试连接</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.primaryAction, saveDisabled && styles.disabledAction]} onPress={handleSave} disabled={saveDisabled}>
                    {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryActionText}>保存配置</Text>}
                  </TouchableOpacity>
                </View>
                {hasToken || baseUrl || model ? (
                  <TouchableOpacity style={styles.clearAction} onPress={handleClear} disabled={saving || testing}>
                    <Text style={styles.clearActionText}>清除模型配置</Text>
                  </TouchableOpacity>
                ) : null}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  keyboardArea: {
    width: '100%',
    maxHeight: '94%',
  },
  container: {
    backgroundColor: theme.cardBackground,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    paddingBottom: SPACING.xl,
    maxHeight: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  headerCopy: {flex: 1},
  title: {color: theme.text, fontSize: FONT_SIZE.xl, fontWeight: '700'},
  close: {color: theme.secondaryText, fontSize: 30, lineHeight: 32, paddingHorizontal: SPACING.xs},
  loader: {marginVertical: SPACING.xxxl},
  content: {paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl},
  sectionTitle: {color: theme.text, fontSize: FONT_SIZE.md, fontWeight: '700', marginTop: SPACING.lg, marginBottom: SPACING.sm},
  selectedChoiceText: {color: '#fff'},
  label: {color: theme.secondaryText, fontSize: FONT_SIZE.sm, marginTop: SPACING.sm, marginBottom: SPACING.xs},
  input: {
    color: theme.text,
    backgroundColor: theme.background,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
  },
  hint: {color: theme.secondaryText, fontSize: FONT_SIZE.xs, lineHeight: FONT_SIZE.xs * 1.5, marginTop: SPACING.xs},
  styleSection: {marginTop: SPACING.xl},
  styleOptions: {flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm},
  styleChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: theme.placeholderBackground,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: theme.border,
  },
  selectedStyleChip: {backgroundColor: theme.primary, borderColor: theme.primary},
  styleText: {color: theme.text, fontSize: FONT_SIZE.sm},
  customStyleInput: {minHeight: 74, textAlignVertical: 'top', marginTop: SPACING.sm},
  error: {color: theme.error, fontSize: FONT_SIZE.sm, marginTop: SPACING.md},
  success: {color: theme.primary, fontSize: FONT_SIZE.sm, marginTop: SPACING.md},
  actions: {flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg},
  secondaryAction: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.background,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: BORDER_RADIUS.md,
  },
  secondaryActionText: {color: theme.primary, fontSize: FONT_SIZE.md, fontWeight: '600'},
  primaryAction: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.primary,
    borderRadius: BORDER_RADIUS.md,
  },
  disabledAction: {opacity: 0.45},
  primaryActionText: {color: '#fff', fontSize: FONT_SIZE.md, fontWeight: '700'},
  clearAction: {alignItems: 'center', paddingVertical: SPACING.md, marginTop: SPACING.xs},
  clearActionText: {color: theme.error, fontSize: FONT_SIZE.sm},
});

export default AiReplyConfigModal;
