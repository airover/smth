// 数据获取服务 - 使用 wap.newsmth.net 获取数据
// 职责：所有数据的获取（GET请求）和操作（POST/DELETE请求）
// 缓存：使用 cacheManager 统一管理
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Mail} from '../types';
import {
  fetchWithRetry,
  DEFAULT_TIMEOUT,
  logRequest,
  safeJsonParse,
  buildHeaders,
  buildGetHeaders,
  buildPostHeaders,
  buildDeleteHeaders,
} from '../utils/requestUtils';
import {setCache, getCacheWithTimestamp, clearCache} from './cacheManager';
import {extractStaticAttachmentUrls, isImageAttachment} from '../utils/imageUtils';
import {getCookies, getMSiteCookies, isMSiteResponseLoggedIn, handleMSiteCookieExpired, triggerSilentMSiteReLogin} from './auth';
import {cleanHtml} from '../utils/htmlParser';

const WAP_BASE_URL = 'https://wap.newsmth.net';
const CACHE_REFRESH_THRESHOLD = 60 * 1000;
const MAX_STALE_CACHE_AGE = 24 * 60 * 60 * 1000;
const MSITE_BOARD_PAGE_CACHE_DURATION = 60 * 1000;
const inFlightRequests = new Map<string, Promise<any>>();
const mSiteBoardPageCache = new Map<string, {timestamp: number; posts: MSiteBoardPost[]}>();

interface MSiteBoardPost {
  postId: string;
  rawTitle: string;
  cleanTitle: string;
  page: number;
}

const runOnce = async <T,>(key: string, request: () => Promise<T>): Promise<T> => {
  const existing = inFlightRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = request().finally(() => {
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, promise);
  return promise;
};

const isLoginExpiredApiResponse = (json: any): boolean => {
  const message = String(json?.message || json?.msg || json?.error || '');
  return (
    json?.code === 401 ||
    json?.code === 403 ||
    json?.kbsCode === 7 ||
    message.includes('登录') ||
    message.includes('未登录') ||
    message.includes('过期')
  );
};

const isPostMissingApiResponse = (json: any): boolean => {
  const message = String(json?.message || json?.msg || json?.error || '');
  return message.includes('不存在') || message.includes('已删除');
};

const invalidateFavoriteBoardsCache = async (): Promise<void> => {
  clearCache('favoriteBoards');
  try {
    await AsyncStorage.removeItem('favorite_boards_cache');
  } catch (error) {
    console.error('[Cache] Failed to invalidate favorite boards cache:', error);
  }
};

/**
 * 获取 M 站请求使用的 Cookie
 * 优先使用 M 站独立的 session cookie（来自 AsyncStorage），
 * 如果都没有，降级使用 wap 站 cookie
 */
const getMSiteRequestCookies = async (): Promise<string | null> => {
  // getMSiteCookies 内部只查 AsyncStorage
  const mSiteCookies = await getMSiteCookies();
  if (mSiteCookies) {
    return mSiteCookies;
  }
  // 降级使用 wap 站 cookie（对非限制版面仍然有效）
  return await getCookies();
};

// 通用请求函数（带 Cookie）
const requestWithCookies = async (
  url: string,
  options: RequestInit = {},
): Promise<Response> => {
  const cookies = await getCookies();
  const headers = {
    ...buildGetHeaders(cookies),
    ...(options.headers as Record<string, string>),
  };

  const fullUrl = url.startsWith('http') ? url : `${WAP_BASE_URL}${url}`;
  
  logRequest.start(fullUrl, options.method?.toString() || 'GET');
  
  const response = await fetchWithRetry(fullUrl, {
    ...options,
    headers,
    credentials: 'include',
  });

  return response;
};

// 通过 M 站短 ID 获取静态附件 URL
// 参数 mSitePostId 是通过 findMSitePostIdByTitle 获取的 M 站短 ID
const fetchStaticAttachmentUrls = async (
  boardName: string,
  mSitePostId: string,
): Promise<string[]> => {
  if (!boardName || !mSitePostId) return [];

  return await runOnce(`msite-static:${boardName}:${mSitePostId}`, async () => {
    const url = `https://m.newsmth.net/article/${boardName}/${mSitePostId}`;
    const cookies = await getMSiteRequestCookies();
    const referer = `https://m.newsmth.net/board/${boardName}`;

    const headers = buildHeaders({
      cookie: cookies,
      acceptType: 'html',
      referer,
      origin: 'https://m.newsmth.net',
      customHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Priority': 'u=0, i',
      },
    });

    const response = await fetchWithRetry(url, {
      method: 'GET',
      headers,
      credentials: 'include',
      mode: 'cors',
    });

    const html = await response.text();

    // 被动探测：检查响应中是否处于登录状态
    if (!isMSiteResponseLoggedIn(html)) {
      console.log('[PostDetail] M站Cookie已过期（响应中无注销链接），清除本地缓存');
      await handleMSiteCookieExpired();
      // 异步触发静默重登录（不阻塞当前请求）
      triggerSilentMSiteReLogin();
      return [];
    }

    const urls = extractStaticAttachmentUrls(html);
    if (urls.length > 0) {
      console.log('[PostDetail] Fallback static attachments:', urls);
    }
    return urls;
  }).catch((error: any) => {
    console.error('[PostDetail] Fetch static attachments failed:', error.message || error);
    return [];
  });
};

// 计算两个字符串的相似度（基于编辑距离）
const getStringSimilarity = (a: string, b: string): number => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  
  if (longer.length === 0) return 1;
  
  // 使用编辑距离计算相似度
  const editDistance = (s1: string, s2: string): number => {
    const m = s1.length;
    const n = s2.length;
    
    // 限制长度，避免过长字符串导致性能问题
    if (m > 100 || n > 100) {
      // 对于过长字符串，使用简化比较
      const minLen = Math.min(m, n);
      let commonPrefix = 0;
      for (let i = 0; i < minLen; i++) {
        if (s1[i] === s2[i]) commonPrefix++;
        else break;
      }
      return Math.max(m, n) - commonPrefix;
    }
    
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]) + 1;
        }
      }
    }
    return dp[m][n];
  };
  
  const distance = editDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return (maxLen - distance) / maxLen;
};

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const getEstimatedMSitePages = (wapPage: number, wapPosition: number): number[] => {
  const globalIndex = (wapPage - 1) * 20 + wapPosition;
  const mBasePage = Math.floor(globalIndex / 30) + 1;
  return [mBasePage, mBasePage + 1];
};

const parseMSiteBoardPosts = (pageHtml: string, boardName: string, page: number): MSiteBoardPost[] => {
  const pattern = new RegExp(
    `<a href="/article/${escapeRegExp(boardName)}/(\\d+)"[^>]*>([\\s\\S]*?)</a>`,
    'gi'
  );
  const posts: MSiteBoardPost[] = [];
  let match;

  while ((match = pattern.exec(pageHtml)) !== null) {
    const rawTitle = match[2];
    posts.push({
      postId: match[1],
      rawTitle,
      cleanTitle: cleanHtml(rawTitle, {collapseWhitespace: true}),
      page,
    });
  }

  return posts;
};

const matchMSitePostIdFromPosts = (
  posts: MSiteBoardPost[],
  targetClean: string,
  logTag: string,
): string | null => {
  let bestId: string | null = null;
  let highestScore = 0;

  for (const {postId, cleanTitle} of posts) {
    if (targetClean.length >= 10 && cleanTitle.includes(targetClean.substring(0, 10))) {
      console.log(`[${logTag}] 前缀匹配成功: ${postId}`);
      return postId;
    }

    if (cleanTitle === targetClean) {
      console.log(`[${logTag}] 精确匹配成功: ${postId}`);
      return postId;
    }

    const score = getStringSimilarity(targetClean, cleanTitle);
    if (score > highestScore) {
      highestScore = score;
      bestId = postId;
    }
  }

  if (highestScore > 0.9 && bestId) {
    console.log(`[${logTag}] 模糊匹配成功 (相似度: ${highestScore.toFixed(2)}): ${bestId}`);
    return bestId;
  }

  return null;
};

const fetchMSiteBoardPagePosts = async (boardName: string, page: number): Promise<MSiteBoardPost[]> => {
  if (!boardName || page < 1) return [];

  const cacheKey = `${boardName}:${page}`;
  const cached = mSiteBoardPageCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < MSITE_BOARD_PAGE_CACHE_DURATION) {
    return cached.posts;
  }

  return await runOnce(`msite-board-page:${cacheKey}`, async () => {
    const latestCached = mSiteBoardPageCache.get(cacheKey);
    if (latestCached && Date.now() - latestCached.timestamp < MSITE_BOARD_PAGE_CACHE_DURATION) {
      return latestCached.posts;
    }

    const cookies = await getMSiteRequestCookies();
    const url = `https://m.newsmth.net/board/${boardName}?p=${page}`;
    console.log(`[MMapper] 正在检索 M 站第 ${page} 页...`);

    const headers = buildHeaders({
      cookie: cookies,
      acceptType: 'html',
      referer: `https://m.newsmth.net/board/${boardName}`,
      origin: 'https://m.newsmth.net',
      customHeaders: {
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });

    try {
      const response = await fetchWithRetry(url, {
        method: 'GET',
        headers,
        credentials: 'include',
      }, 10000);

      if (!response.ok) {
        console.log(`[MMapper] 第 ${page} 页请求失败: ${response.status}`);
        return [];
      }

      const pageHtml = await response.text();
      if (!isMSiteResponseLoggedIn(pageHtml)) {
        console.log('[MMapper] M站Cookie已过期（响应中无注销链接），清除本地缓存');
        await handleMSiteCookieExpired();
        // 异步触发静默重登录（不阻塞当前请求）
        triggerSilentMSiteReLogin();
        return [];
      }

      const posts = parseMSiteBoardPosts(pageHtml, boardName, page);
      console.log(`[MMapper] 第 ${page} 页找到 ${posts.length} 个帖子`);
      mSiteBoardPageCache.set(cacheKey, {timestamp: Date.now(), posts});
      return posts;
    } catch (error: any) {
      console.error(`[MMapper] 第 ${page} 页请求出错:`, error.message || error);
      return [];
    }
  });
};

// 获取 M 站帖子短 ID
// 通过 WAP 站的页码和位置，在 M 站搜索匹配的帖子
// M 站每页30条，WAP 站每页20条
export const findMSitePostId = async (
  boardName: string,
  wapPage: number,
  wapPosition: number,
  targetTitle: string
): Promise<string | null> => {
  if (!boardName || !targetTitle) return null;

  const pagesToCheck = getEstimatedMSitePages(wapPage, wapPosition);
  const targetClean = cleanHtml(targetTitle, {collapseWhitespace: true});
  console.log(`[MMapper] 开始匹配: ${boardName} | WAP Page: ${wapPage}, Pos: ${wapPosition}`);
  console.log(`[MMapper] 目标标题: ${targetClean}`);

  for (const page of pagesToCheck) {
    const posts = await fetchMSiteBoardPagePosts(boardName, page);
    const matchedId = matchMSitePostIdFromPosts(posts, targetClean, 'MMapper');
    if (matchedId) {
      return matchedId;
    }
  }

  console.log('[MMapper] 未找到匹配的帖子');
  return null;
};

// 通过帖子标题直接在 M 站搜索获取短 ID
// 适用于不知道 WAP 站位置信息的场景
export const findMSitePostIdByTitle = async (
  boardName: string,
  targetTitle: string,
  maxPages: number = 3
): Promise<string | null> => {
  if (!boardName || !targetTitle) return null;

  const targetClean = cleanHtml(targetTitle, {collapseWhitespace: true});
  console.log(`[MMapper] 按标题搜索: ${boardName}`);
  console.log(`[MMapper] 目标标题: ${targetClean}`);

  for (let page = 1; page <= maxPages; page++) {
    const posts = await fetchMSiteBoardPagePosts(boardName, page);
    const matchedId = matchMSitePostIdFromPosts(posts, targetClean, 'MMapper');
    if (matchedId) {
      return matchedId;
    }
  }

  console.log('[MMapper] 未找到匹配的帖子');
  return null;
};

// ============================================================
// 公共辅助函数：用于检查和获取M站短ID
// ============================================================

/**
 * 检查附件数组中是否有图片附件缺少云存储URL (k3sUrl 和 ks3Url 都为空)
 * @param attachments 附件数组
 * @returns 是否存在缺少云存储URL的图片附件
 */
