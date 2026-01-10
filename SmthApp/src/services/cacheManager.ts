/**
 * 统一缓存管理模块
 * 支持分类缓存和一键清理
 */

interface CacheItem<T> {
  data: T;
  timestamp: number;
}

interface CacheStore {
  // 版面相关缓存
  boards?: CacheItem<any[]>;
  subBoards: {[key: string]: CacheItem<any[]>};
  boardPosts: {[key: string]: CacheItem<any>};
  
  // 用户相关缓存
  userInfo?: CacheItem<any>;
  favoriteBoards?: CacheItem<any[]>;
  
  // 内容相关缓存
  topTen?: CacheItem<any[]>;
  hotBoards?: CacheItem<any[]>;
  hotPosts: {[key: string]: CacheItem<any>};
  postDetail: {[key: string]: CacheItem<any>};
  topicReplies: {[key: string]: CacheItem<any[]>};
  
  // 频道相关缓存
  channels?: CacheItem<any[]>;
  channelPosts: {[key: string]: CacheItem<any>}; // 新增：频道帖子缓存
  albumPosts: {[key: string]: CacheItem<any>};   // 新增：图览帖子缓存
}

class CacheManager {
  private static instance: CacheManager;
  private cache: CacheStore;
  private readonly DEFAULT_DURATION = 60 * 1000; // 默认1分钟
  
  // 针对不同数据类型的缓存时长配置
  private readonly CACHE_DURATIONS: {[key: string]: number} = {
    topTen: 5 * 60 * 1000,        // 5分钟（今日十大变化较慢）
    hotBoards: 10 * 60 * 1000,     // 10分钟（热门版面更稳定）
    hotPosts: 2 * 60 * 1000,       // 2分钟（热帖变化较快）
    boardPosts: 60 * 1000,         // 1分钟（版面帖子实时性要求高）
    channelPosts: 60 * 1000,       // 1分钟（频道帖子实时性要求高）
    albumPosts: 60 * 1000,         // 1分钟（图览帖子实时性要求高）
    postDetail: 5 * 60 * 1000,     // 5分钟（帖子详情相对稳定）
    topicReplies: 60 * 1000,       // 1分钟（回复实时性要求高）
  };

  private constructor() {
    this.cache = {
      subBoards: {},
      boardPosts: {},
      hotPosts: {},
      postDetail: {},
      topicReplies: {},
      channelPosts: {},
      albumPosts: {},
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
    const timestamp = Date.now();
    
    if (key) {
      // 带 key 的缓存（如 subBoards[id]）
      const categoryCache = this.cache[category] as {[key: string]: CacheItem<T>};
      if (typeof categoryCache === 'object' && !Array.isArray(categoryCache)) {
        categoryCache[key] = {data, timestamp};
      }
    } else {
      // 不带 key 的缓存（如 boards）
      (this.cache as any)[category] = {data, timestamp};
    }
    
    console.log(`[Cache] Set ${category}${key ? `[${key}]` : ''}`);
  }

  /**
   * 获取缓存
   */
  get<T>(category: keyof CacheStore, key?: string, duration?: number): T | null {
    const now = Date.now();
    // 使用配置的缓存时长，如果没有配置则使用默认时长
    const cacheDuration = duration || this.CACHE_DURATIONS[category as string] || this.DEFAULT_DURATION;

    try {
      if (key) {
        // 带 key 的缓存
        const categoryCache = this.cache[category] as {[key: string]: CacheItem<T>};
        if (typeof categoryCache === 'object' && !Array.isArray(categoryCache)) {
          const item = categoryCache[key];
          if (item && now - item.timestamp < cacheDuration) {
            console.log(`[Cache] Hit ${category}[${key}], age: ${Math.floor((now - item.timestamp) / 1000)}s`);
            return item.data;
          }
        }
      } else {
        // 不带 key 的缓存
        const item = (this.cache as any)[category] as CacheItem<T> | undefined;
        if (item && now - item.timestamp < cacheDuration) {
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
            return {data: item.data, timestamp: item.timestamp};
          }
        }
      } else {
        // 不带 key 的缓存
        const item = (this.cache as any)[category] as CacheItem<T> | undefined;
        if (item) {
          return {data: item.data, timestamp: item.timestamp};
        }
      }
    } catch (error) {
      console.error(`[Cache] GetWithTimestamp error for ${category}${key ? `[${key}]` : ''}:`, error);
    }
    return null;
  }

  /**
   * 清除指定分类的缓存
   */
  clearCategory(category: keyof CacheStore): void {
    if (category === 'subBoards' || category === 'boardPosts' || category === 'postDetail' || category === 'topicReplies') {
      (this.cache[category] as any) = {};
    } else {
      delete (this.cache as any)[category];
    }
    console.log(`[Cache] Cleared ${category}`);
  }

  /**
   * 清除所有缓存
   */
  clearAll(): void {
    this.cache = {
      subBoards: {},
      boardPosts: {},
      hotPosts: {},
      postDetail: {},
      topicReplies: {},
      channelPosts: {},
      albumPosts: {},
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
    const cacheDuration = duration || this.DEFAULT_DURATION;
    let cleaned = 0;

    // 清理字典类型的缓存
    const dictCategories: Array<'subBoards' | 'boardPosts' | 'hotPosts' | 'postDetail' | 'topicReplies' | 'channelPosts' | 'albumPosts'> = [
      'subBoards',
      'boardPosts',
      'hotPosts',
      'postDetail',
      'topicReplies',
      'channelPosts',
      'albumPosts',
    ];

    for (const category of dictCategories) {
      const categoryCache = this.cache[category];
      for (const key in categoryCache) {
        if (now - categoryCache[key].timestamp >= cacheDuration) {
          delete categoryCache[key];
          cleaned++;
        }
      }
    }

    // 清理单个缓存项
    const singleCategories: Array<'boards' | 'userInfo' | 'favoriteBoards' | 'topTen' | 'hotBoards'> = [
      'boards',
      'userInfo',
      'favoriteBoards',
      'topTen',
      'hotBoards',
    ];

    for (const category of singleCategories) {
      const item = this.cache[category];
      if (item && now - item.timestamp >= cacheDuration) {
        delete this.cache[category];
        cleaned++;
      }
    }

    console.log(`[Cache] Cleaned ${cleaned} expired items`);
    return cleaned;
  }
}

// 导出单例
export const cacheManager = CacheManager.getInstance();

// 导出便捷方法
export const setCache = <T>(category: keyof CacheStore, key: string | undefined, data: T, duration?: number) => {
  cacheManager.set(category, key, data, duration);
};

export const getCache = <T>(category: keyof CacheStore, key?: string, duration?: number): T | null => {
  return cacheManager.get<T>(category, key, duration);
};

export const getCacheWithTimestamp = <T>(category: keyof CacheStore, key?: string): {data: T, timestamp: number} | null => {
  return cacheManager.getWithTimestamp<T>(category, key);
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
