import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Keyboard,
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
import {useSettings} from '../context/SettingsContext';
import {BORDER_RADIUS, FONT_SIZE, SPACING} from '../utils/responsive';
import {getFontSizes} from '../utils/theme';
import {
  AI_REPLY_STYLE_OPTIONS,
  cleanAiReplyText,
  generateAiReply,
  getAiReplyConfigSummary,
  loadAiReplyPreferences,
  tidyAiReplyOutput,
} from '../services/aiReply';
import type {AiReplyConfigSummary, AiReplyContext, AiReplyStyle} from '../services/aiReply';

type ApplyMode = 'replace' | 'prepend' | 'append';

type AiReplyDraftModalProps = {
  visible: boolean;
  context?: AiReplyContext;
  draftText: string;
  onClose: () => void;
  onRequestConfiguration: () => void;
  onApply: (text: string, mode: ApplyMode) => void;
};

const getTargetLabel = (context?: AiReplyContext): string => {
  if (!context) return '无法识别回复对象';
  if (context.targetKind === 'quoted_reply') {
    return `回应引用内容${context.quotedAuthor ? ` · @${context.quotedAuthor}` : ''}`;
  }
  if (context.targetKind === 'quoted_post') return '回应引用的主帖';
  return '回应主帖正文';
};

const getTargetPreview = (context?: AiReplyContext): string => {
  if (!context) return '';
  return cleanAiReplyText(
    context.targetKind === 'quoted_reply' ? context.quotedContent || '' : context.topicContent || '',
    220,
  );
};