export const hasImageAttachmentWithoutCloudUrl = (attachments: any[]): boolean => {
  if (!attachments || attachments.length === 0) return false;
  
  const result = attachments.some((att: any) => {
    const isImage = isImageAttachment(att);
    const hasCloudUrl = att.k3sUrl || att.ks3Url;
    console.log(`[hasImageAttachmentWithoutCloudUrl] 附件判断: type=${att.type}, name=${att.name}, isImage=${isImage}, k3sUrl=${att.k3sUrl}, ks3Url=${att.ks3Url}, hasCloudUrl=${!!hasCloudUrl}, cdnUrl=${att.cdnUrl}`);
    return isImage && !hasCloudUrl;
  });
  console.log(`[hasImageAttachmentWithoutCloudUrl] 最终结果: ${result}, 附件数量: ${attachments.length}`);
  return result;
};

// ===== M站帖子短ID 持久缓存 (AsyncStorage) =====
const MSITE_POST_ID_CACHE_KEY = '@msite_post_id_cache';
const MSITE_POST_ID_CACHE_MAX_SIZE = 10000; // 缓存最大条目数
const MSITE_STATIC_URL_CACHE_KEY = '@msite_static_attachment_url_cache';
const MSITE_STATIC_URL_CACHE_MAX_SIZE = 5000;
let mSitePostIdCacheMemory: Record<string, string> | null = null;
let mSiteStaticUrlCacheMemory: Record<string, string[]> | null = null;

const loadMSitePostIdCache = async (): Promise<Record<string, string>> => {
  if (mSitePostIdCacheMemory) {
    return mSitePostIdCacheMemory;
  }

  try {
    const raw = await AsyncStorage.getItem(MSITE_POST_ID_CACHE_KEY);
    mSitePostIdCacheMemory = raw ? JSON.parse(raw) : {};
  } catch {
    mSitePostIdCacheMemory = {};
  }

  return mSitePostIdCacheMemory as Record<string, string>;
};

const loadMSiteStaticUrlCache = async (): Promise<Record<string, string[]>> => {
  if (mSiteStaticUrlCacheMemory) {
    return mSiteStaticUrlCacheMemory;
  }

  try {
    const raw = await AsyncStorage.getItem(MSITE_STATIC_URL_CACHE_KEY);
    mSiteStaticUrlCacheMemory = raw ? JSON.parse(raw) : {};
  } catch {
    mSiteStaticUrlCacheMemory = {};
  }

  return mSiteStaticUrlCacheMemory as Record<string, string[]>;
};

/**
 * 从持久缓存中获取 topicId 对应的 mSitePostId
 */
const getMSitePostIdFromCache = async (topicId: string): Promise<string | null> => {
  const cache = await loadMSitePostIdCache();
  return cache[topicId] || null;
};

/**
 * 将 topicId → mSitePostId 写入持久缓存
 */
const saveMSitePostIdToCache = async (topicId: string, mSitePostId: string): Promise<void> => {
  try {
    const cache = await loadMSitePostIdCache();
    // 限制缓存条目数量，超过上限时删除最早的100条
    const keys = Object.keys(cache);
    if (keys.length > MSITE_POST_ID_CACHE_MAX_SIZE) {
      const toRemove = keys.slice(0, 100);
      toRemove.forEach(k => delete cache[k]);
    }
    cache[topicId] = mSitePostId;
    await AsyncStorage.setItem(MSITE_POST_ID_CACHE_KEY, JSON.stringify(cache));
  } catch (err: any) {
    console.log('[MSiteIdCache] 写入缓存失败:', err.message || err);
  }
};

const getStaticAttachmentUrlsFromCache = async (topicId: string): Promise<string[] | null> => {
  const cache = await loadMSiteStaticUrlCache();
  return cache[topicId] || null;
};

const saveStaticAttachmentUrlsToCache = async (topicId: string, urls: string[]): Promise<void> => {
  if (!topicId || urls.length === 0) return;

  try {
    const cache = await loadMSiteStaticUrlCache();
    const keys = Object.keys(cache);
    if (keys.length > MSITE_STATIC_URL_CACHE_MAX_SIZE) {
      keys.slice(0, 100).forEach(key => delete cache[key]);
    }
    cache[topicId] = urls;
    await AsyncStorage.setItem(MSITE_STATIC_URL_CACHE_KEY, JSON.stringify(cache));
  } catch (err: any) {
    console.log('[MSiteStaticUrlCache] 写入缓存失败:', err.message || err);
  }
};

const resolveMSitePostIdsForBoardList = async (topics: any[], wapPage: number): Promise<Map<string, string | null>> => {
  const results = new Map<string, string | null>();
  const candidates: Array<{
    topicId: string;
    boardName: string;
    title: string;
    targetClean: string;
    pages: number[];
  }> = [];

  for (let index = 0; index < topics.length; index++) {
    const topic = topics[index];
    const rawAttachments = (topic.article?.attachments || []).filter((att: any) => att != null);
    if (!hasImageAttachmentWithoutCloudUrl(rawAttachments)) {
      continue;
    }

    const topicId = topic.id;
    const cachedId = topicId ? await getMSitePostIdFromCache(topicId) : null;
    if (cachedId) {
      results.set(topicId, cachedId);
      continue;
    }

    const boardName = topic.board?.name || '';
    const title = topic.subject?.trim() || '';
    if (!topicId || !boardName || !title) {
      continue;
    }

    candidates.push({
      topicId,
      boardName,
      title,
      targetClean: cleanHtml(title, {collapseWhitespace: true}),
      pages: getEstimatedMSitePages(wapPage, index),
    });
  }

  const pageRequests = new Map<string, {boardName: string; page: number}>();
  candidates.forEach(candidate => {
    candidate.pages.forEach(page => {
      pageRequests.set(`${candidate.boardName}:${page}`, {boardName: candidate.boardName, page});
    });
  });

  const postsByPage = new Map<string, MSiteBoardPost[]>();
  await Promise.all(Array.from(pageRequests.entries()).map(async ([key, request]) => {
    const posts = await fetchMSiteBoardPagePosts(request.boardName, request.page);
    postsByPage.set(key, posts);
  }));

  const fallbackCandidates: typeof candidates = [];
  for (const candidate of candidates) {
    const posts = candidate.pages.flatMap(page => postsByPage.get(`${candidate.boardName}:${page}`) || []);
    const matchedId = matchMSitePostIdFromPosts(posts, candidate.targetClean, 'BoardPosts');
    if (matchedId) {
      results.set(candidate.topicId, matchedId);
      await saveMSitePostIdToCache(candidate.topicId, matchedId);
    } else {
      fallbackCandidates.push(candidate);
    }
  }

  await Promise.all(fallbackCandidates.map(async candidate => {
    const matchedId = await findMSitePostIdByTitle(candidate.boardName, candidate.title, 2);
    results.set(candidate.topicId, matchedId);
    if (matchedId) {
      await saveMSitePostIdToCache(candidate.topicId, matchedId);
    }
  }));

  return results;
};

/**
 * 为帖子获取M站短ID
 * 通过精确偏移或标题搜索在M站找到对应帖子的短ID
 * 只在附件缺少云存储URL时才会尝试获取
 * 获取成功后自动写入持久缓存
 * 
 * @param params 参数对象
 * @param params.attachments 附件数组
 * @param params.boardName 版面英文名
 * @param params.topicTitle 帖子标题
 * @param params.logTag 日志标签，用于区分调用来源
 * @param params.topicId 帖子ID，用于日志
 * @param params.page WAP站页码（可选，用于精确查找）
 * @param params.position WAP站位置（可选，用于精确查找）
 * @param params.isTop 是否置顶帖（可选）
 * @param params.maxSearchPages 最大搜索页数（默认2）
 * @returns M站短ID，如果未找到则返回null
 */export const getMSitePostIdForTopic = async (params: {
  attachments: any[];
  boardName: string;
  topicTitle: string;
  logTag: string;
  topicId?: string;
  page?: number;
  position?: number;
  isTop?: boolean;
  maxSearchPages?: number;
}): Promise<string | null> => {
  const {
    attachments,
    boardName,
    topicTitle,
    logTag,
    topicId = '',
    page,
    position,
    isTop = false,
    maxSearchPages = 2,
  } = params;
  
  // 检查是否需要获取M站短ID
  if (!hasImageAttachmentWithoutCloudUrl(attachments)) {
    return null;
  }
  
  if (!boardName || !topicTitle) {
    return null;
  }
  
  // 优先从持久缓存获取M站短ID
  if (topicId) {
    const cachedId = await getMSitePostIdFromCache(topicId);
    if (cachedId) {
      console.log(`[${logTag}] 帖子 ${topicId} 使用M站短ID: ${cachedId} (从缓存获取)`);
      return cachedId;
    }
  }
  
  console.log(`[${logTag}] 帖子 ${topicId} 检测到图片附件缺少云存储URL，尝试获取M站短ID...`);
  
  try {
    let mSitePostId: string | null = null;
    
    // 如果有精确的页码和位置信息（非置顶帖），使用精确查找
    if (!isTop && page !== undefined && position !== undefined && position >= 0) {
      mSitePostId = await findMSitePostId(boardName, page, position, topicTitle);
    }
    
    // 如果精确查找未果或无法使用精确查找，则使用标题搜索方式
    if (!mSitePostId) {
      mSitePostId = await findMSitePostIdByTitle(boardName, topicTitle, maxSearchPages);
    }
    
    if (mSitePostId) {
      console.log(`[${logTag}] 帖子 ${topicId} 找到M站短ID: ${mSitePostId}`);
      // 写入持久缓存
      if (topicId) {
        saveMSitePostIdToCache(topicId, mSitePostId);
      }
    } else {
      console.log(`[${logTag}] 帖子 ${topicId} 未找到M站短ID`);
    }
    
    return mSitePostId;
  } catch (err: any) {
    console.log(`[${logTag}] 帖子 ${topicId} 获取M站短ID失败:`, err.message || err);
    return null;
  }
};

/**
 * 为帖子获取M站静态附件URL数组
 * 整合了获取M站短ID和获取静态URL的逻辑
 * 只在附件缺少云存储URL时才会尝试获取
 * 
 * @param params 参数对象
 * @param params.attachments 附件数组
 * @param params.boardName 版面英文名
 * @param params.topicTitle 帖子标题
 * @param params.logTag 日志标签，用于区分调用来源
 * @param params.topicId 帖子ID，用于日志
 * @param params.maxSearchPages 最大搜索页数（默认2）
 * @returns 静态附件URL数组，如果未找到或不需要则返回空数组
 */
export const getStaticAttachmentUrlsForTopic = async (params: {
  attachments: any[];
  boardName: string;
  topicTitle: string;
  logTag: string;
  topicId?: string;
  maxSearchPages?: number;
}): Promise<string[]> => {
  const {
    attachments,
    boardName,
    topicTitle,
    logTag,
    topicId = '',
    maxSearchPages = 2,
  } = params;
  
  // 检查是否需要获取静态URL
  console.log(`[${logTag}] getStaticAttachmentUrlsForTopic 进入, topicId=${topicId}, boardName=${boardName}, topicTitle=${topicTitle}, attachments数量=${attachments.length}`);
  if (!hasImageAttachmentWithoutCloudUrl(attachments)) {
    console.log(`[${logTag}] 帖子 ${topicId} hasImageAttachmentWithoutCloudUrl返回false，跳过获取静态URL`);
    return [];
  }
  
  if (!boardName || !topicTitle) {
    console.log(`[${logTag}] 帖子 ${topicId} boardName或topicTitle为空，跳过获取静态URL`);
    return [];
  }
  
  console.log(`[${logTag}] 帖子 ${topicId} 检测到图片附件缺少云存储URL，尝试获取M站静态URL...`);
  
  try {
    if (topicId) {
      const cachedStaticUrls = await getStaticAttachmentUrlsFromCache(topicId);
      if (cachedStaticUrls && cachedStaticUrls.length > 0) {
        console.log(`[${logTag}] 帖子 ${topicId} 使用静态附件URL缓存，数量: ${cachedStaticUrls.length}`);
        return cachedStaticUrls;
      }
    }

    // 优先从持久缓存获取M站短ID，缓存没有则通过标题搜索
    let mSitePostId: string | null = null;
    if (topicId) {
      mSitePostId = await getMSitePostIdFromCache(topicId);
      if (mSitePostId) {
        console.log(`[${logTag}] 帖子 ${topicId} 使用M站短ID: ${mSitePostId} (从缓存获取)`);
      }
    }
    if (!mSitePostId) {
      mSitePostId = await findMSitePostIdByTitle(boardName, topicTitle, maxSearchPages);
      // 写入持久缓存
      if (mSitePostId && topicId) {
        saveMSitePostIdToCache(topicId, mSitePostId);
      }
    }
    
    if (!mSitePostId) {
      console.log(`[${logTag}] 帖子 ${topicId} 未找到M站短ID，无法获取静态URL`);
      return [];
    }
    
    console.log(`[${logTag}] 帖子 ${topicId} 找到M站短ID: ${mSitePostId}，开始获取静态URL...`);
    
    // 获取静态附件URL
    const staticUrls = await fetchStaticAttachmentUrls(boardName, mSitePostId);
    
    if (staticUrls.length > 0) {
      console.log(`[${logTag}] 帖子 ${topicId} 获取到 ${staticUrls.length} 个静态URL`);
      if (topicId) {
        await saveStaticAttachmentUrlsToCache(topicId, staticUrls);
      }
    } else {
      console.log(`[${logTag}] 帖子 ${topicId} 未获取到静态URL`);
    }
    
    return staticUrls;
  } catch (err: any) {
    console.log(`[${logTag}] 帖子 ${topicId} 获取静态URL失败:`, err.message || err);
    return [];
  }
};

