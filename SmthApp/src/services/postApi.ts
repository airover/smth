import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchWithRetry,
  DEFAULT_TIMEOUT,
  logRequest,
} from '../utils/requestUtils';

/**
 * 发帖参数接口
 */
export interface CaptchaParams {
  captcha_id: string;
  lot_number: string;
  captcha_output: string;
  pass_token: string;
  gen_time: string;
}

export interface PostParams {
  boardId: string; // 版面ID (hash格式)
  boardName?: string; // 版面名称（用于显示）
  subject: string; // 帖子标题
  body: string; // 帖子内容
  attachments?: string[]; // 附件（如果支持）
  reId?: string; // 回复的帖子ID（如果是回复）
  type?: number; // 帖子类型，默认3
  captchaParams?: CaptchaParams; // 验证码参数
}

/**
 * 发帖响应接口
 */
export interface PostResponse {
  code: number;
  message: string;
  data?: {
    postId?: string;
    topicId?: string;
    articleId?: string;
    url?: string;
  };
}

/**
 * 发帖API
 * 
 * 基于抓包结果实现：
 * - URL: https://wap.newsmth.net/wap/api/topic/publish
 * - Content-Type: application/x-www-form-urlencoded
 * - 需要boardId (hash格式)
 * 
 * ⚠️ 注意：API需要验证码参数，目前暂未实现验证码功能
 * 
 * @param params 发帖参数
 * @returns 发帖响应
 */
export const createPost = async (params: PostParams): Promise<PostResponse> => {
  try {
    const API_URL = 'https://wap.newsmth.net/wap/api/topic/publish';

    // 获取登录凭证
    const cookies = await AsyncStorage.getItem('cookies'); // 修复：使用正确的key 'cookies'
    if (!cookies) {
      throw new Error('未登录，请先登录');
    }

    // 构建请求头（基于抓包结果）
    const headers: HeadersInit = {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookies,
      Authorization: 'Basic Og==', // 从抓包中获取
      Origin: 'https://wap.newsmth.net',
      Referer: `https://wap.newsmth.net/post?boardId=${params.boardId}`,
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      'test-uin-only': '1',
    };

    // 构建Form Data格式的请求体（基于抓包结果）
    const timestamp = Date.now();
    const formData = new URLSearchParams();
    formData.append('boardId', params.boardId);
    formData.append('subject', params.subject);
    formData.append('body', params.body);
    formData.append('type', String(params.type || 3));
    formData.append('client', 'wap');
    formData.append('t', String(timestamp));
    
    // 添加验证码参数（如果有）
    if (params.captchaParams) {
      formData.append('captcha_id', params.captchaParams.captcha_id);
      formData.append('lot_number', params.captchaParams.lot_number);
      formData.append('captcha_output', params.captchaParams.captcha_output);
      formData.append('pass_token', params.captchaParams.pass_token);
      formData.append('gen_time', params.captchaParams.gen_time);
      console.log('使用验证码参数:', {
        lot_number: params.captchaParams.lot_number,
        gen_time: params.captchaParams.gen_time,
      });
    }

    if (params.reId) {
      formData.append('reid', params.reId);
    }

    logRequest.start(API_URL, 'POST');
    logRequest.params({
      boardId: params.boardId,
      subject: params.subject,
      body: params.body.substring(0, 50) + '...',
      type: params.type || 3,
    });

    const response = await fetchWithRetry(API_URL, {
      method: 'POST',
      headers,
      body: formData.toString(),
    }, DEFAULT_TIMEOUT);

    // 处理HTTP错误
    if (!response.ok) {
      const errorText = await response.text();
      logRequest.error(API_URL, new Error(`HTTP ${response.status}: ${errorText || '发帖失败'}`));
      throw new Error(`HTTP ${response.status}: ${errorText || '发帖失败'}`);
    }

    const result = await response.json();

    logRequest.success(API_URL, result);

    // 判断成功
    // 根据水木社区API，通常code为0或1表示成功
    if (result.code === 0 || result.code === 1 || result.success === true) {
      return {
        code: 1,
        message: result.message || '发帖成功',
        data: result.data || result,
      };
    } else {
      // 特别处理验证码错误
      if (result.message && result.message.includes('验证码')) {
        throw new Error('需要验证码，请在网页版完成验证后重试');
      }
      throw new Error(result.message || result.error || '发帖失败');
    }
  } catch (error: any) {
    console.error('发帖错误:', error);
    throw error;
  }
};

/**
 * 回复帖子
 * 
 * @param params 回复参数（包含reId）
 * @returns 回复响应
 */
export const replyPost = async (params: PostParams): Promise<PostResponse> => {
  if (!params.reId) {
    throw new Error('缺少回复目标ID');
  }
  return createPost(params);
};

/**
 * 获取草稿
 */
export const getDraft = async (boardId: string): Promise<PostParams | null> => {
  try {
    const draftKey = `draft_${boardId}`;
    const draftStr = await AsyncStorage.getItem(draftKey);
    if (draftStr) {
      return JSON.parse(draftStr);
    }
    return null;
  } catch (error) {
    console.error('获取草稿失败:', error);
    return null;
  }
};

/**
 * 保存草稿
 */
export const saveDraft = async (params: PostParams): Promise<void> => {
  try {
    const draftKey = `draft_${params.boardId}`;
    await AsyncStorage.setItem(draftKey, JSON.stringify(params));
  } catch (error) {
    console.error('保存草稿失败:', error);
  }
};

/**
 * 清除草稿
 */
export const clearDraft = async (boardId: string): Promise<void> => {
  try {
    const draftKey = `draft_${boardId}`;
    await AsyncStorage.removeItem(draftKey);
  } catch (error) {
    console.error('清除草稿失败:', error);
  }
};
