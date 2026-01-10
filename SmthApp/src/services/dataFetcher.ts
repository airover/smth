// 数据获取服务 - 使用 wap.newsmth.net 获取数据
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Mail} from '../types';

const WAP_BASE_URL = 'https://wap.newsmth.net';

// 默认超时时间（毫秒）
const DEFAULT_TIMEOUT = 10000; // 10秒

// 带超时的 fetch 函数
const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeout: number = DEFAULT_TIMEOUT
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('请求超时');
    }
    throw error;
  }
};

// 获取 Cookie
const getCookies = async (): Promise<string | null> => {
  return await AsyncStorage.getItem('cookies');
};

// 通用请求函数（带 Cookie）
const requestWithCookies = async (
  url: string,
  options: RequestInit = {},
): Promise<Response> => {
  const cookies = await getCookies();
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...(options.headers as Record<string, string>),
  };

  if (cookies) {
    headers.Cookie = cookies;
  }

  const fullUrl = url.startsWith('http') ? url : `${WAP_BASE_URL}${url}`;
  
  console.log('Fetching:', fullUrl);
  
  const response = await fetchWithTimeout(fullUrl, {
    ...options,
    headers,
    credentials: 'include',
  });

  return response;
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
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Authorization': 'Basic Og==',
    };

    if (cookies) {
      headers.Cookie = cookies;
    }

    const response = await fetchWithTimeout(url, {
      headers,
      credentials: 'include',
    });

    const json = await response.json();
    console.log('getHotPosts API response code:', json.code);

    if (json.code === 1 && json.data?.topics) {
      const topics = json.data.topics || [];
      // API返回的是total表示总页数
      const totalPages = json.data.pager?.total || 1;
      
      return {
        topics: topics.map((topic: any) => {
          const article = topic.article || {};
          const account = article.account || {};
          
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
          };
        }),
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
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Authorization': 'Basic Og==',
      'access-control-allow-origin': '*',
    };

    if (cookies) {
      headers.Cookie = cookies;
    }

    const response = await fetchWithTimeout(url, {
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
    console.log('getTopTen API response data:', JSON.stringify(json.data).substring(0, 500));

    if (json.code === 1 && json.data) {
      const topics = json.data.topics || [];
      console.log('getTopTen found topics:', topics.length);
      
      if (topics.length === 0) {
        console.log('getTopTen: API返回空数据，保留本地缓存');
        // 返回 null 表示API返回空，调用方应保留原有数据
        return null;
      }
      
      return topics.map((topic: any) => ({
        id: topic.id, // 使用主题 ID (topicId)，用于详情接口
        title: topic.subject?.trim(),
        author: topic.article?.account?.name || topic.article?.user?.name || '',
        board: topic.boardId, // 版面 ID (hash)
        boardName: topic.board?.title || topic.board?.name || '未知版面',
        replyCount: Math.max(0, (topic.availables || 0) - 1),
        postTime: new Date(topic.flushTime || Date.now()).toISOString(),
        lastReplyTime: new Date(topic.lastPostTime || Date.now()).toISOString(),
      }));
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
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Authorization': 'Basic Og==',
    };

    if (cookies) {
      headers.Cookie = cookies;
    }

    const response = await fetchWithTimeout(url, {
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
export const getFavoriteBoards = async (): Promise<any[]> => {
  try {
    const cookies = await getCookies();
    
    // 严格校验登录态：必须有Cookie才能调用
    if (!cookies) {
      console.error('getFavoriteBoards: 未登录，无Cookie');
      throw new Error('NOT_LOGGED_IN');
    }
    
    const timestamp = Date.now();
    const url = `${WAP_BASE_URL}/wap/api/profile/fav/boards?t=${timestamp}`;
    
    console.log('Fetching Favorite Boards from API:', url);
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Authorization': 'Basic Og==',
      'Cookie': cookies,
    };

    const response = await fetchWithTimeout(url, {
      headers,
      credentials: 'include',
    });
    
    // 检查HTTP状态码，401/403表示未登录或Cookie过期
    if (response.status === 401 || response.status === 403) {
      console.error('getFavoriteBoards: Cookie已过期或无权限，状态码:', response.status);
      // 清除本地登录状态
      await AsyncStorage.removeItem('isLoggedIn');
      await AsyncStorage.removeItem('cookies');
      throw new Error('LOGIN_EXPIRED');
    }

    const json = await response.json();
    console.log('getFavoriteBoards API response code:', json.code);
    
    // 检查API返回码，某些错误码也表示未登录
    if (json.code !== 1) {
      console.error('getFavoriteBoards: API返回错误，code:', json.code, 'message:', json.message);
      if (json.code === 401 || json.code === 403 || json.message?.includes('登录')) {
        await AsyncStorage.removeItem('isLoggedIn');
        await AsyncStorage.removeItem('cookies');
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
      return allFavBoards;
    }
    
    return [];
  } catch (error: any) {
    console.error('Get favorite boards error:', error);
    // 登录相关错误需要抛出，让调用方处理
    if (error.message === 'NOT_LOGGED_IN' || error.message === 'LOGIN_EXPIRED') {
      throw error;
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
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Authorization': 'Basic Og==',
    };

    if (cookies) {
      headers.Cookie = cookies;
    }

    const response = await fetchWithTimeout(url, {
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
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Authorization': 'Basic Og==',
    };

    if (cookies) {
      headers.Cookie = cookies;
    }

    const response = await fetchWithTimeout(url, {
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

// 获取版面帖子列表
// 使用新的 JSON API 获取
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
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Authorization': 'Basic Og==',
    };

    if (cookies) {
      headers.Cookie = cookies;
    }

    const response = await fetchWithTimeout(url, {
      headers,
      credentials: 'include',
    });

    const json = await response.json();
    console.log('getBoardPosts API response code:', json.code);

    if (json.code === 1 && json.data) {
      const topics = json.data.topics || [];
      const tops = json.data.tops || [];
      // API返回的是total表示总页数，不是totalPages
      const totalPages = json.data.pager?.total || 1;
      
      const processTopic = (topic: any, isTop: boolean = false) => {
        const article = topic.article || {};
        const account = article.account || {};
        
        let avatar = account.k3sUrl || account.ks3Url || account.avatarUrl || '';
        if (avatar && avatar.startsWith('http:')) {
          avatar = avatar.replace('http:', 'https:');
        }

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
          attachments: (article.attachments || []).map((att: any) => ({
            ...att,
            url: att.ks3Url || (att.url?.startsWith('http') ? att.url : `https://file.mysmth.net/${att.url}`)
          })),
        };
      };

      return {
        topics: topics.map((t: any) => processTopic(t, false)),
        tops: tops.map((t: any) => processTopic(t, true)),
        totalPages: totalPages
      };
    }
    
    return { topics: [], tops: [], totalPages: 0 };
  } catch (error) {
    console.error('Get board posts error:', error);
    return { topics: [], tops: [], totalPages: 0 };
  }
};

// 获取帖子详情
// 使用新的 JSON API 获取主题和首贴
export const getPostDetail = async (
  _board: string,
  topicId: string, // 现在传入的是 topicId
  _page: number = 1,
): Promise<any> => {
  try {
    const cookies = await getCookies();
    const timestamp = Date.now();
    // API: https://wap.newsmth.net/wap/api/topic/:topicId/detail
    const url = `${WAP_BASE_URL}/wap/api/topic/${topicId}/detail?t=${timestamp}`;
    
    console.log('Fetching Post Detail from API:', url);
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Authorization': 'Basic Og==',
    };

    if (cookies) {
      headers.Cookie = cookies;
    }

    const response = await fetchWithTimeout(url, {
      headers,
      credentials: 'include',
    });

    const json = await response.json();
    console.log('getPostDetail API response code:', json.code);

    if (json.code === 1 && json.data?.topic) {
      const topic = json.data.topic;
      const article = topic.article;
      
      // 提取头像，优先使用 k3sUrl/ks3Url（云存储）
      let avatar = article?.account?.k3sUrl || article?.account?.ks3Url ||
                   article?.user?.k3sUrl || article?.user?.ks3Url ||
                   article?.account?.avatarUrl || article?.user?.avatarUrl || '';
      if (avatar && avatar.startsWith('http:')) {
        avatar = avatar.replace('http:', 'https:');
      }
      
      const post: any = {
        id: topic.id,
        board: topic.board?.name || _board,
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
        attachments: (article?.attachments || []).map((att: any) => {
          // 优先使用 ks3Url，这是金山云的直接访问地址
          let url = att.ks3Url || att.url || '';
          
          if (url && url.startsWith('http:')) {
            url = url.replace('http:', 'https:');
          }
          
          if (url && !url.startsWith('http')) {
            url = `https://file.mysmth.net/${url}`;
          } else if (!url && att.id) {
            // 如果没有 url 但有 id，尝试构建下载链接
            url = `https://wap.newsmth.net/wap/api/attachment/download/${att.id}`;
          }
          
          return {
            ...att,
            url: url
          };
        }),
        likes: (article?.likes || []).map((like: any) => {
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
    
    return null;
  } catch (error) {
    console.error('Get post detail error:', error);
    return null;
  }
};

// 获取主题的回复列表（分页）
// API: https://wap.newsmth.net/wap/api/topic/loadArticlesByMode/:topicId/:mode/:page/:pageSize
export const getTopicReplies = async (
  topicId: string,
  page: number = 1,
  pageSize: number = 20,
  mode: number = 1, // 1 为全部回复
): Promise<{replies: any[], totalItems: number}> => {
  try {
    const cookies = await getCookies();
    const timestamp = Date.now();
    const url = `${WAP_BASE_URL}/wap/api/topic/loadArticlesByMode/${topicId}/${mode}/${page}/${pageSize}?t=${timestamp}`;
    
    console.log('Fetching Topic Replies from API:', url);
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Authorization': 'Basic Og==',
    };

    if (cookies) {
      headers.Cookie = cookies;
    }

    const response = await fetchWithTimeout(url, {
      headers,
      credentials: 'include',
    });

    const json = await response.json();
    console.log('getTopicReplies API response code:', json.code);

    if (json.code === 1 && json.data?.articles) {
      const articles = json.data.articles;
      const replies = articles.map((article: any) => {
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
          floor: article.topicOrder,
          attachments: (article.attachments || []).map((att: any) => {
            let url = att.ks3Url || att.url || '';
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
        totalItems: json.data.pager?.totalItems || 0
      };
    }
    
    return { replies: [], totalItems: 0 };
  } catch (error) {
    console.error('Get topic replies error:', error);
    return { replies: [], totalItems: 0 };
  }
};

// 获取用户信息
export const fetchUserInfo = async (username: string): Promise<any> => {
  try {
    const cookies = await getCookies();
    const timestamp = Date.now();
    const url = `${WAP_BASE_URL}/wap/api/account/${username}/mixlogs?t=${timestamp}&page=1`;
    
    console.log('Fetching user info from API:', url);
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Authorization': 'Basic Og==',
      'access-control-allow-origin': '*',
    };

    if (cookies) {
      headers.Cookie = cookies;
    }

    const response = await fetchWithTimeout(url, {
      headers,
      credentials: 'include',
    });

    const text = await response.text();
    console.log('fetchUserInfo raw response:', text.substring(0, 300));
    
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.error('fetchUserInfo JSON parse error:', e);
      return null;
    }
    
    console.log('fetchUserInfo API response code:', json.code);

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
export const getConversationMessages = async (conversationId: string): Promise<any[]> => {
  try {
    const cookies = await getCookies();
    
    // 严格校验登录态：必须有Cookie才能调用
    if (!cookies) {
      console.error('getConversationMessages: 未登录，无Cookie');
      throw new Error('NOT_LOGGED_IN');
    }
    
    const timestamp = Date.now();
    const url = `${WAP_BASE_URL}/wap/api/message/conversation/${conversationId}?t=${timestamp}`;
    
    console.log('Fetching conversation messages from API:', url);
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Authorization': 'Basic Og==',
      'Cookie': cookies,
    };

    const response = await fetchWithTimeout(url, {
      headers,
      credentials: 'include',
    });
    
    // 检查HTTP状态码
    if (response.status === 401 || response.status === 403) {
      console.error('getConversationMessages: Cookie已过期或无权限，状态码:', response.status);
      await AsyncStorage.removeItem('isLoggedIn');
      await AsyncStorage.removeItem('cookies');
      throw new Error('LOGIN_EXPIRED');
    }

    const json = await response.json();
    console.log('getConversationMessages API response code:', json.code);
    
    // 检查API返回码
    if (json.code !== 1) {
      console.error('getConversationMessages: API返回错误，code:', json.code, 'message:', json.message);
      if (json.code === 401 || json.code === 403 || json.message?.includes('登录')) {
        await AsyncStorage.removeItem('isLoggedIn');
        await AsyncStorage.removeItem('cookies');
        throw new Error('LOGIN_EXPIRED');
      }
      throw new Error(json.message || 'API_ERROR');
    }

    if (json.data?.messages) {
      const messages = json.data.messages;
      const currentUserId = json.data.accountId; // 当前用户ID
      
      return messages.map((msg: any) => {
        const sender = msg.sender || {};
        let avatar = sender.k3sUrl || sender.ks3Url || sender.avatarUrl || '';
        if (avatar && avatar.startsWith('http:')) {
          avatar = avatar.replace('http:', 'https:');
        }
        
        return {
          id: msg.id,
          senderId: msg.senderId,
          senderName: sender.name || '',
          senderNick: sender.nick || sender.name || '',
          senderAvatar: avatar,
          subject: msg.subject || '',
          body: msg.body || '',
          sendTime: msg.sendTime || Date.now(),
          isMe: msg.senderId === currentUserId,
        };
      });
    }
    
    return [];
  } catch (error: any) {
    console.error('Get conversation messages error:', error);
    // 登录相关错误需要抛出，让调用方处理
    if (error.message === 'NOT_LOGGED_IN' || error.message === 'LOGIN_EXPIRED') {
      throw error;
    }
    // 其他错误返回空数组
    return [];
  }
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
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Authorization': 'Basic Og==',
      'Cookie': cookies,
    };

    const response = await fetchWithTimeout(url, {
      headers,
      credentials: 'include',
    });
    
    // 检查HTTP状态码
    if (response.status === 401 || response.status === 403) {
      console.error('getMessages: Cookie已过期或无权限，状态码:', response.status);
      await AsyncStorage.removeItem('isLoggedIn');
      await AsyncStorage.removeItem('cookies');
      throw new Error('LOGIN_EXPIRED');
    }

    const json = await response.json();
    console.log('getMessages API response code:', json.code);
    
    // 检查API返回码
    if (json.code !== 1) {
      console.error('getMessages: API返回错误，code:', json.code, 'message:', json.message);
      if (json.code === 401 || json.code === 403 || json.message?.includes('登录')) {
        await AsyncStorage.removeItem('isLoggedIn');
        await AsyncStorage.removeItem('cookies');
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
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      'Authorization': 'Basic Og==',
      'Cookie': cookies,
    };

    const response = await fetchWithTimeout(url, {
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
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      'Authorization': 'Basic Og==',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookies,
    };

    const body = `id=${boardId}&t=${timestamp}`;

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body,
      credentials: 'include',
    }, 10000); // 10秒超时

    const json = await response.json();
    console.log('addBoardFavorite API response:', json);

    if (json.code === 1) {
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
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      'Authorization': 'Basic Og==',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': '0',
      'Cookie': cookies,
    };

    const response = await fetchWithTimeout(url, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    }, 10000); // 10秒超时

    const json = await response.json();
    console.log('removeBoardFavorite API response:', json);

    if (json.code === 1) {
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