// 获取热门帖子（全站热帖）
// API: GET https://wap.newsmth.net/wap/api/hot/global?t={timestamp}&page={page}&size={size}
export const getHotPosts = async (
  page: number = 1, 
  size: number = 20
): Promise<{topics: any[], totalPages: number}> => {
  try {
    const cookies = await getCookies();
    const timestamp = Date.now();
    const url = `${WAP_BASE_URL}/wap/api/hot/global?t=${timestamp}&page=${page}&size=${size}`;
    
    console.log('Fetching Hot Posts from API:', url);
    
    const headers = buildGetHeaders(cookies);

    const response = await fetchWithRetry(url, {
      headers,
      credentials: 'include',
    });

    const json = await response.json();
    console.log('getHotPosts API response code:', json.code);

if (json.code === 1 && json.data?.topics) {
      const topics = json.data.topics || [];
      // API返回的是total表示总页数
      const totalPages = json.data.pager?.total || 1;
      
      // 处理每个帖子，检查是否需要获取M站短ID
      const processTopic = async (topic: any): Promise<any> => {
        const article = topic.article || {};
        const account = article.account || {};
        const attachments = article.attachments || [];
        
        // 使用公共函数获取M站短ID（只在附件缺少云存储URL时才会尝试获取）
        const mSitePostId = await getMSitePostIdForTopic({
          attachments,
          boardName: topic.board?.name || '',
          topicTitle: topic.subject?.trim() || '',
          logTag: 'HotPosts',
          topicId: topic.id,
        });
        
        return {
          id: topic.id,
          title: topic.subject?.trim(),
          author: account.name || '',
          board: topic.boardId,
          boardName: topic.board?.title || topic.board?.name || '未知版面',
          replyCount: Math.max(0, (topic.availables || 0) - 1),
          postTime: new Date(article.postTime || Date.now()).toISOString(),
          // 使用lastPostTime而不是flushTime作为最后回复时间
          lastReplyTime: new Date(topic.lastPostTime || topic.flushTime || Date.now()).toISOString(),
          mSitePostId: mSitePostId, // M站短ID，用于帖子详情获取静态附件URL
        };
      };
      
      // 并行处理所有帖子
      const processedTopics = await Promise.all(topics.map((t: any) => processTopic(t)));
      
      return {
        topics: processedTopics,
        totalPages: totalPages
      };
    }
    
    return { topics: [], totalPages: 0 };
  } catch (error) {
    console.error('Get hot posts error:', error);
    return { topics: [], totalPages: 0 };
  }
};

// 获取当日十大
// 使用新的 JSON API 获取
export const getTopTen = async (): Promise<any[] | null> => {
  try {
    const cookies = await getCookies();
    const timestamp = Date.now();
    const url = `${WAP_BASE_URL}/wap/api/hot/ten?t=${timestamp}&page=1&size=20`;
    
    console.log('Fetching Top Ten from API:', url);
    
    const headers = buildGetHeaders(cookies);

    const response = await fetchWithRetry(url, {
      headers,
      credentials: 'include',
    });

    const text = await response.text();
    console.log('getTopTen raw response:', text.substring(0, 500));
    
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.error('getTopTen JSON parse error:', e);
      console.log('Response was not JSON, first 500 chars:', text.substring(0, 500));
      return [];
    }
    
    console.log('getTopTen API response code:', json.code);
    console.log('getTopTen API response keys:', json.data ? Object.keys(json.data) : 'no data');

if (json.code === 1 && json.data) {
      const topics = json.data.topics || [];
      console.log('getTopTen found topics:', topics.length);
      
      if (topics.length === 0) {
        console.log('getTopTen: API返回空数据，保留本地缓存');
        // 返回 null 表示API返回空，调用方应保留原有数据
        return null;
      }
      
      // 处理每个帖子，检查是否需要获取M站短ID
      const processTopic = async (topic: any): Promise<any> => {
        const article = topic.article || {};
        const attachments = article.attachments || [];
        
        // 使用公共函数获取M站短ID（只在附件缺少云存储URL时才会尝试获取）
        const mSitePostId = await getMSitePostIdForTopic({
          attachments,
          boardName: topic.board?.name || '',
          topicTitle: topic.subject?.trim() || '',
          logTag: 'TopTen',
          topicId: topic.id,
        });
        
        return {
          id: topic.id, // 使用主题 ID (topicId)，用于详情接口
          title: topic.subject?.trim(),
          author: topic.article?.account?.name || topic.article?.user?.name || '',
          board: topic.boardId, // 版面 ID (hash)
          boardName: topic.board?.title || topic.board?.name || '未知版面',
          replyCount: Math.max(0, (topic.availables || 0) - 1),
          postTime: new Date(topic.flushTime || Date.now()).toISOString(),
          lastReplyTime: new Date(topic.lastPostTime || Date.now()).toISOString(),
          mSitePostId: mSitePostId, // M站短ID，用于帖子详情获取静态附件URL
        };
      };
      
      // 并行处理所有帖子
      const processedTopics = await Promise.all(topics.map((t: any) => processTopic(t)));
      
      return processedTopics;
    }
    
    console.log('getTopTen: API请求失败，保留本地缓存');
    return null;
  } catch (error) {
    console.error('Get top ten error:', error);
    return null;
  }
};

// 获取热门版面
// 使用新的 JSON API 获取
export const getHotBoards = async (): Promise<any[]> => {
  try {
    const cookies = await getCookies();
    const url = `${WAP_BASE_URL}/wap/api/hot/popularity/board`;
    
    console.log('Fetching Hot Boards from API:', url);
    
    const headers = buildGetHeaders(cookies);

    const response = await fetchWithRetry(url, {
      headers,
      credentials: 'include',
    });

    const json = await response.json();
    console.log('getHotBoards API response code:', json.code);

    if (json.code === 1 && Array.isArray(json.data)) {
      return json.data.map((board: any) => ({
        id: board.id, // hash ID
        name: board.name, // 英文名，如 FamilyLife
        chineseName: board.title?.trim(), // 中文名，如 家庭生活
        popularity: board.popularity,
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Get hot boards error:', error);
    return [];
  }
};

// 获取收藏版面
// 使用新的 JSON API 获取
export const getFavoriteBoards = async (forceRefresh: boolean = false): Promise<any[]> => {
  try {
    const cookies = await getCookies();
    
    // 严格校验登录态：必须有Cookie才能调用
    if (!cookies) {
      console.error('getFavoriteBoards: 未登录，无Cookie');
      throw new Error('NOT_LOGGED_IN');
    }
    
    // 检查缓存（5分钟有效期）
    if (!forceRefresh) {
      const CACHE_KEY = 'favorite_boards_cache';
      const CACHE_DURATION = 5 * 60 * 1000; // 5分钟
      
      try {
        const cachedData = await AsyncStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          const age = Date.now() - parsed.timestamp;
          
          if (age < CACHE_DURATION) {
            console.log(`[Cache] Using favorite boards cache, age: ${Math.floor(age / 1000)}s`);
            
            // 如果缓存超过1分钟，异步更新
            if (age > 60 * 1000) {
              console.log('[Cache] Favorite boards cache needs background refresh');
              // 异步更新缓存
              getFavoriteBoards(true).catch(err => {
                console.error('[Cache] Background refresh failed:', err);
              });
            }
            
            return parsed.data;
          }
        }
      } catch (error) {
        console.error('[Cache] Read favorite boards cache error:', error);
      }
    }
    
    return await runOnce('favoriteBoards', async () => {
      const timestamp = Date.now();
      const url = `${WAP_BASE_URL}/wap/api/profile/fav/boards?t=${timestamp}`;
    
      console.log('Fetching Favorite Boards from API:', url);
    
      const headers = buildGetHeaders(cookies);

      const response = await fetchWithRetry(url, {
        headers,
        credentials: 'include',
      }, 10000); // 10秒超时
    
      // 检查HTTP状态码，401/403表示未登录或Cookie过期
      if (response.status === 401 || response.status === 403) {
        console.error('getFavoriteBoards: Cookie已过期或无权限，状态码:', response.status);
        // 清除本地登录状态
        // 注意：不在这里清除登录态，让上层UI决定如何处理
        // 登录态只在用户主动退出登录时才清除
        throw new Error('LOGIN_EXPIRED');
      }

      const json = await response.json();
      console.log('getFavoriteBoards API response code:', json.code);

      // 检查API返回码，某些错误码也表示未登录
      if (json.code !== 1) {
        console.error('getFavoriteBoards: API返回错误，code:', json.code, 'message:', json.message);
        if (json.code === 401 || json.code === 403 || json.message?.includes('登录')) {
          // 注意：不在这里清除登录态，让上层UI决定如何处理
          throw new Error('LOGIN_EXPIRED');
        }
        throw new Error(json.message || 'API_ERROR');
      }

      if (json.data?.favBoards) {
        const allFavBoards: any[] = [];
      
      // 兼容处理：有些 API 返回的是对象格式（带数字键）而非标准数组
      const rawData = json.data.favBoards;
      const folders = Array.isArray(rawData) ? rawData : Object.values(rawData || {});
      
      // 深度递归提取所有版面项目
      const collect = (list: any[]) => {
        if (!Array.isArray(list)) return;
        
        list.forEach(item => {
          if (!item) return;
          
          // 根据提供的最新响应格式：
          // 1. 如果 item.type 为 "BOARD"，版面信息在 item.bid 中
          if (item.type === 'BOARD' && item.bid) {
            const bid = item.bid;
            if (!allFavBoards.find(b => b.id === bid.id)) {
              allFavBoards.push({
                id: bid.id,
                name: bid.name || '',
                chineseName: (bid.title || bid.name || '').trim(),
                isFavorite: true,
              });
            }
          } 
          // 2. 如果是旧格式或者直接是版面对象
          else if (typeof item.id === 'string' && item.id.length > 10) {
            if (!allFavBoards.find(b => b.id === item.id)) {
              allFavBoards.push({
                id: item.id,
                name: item.name || '',
                chineseName: (item.title || item.name || '').trim(),
                isFavorite: true,
          });
        }
      }
          
          // 递归进入 items 子列表（处理文件夹嵌套）
          if (item.items && Array.isArray(item.items)) {
            collect(item.items);
          }
        });
      };

      collect(folders);
      console.log('Extracted fav boards count:', allFavBoards.length);
      
      // 保存到缓存
      const CACHE_KEY = 'favorite_boards_cache';
      try {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
          data: allFavBoards,
          timestamp: Date.now(),
        }));
        console.log('[Cache] Saved favorite boards to cache');
      } catch (error) {
        console.error('[Cache] Failed to save favorite boards cache:', error);
      }
      
      return allFavBoards;
    }
    
      return [];
    });
  } catch (error: any) {
    console.error('Get favorite boards error:', error);
    // 登录相关错误需要抛出，让调用方处理
    if (error.message === 'NOT_LOGGED_IN' || error.message === 'LOGIN_EXPIRED') {
      throw error;
    }
    
    // 其他错误时，尝试返回缓存数据
    if (error.message === '请求超时') {
      const CACHE_KEY = 'favorite_boards_cache';
      try {
        const cachedData = await AsyncStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          console.log('[Cache] Using stale cache due to timeout');
          return parsed.data;
        }
      } catch (cacheError) {
        console.error('[Cache] Failed to read cache on error:', cacheError);
      }
    }
    
    // 其他错误返回空数组
    return [];
  }
};

