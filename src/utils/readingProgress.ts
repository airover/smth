import AsyncStorage from '@react-native-async-storage/async-storage';

export const READING_PROGRESS_STORAGE_KEY = 'topic_reading_progress_v1';
const MAX_PROGRESS_ITEMS = 500;
const FLUSH_DELAY = 1500;

export interface TopicReadingProgress {
  topicId: string;
  articleId: string;
  topicOrder?: number;
  position?: number;
  page: number;
  updatedAt: number;
}

type ProgressMap = Record<string, TopicReadingProgress>;

const parseTopicOrder = (value: unknown): number | null => {
  // 接口在缺少 topicOrder 时可能返回 null/空字符串；Number(null) 和
  // Number('') 都会得到 0，不能把它们误判成有效的稳定顺序。
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    return null;
  }

  const order = Number(value);
  return Number.isFinite(order) ? order : null;
};

let progressMap: ProgressMap | null = null;
let loadPromise: Promise<ProgressMap> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushPromise: Promise<void> = Promise.resolve();
let dirty = false;

const readAll = async (): Promise<ProgressMap> => {
  try {
    const raw = await AsyncStorage.getItem(READING_PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error('[ReadingProgress] Failed to load progress:', error);
    return {};
  }
};

const ensureLoaded = async (): Promise<ProgressMap> => {
  if (progressMap) {
    return progressMap;
  }

  if (!loadPromise) {
    loadPromise = readAll().then(result => {
      progressMap = result;
      return result;
    }).finally(() => {
      loadPromise = null;
    });
  }

  return loadPromise;
};

const trimProgressMap = (all: ProgressMap) => {
  const entries = Object.entries(all);
  if (entries.length <= MAX_PROGRESS_ITEMS) {
    return;
  }

  entries
    .sort(([, a], [, b]) => a.updatedAt - b.updatedAt)
    .slice(0, entries.length - MAX_PROGRESS_ITEMS)
    .forEach(([topicId]) => delete all[topicId]);
};

const scheduleFlush = () => {
  if (flushTimer) {
    clearTimeout(flushTimer);
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushTopicReadingProgress().catch(error => {
      console.error('[ReadingProgress] Scheduled flush failed:', error);
    });
  }, FLUSH_DELAY);
};

/** 将内存态阅读进度写入持久化存储。 */
export const flushTopicReadingProgress = async (): Promise<void> => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const all = await ensureLoaded();
  if (!dirty) {
    await flushPromise.catch(() => undefined);
    return;
  }

  const snapshot = JSON.stringify(all);
  dirty = false;
  flushPromise = flushPromise.catch(() => undefined).then(async () => {
    try {
      await AsyncStorage.setItem(READING_PROGRESS_STORAGE_KEY, snapshot);
    } catch (error) {
      // 写入失败时保留 dirty，下一次 flush 仍会重试。
      dirty = true;
      console.error('[ReadingProgress] Failed to save progress:', error);
    }
  });
  await flushPromise;

  // 写入期间可能又有新的阅读位置，确保不会被本次快照吞掉。
  if (dirty) {
    scheduleFlush();
  }
};

export const getTopicReadingProgress = async (topicId: string): Promise<TopicReadingProgress | null> => {
  const all = await ensureLoaded();
  return all[topicId] || null;
};

/**
 * 持久化主题阅读位置。仅向前推进，回看旧回复不会覆盖最远阅读位置。
 * topicOrder 是服务端稳定顺序，优先级高于列表内 index 和 page 推导出的 position。
 */
export const saveTopicReadingProgress = async (
  progress: Omit<TopicReadingProgress, 'updatedAt'>,
): Promise<void> => {
  const all = await ensureLoaded();
  const saved = all[progress.topicId];
  const savedOrder = parseTopicOrder(saved?.topicOrder);
  const nextOrder = parseTopicOrder(progress.topicOrder);
  const savedPosition = Number(saved?.position);
  const nextPosition = Number(progress.position);
  const hasSavedOrder = savedOrder !== null;
  const hasNextOrder = nextOrder !== null;
  const hasComparablePosition = Number.isFinite(savedPosition) && Number.isFinite(nextPosition);

  let isFurther = !saved;
  if (saved) {
    if (hasSavedOrder && hasNextOrder) {
      isFurther = nextOrder > savedOrder;
    } else if (!hasSavedOrder && hasNextOrder) {
      // 旧版本没有 topicOrder，新数据具备稳定顺序时允许升级。
      isFurther = true;
    } else if (hasSavedOrder && !hasNextOrder) {
      // 不用缺少 topicOrder 的新数据覆盖已有的稳定顺序。
      isFurther = false;
    } else if (hasComparablePosition) {
      isFurther = nextPosition > savedPosition;
    } else {
      isFurther = progress.page > saved.page;
    }
  }

  if (!isFurther) {
    return;
  }

  all[progress.topicId] = {...progress, updatedAt: Date.now()};
  trimProgressMap(all);
  progressMap = all;
  dirty = true;
  scheduleFlush();
};

export const clearTopicReadingProgress = async (): Promise<void> => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushPromise.catch(() => undefined);
  progressMap = {};
  dirty = false;
  await AsyncStorage.removeItem(READING_PROGRESS_STORAGE_KEY);
};
