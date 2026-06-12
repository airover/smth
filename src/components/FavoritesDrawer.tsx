/**
 * FavoritesDrawer - 微信式下拉收藏面板（精修版）
 */
import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  PanResponder,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from './ThemedComponents';
import {StarIcon, BoardIcon, MessageIcon} from './SvgIcons';
import {getCardElevation} from '../utils/theme';
import {getFavoriteTopics, getFavoriteBoards} from '../services/dataFetcher';
import {formatRelativeTime} from '../utils/timeFormat';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  getStatusBarHeight,
} from '../utils/responsive';

const {height: SCREEN_HEIGHT, width: SCREEN_WIDTH} = Dimensions.get('window');
const STATUS_BAR = getStatusBarHeight();
const PANEL_HEIGHT = Math.round(SCREEN_HEIGHT * 0.9);
const GRID_COLS = 4;
const GRID_GAP = SPACING.md;
// 自适应宽度：屏幕宽度扣除两侧 padding 和间距后平均分配给4列
const GRID_ITEM_W = Math.floor((SCREEN_WIDTH - SPACING.xl * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS);

// 版面图标用主题色的不同透明度层次
const getBoardTint = (theme: any, index: number) => {
  // 基于主题色生成柔和变体
  return theme.primary;
};

interface FavoritesDrawerProps {
  visible: boolean;
  onClose: () => void;
  contentTranslateY: Animated.Value;
}

const FavoritesDrawer: React.FC<FavoritesDrawerProps> = ({visible, onClose, contentTranslateY}) => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const panelY = useRef(new Animated.Value(-PANEL_HEIGHT)).current;

  const [boards, setBoards] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, gs) => gs.dy < -6 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_e, gs) => {
        if (gs.dy < 0) {
          const p = Math.max(0, 1 + gs.dy / PANEL_HEIGHT);
          panelY.setValue(gs.dy * 0.8);
          contentTranslateY.setValue(PANEL_HEIGHT * p);
        }
      },
      onPanResponderRelease: (_e, gs) => {
        if (gs.dy < -60 || gs.vy < -0.4) {
          close();
        } else {
          Animated.parallel([
            Animated.spring(panelY, {toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200}),
            Animated.spring(contentTranslateY, {toValue: PANEL_HEIGHT, useNativeDriver: true, damping: 20, stiffness: 200}),
          ]).start();
        }
      },
    }),
  ).current;

  const open = useCallback(() => {
    setShow(true);
    panelY.setValue(-PANEL_HEIGHT);
    contentTranslateY.setValue(0);
    Animated.parallel([
      Animated.spring(panelY, {toValue: 0, useNativeDriver: true, damping: 22, stiffness: 90, mass: 1}),
      Animated.spring(contentTranslateY, {toValue: PANEL_HEIGHT, useNativeDriver: true, damping: 22, stiffness: 90, mass: 1}),
    ]).start();
    loadData();
  }, [panelY, contentTranslateY]);

  const close = useCallback(() => {
    Animated.parallel([
      Animated.spring(panelY, {toValue: -PANEL_HEIGHT, useNativeDriver: true, damping: 20, stiffness: 180}),
      Animated.spring(contentTranslateY, {toValue: 0, useNativeDriver: true, damping: 20, stiffness: 180}),
    ]).start(() => { setShow(false); onClose(); });
  }, [panelY, contentTranslateY, onClose]);

  useEffect(() => { if (visible && !show) open(); }, [visible, show, open]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [b, t] = await Promise.all([
        getFavoriteBoards(false).catch(() => []),
        getFavoriteTopics(0, 5).catch(() => ({topics: []})),
      ]);
      setBoards(b || []);
      setTopics(t?.topics || []);
    } catch (_) {}
    setTimeout(() => setLoading(false), 150);
  }, []);

  const goBoard = useCallback((board: any) => {
    close();
    setTimeout(() => navigation.navigate('MainTabs', {
      screen: 'Board', params: {board: board.id || board.name, boardName: board.chineseName || board.name, source: 'favorites'},
    }), 250);
  }, [close, navigation]);

  const goTopic = useCallback((topic: any) => {
    close();
    setTimeout(() => navigation.navigate('PostDetail', {board: topic.boardName, postId: topic.topicId}), 250);
  }, [close, navigation]);

  const goAll = useCallback(() => {
    close();
    setTimeout(() => navigation.navigate('Favorites'), 250);
  }, [close, navigation]);

  if (!show) return null;

  const isDark = theme.statusBarStyle === 'light';

  return (
    <Animated.View
      style={[styles.panel, {height: PANEL_HEIGHT, paddingTop: STATUS_BAR, backgroundColor: theme.background, transform: [{translateY: panelY}]}]}
      {...pan.panHandlers}>

      {/* ── 顶部 ── */}
      <View style={styles.topArea}>
        <View style={[styles.handle, {backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)'}]} />
        <View style={styles.titleBar}>
          <View style={styles.spacer} />
          <Text style={[styles.title, {color: theme.text}]}>收藏</Text>
          <TouchableOpacity style={[styles.spacer, {alignItems: 'flex-end'}]} onPress={goAll} activeOpacity={0.6}>
            <Text style={[styles.allLink, {color: theme.primary}]}>查看全部 ›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loader}><ActivityIndicator size="small" color={theme.primary} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* ── 文章 ── */}
          {topics.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, {color: theme.secondaryText}]}>最近收藏</Text>
              <View style={[styles.cardGroup, {backgroundColor: theme.cardBackground}, getCardElevation(theme)]}>
                {topics.map((item, i) => (
                  <TouchableOpacity
                    key={`${item.topicId}-${i}`}
                    style={[styles.articleRow, i < topics.length - 1 && styles.articleBorder, i < topics.length - 1 && {borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'}]}
                    activeOpacity={0.55}
                    onPress={() => goTopic(item)}>
                    <View style={[styles.indexBadge, {backgroundColor: theme.primary + (i < 3 ? '18' : '0A')}]}>
                      <Text style={[styles.indexText, {color: i < 3 ? theme.primary : theme.secondaryText}]}>{i + 1}</Text>
                    </View>
                    <View style={styles.articleBody}>
                      <Text style={[styles.articleTitle, {color: theme.text}]} numberOfLines={1}>{item.subject}</Text>
                      <Text style={[styles.articleSub, {color: theme.secondaryText}]}>
                        {item.boardTitle || item.boardName}{item.postTime ? ` · ${formatRelativeTime(item.postTime)}` : ''}
                      </Text>
                    </View>
                    {item.hasNewReply && <View style={[styles.dot, {backgroundColor: theme.primary}]} />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.emptyBlock}>
              <StarIcon size={20} color={theme.border} />
              <Text style={[styles.emptyText, {color: theme.secondaryText}]}>暂无收藏文章</Text>
            </View>
          )}

          {/* ── 版面 ── */}
          {boards.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, {color: theme.secondaryText}]}>收藏版面</Text>
              <View style={styles.grid}>
                {boards.slice(0, 12).map((b, i) => {
                  return (
                    <TouchableOpacity
                      key={`${b.id}-${i}`}
                      style={[styles.gridItem, {backgroundColor: theme.cardBackground}, getCardElevation(theme)]}
                      activeOpacity={0.7}
                      onPress={() => goBoard(b)}>
                      <View style={[styles.gridIcon, {backgroundColor: theme.primary + '12'}]}>
                        <MessageIcon size={16} color={theme.primary} />
                      </View>
                      <Text style={[styles.gridLabel, {color: theme.text}]} numberOfLines={1}>
                        {b.chineseName || b.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* 底部引导 */}
      <View style={styles.bottomBar}>
        <Text style={[styles.bottomHint, {color: theme.secondaryText + '80'}]}>↑ 上推收起</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 50,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 10,
  },

  // 顶部
  topArea: {
    alignItems: 'center',
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: SPACING.xl,
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    width: '100%',
  },
  spacer: {flex: 1},
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  allLink: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
  },

  loader: {flex: 1, justifyContent: 'center', alignItems: 'center'},

  // 滚动
  scroll: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxxl,
  },

  // 段落
  section: {
    marginBottom: SPACING.xxl,
  },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
    marginLeft: SPACING.xs,
  },

  // 文章卡片组
  cardGroup: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  articleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md + 2,
    paddingHorizontal: SPACING.lg,
  },
  articleBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  indexBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  indexText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
  },
  articleBody: {
    flex: 1,
  },
  articleTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '500',
    marginBottom: 2,
  },
  articleSub: {
    fontSize: FONT_SIZE.xs,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginLeft: SPACING.sm,
  },

  // 空
  emptyBlock: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.sm,
  },
  emptyText: {fontSize: FONT_SIZE.sm},

  // 宫格（最多3行×4列=12个）
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridItem: {
    width: GRID_ITEM_W,
    height: GRID_ITEM_W,  // 固定高度，避免 aspectRatio 在不同屏幕上拉伸过大
    borderRadius: BORDER_RADIUS.xl,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  gridIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 2,
  },

  // 底部
  bottomBar: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  bottomHint: {
    fontSize: FONT_SIZE.xs,
  },
});

export default FavoritesDrawer;