// 获取版面列表（分区）
// 使用新的 JSON API 获取全部一级分区
export const getBoards = async (): Promise<any[]> => {
  try {
    const cookies = await getCookies();
    const timestamp = Date.now();
    // API: https://wap.newsmth.net/wap/api/section/all
    const url = `${WAP_BASE_URL}/wap/api/section/all?t=${timestamp}`;
    
    console.log('Fetching Sections from API:', url);
    
    const headers = buildGetHeaders(cookies);

    const response = await fetchWithRetry(url, {
      headers,
      credentials: 'include',
    });

    const json = await response.json();
    console.log('getBoards API response code:', json.code);

    if (json.code === 1 && json.data?.sections) {
      return json.data.sections.map((section: any) => ({
        id: section.id,
        name: section.name,
        chineseName: section.name,
        description: section.description,
        cover: section.cover,
        children: [], // 一级分区暂时没有下级信息，需要后续进入获取
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Get boards error:', error);
    return [];
  }
};

// 获取子版面/二级分区列表
export const getSubBoards = async (sectionId: string): Promise<any[]> => {
  try {
    const cookies = await getCookies();
    const timestamp = Date.now();
    // API: https://wap.newsmth.net/wap/api/section/subs?t=:t&id=:id
    const url = `${WAP_BASE_URL}/wap/api/section/subs?t=${timestamp}&id=${sectionId}`;
    
    const headers = buildGetHeaders(cookies);

    const response = await fetchWithRetry(url, {
      headers,
      credentials: 'include',
    });

    const json = await response.json();

    if (json.code === 1 && json.data?.boards) {
      const boards = json.data.boards.filter((item: any) => item.id && (item.name || item.title));
      
      // 根据 groupId 构建层级关系
      const boardMap = new Map<string, any>();
      const rootBoards: any[] = [];
      
      // 第一步：创建所有节点并建立映射
      boards.forEach((item: any) => {
        const node = {
          id: item.id,
          name: item.name,
          chineseName: item.title?.trim() || item.name,
          type: item.type,
          isFolder: item.type === 1,
          groupId: item.groupId || '',
          children: [],
        };
        boardMap.set(item.id, node);
      });
      
      // 第二步：根据 groupId 建立父子关系
      boards.forEach((item: any) => {
        const node = boardMap.get(item.id);
        if (!node) return;
        
        if (item.groupId && boardMap.has(item.groupId)) {
          // 有 groupId 且父节点存在，添加到父节点的 children
          const parent = boardMap.get(item.groupId);
          parent.children.push(node);
        } else {
          // 没有 groupId 或父节点不存在，作为根节点
          rootBoards.push(node);
        }
      });
      
      // 第三步：清理不需要暴露 groupId 的字段，移除空 children
      const cleanNode = (node: any) => {
        delete node.groupId;
        if (node.children.length === 0 && !node.isFolder) {
          delete node.children;
        } else if (node.children.length > 0) {
          node.children.forEach(cleanNode);
        }
        return node;
      };
      
      const result = rootBoards.map(cleanNode);
      return result;
    }
    
    return [];
  } catch (error) {
    console.error('Get sub-boards error:', error);
    return [];
  }
};

/**
 * 获取版面帖子列表。
 * 失败时会抛错，登录态失效时抛 LOGIN_EXPIRED；空版面返回空数组。
 */
export const getBoardPosts = async (
  boardId: string, // 现在传入的是版面 hash ID
  page: number = 1,
  isOrderByFlushTime: number = 0, // 0: 按发布时间排序, 1: 按回复时间排序
): Promise<{topics: any[], tops: any[], totalPages: number}> => {
  try {
    const cookies = await getCookies();
    const timestamp = Date.now();
    // API: https://wap.newsmth.net/wap/api/board/topic/list?t=:t&id=:id&isOrderByFlushTime=0&page=:page
    const url = `${WAP_BASE_URL}/wap/api/board/topic/list?t=${timestamp}&id=${boardId}&isOrderByFlushTime=${isOrderByFlushTime}&page=${page}`;
    
    console.log('Fetching Board Posts from API:', url);
    
    const headers = buildGetHeaders(cookies);

    const response = await fetchWithRetry(url, {
      headers,
      credentials: 'include',
    });

    const json = await response.json();
    console.log('getBoardPosts API response code:', json.code, 'kbsCode:', json.kbsCode, 'message:', json.message);

    if (json.code !== 1) {
      console.error('getBoardPosts API returned failure, code:', json.code, 'kbsCode:', json.kbsCode, 'message:', json.message);
      if (isLoginExpiredApiResponse(json)) {
        throw new Error('LOGIN_EXPIRED');
      }
      throw new Error(json.message || json.msg || `GET_BOARD_POSTS_FAILED_${json.code || 'UNKNOWN'}`);
    }

    const data = json.data || {};
    {
      const topics = data.topics || [];
      const tops = data.tops || [];
      // API返回的是total表示总页数，不是totalPages
      const totalPages = data.pager?.total || 1;
      const boardListMSiteIds = await resolveMSitePostIdsForBoardList(topics, page);
      
      // wapPosition: 页内位置（仅普通帖子有效，置顶帖为-1）
      const processTopic = async (topic: any, isTop: boolean = false, wapPosition: number = -1) => {
        const article = topic.article || {};
        const account = article.account || {};
        
        let avatar = account.k3sUrl || account.ks3Url || account.avatarUrl || '';
        if (avatar && avatar.startsWith('http:')) {
          avatar = avatar.replace('http:', 'https:');
        }

        // 处理附件列表
        const rawAttachments = (article.attachments || []).filter((att: any) => att != null);
        
        // 检查是否有图片类型附件缺少云存储URL (k3sUrl 和 ks3Url 都为空)
        const hasImageWithoutCloudUrl = hasImageAttachmentWithoutCloudUrl(rawAttachments);

        // 如果有图片附件缺少云存储URL，获取M站短ID用于传递到帖子详情
        // 注意：列表页不获取静态URL，交给帖子详情处理
        let mSitePostId: string | null = null;
        if (hasImageWithoutCloudUrl && rawAttachments.length > 0) {
          if (!isTop && boardListMSiteIds.has(topic.id)) {
            mSitePostId = boardListMSiteIds.get(topic.id) || null;
          } else {
            const boardNameForFetch = topic.board?.name || '';
            const topicTitle = topic.subject?.trim() || '';

            // 置顶帖没有普通页内位置，继续走单帖标题兜底
            mSitePostId = await getMSitePostIdForTopic({
              attachments: rawAttachments,
              boardName: boardNameForFetch,
              topicTitle: topicTitle,
              logTag: 'BoardPosts',
              topicId: topic.id,
              page: page,
              position: wapPosition,
              isTop: isTop,
            });
          }
        }

        // 处理附件URL
        const processedAttachments = rawAttachments.map((att: any) => {
          const attUrl = att.url || '';
          
          // 如果有云存储URL，优先使用
          if (att.k3sUrl || att.ks3Url) {
            return {
              ...att,
              url: att.k3sUrl || att.ks3Url || (attUrl.startsWith('http') ? attUrl : `https://file.mysmth.net/${attUrl}`)
            };
          }
          
          // 其他情况使用原始URL
          return {
            ...att,
            url: attUrl.startsWith('http') ? attUrl : `https://file.mysmth.net/${attUrl}`
          };
        });

        return {
          id: topic.id, // topicId
          title: topic.subject?.trim(),
          author: account.name || '',
          nickname: account.nick || '',
          avatar: avatar,
          levelTitle: account.levelTitle || '',
          city: article.city || '',
          board: topic.boardId,
          boardName: topic.board?.title || '',
          replyCount: Math.max(0, (topic.availables || 0) - 1),
          postTime: new Date(article.postTime || Date.now()).toISOString(),
          // 使用lastPostTime而不是flushTime作为最后回复时间
          lastReplyTime: new Date(topic.lastPostTime || topic.flushTime || Date.now()).toISOString(),
          isTop: isTop,
          attachments: processedAttachments,
          mSitePostId: mSitePostId, // M站短ID，用于帖子详情获取静态附件URL
        };
      };

      // processTopic 现在是异步函数，需要并行处理
      // 普通帖子传入页内位置（index），置顶帖位置设为-1
      const [processedTopics, processedTops] = await Promise.all([
        Promise.all(topics.map((t: any, index: number) => processTopic(t, false, index))),
        Promise.all(tops.map((t: any) => processTopic(t, true, -1))),
      ]);

      return {
        topics: processedTopics,
        tops: processedTops,
        totalPages: totalPages
      };
    }
  } catch (error: any) {
    console.error('Get board posts error:', error);
    if (
      error.message === 'LOGIN_EXPIRED' ||
      error.message === 'NOT_LOGGED_IN' ||
      error.message?.includes('HTTP 401') ||
      error.message?.includes('HTTP 403')
    ) {
      throw new Error('LOGIN_EXPIRED');
    }
    throw error;
  }
};

/**
 * 获取帖子详情。
 * 失败时会抛错，登录态失效时抛 LOGIN_EXPIRED；帖子确实不存在时返回 null。
 */
export const getPostDetail = async (
  _board: string,
  topicId: string, // 现在传入的是 topicId
  _page: number = 1,
  initialMSitePostId?: string | null,
): Promise<any> => {
  try {
    const cookies = await getCookies();
    const timestamp = Date.now();
    // API: https://wap.newsmth.net/wap/api/topic/:topicId/detail
    const url = `${WAP_BASE_URL}/wap/api/topic/${topicId}/detail?t=${timestamp}`;
    
    console.log('Fetching Post Detail from API:', url);
    
    const headers = buildGetHeaders(cookies);

    const response = await fetchWithRetry(url, {
      headers,
      credentials: 'include',
    });

    const json = await response.json();
    console.log('getPostDetail API response code:', json.code);

    if (json.code !== 1) {
      console.error('getPostDetail API returned failure, code:', json.code, 'message:', json.message);
      if (isLoginExpiredApiResponse(json)) {
        throw new Error('LOGIN_EXPIRED');
      }
      if (isPostMissingApiResponse(json)) {
        return null;
      }
      throw new Error(json.message || json.msg || 'GET_POST_DETAIL_FAILED');
    }

    if (json.data?.topic) {
      const topic = json.data.topic;
      const article = topic.article;
      
      // 调试：打印 topic.board 的完整结构
      console.log('[getPostDetail] topic.board 完整结构:', JSON.stringify(topic.board, null, 2));
      console.log('[getPostDetail] topic.boardId:', topic.boardId);
      console.log('[getPostDetail] _board (传入参数):', _board);
      
      // 提取头像，优先使用 k3sUrl/ks3Url（云存储）
      let avatar = article?.account?.k3sUrl || article?.account?.ks3Url ||
                   article?.user?.k3sUrl || article?.user?.ks3Url ||
                   article?.account?.avatarUrl || article?.user?.avatarUrl || '';
      if (avatar && avatar.startsWith('http:')) {
        avatar = avatar.replace('http:', 'https:');
      }
      
      const boardNameForFetch = topic.board?.name || _board;

      // 检查是否有任何附件的 k3sUrl 和 ks3Url 都为空
      const rawAttachments = (article?.attachments || []).filter((att: any) => att != null);
      const hasEmptyCloudUrl = rawAttachments.some((att: any) => !att.k3sUrl && !att.ks3Url);
      
      // 如果有附件缺少云存储URL，先获取静态URL备用
      let staticUrls: string[] = [];
      if (hasEmptyCloudUrl && rawAttachments.length > 0) {
        const topicTitle = topic.subject?.trim() || '';
        
        const cachedStaticUrls = await getStaticAttachmentUrlsFromCache(topicId);
        if (cachedStaticUrls && cachedStaticUrls.length > 0) {
          staticUrls = cachedStaticUrls;
          console.log('[PostDetail] 使用静态附件URL缓存，数量:', staticUrls.length);
        }

        // 优先使用列表页传入的M站短ID，再读持久缓存
        let mSitePostId = initialMSitePostId || await getMSitePostIdFromCache(topicId);
        if (initialMSitePostId) {
          console.log('[PostDetail] 使用M站短ID:', initialMSitePostId, '(从列表传入)');
          await saveMSitePostIdToCache(topicId, initialMSitePostId);
        } else if (mSitePostId) {
          console.log('[PostDetail] 使用M站短ID:', mSitePostId, '(从缓存获取)');
        } else if (boardNameForFetch && topicTitle) {
          // 缓存没有则通过网络查找
          mSitePostId = await getMSitePostIdForTopic({
            attachments: rawAttachments,
            boardName: boardNameForFetch,
            topicTitle: topicTitle,
            logTag: 'PostDetail',
            topicId: topicId,
            maxSearchPages: 3,
          });
        }
        
        if (mSitePostId && staticUrls.length === 0) {
          if (!await getMSitePostIdFromCache(topicId)) {
            console.log('[PostDetail] 使用M站短ID:', mSitePostId, '(新查找)');
          }
          try {
            staticUrls = await fetchStaticAttachmentUrls(boardNameForFetch, mSitePostId);
            console.log('[PostDetail] 获取到静态URL数量:', staticUrls.length);
            await saveStaticAttachmentUrlsToCache(topicId, staticUrls);
          } catch (err: any) {
            console.log('[PostDetail] 获取静态URL失败:', err.message || err);
          }
        }
      }

      // 处理附件列表
      let staticUrlIndex = 0;
      const finalAttachments = rawAttachments.map((att: any) => {
        // 如果有云存储URL，优先使用
        if (att.k3sUrl || att.ks3Url) {
          let url = att.k3sUrl || att.ks3Url || '';
          if (url && url.startsWith('http:')) {
            url = url.replace('http:', 'https:');
          }
          console.log('📎 帖子详情附件(云存储):', { k3sUrl: att.k3sUrl, ks3Url: att.ks3Url, finalUrl: url });
          return { ...att, url };
        }
        
        // 云存储URL为空，尝试使用静态URL
        if (staticUrls.length > staticUrlIndex) {
          const staticUrl = staticUrls[staticUrlIndex++];
          console.log('📎 帖子详情附件(静态URL):', { originalUrl: att.url, staticUrl });
          return { ...att, url: staticUrl, k3sUrl: staticUrl }; // 同时设置k3sUrl
        }
        
        // 都没有，使用原始URL作为fallback
        let url = att.cdnUrl || att.url || '';
        console.log('📎 帖子详情附件(原始URL):', {
          cdnUrl: att.cdnUrl,
          url: att.url,
          finalUrl: url
        });
        
        if (url && url.startsWith('http:')) {
          url = url.replace('http:', 'https:');
        }
        
        if (url && !url.startsWith('http')) {
          url = `https://file.mysmth.net/${url}`;
        } else if (!url && att.id) {
          // 如果没有 url 但有 id，尝试构建下载链接
          url = `https://wap.newsmth.net/wap/api/attachment/download/${att.id}`;
        }
        
        return { ...att, url };
      });

      const post: any = {
        id: topic.id,
        articleId: article?.id, // 文章ID，用于删除等操作
        board: boardNameForFetch,
        boardId: topic.boardId, // 版面hash ID，用于API请求
        boardName: topic.board?.title || '未知版面',
        title: topic.subject?.trim(),
        content: article?.body || '', // 包含 HTML
        author: article?.account?.name || article?.user?.name || '',
        nick: article?.account?.nick || article?.user?.nick || '',
        levelTitle: article?.account?.levelTitle || article?.user?.levelTitle || '',
        avatar: avatar,
        city: article?.city || '',
        postTime: new Date(article?.postTime || Date.now()).toISOString(),
        replyCount: Math.max(0, (topic.availables || 0) - 1),
        attachments: finalAttachments,
        likes: (article?.likes || [])
          .filter((like: any) => like != null)
          .map((like: any) => {
          let likeAvatar = like.account?.k3sUrl || like.account?.ks3Url ||
                          like.user?.k3sUrl || like.user?.ks3Url ||
                          like.account?.avatarUrl || like.user?.avatarUrl || '';
          if (likeAvatar && likeAvatar.startsWith('http:')) {
            likeAvatar = likeAvatar.replace('http:', 'https:');
          }
          return {
            id: like.id,
            author: like.account?.name || like.user?.name || '',
            nick: like.account?.nick || like.user?.nick || '',
            levelTitle: like.account?.levelTitle || like.user?.levelTitle || '',
            avatar: likeAvatar,
            body: like.body || '',
            postTime: new Date(like.postTime || Date.now()).toISOString(),
            score: like.score || 0,
          };
        }),
        replies: [], // 详情接口目前只返回了主贴，回复可能需要另一个接口
      };

      // 处理内容中的 HTML（如果需要纯文本）
      if (post.content) {
        post.contentText = post.content
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
          .replace(/<p[^>]*>/gi, '')
          .replace(/<\/p>/gi, '\n')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<div[^>]*>/gi, '')
          .replace(/<\/div>/gi, '\n')
          .replace(/<[^>]*>/g, '') // 移除所有 HTML 标签
          .replace(/\n\s*\n/g, '\n') // 移除多余空行
          .trim();
        
        // 如果处理后内容为空（例如全是空标签），则设为 null 以触发 fallback
        if (post.contentText.length === 0 || post.contentText === '<p></p>') {
          post.contentText = undefined;
        }
      }

      console.log('getPostDetail success:', post.title, 'by', post.author);
      return post;
    }

    console.error('getPostDetail API missing topic payload:', json);
    throw new Error('GET_POST_DETAIL_EMPTY');
  } catch (error: any) {
    console.error('Get post detail error:', error);
    if (
      error.message === 'LOGIN_EXPIRED' ||
      error.message === 'NOT_LOGGED_IN' ||
      error.message?.includes('HTTP 401') ||
      error.message?.includes('HTTP 403')
    ) {
      throw new Error('LOGIN_EXPIRED');
    }
    throw error;
  }
};

/**
 * 获取主题回复列表（分页）。
 * 失败时会抛错，登录态失效时抛 LOGIN_EXPIRED；无回复返回空数组。
 * API: https://wap.newsmth.net/wap/api/topic/loadArticlesByMode/:topicId/:mode/:page/:pageSize
 */
export const getTopicReplies = async (
  topicId: string,
  page: number = 1,
  pageSize: number = 20,
  mode: number = 1, // 1 为全部回复
): Promise<{replies: any[], totalItems: number, totalPages: number, currentPage: number, pageSize: number, start: number}> => {
  try {
    const cookies = await getCookies();
    const timestamp = Date.now();
    const url = `${WAP_BASE_URL}/wap/api/topic/loadArticlesByMode/${topicId}/${mode}/${page}/${pageSize}?t=${timestamp}`;
    
    console.log('Fetching Topic Replies from API:', url);
    
    const headers = buildGetHeaders(cookies);

    const response = await fetchWithRetry(url, {
      headers,
      credentials: 'include',
    });

    const json = await response.json();
    console.log('getTopicReplies API response code:', json.code);

    if (json.code !== 1) {
      console.error('getTopicReplies API returned failure, code:', json.code, 'message:', json.message);
      if (isLoginExpiredApiResponse(json)) {
        throw new Error('LOGIN_EXPIRED');
      }
      throw new Error(json.message || json.msg || 'GET_TOPIC_REPLIES_FAILED');
    }

    {
      const data = json.data || {};
      const articles = data.articles || [];
      const pager = data.pager || {};
      const currentPage = pager.currentPage || page;
      const resolvedPageSize = pager.pageSize || pageSize;
      const start = pager.start ?? ((currentPage - 1) * resolvedPageSize);
      const totalItems = pager.totalItems || 0;
      const replies: any[] = articles.map((article: any) => {
        // 提取头像，优先使用 k3sUrl/ks3Url（云存储）
        let avatar = article.account?.k3sUrl || article.account?.ks3Url ||
                     article.user?.k3sUrl || article.user?.ks3Url ||
                     article.account?.avatarUrl || article.user?.avatarUrl || '';
        if (avatar && avatar.startsWith('http:')) {
          avatar = avatar.replace('http:', 'https:');
        }

        // 处理回复内容
        let content = article.body || '';
        let contentText = content
          .replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/<p[^>]*>/gi, '')
          .replace(/<\/p>/gi, '\n')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<div[^>]*>/gi, '')
          .replace(/<\/div>/gi, '\n')
          .replace(/<[^>]*>/g, '')
          .trim();

        return {
          id: article.id,
          author: article.account?.name || article.user?.name || '',
          nickname: article.account?.nick || article.user?.nick || '',
          levelTitle: article.account?.levelTitle || article.user?.levelTitle || '',
          avatar: avatar,
          city: article.city || '',
          content: contentText,
          postTime: new Date(article.postTime || Date.now()).toISOString(),
          topicOrder: article.topicOrder,
          replyId: article.replyId, // 所回复的文章 id（父节点），用于按引用树排序
          status: article.status, // 回复状态，0为正常
          attachments: (article.attachments || [])
            .filter((att: any) => att != null) // 过滤掉 null 和 undefined
            .map((att: any) => {
            // 优先使用 k3sUrl/ks3Url，然后是 cdnUrl，最后是 url
            let url = att.k3sUrl || att.ks3Url || att.cdnUrl || att.url || '';

            console.log('📎 回复附件:', {
              k3sUrl: att.k3sUrl,
              ks3Url: att.ks3Url,
              cdnUrl: att.cdnUrl,
              url: att.url,
              finalUrl: url
            });

            if (url && url.startsWith('http:')) {
              url = url.replace('http:', 'https:');
            }
            if (url && !url.startsWith('http')) {
              url = `https://file.mysmth.net/${url}`;
            }
            return { ...att, url };
          }),
        };
      });

      return {
        replies,
        totalItems,
        totalPages: pager.totalPages || 1,
        currentPage,
        pageSize: resolvedPageSize,
        start,
      };
    }
  } catch (error: any) {
    console.error('Get topic replies error:', error);
    if (
      error.message === 'LOGIN_EXPIRED' ||
      error.message === 'NOT_LOGGED_IN' ||
      error.message?.includes('HTTP 401') ||
      error.message?.includes('HTTP 403')
    ) {
      throw new Error('LOGIN_EXPIRED');
    }
    throw error;
  }
};

// 获取用户信息
export const fetchUserInfo = async (username: string): Promise<any> => {
  try {
    const cookies = await getCookies();
    const timestamp = Date.now();
    const url = `${WAP_BASE_URL}/wap/api/account/${username}/mixlogs?t=${timestamp}&page=1`;
    
    console.log('Fetching user info from API:', url);
    
    const headers = buildGetHeaders(cookies);

    const response = await fetchWithRetry(url, {
      headers,
      credentials: 'include',
    });

    const text = await response.text();
    
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.error('fetchUserInfo JSON parse error:', e);
      return null;
    }
    
    console.log('fetchUserInfo raw response:', json);

    if (json.code === 1 && json.data && json.data.account) {
      const account = json.data.account;
      const content = json.data.content || [];
      
      console.log('fetchUserInfo content count:', content.length);
      
      // 调试：打印头像相关字段
      console.log('fetchUserInfo avatar fields:', {
        avatarUrl: account.avatarUrl,
        avatar: account.avatar,
        ks3Url: account.ks3Url,
        k3sUrl: account.k3sUrl,
      });
      
      // 优先使用 k3sUrl/ks3Url（云存储），其次使用 avatarUrl，最后使用 avatar 字段
      let avatar = account.k3sUrl || account.ks3Url || account.avatarUrl || '';
      
      // 如果上述字段都没有，尝试使用 avatar 字段
      if (!avatar && account.avatar) {
        // avatar 字段通常是相对路径，需要拼接完整URL
        if (account.avatar.startsWith('http')) {
          avatar = account.avatar;
        } else {
          avatar = `https://file.mysmth.net/${account.avatar}`;
        }
      }
      
      // 确保使用 HTTPS
      if (avatar && avatar.startsWith('http:')) {
        avatar = avatar.replace('http:', 'https:');
      }
      
      console.log('fetchUserInfo final avatar URL:', avatar);
      
      const userInfo = {
        id: account.id,
        username: account.name || username,
        nickname: account.nick,
        avatar: avatar,
        gender: account.gender,
        level: account.level,
        levelTitle: account.levelTitle,
        title: account.title || '',
        score: account.score,
        postCount: account.articleCount,
        loginTime: account.loginTime,
        createTime: account.createTime,
        fansCount: account.fansCount,
        friendCount: account.friendCount,
        isFollowing: account.isFriend, // 是否已关注
        isBlack: account.isBlack, // 是否已拉黑
        isFans: account.isFans, // 是否为粉丝
        suicide: account.suicide, // 是否已注销
        recentPosts: content.slice(0, 10).map((item: any) => ({
          id: item.id,
          subject: item.subject,
          body: item.body,
          boardName: item.board?.name,
          boardTitle: item.board?.title,
          postTime: item.postTime,
          replyCount: item.topic?.availables || 0,
          topicId: item.topicId,
          boardId: item.boardId,
        })),
      };
      
      console.log('fetchUserInfo parsed user:', userInfo.username, 'posts:', userInfo.recentPosts.length);
      return userInfo;
    }
    
    console.log('fetchUserInfo: API returned failure, code:', json.code, 'message:', json.message);
    return null;
  } catch (error) {
    console.error('Fetch user info error:', error);
    return null;
  }
};

