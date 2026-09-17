/**
 * 统一缓存管理模块
 * 支持分类缓存和一键清理
 *
 * 本模块只负责内存层（同步读写）。持久化（AsyncStorage）不是本模块的职责，
 * 也不会被自动挂钩——各场景根据自己的需要，在调用点自行组合内存层和
 * readPersistedSnapshot/writePersistedSnapshot（见文件底部），需要几层
 * 由场景自己决定，不强制统一入口。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

interface CacheItem<T> {
  data: T;
  timestamp: number;
  duration?: number;
  lastAccess: number;
}

interface CacheStore {
  // 版面相关缓存
  boards?: CacheItem<any[]>;
  boardPosts: {[key: string]: CacheItem<any>};

  // 用户相关缓存
  userInfo?: CacheItem<any>;
  otherUserInfo: {[key: string]: CacheItem<any>}; // 他人资料缓存
  friendsList: {[key: string]: CacheItem<string[]>}; // 关注列表缓存
  fansList: {[key: string]: CacheItem<{fans: any[], total: number}>}; // 粉丝列表缓存
  blackList: {[key: string]: CacheItem<string[]>}; // 黑名单缓存
  favoriteBoards?: CacheItem<any[]>; // 收藏版面（调用方自行叠加 AsyncStorage 持久层）

  // 消息中心相关缓存（纯内存，不持久化）：用于同一 App 会话内先画上次内容；
  // 页面获得焦点或停留达到刷新间隔后，再按页面 TTL 决定是否静默请求。
  mailConversations?: CacheItem<any[]>; // 私信会话列表
  replyNotificationsFirstPage?: CacheItem<any>; // 回复提醒第一页快照

  // 我的文章/回复/喜欢：内存层用于快速展示和新鲜期内跳过请求，持久层由页面
  // 额外维护，用于冷启动和网络失败兜底。
  myArticles?: CacheItem<any>;
  myReplies?: CacheItem<any>;
  myLikes?: CacheItem<any>;

  // 内容相关缓存
  postDetail: {[key: string]: CacheItem<any>};
  topicReplies: {[key: string]: CacheItem<any[]>};
  topTen?: CacheItem<any[]>; // 今日十大（调用方自行叠加 AsyncStorage 持久层）
  hotBoards?: CacheItem<any[]>; // 热门版面（调用方自行叠加 AsyncStorage 持久层）
  hotPostsFirstPage?: CacheItem<{topics: any[]; totalPages: number}>; // 热门帖子首页快照（调用方自行叠加 AsyncStorage 持久层）
  hotPosts: {[key: string]: CacheItem<{topics: any[]; totalPages: number}>}; // 热门帖子深页（page>=2），仅会话内去重，不持久化

  // 频道相关缓存
  channels?: CacheItem<any[]>;
  channelPosts: {[key: string]: CacheItem<any>}; // 新增：频道帖子缓存
  albumPosts: {[key: string]: CacheItem<any>};   // 新增：图览帖子缓存

  // M 站映射表（topicId -> 短链 postId / 附件静态 URL），永久性映射，不设新鲜度，
  // 只靠 MAX_ENTRIES 做 LRU 容量淘汰；调用方自行叠加 AsyncStorage 持久层。
  msitePostId: {[topicId: string]: CacheItem<string>};
  msiteStaticUrl: {[topicId: string]: CacheItem<string[]>};
}

class CacheManager {
  private static instance: CacheManager;
  private cache: CacheStore;
  private readonly DEFAULT_DURATION = 60 * 1000; // 默认1分钟
  private readonly DICT_CATEGORIES: Array<keyof CacheStore> = [
    'boardPosts',
    'postDetail',
    'topicReplies',
    'hotPosts',
    'channelPosts',
    'albumPosts',
    'otherUserInfo',
    'friendsList',
    'fansList',
    'blackList',
    'msitePostId',
    'msiteStaticUrl',
  ];
  private readonly SINGLE_CATEGORIES: Array<keyof CacheStore> = [
    'boards',
    'userInfo',
    'channels',
    'topTen',
    'hotBoards',
    'hotPostsFirstPage',
    'favoriteBoards',
    'mailConversations',
    'replyNotificationsFirstPage',
    'myArticles',
    'myReplies',
    'myLikes',
  ];
  private readonly MAX_ENTRIES: {[key: string]: number} = {
    boardPosts: 60,
    postDetail: 120,
    topicReplies: 120,
    hotPosts: 10,
    channelPosts: 40,
    albumPosts: 10,
    otherUserInfo: 120,
    friendsList: 80,
    fansList: 80,
    blackList: 10,
    msitePostId: 10000,
    msiteStaticUrl: 5000,
  };

  // 针对不同数据类型的缓存时长配置
  private readonly CACHE_DURATIONS: {[key: string]: number} = {
    boards: 24 * 60 * 60 * 1000,   // 24小时（版面树变化很少）
    channels: 30 * 60 * 1000,      // 30分钟（频道导航变化较少）
    topTen: 5 * 60 * 1000,         // 5分钟（今日十大变化较慢）
    hotBoards: 10 * 60 * 1000,     // 10分钟（热门版面更稳定）
    hotPostsFirstPage: 2 * 60 * 1000, // 2分钟（热帖首页变化较快）
    hotPosts: 2 * 60 * 1000,       // 2分钟（热帖深页，仅会话内使用）
    favoriteBoards: 5 * 60 * 1000, // 5分钟（收藏版面）
    // mailConversations/replyNotificationsFirstPage 用 getWithTimestamp 读取，
    // 不依赖这个时长做新鲜度判断（调用点每次都会照常发起真实请求刷新）；
    // 这里的数值只影响 cleanExpired() 的过期清理节奏。
    mailConversations: 60 * 1000,
    replyNotificationsFirstPage: 60 * 1000,
    // 同上，myArticles/myReplies/myLikes 也用 getWithTimestamp 读取，这里的数值
    // 只影响 cleanExpired() 的清理节奏。
    myArticles: 60 * 1000,
    myReplies: 60 * 1000,
    myLikes: 60 * 1000,
    boardPosts: 60 * 1000,         // 1分钟（版面帖子实时性要求高）
    channelPosts: 60 * 1000,       // 1分钟（频道帖子实时性要求高）
    albumPosts: 60 * 1000,         // 1分钟（图览帖子实时性要求高）
    postDetail: 5 * 60 * 1000,     // 5分钟（帖子详情相对稳定）
    topicReplies: 60 * 1000,       // 1分钟（回复实时性要求高）
    otherUserInfo: 5 * 60 * 1000,  // 5分钟（他人资料相对稳定）
    friendsList: 5 * 60 * 1000,    // 5分钟（关注列表相对稳定）
    fansList: 5 * 60 * 1000,       // 5分钟（粉丝列表相对稳定）
    blackList: 5 * 60 * 1000,      // 5分钟（黑名单相对稳定）
    // msitePostId/msiteStaticUrl 是永久映射表，不设新鲜度，Number.MAX_SAFE_INTEGER
    // 相当于"永不因为时间过期"，只靠 MAX_ENTRIES 的 LRU 做容量淘汰。
    msitePostId: Number.MAX_SAFE_INTEGER,
    msiteStaticUrl: Number.MAX_SAFE_INTEGER,
  };

  private constructor() {
    this.cache = {
      boardPosts: {},
      postDetail: {},
      topicReplies: {},
      hotPosts: {},
      channelPosts: {},
      albumPosts: {},
      otherUserInfo: {},
      friendsList: {},
      fansList: {},
      blackList: {},
      msitePostId: {},
      msiteStaticUrl: {},
    };
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  /**
   * 设置缓存
   */
  set<T>(category: keyof CacheStore, key: string | undefined, data: T, duration?: number): void {
    this.setAt(category, key, data, Date.now(), duration);
  }

  /**
   * 将已有快照恢复到内存层，同时保留快照原始时间戳。
   *
   * 持久缓存即使过期也可能作为首屏兜底，但不能在恢复时把 timestamp
   * 重置成“现在”，否则旧数据会被错误地当成新数据继续存活。
   */
  setWithTimestamp<T>(
    category: keyof CacheStore,
    key: string | undefined,
    data: T,
    timestamp: number,
    duration?: number,
  ): void {
    this.setAt(category, key, data, timestamp, duration);
  }

  private setAt<T>(
    category: keyof CacheStore,
    key: string | undefined,
    data: T,
    timestamp: number,
    duration?: number,
  ): void {
    if (key) {
      // 带 key 的缓存（如 boardPosts[id]）
      const categoryCache = this.cache[category] as {[key: string]: CacheItem<T>};
      if (typeof categoryCache === 'object' && !Array.isArray(categoryCache)) {
        categoryCache[key] = {data, timestamp, duration, lastAccess: timestamp};
        this.pruneCategory(category);
      }
    } else {
      // 不带 key 的缓存（如 boards）
      (this.cache as any)[category] = {data, timestamp, duration, lastAccess: timestamp};
    }
    
    console.log(`[Cache] Set ${category}${key ? `[${key}]` : ''}`);
  }

  /**
   * 获取缓存
   */
  get<T>(category: keyof CacheStore, key?: string, duration?: number): T | null {
    const now = Date.now();

    try {
      if (key) {
        // 带 key 的缓存
        const categoryCache = this.cache[category] as {[key: string]: CacheItem<T>};
        if (typeof categoryCache === 'object' && !Array.isArray(categoryCache)) {
          const item = categoryCache[key];
          const cacheDuration = this.getDuration(category, duration, item?.duration);
          if (item && now - item.timestamp < cacheDuration) {
            item.lastAccess = now;
            console.log(`[Cache] Hit ${category}[${key}], age: ${Math.floor((now - item.timestamp) / 1000)}s`);
            return item.data;
          }
        }
      } else {
        // 不带 key 的缓存
        const item = (this.cache as any)[category] as CacheItem<T> | undefined;
        const cacheDuration = this.getDuration(category, duration, item?.duration);
        if (item && now - item.timestamp < cacheDuration) {
          item.lastAccess = now;
          console.log(`[Cache] Hit ${category}, age: ${Math.floor((now - item.timestamp) / 1000)}s`);
          return item.data;
        }
      }
    } catch (error) {
      console.error(`[Cache] Get error for ${category}${key ? `[${key}]` : ''}:`, error);
    }

    console.log(`[Cache] Miss ${category}${key ? `[${key}]` : ''}`);
    return null;
  }

  /**
   * 获取缓存（包含时间戳，不检查过期）
   */
  getWithTimestamp<T>(category: keyof CacheStore, key?: string): {data: T, timestamp: number} | null {
    try {
      if (key) {
        // 带 key 的缓存
        const categoryCache = this.cache[category] as {[key: string]: CacheItem<T>};
        if (typeof categoryCache === 'object' && !Array.isArray(categoryCache)) {
          const item = categoryCache[key];
          if (item) {
            item.lastAccess = Date.now();
            return {data: item.data, timestamp: item.timestamp};
          }
        }
      } else {
        // 不带 key 的缓存
        const item = (this.cache as any)[category] as CacheItem<T> | undefined;
        if (item) {
          item.lastAccess = Date.now();
          return {data: item.data, timestamp: item.timestamp};
        }
      }
    } catch (error) {
      console.error(`[Cache] GetWithTimestamp error for ${category}${key ? `[${key}]` : ''}:`, error);
    }
    return null;
  }

  /**
   * 导出某个字典分类当前的全部键值（不含时间戳等元信息），用于需要把
   * 整个分类整体持久化到别处的场景（如 dataFetcher.ts 的 M 站映射表）。
   */
  getDictSnapshot<T>(category: keyof CacheStore): {[key: string]: T} {
    const categoryCache = this.cache[category] as {[key: string]: CacheItem<T>} | undefined;
    if (!categoryCache || typeof categoryCache !== 'object') {
      return {};
    }

    const snapshot: {[key: string]: T} = {};
    for (const key of Object.keys(categoryCache)) {
      snapshot[key] = categoryCache[key].data;
    }
    return snapshot;
  }

  /**
   * 清除指定分类的缓存
   */
  clearCategory(category: keyof CacheStore): void {
    if (this.DICT_CATEGORIES.includes(category)) {
      (this.cache[category] as any) = {};
    } else {
      delete (this.cache as any)[category];
    }
    console.log(`[Cache] Cleared ${category}`);
  }

  /** 清除字典分类下指定 key 前缀的缓存。 */
  clearByKeyPrefix(category: keyof CacheStore, keyPrefix: string): void {
    if (!this.DICT_CATEGORIES.includes(category)) return;
    const categoryCache = this.cache[category] as {[key: string]: CacheItem<any>};
    Object.keys(categoryCache).forEach(key => {
      if (key.startsWith(keyPrefix)) {
        delete categoryCache[key];
      }
    });
    console.log(`[Cache] Cleared ${category}[${keyPrefix}*]`);
  }

  /**
   * 清除所有缓存
   */
  clearAll(): void {
    this.cache = {
      boardPosts: {},
      postDetail: {},
      topicReplies: {},
      hotPosts: {},
      channelPosts: {},
      albumPosts: {},
      otherUserInfo: {},
      friendsList: {},
      fansList: {},
      blackList: {},
      msitePostId: {},
      msiteStaticUrl: {},
    };
    console.log('[Cache] Cleared all caches');
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): {
    categories: {
      name: string;
      count: number;
      size: string;
    }[];
    total: number;
  } {
    const categories: {name: string; count: number; size: string}[] = [];
    let total = 0;

    for (const [key, value] of Object.entries(this.cache)) {
      let count = 0;
      
      if (value && typeof value === 'object') {
        if ('data' in value && 'timestamp' in value) {
          // 单个缓存项
          count = 1;
        } else {
          // 多个缓存项（字典）
          count = Object.keys(value).length;
        }
      }
      
      total += count;
      categories.push({
        name: key,
        count,
        size: count > 0 ? `${count} 项` : '空',
      });
    }

    return {categories, total};
  }

  /**
   * 清理过期缓存
   */
  cleanExpired(duration?: number): number {
    const now = Date.now();
    let cleaned = 0;

    // 清理字典类型的缓存
    for (const category of this.DICT_CATEGORIES) {
      const categoryCache = this.cache[category] as {[key: string]: CacheItem<any>} | undefined;
      if (!categoryCache) {
        continue;
      }
      for (const key in categoryCache) {
        const cacheDuration = this.getDuration(category, duration, categoryCache[key].duration);
        if (now - categoryCache[key].timestamp >= cacheDuration) {
          delete categoryCache[key];
          cleaned++;
        }
      }
    }

    // 清理单个缓存项
    for (const category of this.SINGLE_CATEGORIES) {
      const item = this.cache[category] as CacheItem<any> | undefined;
      const cacheDuration = this.getDuration(category, duration, item?.duration);
      if (item && now - item.timestamp >= cacheDuration) {
        delete this.cache[category];
        cleaned++;
      }
    }

    console.log(`[Cache] Cleaned ${cleaned} expired items`);
    return cleaned;
  }

  private getDuration(category: keyof CacheStore, duration?: number, itemDuration?: number): number {
    return duration || itemDuration || this.CACHE_DURATIONS[category as string] || this.DEFAULT_DURATION;
  }

  private pruneCategory(category: keyof CacheStore): void {
    const maxEntries = this.MAX_ENTRIES[category as string];
    if (!maxEntries) {
      return;
    }

    const categoryCache = this.cache[category] as {[key: string]: CacheItem<any>};
    const entries = Object.entries(categoryCache);
    if (entries.length <= maxEntries) {
      return;
    }

    entries
      .sort(([, a], [, b]) => (a.lastAccess || a.timestamp) - (b.lastAccess || b.timestamp))
      .slice(0, entries.length - maxEntries)
      .forEach(([entryKey]) => {
        delete categoryCache[entryKey];
      });
  }
}