const AiReplyDraftModal: React.FC<AiReplyDraftModalProps> = ({
  visible,
  context,
  draftText,
  onClose,
  onRequestConfiguration,
  onApply,
}) => {
  const theme = useTheme();
  const {settings} = useSettings();
  const fontSizes = useMemo(() => getFontSizes(settings.fontSize), [settings.fontSize]);
  const styles = useMemo(() => createStyles(theme, fontSizes), [theme, fontSizes]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const [config, setConfig] = useState<AiReplyConfigSummary | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [style, setStyle] = useState<AiReplyStyle>('concise');
  const [customStyle, setCustomStyle] = useState('');
  const [customInstruction, setCustomInstruction] = useState('');
  const [showCustomInstruction, setShowCustomInstruction] = useState(false);
  const [generationMode, setGenerationMode] = useState<'new' | 'polish'>('new');
  const [generatedText, setGeneratedText] = useState('');
  const [editingGeneratedText, setEditingGeneratedText] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [resultStale, setResultStale] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setGenerating(false);
      return;
    }
    let active = true;
    setLoadingSettings(true);
    setGenerating(false);
    setStopped(false);
    setResultStale(false);
    setGeneratedText('');
    setEditingGeneratedText(false);
    setError('');
    setCustomInstruction('');
    setShowCustomInstruction(false);
    setGenerationMode(draftText.trim() ? 'polish' : 'new');
    Promise.all([getAiReplyConfigSummary(), loadAiReplyPreferences()])
      .then(([configSummary, preferences]) => {
        if (!active) return;
        setConfig(configSummary);
        setStyle(preferences.defaultStyle);
        setCustomStyle(preferences.customStyle);
      })
      .catch((loadError: any) => {
        if (active) setError(loadError?.message || '读取 AI 设置失败');
      })
      .finally(() => {
        if (active) setLoadingSettings(false);
      });
    return () => {
      active = false;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, [visible, draftText]);

  useEffect(() => {
    if (!visible || !editingGeneratedText) return;

    const scrollToResultInput = () => {
      requestAnimationFrame(() => scrollViewRef.current?.scrollToEnd({animated: true}));
    };
    const keyboardSubscription = Keyboard.addListener('keyboardDidShow', scrollToResultInput);
    const initialScrollTimer = setTimeout(scrollToResultInput, 250);

    return () => {
      keyboardSubscription.remove();
      clearTimeout(initialScrollTimer);
    };
  }, [visible, editingGeneratedText]);

  // 修改选项时保留已生成的内容，只提示需要重新生成，避免误触丢失结果
  const markResultStale = () => {
    if (generatedText.trim()) setResultStale(true);
    setError('');
  };

  const scrollToResult = () => {
    requestAnimationFrame(() => scrollViewRef.current?.scrollToEnd({animated: true}));
  };

  const handleGenerate = async () => {
    if (!context) {
      setError('缺少帖子上下文，无法生成回复');
      return;
    }
    if (!config?.isConfigured) {
      setError('请先配置模型服务');
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setGenerating(true);
    setStopped(false);
    setResultStale(false);
    setGeneratedText('');
    setEditingGeneratedText(false);
    setError('');
    scrollToResult();
    try {
      await generateAiReply({
        context,
        style,
        customStyle,
        customInstruction,
        existingDraft: generationMode === 'polish' ? draftText : undefined,
        signal: controller.signal,
        onDelta: delta => setGeneratedText(current => current + delta),
      });
      setGeneratedText(current => tidyAiReplyOutput(current));
    } catch (generationError: any) {
      if (generationError?.name === 'AbortError') {
        setStopped(true);
      } else {
        setError(generationError?.message || '生成失败，请重试');
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setGenerating(false);
      }
    }
  };

  const handleStop = () => abortControllerRef.current?.abort();
  const handleApply = (mode: ApplyMode) => {
    const value = tidyAiReplyOutput(generatedText);
    if (!value) return;
    onApply(value, mode);
    onClose();
  };

  const targetPreview = getTargetPreview(context);
  const targetImageCount = context?.targetImages?.length || 0;
  const hasQuotedInput = context?.targetKind === 'quoted_post' || context?.targetKind === 'quoted_reply';
  const hasDraft = Boolean(draftText.trim());
  const primaryApplyMode: ApplyMode = hasDraft || hasQuotedInput ? 'prepend' : 'replace';
  const primaryApplyLabel = hasDraft ? '插入到草稿前' : '采用';
  const canGenerate = Boolean(
    context &&
    config?.isConfigured &&
    !loadingSettings &&
    !generating &&
    !editingGeneratedText &&
    (style !== 'custom' || customStyle.trim()),
  );

  const finishEditingGeneratedText = () => {
    Keyboard.dismiss();
    setEditingGeneratedText(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} disabled={generating} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardArea}>
          <View style={styles.container}>
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>AI 帮写回复</Text>
                <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">{getTargetLabel(context)}</Text>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity onPress={onClose} disabled={generating} hitSlop={10} accessibilityRole="button" accessibilityLabel="关闭 AI 回复">
                  <Text style={styles.close}>×</Text>
                </TouchableOpacity>
              </View>
            </View>

            {loadingSettings ? (
              <ActivityIndicator color={theme.primary} style={styles.loader} />
            ) : (
              <>
                <ScrollView
                  ref={scrollViewRef}
                  style={styles.scrollView}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.content}>
                  <View style={styles.targetCard}>
                    <Text style={styles.targetTitle} numberOfLines={1}>{context?.topicTitle || '帖子'}</Text>
                    {targetPreview ? <Text style={styles.targetText} numberOfLines={2}>{targetPreview}</Text> : null}
                    {context?.targetKind === 'quoted_reply' ? (
                      <Text style={styles.targetHint} numberOfLines={1}>优先回应引用内容，主题标题只作背景</Text>
                    ) : null}
                  </View>

                  {config?.isConfigured ? (
                    <Text style={styles.modelHint} numberOfLines={1}>模型 · {config.model}</Text>
                  ) : (
                    <View style={styles.configNotice}>
                      <Text style={styles.configNoticeText}>配置模型后即可生成回复。</Text>
                      <TouchableOpacity style={styles.configButton} onPress={onRequestConfiguration}>
                        <Text style={styles.configButtonText}>配置模型</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {draftText.trim() ? (
                    <View style={styles.modeRow}>
                      {([
                        {value: 'polish' as const, label: '润色草稿'},
                        {value: 'new' as const, label: '另写一版'},
                      ]).map(option => (
                        <TouchableOpacity
                          key={option.value}
                          style={[styles.modeChip, generationMode === option.value && styles.selectedModeChip]}
                          onPress={() => {
                            setGenerationMode(option.value);
                            markResultStale();
                          }}
                          disabled={generating}
                          accessibilityRole="button"
                          accessibilityState={{selected: generationMode === option.value}}>
                          <Text style={[styles.modeText, generationMode === option.value && styles.selectedChipText]}>{option.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}

                  <Text style={styles.sectionTitle}>回复风格</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.styleOptions}>
                    {AI_REPLY_STYLE_OPTIONS.map(option => (
                      <TouchableOpacity
                        key={option.value}
                        style={[styles.styleChip, style === option.value && styles.selectedStyleChip]}
                        onPress={() => {
                          setStyle(option.value);
                          markResultStale();
                        }}
                        disabled={generating}
                        accessibilityRole="button"
                        accessibilityState={{selected: style === option.value}}>
                        <Text style={[styles.styleText, style === option.value && styles.selectedChipText]}>{option.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {style === 'custom' ? (
                    <TextInput
                      value={customStyle}
                      onChangeText={value => {
                        setCustomStyle(value);
                        markResultStale();
                      }}
                      multiline
                      maxLength={500}
                      placeholder="描述希望采用的语气和表达方式，例如：像耐心的老版友交流，先说结论，避免说教。"
                      placeholderTextColor={theme.secondaryText}
                      editable={!generating}
                      style={[styles.input, styles.customStyleInput]}
                    />
                  ) : null}
                  {style === 'custom' && !customStyle.trim() ? (
                    <Text style={styles.modelHint}>请先描述自定义回复风格，再生成。</Text>
                  ) : null}

                  <TouchableOpacity
                    style={styles.instructionToggle}
                    onPress={() => setShowCustomInstruction(value => !value)}
                    disabled={generating}
                    accessibilityRole="button"
                    accessibilityState={{expanded: showCustomInstruction}}>
                    <Text style={styles.instructionToggleText}>补充要求（可选）</Text>
                    <Text style={styles.instructionToggleHint}>
                      {customInstruction.trim() ? '已填写' : showCustomInstruction ? '收起' : '添加'}
                    </Text>
                  </TouchableOpacity>
                  {showCustomInstruction ? (
                    <TextInput
                      value={customInstruction}
                      onChangeText={value => {
                        setCustomInstruction(value);
                        markResultStale();
                      }}
                      multiline
                      maxLength={1000}
                      placeholder="例如：礼貌地询问对方的数据来源。"
                      placeholderTextColor={theme.secondaryText}
                      editable={!generating}
                      style={[styles.input, styles.instructionInput]}
                    />
                  ) : null}

                  {generationMode === 'polish' && draftText.trim() ? (
                    <View style={styles.draftPreview}>
                      <Text style={styles.draftPreviewLabel}>当前草稿</Text>
                      <Text style={styles.draftText} numberOfLines={2}>{draftText}</Text>
                    </View>
                  ) : null}

                  <View style={styles.resultHeader}>
                    <Text style={styles.resultTitle}>生成结果</Text>
                    <View style={styles.resultHeaderActions}>
                      {generatedText.trim() && !generating && !editingGeneratedText ? (
                        <TouchableOpacity
                          onPress={() => setEditingGeneratedText(true)}
                          accessibilityRole="button"
                          accessibilityLabel="编辑生成结果">
                          <Text style={styles.resultEditAction}>编辑</Text>
                        </TouchableOpacity>
                      ) : null}
                      {generatedText.trim() && !generating && editingGeneratedText ? (
                        <TouchableOpacity
                          onPress={finishEditingGeneratedText}
                          accessibilityRole="button"
                          accessibilityLabel="完成编辑生成结果">
                          <Text style={styles.resultEditAction}>完成</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                  {editingGeneratedText ? (
                    <TextInput
                      value={generatedText}
                      onChangeText={setGeneratedText}
                      onFocus={() => requestAnimationFrame(() => scrollViewRef.current?.scrollToEnd({animated: true}))}
                      multiline
                      maxLength={10000}
                      editable={!generating}
                      textAlignVertical="top"
                      style={[styles.input, styles.resultInput]}
                    />
                  ) : (
                    <View style={[styles.input, styles.resultPreview]}>
                      <Text selectable style={generatedText ? styles.resultText : styles.resultPlaceholder}>
                        {generatedText || (generating ? '正在生成…' : '生成后可在这里查看回复。')}
                      </Text>
                    </View>
                  )}

                  {resultStale && !generating ? <Text style={styles.stoppedHint}>选项已修改，点“重新生成”后生效。</Text> : null}
                  {error ? <Text style={styles.error}>{error}</Text> : null}
                  {stopped && !generating ? <Text style={styles.stoppedHint}>生成已停止，已生成内容仍可编辑或采用。</Text> : null}
                </ScrollView>

                {!editingGeneratedText ? (
                  <View style={styles.footer}>
                    {generating ? (
                      <View style={styles.generationStatus}>
                        <ActivityIndicator size="small" color={theme.primary} />
                        <Text style={styles.modelHint}>{targetImageCount > 0 ? '正在读取图片并生成' : '正在生成'}</Text>
                        <TouchableOpacity onPress={handleStop} style={styles.stopButton}>
                          <Text style={styles.stopButtonText}>停止</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                    {!generatedText.trim() ? (
                      <View style={styles.actions}>
                        <TouchableOpacity style={[styles.generateButton, !canGenerate && styles.disabledButton]} onPress={handleGenerate} disabled={!canGenerate}>
                          <Text style={styles.generateButtonText}>生成回复</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    {generatedText.trim() && !generating ? (
                      <View style={styles.applyActions}>
                        <View style={styles.primaryApplyRow}>
                          <TouchableOpacity
                            style={[styles.regenerateButton, !canGenerate && styles.disabledButton]}
                            onPress={handleGenerate}
                            disabled={!canGenerate}
                            accessibilityRole="button"
                            accessibilityLabel="重新生成 AI 回复">
                            <Text style={styles.appendButtonText}>重新生成</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.applyButton}
                            onPress={() => handleApply(primaryApplyMode)}>
                            <Text style={styles.applyButtonText}>{primaryApplyLabel}</Text>
                          </TouchableOpacity>
                        </View>
                        {hasDraft ? (
                          <View style={styles.alternateApplyActions}>
                            <TouchableOpacity style={styles.appendButton} onPress={() => handleApply('replace')}>
                              <Text style={styles.appendButtonText}>替换草稿</Text>
                            </TouchableOpacity>
                            {generationMode === 'new' ? (
                              <TouchableOpacity style={styles.appendButton} onPress={() => handleApply('append')}>
                                <Text style={styles.appendButtonText}>追加到末尾</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>, fontSizes: ReturnType<typeof getFontSizes>) => StyleSheet.create({
  overlay: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.38)'},
  keyboardArea: {width: '100%', height: '94%', maxHeight: '94%'},
  container: {
    flex: 1,
    backgroundColor: theme.cardBackground,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
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
  headerActions: {flexDirection: 'row', alignItems: 'center', gap: SPACING.xs},
  headerCopy: {flex: 1},
  title: {color: theme.text, fontSize: FONT_SIZE.xl, fontWeight: '700'},
  subtitle: {color: theme.primary, fontSize: FONT_SIZE.sm, marginTop: SPACING.xs},
  close: {color: theme.secondaryText, fontSize: 30, lineHeight: 32, paddingHorizontal: SPACING.xs},
  loader: {flex: 1, alignSelf: 'center'},
  scrollView: {flex: 1},
  content: {paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md},
  targetCard: {
    padding: SPACING.md,
    marginTop: SPACING.sm,
    backgroundColor: theme.background,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  targetTitle: {color: theme.text, fontSize: FONT_SIZE.md, fontWeight: '700'},
  targetText: {color: theme.secondaryText, fontSize: fontSizes.quote, lineHeight: fontSizes.quoteLineHeight, marginTop: SPACING.xs},
  targetHint: {color: theme.primary, fontSize: FONT_SIZE.xs, marginTop: SPACING.xs},
  modelHint: {color: theme.secondaryText, fontSize: FONT_SIZE.xs, marginTop: SPACING.xs},
  configNotice: {
    marginTop: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: theme.placeholderBackground,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  configNoticeText: {color: theme.text, fontSize: FONT_SIZE.sm, lineHeight: FONT_SIZE.md * 1.4},
  configButton: {alignSelf: 'flex-start', marginTop: SPACING.sm, paddingVertical: SPACING.xs},
  configButtonText: {color: theme.primary, fontSize: FONT_SIZE.md, fontWeight: '700'},
  modeRow: {flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm},
  modeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    backgroundColor: theme.placeholderBackground,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: theme.border,
  },
  selectedModeChip: {backgroundColor: theme.primary, borderColor: theme.primary},
  modeText: {color: theme.text, fontSize: FONT_SIZE.sm, fontWeight: '600'},
  selectedChipText: {color: '#fff'},
  sectionTitle: {color: theme.text, fontSize: FONT_SIZE.md, fontWeight: '700', marginTop: SPACING.md, marginBottom: SPACING.xs},
  resultHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.md, marginBottom: SPACING.xs},
  resultHeaderActions: {flexDirection: 'row', alignItems: 'center', gap: SPACING.xs},
  resultTitle: {color: theme.text, fontSize: FONT_SIZE.md, fontWeight: '700'},
  resultEditAction: {color: theme.primary, fontSize: FONT_SIZE.sm, fontWeight: '600', paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm},
  styleOptions: {flexDirection: 'row', gap: SPACING.sm, paddingRight: SPACING.lg},
  styleChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: theme.placeholderBackground,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: theme.border,
  },
  selectedStyleChip: {backgroundColor: theme.primary, borderColor: theme.primary},
  styleText: {color: theme.text, fontSize: FONT_SIZE.sm},
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
  customStyleInput: {minHeight: 60, maxHeight: 90, textAlignVertical: 'top', marginTop: SPACING.xs},
  instructionToggle: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.md, paddingVertical: SPACING.xs},
  instructionToggleText: {color: theme.text, fontSize: FONT_SIZE.sm, fontWeight: '600'},
  instructionToggleHint: {color: theme.primary, fontSize: FONT_SIZE.xs},
  instructionInput: {minHeight: 60, maxHeight: 100, textAlignVertical: 'top'},
  draftPreview: {marginTop: SPACING.xs, padding: SPACING.sm, backgroundColor: theme.background, borderRadius: BORDER_RADIUS.md},
  draftPreviewLabel: {color: theme.secondaryText, fontSize: FONT_SIZE.xs, marginBottom: SPACING.xs},
  draftText: {color: theme.secondaryText, fontSize: fontSizes.content, lineHeight: fontSizes.lineHeight},
  resultPreview: {minHeight: 124},
  resultText: {color: theme.text, fontSize: fontSizes.content, lineHeight: fontSizes.lineHeight},
  resultPlaceholder: {color: theme.secondaryText, fontSize: fontSizes.content, lineHeight: fontSizes.lineHeight},
  resultInput: {minHeight: 124, maxHeight: 190, fontSize: fontSizes.content, lineHeight: fontSizes.lineHeight, textAlignVertical: 'top'},
  generationStatus: {flexDirection: 'row', alignItems: 'center', gap: SPACING.sm},
  stopButton: {marginLeft: 'auto', paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs},
  stopButtonText: {color: theme.error, fontSize: FONT_SIZE.sm, fontWeight: '600'},
  error: {color: theme.error, fontSize: FONT_SIZE.sm, marginTop: SPACING.sm},
  stoppedHint: {color: theme.secondaryText, fontSize: FONT_SIZE.sm, marginTop: SPACING.sm},
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
    backgroundColor: theme.cardBackground,
  },
  actions: {flexDirection: 'row', marginTop: SPACING.sm},
  generateButton: {flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary, borderRadius: BORDER_RADIUS.md},
  disabledButton: {opacity: 0.45},
  generateButtonText: {color: '#fff', fontSize: FONT_SIZE.md, fontWeight: '700'},
  applyActions: {gap: SPACING.sm, marginTop: SPACING.sm},
  alternateApplyActions: {flexDirection: 'row', gap: SPACING.sm},
  primaryApplyRow: {flexDirection: 'row', gap: SPACING.sm},
  regenerateButton: {flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: BORDER_RADIUS.md},
  applyButton: {flex: 2, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary, borderRadius: BORDER_RADIUS.md},
  applyButtonText: {color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: '700'},
  appendButton: {flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: BORDER_RADIUS.md},
  appendButtonText: {color: theme.text, fontSize: FONT_SIZE.sm, fontWeight: '600'},
});

export default AiReplyDraftModal;