// 搜索版面
export const searchBoards = async (keyword: string): Promise<any[]> => {
  try {
    const response = await requestWithCookies(`/search/board?q=${encodeURIComponent(keyword)}`);
    await response.text();
    
    // TODO: 解析HTML提取版面信息
    
    return [];
  } catch (error) {
    console.error('Search boards error:', error);
    return [];
  }
};

// 获取对话详情（对话中的所有消息）
// API: GET https://wap.newsmth.net/wap/api/message/conversation/{conversationId}?t={timestamp}
// 获取会话消息
// API: GET https://wap.newsmth.net/wap/api/message/{speakerId}/messages/{page}
// 参数说明：
// - speakerId: 对话用户ID
// - page: 页码（从1开始）
export const getConversationMessages = async (
  speakerId: string,
  page: number = 1
): Promise<{
  messages: any[];
  speaker: any;
  account: any;
  hasMore: boolean;
  total: number;
}> => {
  try {
    const cookies = await getCookies();
    
    // 严格校验登录态：必须有Cookie才能调用
    if (!cookies) {
      console.error('getConversationMessages: 未登录，无Cookie');
      throw new Error('NOT_LOGGED_IN');
    }
    
    const url = `${WAP_BASE_URL}/wap/api/message/${speakerId}/messages/${page}`;
    
    console.log('Fetching conversation messages from API:', url);
    
    const headers = buildGetHeaders(cookies, `https://wap.newsmth.net/conversation/${speakerId}`);

    const response = await fetchWithRetry(url, {
      headers,
      credentials: 'include',
    }, DEFAULT_TIMEOUT);
    
    // 检查HTTP状态码
    if (response.status === 401 || response.status === 403) {
      console.error('getConversationMessages: Cookie已过期或无权限，状态码:', response.status);
      // 注意：不在这里清除登录态，让上层UI决定如何处理
      // 登录态只在用户主动退出登录时才清除
      throw new Error('LOGIN_EXPIRED');
    }

    const json = await response.json();
    console.log('getConversationMessages API response code:', json.code);
    
    // 检查API返回码
    if (json.code !== 1) {
      console.error('getConversationMessages: API返回错误，code:', json.code, 'message:', json.message);
      if (json.code === 401 || json.code === 403 || json.message?.includes('登录')) {
        // 注意：不在这里清除登录态，让上层UI决定如何处理
        throw new Error('LOGIN_EXPIRED');
      }
      throw new Error(json.message || 'API_ERROR');
    }

    if (json.data) {
      const messages = json.data.messages || [];
      const speaker = json.data.speaker || {};
      const account = json.data.account || {};
      const pager = json.data.pager || {};
      
      // 当前用户ID
      const currentUserId = account.id;
      
      // 处理头像URL
      const processAvatar = (avatarUrl: string | undefined): string => {
        if (!avatarUrl) return '';
        if (avatarUrl.startsWith('http:')) {
          return avatarUrl.replace('http:', 'https:');
        }
        return avatarUrl;
      };
      
      const processedMessages = messages.map((msg: any) => {
        // 判断是发送方还是接收方
        const isSender = msg.senderId === currentUserId;
        // 获取对方的信息（speaker是对话的对方）
        const senderInfo = isSender ? account : speaker;
        
        return {
          id: msg.id,
          senderId: msg.senderId,
          recipientId: msg.recipientId,
          senderName: senderInfo.name || '',
          senderNick: senderInfo.nick || senderInfo.name || '',
          senderAvatar: processAvatar(senderInfo.avatarUrl || senderInfo.k3sUrl),
          subject: msg.subject || '',
          body: msg.body || '',
          sendTime: msg.sendTime || Date.now(),
          status: msg.status,
          isMe: isSender,
        };
      });
      
      // 计算是否还有更多
      const total = pager.total || 0;
      const pageSize = pager.size || 20;
      const currentPage = pager.page || page;
      const hasMore = currentPage * pageSize < total;
      
      return {
        messages: processedMessages,
        speaker: {
          id: speaker.id,
          name: speaker.name,
          nick: speaker.nick || speaker.name,
          avatar: processAvatar(speaker.avatarUrl || speaker.k3sUrl),
          levelTitle: speaker.levelTitle,
        },
        account: {
          id: account.id,
          name: account.name,
          nick: account.nick || account.name,
          avatar: processAvatar(account.avatarUrl || account.k3sUrl),
        },
        hasMore,
        total,
      };
    }
    
    return {
      messages: [],
      speaker: {},
      account: {},
      hasMore: false,
      total: 0,
    };
  } catch (error: any) {
    console.error('Get conversation messages error:', error);
    // 登录相关错误需要抛出，让调用方处理
    if (error.message === 'NOT_LOGGED_IN' || error.message === 'LOGIN_EXPIRED') {
      throw error;
    }
    // 其他错误返回空数据
    return {
      messages: [],
      speaker: {},
      account: {},
      hasMore: false,
      total: 0,
    };
  }
};