// 导出单例
export const cacheManager = CacheManager.getInstance();

// 导出便捷方法
export const setCache = <T>(category: keyof CacheStore, key: string | undefined, data: T, duration?: number) => {
  cacheManager.set(category, key, data, duration);
};

export const setCacheWithTimestamp = <T>(
  category: keyof CacheStore,
  key: string | undefined,
  data: T,
  timestamp: number,
  duration?: number,
) => {
  cacheManager.setWithTimestamp(category, key, data, timestamp, duration);
};

export const getCache = <T>(category: keyof CacheStore, key?: string, duration?: number): T | null => {
  return cacheManager.get<T>(category, key, duration);
};

export const getCacheWithTimestamp = <T>(category: keyof CacheStore, key?: string): {data: T, timestamp: number} | null => {
  return cacheManager.getWithTimestamp<T>(category, key);
};

export const getCacheDictSnapshot = <T>(category: keyof CacheStore): {[key: string]: T} => {
  return cacheManager.getDictSnapshot<T>(category);
};

export const clearCache = (category?: keyof CacheStore) => {
  if (category) {
    cacheManager.clearCategory(category);
  } else {
    cacheManager.clearAll();
  }
};

export const getCacheStats = () => {
  return cacheManager.getStats();
};

export const cleanExpiredCache = (duration?: number) => {
  return cacheManager.cleanExpired(duration);
};