// 标记消息已读
// API: GET https://wap.newsmth.net/wap/api/message/read?t={timestamp}&speakId={speakerId}
export const markMessageAsRead = async (speakerId: string): Promise<{success: boolean, message?: string}> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      console.error('markMessageAsRead: 未登录，无Cookie');
      return {success: false, message: '请先登录'};
    }
    
    const timestamp = Date.now();
    const url = `${WAP_BASE_URL}/wap/api/message/read?t=${timestamp}&speakId=${speakerId}`;
    
    console.log('Marking message as read:', url);
    
    const headers = buildGetHeaders(cookies, `https://wap.newsmth.net/conversation/${speakerId}`);

    const response = await fetchWithRetry(url, {
      headers,
      credentials: 'include',
    }, DEFAULT_TIMEOUT);
    
    if (response.status === 401 || response.status === 403) {
      console.error('markMessageAsRead: Cookie已过期或无权限');
      // 注意：不在这里清除登录态，让上层UI决定如何处理
      // 登录态只在用户主动退出登录时才清除
      throw new Error('LOGIN_EXPIRED');
    }

    const json = await response.json();
    console.log('markMessageAsRead API response:', json);
    
    if (json.code === 1) {
      return {success: true, message: json.message || '标记成功'};
    }
    
    return {success: false, message: json.message || '标记失败'};
  } catch (error: any) {
    console.error('Mark message as read error:', error);
    if (error.message === 'LOGIN_EXPIRED') {
      throw error;
    }
    return {success: false, message: '标记失败'};
  }
};

// 发送站内消息
// API: POST https://wap.newsmth.net/wap/api/message/send
// Body: body={content}&recipientName={username}&subject={subject}&t={timestamp}
export const sendMessage = async (
  recipientName: string,
  body: string,
  subject: string = ''
): Promise<{success: boolean, message?: string}> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      console.error('sendMessage: 未登录，无Cookie');
      return {success: false, message: '请先登录'};
    }
    
    const timestamp = Date.now();
    const url = `${WAP_BASE_URL}/wap/api/message/send`;
    
    // 构造表单数据
    const formData = new URLSearchParams();
    formData.append('body', body);
    formData.append('recipientName', recipientName);
    formData.append('subject', subject);
    formData.append('t', timestamp.toString());
    
    console.log('Sending message:', {recipientName, body, subject});
    
    const headers = buildPostHeaders(
      cookies,
      'application/x-www-form-urlencoded',
      `https://wap.newsmth.net/conversation/${recipientName}`
    );

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: formData.toString(),
      credentials: 'include',
    }, DEFAULT_TIMEOUT);
    
    if (response.status === 401 || response.status === 403) {
      console.error('sendMessage: Cookie已过期或无权限');
      // 注意：不在这里清除登录态，让上层UI决定如何处理
      // 登录态只在用户主动退出登录时才清除
      throw new Error('LOGIN_EXPIRED');
    }

    const json = await response.json();
    console.log('sendMessage API response:', json);
    
    if (json.code === 1) {
      return {success: true, message: json.message || '发送成功'};
    }
    
    return {success: false, message: json.message || '发送失败'};
  } catch (error: any) {
    console.error('Send message error:', error);
    if (error.message === 'LOGIN_EXPIRED') {
      throw error;
    }
    return {success: false, message: '发送失败'};
  }
};

// 关注用户（添加好友）
// API: POST https://wap.newsmth.net/wap/api/profile/add/friend/{userId}
// 响应: {"code":1,"kbsCode":0,"message":"操作成功"}
export const addFriend = async (
  userId: string
): Promise<{success: boolean, message?: string}> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      console.error('addFriend: 未登录，无Cookie');
      return {success: false, message: '请先登录'};
    }
    
    const url = `${WAP_BASE_URL}/wap/api/profile/add/friend/${userId}`;
    
    console.log('Adding friend:', userId);
    
    const headers = buildPostHeaders(
      cookies,
      'application/x-www-form-urlencoded',
      `https://wap.newsmth.net/account/${userId}`
    );

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: '',
      credentials: 'include',
    }, DEFAULT_TIMEOUT);
    
    if (response.status === 401 || response.status === 403) {
      console.error('addFriend: Cookie已过期或无权限');
      // 注意：不在这里清除登录态，让上层UI决定如何处理
      // 登录态只在用户主动退出登录时才清除
      throw new Error('LOGIN_EXPIRED');
    }

    const json = await response.json();
    console.log('addFriend API response:', json);
    
    // 检查 code 和 kbsCode
    if (json.code === 1 && (json.kbsCode === 0 || json.kbsCode === undefined)) {
      return {success: true, message: json.message || '关注成功'};
    }
    
    return {success: false, message: json.message || '关注失败'};
  } catch (error: any) {
    console.error('Add friend error:', error);
    if (error.message === 'LOGIN_EXPIRED') {
      throw error;
    }
    return {success: false, message: '关注失败'};
  }
};

// 取消关注用户
// API: DELETE https://wap.newsmth.net/wap/api/profile/remove/friend/{userId}
// 响应: {"code":1,"kbsCode":0,"message":"操作成功"}
export const removeFriend = async (
  userId: string
): Promise<{success: boolean, message?: string}> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      console.error('removeFriend: 未登录，无Cookie');
      return {success: false, message: '请先登录'};
    }
    
    const url = `${WAP_BASE_URL}/wap/api/profile/remove/friend/${userId}`;
    
    console.log('Removing friend:', userId);
    
    const headers = buildDeleteHeaders(
      cookies,
      `https://wap.newsmth.net/account/${userId}`
    );

    const response = await fetchWithRetry(url, {
      method: 'DELETE',
      headers,
      body: '',
      credentials: 'include',
    }, DEFAULT_TIMEOUT);
    
    if (response.status === 401 || response.status === 403) {
      console.error('removeFriend: Cookie已过期或无权限');
      // 注意：不在这里清除登录态，让上层UI决定如何处理
      // 登录态只在用户主动退出登录时才清除
      throw new Error('LOGIN_EXPIRED');
    }

    const json = await response.json();
    console.log('removeFriend API response:', json);
    
    // 检查 code 和 kbsCode
    if (json.code === 1 && (json.kbsCode === 0 || json.kbsCode === undefined)) {
      return {success: true, message: json.message || '取消关注成功'};
    }
    
    return {success: false, message: json.message || '取消关注失败'};
  } catch (error: any) {
    console.error('Remove friend error:', error);
    if (error.message === 'LOGIN_EXPIRED') {
      throw error;
    }
    return {success: false, message: '取消关注失败'};
  }
};

// 检查是否被对方拉黑
// API: POST https://wap.newsmth.net/wap/api/black/isherblack
// Body: accountid={userId}&t={timestamp}
// 响应: {"code":1,"data":false,"kbsCode":0,"message":"操作成功"}
// data为true表示被对方拉黑，false表示未被拉黑
export const checkIsHerBlack = async (
  userId: string
): Promise<{success: boolean, isBlack: boolean, message?: string}> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      console.error('checkIsHerBlack: 未登录，无Cookie');
      return {success: false, isBlack: false, message: '请先登录'};
    }
    
    const timestamp = Date.now();
    const url = `${WAP_BASE_URL}/wap/api/black/isherblack`;
    
    // 构造表单数据
    const formData = new URLSearchParams();
    formData.append('accountid', userId);
    formData.append('t', timestamp.toString());
    
    console.log('Checking if blocked by user:', userId);
    
    const headers = buildPostHeaders(
      cookies,
      'application/x-www-form-urlencoded',
      `https://wap.newsmth.net/account/${userId}`
    );

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: formData.toString(),
      credentials: 'include',
    }, DEFAULT_TIMEOUT);
    
    if (response.status === 401 || response.status === 403) {
      console.error('checkIsHerBlack: Cookie已过期或无权限');
      // 注意：不在这里清除登录态，让上层UI决定如何处理
      // 登录态只在用户主动退出登录时才清除
      throw new Error('LOGIN_EXPIRED');
    }

    const json = await response.json();
    console.log('checkIsHerBlack API response:', json);
    
    // 检查 code 和 kbsCode
    if (json.code === 1 && (json.kbsCode === 0 || json.kbsCode === undefined)) {
      const isBlack = json.data === true;
      return {
        success: true, 
        isBlack, 
        message: json.message || (isBlack ? '对方已将您拉黑' : '未被拉黑')
      };
    }
    
    return {success: false, isBlack: false, message: json.message || '检查失败'};
  } catch (error: any) {
    console.error('Check is her black error:', error);
    if (error.message === 'LOGIN_EXPIRED') {
      throw error;
    }
    return {success: false, isBlack: false, message: '检查失败'};
  }
};

// 拉黑用户
// API: POST https://wap.newsmth.net/wap/api/black/addblack
// 请求参数: accountid={userId}&t={timestamp}
// 响应: {"code":1,"data":true,"kbsCode":0,"message":"操作成功"}
export const addBlack = async (
  userId: string
): Promise<{success: boolean, message?: string}> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      console.error('addBlack: 未登录，无Cookie');
      return {success: false, message: '请先登录'};
    }
    
    const timestamp = Date.now();
    const url = `${WAP_BASE_URL}/wap/api/black/addblack`;
    
    // 构造表单数据
    const formData = new URLSearchParams();
    formData.append('accountid', userId);
    formData.append('t', timestamp.toString());
    
    console.log('Adding user to blacklist:', userId);
    
    const headers = buildPostHeaders(
      cookies,
      'application/x-www-form-urlencoded',
      `https://wap.newsmth.net/account/${userId}`
    );

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: formData.toString(),
      credentials: 'include',
    }, DEFAULT_TIMEOUT);
    
    if (response.status === 401 || response.status === 403) {
      console.error('addBlack: Cookie已过期或无权限');
      // 注意：不在这里清除登录态，让上层UI决定如何处理
      // 登录态只在用户主动退出登录时才清除
      throw new Error('LOGIN_EXPIRED');
    }

    const json = await response.json();
    console.log('addBlack API response:', json);
    
    // 检查 code 和 kbsCode
    if (json.code === 1 && (json.kbsCode === 0 || json.kbsCode === undefined)) {
      return {success: true, message: json.message || '拉黑成功'};
    }
    
    return {success: false, message: json.message || '拉黑失败'};
  } catch (error: any) {
    console.error('Add black error:', error);
    if (error.message === 'LOGIN_EXPIRED') {
      throw error;
    }
    return {success: false, message: '拉黑失败'};
  }
};

// 从黑名单中移除用户
// API: DELETE https://wap.newsmth.net/wap/api/black/delblack?accountid={userId}
// 响应: {"code":1,"data":true,"kbsCode":0,"message":"操作成功"}
export const removeBlack = async (
  userId: string
): Promise<{success: boolean, message?: string}> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      console.error('removeBlack: 未登录，无Cookie');
      return {success: false, message: '请先登录'};
    }
    
    const url = `${WAP_BASE_URL}/wap/api/black/delblack?accountid=${userId}`;
    
    console.log('Removing user from blacklist:', userId);
    
    const headers = buildDeleteHeaders(
      cookies,
      `https://wap.newsmth.net/account/${userId}`
    );

    const response = await fetchWithRetry(url, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    }, DEFAULT_TIMEOUT);
    
    if (response.status === 401 || response.status === 403) {
      console.error('removeBlack: Cookie已过期或无权限');
      // 注意：不在这里清除登录态，让上层UI决定如何处理
      // 登录态只在用户主动退出登录时才清除
      throw new Error('LOGIN_EXPIRED');
    }

    const json = await response.json();
    console.log('removeBlack API response:', json);
    
    // 检查 code 和 kbsCode
    if (json.code === 1 && (json.kbsCode === 0 || json.kbsCode === undefined)) {
      return {success: true, message: json.message || '移除成功'};
    }
    
    return {success: false, message: json.message || '移除失败'};
  } catch (error: any) {
    console.error('Remove black error:', error);
    if (error.message === 'LOGIN_EXPIRED') {
      throw error;
    }
    return {success: false, message: '移除失败'};
  }
};

// 获取关注用户列表
// API: GET https://wap.newsmth.net/wap/api/account/friends/{username}
// 响应: {"code":1,"data":{"pager":{...},"account":{...},"friends":[...]}},"kbsCode":0,"message":"操作成功"}
export const getFriendsList = async (
  username: string,
  page: number = 1,
  forceRefresh: boolean = false
): Promise<{
  success: boolean;
  friends: any[];
  total: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
  message?: string;
}> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      console.error('getFriendsList: 未登录，无Cookie');
      return {success: false, friends: [], total: 0, hasMore: false, page, pageSize: 50, message: '请先登录'};
    }
    
    const cacheKey = `${username}_${page}`;
    
    // 如果不是强制刷新，先尝试从缓存获取
    if (!forceRefresh) {
      const cachedData = getCacheWithTimestamp<{friends: any[], total: number, hasMore: boolean, page: number, pageSize: number}>('friendsList', cacheKey);
      if (cachedData) {
        const age = Date.now() - cachedData.timestamp;
        console.log('getFriendsList: Using cached data for', username, 'page', page, 'age:', Math.floor(age / 1000), 's');
        
        if (age > CACHE_REFRESH_THRESHOLD && age < MAX_STALE_CACHE_AGE) {
          runOnce(`friendsList:${cacheKey}`, () => fetchFriendsListFromAPI(username, page, cookies, cacheKey)).catch(err => {
            console.error('Background update friends list error:', err);
          });
        }
        
        if (age < MAX_STALE_CACHE_AGE) {
          return {
            success: true,
            friends: cachedData.data.friends,
            total: cachedData.data.total,
            hasMore: cachedData.data.hasMore,
            page: cachedData.data.page,
            pageSize: cachedData.data.pageSize,
            message: '获取成功'
          };
        }
      }
    }
    
    // 没有缓存或强制刷新，从API获取
    return await runOnce(`friendsList:${cacheKey}`, () => fetchFriendsListFromAPI(username, page, cookies, cacheKey));
  } catch (error: any) {
    console.error('Get friends list error:', error);
    if (error.message === 'LOGIN_EXPIRED') {
      throw error;
    }
    return {success: false, friends: [], total: 0, hasMore: false, page, pageSize: 50, message: '获取失败'};
  }
};
// 从API获取关注列表的内部函数
const fetchFriendsListFromAPI = async (
  username: string,
  page: number,
  cookies: string,
  cacheKey: string
): Promise<{
  success: boolean;
  friends: any[];
  total: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
  message?: string;
}> => {
  const url = `${WAP_BASE_URL}/wap/api/account/friends/${username}?page=${page}`;
  
  console.log('Fetching friends list from API:', username, 'page', page);
  
  const headers = buildGetHeaders(cookies);

  const response = await fetchWithRetry(url, {
    method: 'GET',
    headers,
    credentials: 'include',
  }, DEFAULT_TIMEOUT);
  
  if (response.status === 401 || response.status === 403) {
    console.error('getFriendsList: Cookie已过期或无权限');
    // 注意：不在这里清除登录态，让上层UI决定如何处理
    throw new Error('LOGIN_EXPIRED');
  }

  const json = await response.json();
  console.log('getFriendsList API response:', json);
  
  // 检查 code 和 kbsCode
  if (json.code === 1 && (json.kbsCode === 0 || json.kbsCode === undefined)) {
    const friendsList: any[] = [];
    
    // 解析分页信息
    const pager = json.data?.pager || {};
    const totalPages = pager.total || 0; // 总页数
    const pageSize = pager.size || 50;
    const currentPage = pager.page || page;
    
    // 判断是否还有更多：当前页 < 总页数
    const hasMore = currentPage < totalPages;
    
    // 提取所有关注用户信息
    if (json.data?.friends && Array.isArray(json.data.friends)) {
      json.data.friends.forEach((item: any) => {
        if (item.friend) {
          friendsList.push({
            id: item.friend.id,
            username: item.friend.name,
            nickname: item.friend.nick,
            avatar: item.friend.avatarUrl,
            level: item.friend.level,
            levelTitle: item.friend.levelTitle,
            score: item.friend.score,
          });
        }
      });
    }
    
    console.log('getFriendsList: Found', friendsList.length, 'friends, totalPages:', totalPages, 'hasMore:', hasMore);
    
    // 保存到缓存
    const cacheData = {friends: friendsList, total: totalPages, hasMore, page: currentPage, pageSize};
    setCache('friendsList', cacheKey, cacheData);
    
    return {
      success: true,
      friends: friendsList,
      total: totalPages,
      hasMore,
      page: currentPage,
      pageSize,
      message: json.message || '获取成功'
    };
  }
  
  return {success: false, friends: [], total: 0, hasMore: false, page, pageSize: 50, message: json.message || '获取失败'};
};

// 获取粉丝列表
// API: GET https://wap.newsmth.net/wap/api/account/fans/{username}
// 响应格式: {"code":1,"data":{"pager":{"total":1,"size":50,"page":1,"items":0},"account":{...},"fans":[...]},"kbsCode":0,"message":"操作成功"}
export const getFansList = async (
  username: string,
  page: number = 1,
  forceRefresh: boolean = false
): Promise<{
  success: boolean;
  fans: any[];
  total: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
  message?: string;
}> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      console.error('getFansList: 未登录，无Cookie');
      return {success: false, fans: [], total: 0, hasMore: false, page, pageSize: 50, message: '请先登录'};
    }
    
    const cacheKey = `${username}_${page}`;
    
    // 如果不是强制刷新，先尝试从缓存获取
    if (!forceRefresh) {
      const cachedData = getCacheWithTimestamp<{fans: any[], total: number, hasMore: boolean, page: number, pageSize: number}>('fansList', cacheKey);
      if (cachedData) {
        const age = Date.now() - cachedData.timestamp;
        console.log('getFansList: Using cached data for', username, 'page', page, 'age:', Math.floor(age / 1000), 's');
        
        if (age > CACHE_REFRESH_THRESHOLD && age < MAX_STALE_CACHE_AGE) {
          runOnce(`fansList:${cacheKey}`, () => fetchFansListFromAPI(username, page, cookies, cacheKey)).catch(err => {
            console.error('Background update fans list error:', err);
          });
        }
        
        if (age < MAX_STALE_CACHE_AGE) {
          return {
            success: true,
            fans: cachedData.data.fans,
            total: cachedData.data.total,
            hasMore: cachedData.data.hasMore,
            page: cachedData.data.page,
            pageSize: cachedData.data.pageSize,
            message: '获取成功'
          };
        }
      }
    }
    
    // 没有缓存或强制刷新，从API获取
    return await runOnce(`fansList:${cacheKey}`, () => fetchFansListFromAPI(username, page, cookies, cacheKey));
  } catch (error: any) {
    console.error('Get fans list error:', error);
    if (error.message === 'LOGIN_EXPIRED') {
      throw error;
    }
    return {success: false, fans: [], total: 0, hasMore: false, page, pageSize: 50, message: '获取失败'};
  }
};

// 从API获取粉丝列表的辅助函数
const fetchFansListFromAPI = async (
  username: string,
  page: number,
  cookies: string,
  cacheKey: string
): Promise<{
  success: boolean;
  fans: any[];
  total: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
  message?: string;
}> => {
  const url = `${WAP_BASE_URL}/wap/api/account/fans/${username}?page=${page}`;
  
  console.log('Fetching fans list from API:', username, 'page', page);
  
  const headers = buildGetHeaders(cookies, `https://wap.newsmth.net/relation/1`);

  const response = await fetchWithRetry(url, {
    method: 'GET',
    headers,
    credentials: 'include',
  }, DEFAULT_TIMEOUT);
  
  if (response.status === 401 || response.status === 403) {
    console.error('getFansList: Cookie已过期或无权限');
    // 注意：不在这里清除登录态，让上层UI决定如何处理
    throw new Error('LOGIN_EXPIRED');
  }

  const json = await response.json();
  console.log('getFansList API response:', json);
  
  // 检查 code 和 kbsCode
  if (json.code === 1 && (json.kbsCode === 0 || json.kbsCode === undefined)) {
    const fansList: any[] = [];
    
    // 解析分页信息
    const pager = json.data?.pager || {};
    const totalPages = pager.total || 0; // 总页数
    const pageSize = pager.size || 50;
    const currentPage = pager.page || page;
    
    // 判断是否还有更多：当前页 < 总页数
    const hasMore = currentPage < totalPages;
    
    // 提取所有粉丝信息
    // 注意：fans 接口中 item.account 是粉丝，item.friend 是被关注者（自己）
    if (json.data?.fans && Array.isArray(json.data.fans)) {
      json.data.fans.forEach((item: any) => {
        if (item.account) {
          fansList.push({
            id: item.account.id,
            username: item.account.name,
            nickname: item.account.nick,
            avatar: item.account.avatarUrl,
            level: item.account.level,
            levelTitle: item.account.levelTitle,
            score: item.account.score,
          });
        }
      });
    }
    
    console.log('getFansList: Found', fansList.length, 'fans, totalPages:', totalPages, 'hasMore:', hasMore);
    
    // 保存到缓存
    const cacheData = {fans: fansList, total: totalPages, hasMore, page: currentPage, pageSize};
    setCache('fansList', cacheKey, cacheData);
    
    return {
      success: true,
      fans: fansList,
      total: totalPages,
      hasMore,
      page: currentPage,
      pageSize,
      message: json.message || '获取成功'
    };
  }
  
  return {success: false, fans: [], total: 0, hasMore: false, page, pageSize: 50, message: json.message || '获取失败'};
};