// ============================================================
// 持久化（AsyncStorage）辅助函数 —— 独立、可选，不绑定任何分类。
//
// 这两个函数只是把"读 AsyncStorage → JSON.parse → 用 timestamp 判断新鲜度"
// 这段样板收成一处，供需要持久层的场景自愿使用；不使用它们、只用内存层，
// 或者两层都不用（直接读网络），都是允许的，由调用点自己决定怎么组合。
// ============================================================

interface PersistedSnapshot<T> {
  data: T;
  timestamp: number;
}

/** 从 AsyncStorage 读取一份带时间戳的快照，返回数据及其新鲜度信息；不存在或解析失败返回 null。 */
export const readPersistedSnapshot = async <T>(
  storageKey: string,
  maxAge: number,
): Promise<{data: T; age: number; isExpired: boolean} | null> => {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed: PersistedSnapshot<T> = JSON.parse(raw);
    if (!parsed || typeof parsed.timestamp !== 'number') {
      return null;
    }

    const age = Date.now() - parsed.timestamp;
    return {data: parsed.data, age, isExpired: age >= maxAge};
  } catch (error) {
    console.error(`[Cache] readPersistedSnapshot failed for ${storageKey}:`, error);
    return null;
  }
};

/** 将数据以 {data, timestamp} 的形式写入 AsyncStorage。 */
export const writePersistedSnapshot = async <T>(
  storageKey: string,
  data: T,
): Promise<void> => {
  try {
    const snapshot: PersistedSnapshot<T> = {data, timestamp: Date.now()};
    await AsyncStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch (error) {
    console.error(`[Cache] writePersistedSnapshot failed for ${storageKey}:`, error);
  }
};