// 获取站内私信列表
// API: GET https://wap.newsmth.net/wap/api/message/conversations?t={timestamp}&page={page}
export const getMessages = async (_page: number = 0): Promise<Mail[]> => {
  try {
    const cookies = await getCookies();
    
    // 严格校验登录态：必须有Cookie才能调用
    if (!cookies) {
      console.error('getMessages: 未登录，无Cookie');
      throw new Error('NOT_LOGGED_IN');
    }
    
    const timestamp = Date.now();
    const url = `${WAP_BASE_URL}/wap/api/message/conversations?t=${timestamp}&page=${_page}`;
    
    console.log('Fetching messages from API:', url);
    
    const headers = buildGetHeaders(cookies);

    const response = await fetchWithRetry(url, {
      headers,
      credentials: 'include',
    });
    
    // 检查HTTP状态码
    if (response.status === 401 || response.status === 403) {
      console.error('getMessages: Cookie已过期或无权限，状态码:', response.status);
      // 注意：不在这里清除登录态，让上层UI决定如何处理
      // 登录态只在用户主动退出登录时才清除
      throw new Error('LOGIN_EXPIRED');
    }

    const json = await response.json();
    console.log('getMessages API response code:', json.code);
    
    // 检查API返回码
    if (json.code !== 1) {
      console.error('getMessages: API返回错误，code:', json.code, 'message:', json.message);
      if (json.code === 401 || json.code === 403 || json.message?.includes('登录')) {
        // 注意：不在这里清除登录态，让上层UI决定如何处理
        throw new Error('LOGIN_EXPIRED');
      }
      throw new Error(json.message || 'API_ERROR');
    }

    if (json.data?.conversations && json.data?.lastMessages) {
      const conversations = json.data.conversations;
      const lastMessages = json.data.lastMessages;
      
      // 将对话和最后一条消息组合
      return conversations.map((conv: any) => {
        const lastMsg = lastMessages.find((msg: any) => msg.conversationId === conv.id);
        const speaker = conv.speaker || {};
        
        let avatar = speaker.k3sUrl || speaker.ks3Url || speaker.avatarUrl || '';
        if (avatar && avatar.startsWith('http:')) {
          avatar = avatar.replace('http:', 'https:');
        }
        
        return {
          id: conv.id,
          conversationId: conv.id,
          from: speaker.name || '',
          fromId: speaker.id || '',
          fromNickname: speaker.nick || speaker.name || '',
          fromAvatar: avatar,
          subject: lastMsg?.subject || '(无主题)',
          body: lastMsg?.body || '',
          sendTime: lastMsg?.sendTime || conv.lastTime || Date.now(),
          unread: conv.unread || 0,
          items: conv.items || 1,
        };
      });
    }
    
    return [];
  } catch (error: any) {
    console.error('Get messages error:', error);
    // 登录相关错误需要抛出，让调用方处理
    if (error.message === 'NOT_LOGGED_IN' || error.message === 'LOGIN_EXPIRED') {
      throw error;
    }
    // 其他错误返回空数组
    return [];
  }
};

// 检查版面是否已收藏
export const checkBoardFavorite = async (boardId: string): Promise<boolean> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      console.log('checkBoardFavorite: 未登录，无Cookie');
      return false;
    }
    
    const timestamp = Date.now();
    const url = `${WAP_BASE_URL}/wap/api/profile/isFavorite?t=${timestamp}&id=${boardId}`;
    
    console.log('Checking board favorite status:', url);
    
    const headers = buildGetHeaders(cookies);

    const response = await fetchWithRetry(url, {
      headers,
      credentials: 'include',
    }, 5000); // 5秒超时

    const json = await response.json();
    console.log('checkBoardFavorite API response:', json);

    if (json.code === 1 && json.data) {
      return json.data.isFavorite === 1;
    }
    
    return false;
  } catch (error) {
    console.error('Check board favorite error:', error);
    return false;
  }
};

// 添加版面到收藏
export const addBoardFavorite = async (boardId: string): Promise<{success: boolean, message?: string}> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      console.log('addBoardFavorite: 未登录，无Cookie');
      return {success: false, message: '请先登录'};
    }
    
    const timestamp = Date.now();
    const url = `${WAP_BASE_URL}/wap/api/profile/addFavorite`;
    
    console.log('Adding board to favorites:', boardId);
    
    const headers = buildPostHeaders(cookies, 'application/x-www-form-urlencoded');

    const body = `id=${boardId}&t=${timestamp}`;

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers,
      body,
      credentials: 'include',
    }, 10000); // 10秒超时

    const json = await response.json();
    console.log('addBoardFavorite API response:', json);

    if (json.code === 1) {
      await invalidateFavoriteBoardsCache();
      return {success: true, message: json.message || '收藏成功'};
    }
    
    return {success: false, message: json.message || '收藏失败'};
  } catch (error: any) {
    console.error('Add board favorite error:', error);
    if (error.message === '请求超时') {
      return {success: false, message: '请求超时，请重试'};
    }
    return {success: false, message: '收藏失败'};
  }
};

// 取消版面收藏
export const removeBoardFavorite = async (boardId: string): Promise<{success: boolean, message?: string}> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      console.log('removeBoardFavorite: 未登录，无Cookie');
      return {success: false, message: '请先登录'};
    }
    
    const url = `${WAP_BASE_URL}/wap/api/profile/favorite/boards/${boardId}/0`;
    
    console.log('Removing board from favorites:', boardId);
    
    const headers = buildDeleteHeaders(cookies, undefined, {
      'content-length': '0',
    });

    const response = await fetchWithRetry(url, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    }, 10000); // 10秒超时

    const json = await response.json();
    console.log('removeBoardFavorite API response:', json);

    if (json.code === 1) {
      await invalidateFavoriteBoardsCache();
      return {success: true, message: json.message || '取消收藏成功'};
    }
    
    return {success: false, message: json.message || '取消收藏失败'};
  } catch (error: any) {
    console.error('Remove board favorite error:', error);
    if (error.message === '请求超时') {
      return {success: false, message: '请求超时，请重试'};
    }
    return {success: false, message: '取消收藏失败'};
  }
};

// 获取收藏的文章列表
// API: GET https://wap.newsmth.net/wap/api/profile/favTopic/asc/0/20
export const getFavoriteTopics = async (
  page: number = 0,
  pageSize: number = 20
): Promise<{topics: any[], totalPages: number, totalItems: number}> => {
  try {
    const cookies = await getCookies();
    
    // 严格校验登录态：必须有Cookie才能调用
    if (!cookies) {
      console.error('getFavoriteTopics: 未登录，无Cookie');
      throw new Error('NOT_LOGGED_IN');
    }
    
    const url = `${WAP_BASE_URL}/wap/api/profile/favTopic/desc/${page}/${pageSize}`;
    
    console.log('Fetching favorite topics from API:', url);
    
    const headers = buildGetHeaders(cookies, 'https://wap.newsmth.net/collect');

    const response = await fetchWithRetry(url, {
      method: 'GET',
      headers,
      credentials: 'include',
    }, 10000); // 10秒超时

    const json = await safeJsonParse(response);
    console.log('getFavoriteTopics API response:', json);

    if (json.code === 1 && json.data) {
      const favTopics = json.data.favTopic || [];
      const pager = json.data.pager || {};
      
      // 解析嵌套的数据结构，提取需要的字段
      const topics = favTopics.map((item: any) => {
        const wrapper = item.topicWrapper || {};
        const article = wrapper.article || {};
        const board = wrapper.board || {};
        const account = article.account || {};
        
        return {
          id: item.id,
          topicId: wrapper.id,
          boardId: board.id,
          boardName: board.name,
          boardTitle: board.title,
          subject: wrapper.subject || article.subject,
          author: account.name,
          authorNick: account.nick,
          postTime: article.postTime,
          replyCount: wrapper.availables || 0,
          lastReplyTime: wrapper.lastPostTime,
          hasNewReply: item.hasNewReply,
          readOrder: item.readOrder,
        };
      });
      
      return {
        topics,
        totalPages: pager.totalPages || 1,
        totalItems: pager.totalItems || 0,
      };
    }
    
    throw new Error(json.message || '获取收藏文章失败');
  } catch (error: any) {
    console.error('Get favorite topics error:', error);
    
    if (error.message === 'NOT_LOGGED_IN') {
      throw error;
    }
    
    if (error.message === '请求超时') {
      throw new Error('请求超时，请检查网络连接');
    }
    
    throw new Error('获取收藏文章失败');
  }
};

// 获取黑名单列表
// API: GET https://wap.newsmth.net/wap/api/black/blacklist
// 注意：该API不支持分页，会返回全部黑名单用户
export const getBlackList = async (
  forceRefresh: boolean = false
): Promise<{
  success: boolean;
  blacklist: any[];
  total: number;
  message?: string;
}> => {
  try {
    const cookies = await getCookies();
    
    if (!cookies) {
      console.error('getBlackList: 未登录，无Cookie');
      return {success: false, blacklist: [], total: 0, message: '请先登录'};
    }
    
    const cacheKey = 'current_user_blacklist';
    
    // 如果不是强制刷新，先尝试从缓存获取
    if (!forceRefresh) {
      const cachedData = getCacheWithTimestamp<{blacklist: any[], total: number}>('blackList', cacheKey);
      if (cachedData) {
        const age = Date.now() - cachedData.timestamp;
        console.log('getBlackList: Using cached data, age:', Math.floor(age / 1000), 's');
        
        if (age > CACHE_REFRESH_THRESHOLD && age < MAX_STALE_CACHE_AGE) {
          runOnce(`blackList:${cacheKey}`, () => fetchBlackListFromAPI(cookies, cacheKey)).catch(err => {
            console.error('Background update blacklist error:', err);
          });
        }
        
        if (age < MAX_STALE_CACHE_AGE) {
          return {
            success: true,
            blacklist: cachedData.data.blacklist,
            total: cachedData.data.total,
            message: '获取成功'
          };
        }
      }
    }
    
    // 没有缓存或强制刷新，从API获取
    return await runOnce(`blackList:${cacheKey}`, () => fetchBlackListFromAPI(cookies, cacheKey));
  } catch (error: any) {
    console.error('Get blacklist error:', error);
    if (error.message === 'LOGIN_EXPIRED') {
      throw error;
    }
    return {success: false, blacklist: [], total: 0, message: '获取失败'};
  }
};

// 从API获取黑名单列表的内部函数
const fetchBlackListFromAPI = async (
  cookies: string,
  cacheKey: string
): Promise<{
  success: boolean;
  blacklist: any[];
  total: number;
  message?: string;
}> => {
  const url = `${WAP_BASE_URL}/wap/api/black/blacklist`;
  
  console.log('Fetching blacklist from API');
  
  const headers = buildGetHeaders(cookies);

  const response = await fetchWithRetry(url, {
    method: 'GET',
    headers,
    credentials: 'include',
  }, DEFAULT_TIMEOUT);
  
  if (response.status === 401 || response.status === 403) {
    console.error('getBlackList: Cookie已过期或无权限');
    // 注意：不在这里清除登录态，让上层UI决定如何处理
    throw new Error('LOGIN_EXPIRED');
  }

  const json = await response.json();
  console.log('getBlackList API response:', {
    code: json.code,
    kbsCode: json.kbsCode,
    message: json.message,
    dataLength: json.data?.length
  });
  
  // 检查 code 和 kbsCode
  if (json.code === 1 && (json.kbsCode === 0 || json.kbsCode === undefined)) {
    const blacklist: any[] = [];
    
    // 提取所有黑名单用户信息
    if (json.data && Array.isArray(json.data)) {
      json.data.forEach((item: any) => {
        if (item.blackAccount) {
          blacklist.push({
            id: item.blackAccount.id,
            username: item.blackAccount.name,
            nickname: item.blackAccount.nick,
            avatar: item.blackAccount.avatarUrl,
            score: item.blackAccount.score,
            level: item.blackAccount.level,
            levelTitle: item.blackAccount.levelTitle,
            createTime: item.createTime,
            memo: item.memo,
          });
        }
      });
    }
    
    const total = blacklist.length;
    console.log('getBlackList: Found', total, 'blocked users');
    
    // 保存到缓存
    setCache('blackList', cacheKey, {blacklist, total});
    
    return {success: true, blacklist, total, message: json.message || '获取成功'};
  }
  
  return {success: false, blacklist: [], total: 0, message: json.message || '获取失败'};
};
