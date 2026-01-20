import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFetchBlob from 'rn-fetch-blob';
import {
  fetchWithRetry,
  DEFAULT_TIMEOUT,
  logRequest,
  buildGetHeaders,
  buildPostHeaders,
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
  uploadToken?: string; // 上传图片的token（多个图片共用一个token）
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

    // 构建请求头（使用封装好的函数）
    const headers = buildPostHeaders(
      cookies,
      'application/x-www-form-urlencoded',
      `https://wap.newsmth.net/post?boardId=${params.boardId}`
    );

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
    }

    if (params.reId) {
      formData.append('reid', params.reId);
    }

    // 添加图片上传token（如果有）
    if (params.uploadToken) {
      formData.append('uploadToken', params.uploadToken);
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
    }, 20000);

    // 处理HTTP错误
    if (!response.ok) {
      const errorText = await response.text();
      logRequest.error(API_URL, new Error(`HTTP ${response.status}: ${errorText || '发帖失败'}`));
      throw new Error(`HTTP ${response.status}: ${errorText || '发帖失败'}`);
    }

    const result = await response.json();

    logRequest.success(API_URL, result);

    // 判断成功
    // 根据水木社区API响应格式：
    // - code: 0 表示HTTP请求成功
    // - kbsCode: 0 表示业务逻辑成功，非0表示业务失败
    // - 需要同时检查 kbsCode 来判断真正的成功/失败
    if ((result.code === 0 || result.code === 1) && (result.kbsCode === 0 || result.kbsCode === undefined)) {
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
      // 返回具体的错误信息
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
 * 基于用户提供的 curl 命令实现：
 * - URL: https://wap.newsmth.net/wap/api/topic/reply
 * - 参数: articleId, body, captcha_id 等
 * 
 * @param params 回复参数（包含reId作为articleId）
 * @returns 回复响应
 */
export const replyPost = async (params: PostParams): Promise<PostResponse> => {
  try {
    const API_URL = 'https://wap.newsmth.net/wap/api/topic/reply';

    if (!params.reId) {
      throw new Error('缺少回复目标ID');
    }

    // 获取登录凭证
    const cookies = await AsyncStorage.getItem('cookies');
    if (!cookies) {
      throw new Error('未登录，请先登录');
    }

    // 构建请求头（使用封装好的函数）
    const headers = buildPostHeaders(
      cookies,
      'application/x-www-form-urlencoded',
      `https://wap.newsmth.net/article/${params.reId}?title=${encodeURIComponent(params.subject || '')}&from=board`
    );

    // 构建Form Data
    const timestamp = Date.now();
    const formData = new URLSearchParams();
    
    // 关键参数：articleId
    formData.append('articleId', params.reId);
    formData.append('body', params.body);
    formData.append('client', 'wap');
    formData.append('t', String(timestamp));
    formData.append('type', String(params.type || 3));
    
    // 添加验证码参数（如果有）
    if (params.captchaParams) {
      formData.append('captcha_id', params.captchaParams.captcha_id);
      formData.append('lot_number', params.captchaParams.lot_number);
      formData.append('captcha_output', params.captchaParams.captcha_output);
      formData.append('pass_token', params.captchaParams.pass_token);
      formData.append('gen_time', params.captchaParams.gen_time);
    }

    // 添加图片上传token（如果有）
    if (params.uploadToken) {
      formData.append('uploadToken', params.uploadToken);
    }

    logRequest.start(API_URL, 'POST');
    logRequest.params({
      articleId: params.reId,
      body: params.body.substring(0, 50) + '...',
      type: params.type || 3,
    });

    const response = await fetchWithRetry(API_URL, {
      method: 'POST',
      headers,
      body: formData.toString(),
    }, 20000);

    // 处理HTTP错误
    if (!response.ok) {
      const errorText = await response.text();
      logRequest.error(API_URL, new Error(`HTTP ${response.status}: ${errorText || '回复失败'}`));
      throw new Error(`HTTP ${response.status}: ${errorText || '回复失败'}`);
    }

    const result = await response.json();

    logRequest.success(API_URL, result);

    // 判断成功
    // 根据水木社区API响应格式：
    // - code: 0 表示HTTP请求成功
    // - kbsCode: 0 表示业务逻辑成功，非0表示业务失败
    // - 需要同时检查 kbsCode 来判断真正的成功/失败
    if ((result.code === 0 || result.code === 1) && (result.kbsCode === 0 || result.kbsCode === undefined)) {
      return {
        code: 1,
        message: result.message || '回复成功',
        data: result.data || result,
      };
    } else {
      // 特别处理验证码错误
      if (result.message && result.message.includes('验证码')) {
        throw new Error('需要验证码，请在网页版完成验证后重试');
      }
      // 返回具体的错误信息
      throw new Error(result.message || result.error || '回复失败');
    }
  } catch (error: any) {
    console.error('回复错误:', error);
    throw error;
  }
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

/**
 * 获取图片上传token
 * 
 * @param boardId 版面ID（用于Referer）
 * @returns 上传token
 */
/**
 * 检查发帖权限
 * 在获取上传token前调用，验证用户是否有发帖权限
 * 
 * @param boardId 版面ID
 * @returns 检查结果，成功返回true，失败抛出错误
 */
export const checkPublish = async (boardId?: string): Promise<boolean> => {
  try {
    const API_URL = 'https://wap.newsmth.net/wap/api/topic/publish/check';

    // 获取登录凭证
    const cookies = await AsyncStorage.getItem('cookies');
    if (!cookies) {
      throw new Error('未登录，请先登录');
    }

    // 构建请求头（使用封装好的函数）
    const headers = buildGetHeaders(
      cookies,
      boardId 
        ? `https://wap.newsmth.net/post?boardId=${boardId}` 
        : 'https://wap.newsmth.net/'
    );

    logRequest.start(API_URL, 'GET');

    const response = await fetchWithRetry(API_URL, {
      method: 'GET',
      headers,
    }, DEFAULT_TIMEOUT);

    if (!response.ok) {
      const errorText = await response.text();
      logRequest.error(API_URL, new Error(`HTTP ${response.status}: ${errorText}`));
      throw new Error(`检查发帖权限失败: ${response.status}`);
    }

    const result = await response.json();
    logRequest.success(API_URL, result);

    if (result.code === 1) {
      return true;
    } else {
      throw new Error(result.message || '您没有发帖权限');
    }
  } catch (error: any) {
    console.error('检查发帖权限错误:', error);
    throw error;
  }
};

export const getUploadToken = async (boardId?: string): Promise<string> => {
  try {
    const API_URL = 'https://wap.newsmth.net/wap/api/file/token';

    // 获取登录凭证
    const cookies = await AsyncStorage.getItem('cookies');
    if (!cookies) {
      throw new Error('未登录，请先登录');
    }

    // 构建请求头（使用封装好的函数）
    const headers = buildGetHeaders(
      cookies,
      boardId 
        ? `https://wap.newsmth.net/post?boardId=${boardId}` 
        : 'https://wap.newsmth.net/'
    );

    logRequest.start(API_URL, 'GET');

    const response = await fetchWithRetry(API_URL, {
      method: 'GET',
      headers,
    }, DEFAULT_TIMEOUT);

    if (!response.ok) {
      const errorText = await response.text();
      logRequest.error(API_URL, new Error(`HTTP ${response.status}: ${errorText}`));
      throw new Error(`获取上传token失败: ${response.status}`);
    }

    const result = await response.json();
    logRequest.success(API_URL, result);

    if (result.code === 1 && result.data) {
      return result.data;
    } else {
      throw new Error(result.message || '获取上传token失败');
    }
  } catch (error: any) {
    console.error('获取上传token错误:', error);
    throw error;
  }
};

/**
 * 图片 Asset 对象接口（来自 react-native-image-picker）
 */
interface ImageAsset {
  uri: string;           // 图片 URI（可能是 ph:// 格式）
  originalPath?: string; // 原始文件路径（iOS 上可用）
  fileName?: string;     // 文件名
  type?: string;         // MIME 类型
  fileSize?: number;     // 文件大小
  width?: number;        // 宽度
  height?: number;       // 高度
  base64?: string;       // Base64 数据（如果请求了）
}

/**
 * 批量上传图片（一次请求上传多张图片）
 * 
 * 使用 rn-fetch-blob 库进行文件上传，该库可以正确读取本地文件并发送
 * React Native 的 fetch/XMLHttpRequest 在处理 FormData 文件时存在兼容性问题
 * 
 * @param boardId 版面ID
 * @param token 上传token
 * @param imageAssets 图片 asset 对象数组（来自 react-native-image-picker）
 * @param onProgress 上传进度回调
 * @returns 上传后的图片token
 */
export const uploadImages = async (
  boardId: string,
  token: string,
  imageAssets: ImageAsset[],
  onProgress?: (progress: number) => void
): Promise<string> => {
  try {
    const API_URL = `https://wap.newsmth.net/wap/api/file/upload/${boardId}/${token}`;

    // 获取登录凭证
    const cookies = await AsyncStorage.getItem('cookies');
    if (!cookies) {
      throw new Error('未登录，请先登录');
    }

    // 检查是否有图片
    if (!imageAssets || imageAssets.length === 0) {
      throw new Error('请选择要上传的图片');
    }

    // 构建 multipart/form-data 数据
    const formDataParts: Array<{
      name: string;
      filename: string;
      type: string;
      data: string; // rn-fetch-blob 使用 wrap() 包装文件路径
    }> = [];
    
    for (let i = 0; i < imageAssets.length; i++) {
      const asset = imageAssets[i];
      
      // 检查 asset 是否有效
      if (!asset || !asset.uri) {
        console.error(`图片 ${i + 1} asset无效:`, asset);
        continue;
      }
      
      // 获取文件路径（去掉 file:// 前缀）
      let filePath = asset.originalPath || asset.uri;
      if (filePath.startsWith('file://')) {
        filePath = filePath.substring(7);
      }
      // 解码路径，处理空格和特殊字符
      filePath = decodeURIComponent(filePath);
      
      // 获取文件名
      const filename = asset.fileName || filePath.split('/').pop() || `image${i}.jpg`;
      
      // 获取 MIME 类型
      let mimeType = asset.type || 'image/jpeg';
      if (mimeType === 'image/jpg') {
        mimeType = 'image/jpeg';
      }
      const ext = filename.split('.').pop()?.toLowerCase();
      if (ext === 'png') {
        mimeType = 'image/png';
      } else if (ext === 'gif') {
        mimeType = 'image/gif';
      } else if (ext === 'heic' || ext === 'heif') {
        mimeType = 'image/heic';
      } else if (ext === 'webp') {
        mimeType = 'image/webp';
      }

      // 检查文件是否存在
      try {
        await RNFetchBlob.fs.stat(filePath);
      } catch (e) {
        console.error(`图片 ${i + 1} 文件读取失败:`, e);
        throw new Error(`无法读取图片文件: ${filename}`);
      }

      // 使用 RNFetchBlob.wrap() 包装文件路径
      formDataParts.push({
        name: 'files', // 根据前端JS分析，字段名应为 'files'
        filename: filename,
        type: mimeType,
        data: RNFetchBlob.wrap(filePath),
      });
    }
    
    if (formDataParts.length === 0) {
      throw new Error('没有有效的图片可上传');
    }

    logRequest.start(API_URL, 'POST');
    logRequest.params({boardId, token, imageCount: imageAssets.length});

    // 构建请求头（使用封装好的函数）
    // set_identity 已在登录后由 api.ts 自动构造并持久化，无需再手动构造
    // Content-Type 由 rn-fetch-blob 自动设置为 multipart/form-data，所以这里不传 contentType
    const requestHeaders = buildPostHeaders(
      cookies,
      undefined, // Content-Type 由 rn-fetch-blob 自动设置
      `https://wap.newsmth.net/post?boardId=${boardId}`
    );

    // 使用 rn-fetch-blob 上传文件
    const response = await RNFetchBlob.config({
      timeout: 30000,
    }).fetch(
      'POST',
      API_URL,
      requestHeaders,
      formDataParts
    )
    .uploadProgress((written, total) => {
      let progress = Math.round((written / total) * 100);
      // 限制进度最大为95%，预留5%给服务器处理时间，避免进度条提前100%但实际还在等待响应
      if (progress > 95) {
        progress = 95;
      }
      if (onProgress) {
        onProgress(progress);
      }
    });

    const responseText = await response.text();

    if (response.respInfo.status !== 200) {
      logRequest.error(API_URL, new Error(`HTTP ${response.respInfo.status}: ${responseText}`));
      throw new Error(`上传图片失败: ${response.respInfo.status}`);
    }

    const result = JSON.parse(responseText);
    logRequest.success(API_URL, result);

    // 根据浏览器抓包响应格式：
    // {
    //   "code": 1,
    //   "data": [
    //     { "ext": "image/jpeg", "key": "xxx.jpg", "uri": "/compose/download/xxx.jpg", ... },
    //     { "ext": "image/jpeg", "key": "yyy.jpg", "uri": "/compose/download/yyy.jpg", ... }
    //   ],
    //   "kbsCode": 0,
    //   "message": "操作成功"
    // }
    if (result.code === 1) {
      // result.data 是一个数组，包含每张图片的信息
      // 返回 token（调用方实际使用 URL 中的 token 来关联图片）
      // 这里返回 token 以保持接口兼容性
      return token;
    } else {
      throw new Error(result.message || '上传图片失败');
    }
  } catch (error: any) {
    console.error('批量上传图片错误:', error);
    throw error;
  }
};

/**
 * 上传单张图片（兼容旧代码）
 * 
 * @param boardId 版面ID
 * @param token 上传token
 * @param imageAsset 图片 asset 对象或 URI 字符串
 * @returns 上传后的图片token
 */
export const uploadImage = async (
  boardId: string,
  token: string,
  imageAsset: ImageAsset | string
): Promise<string> => {
  // 兼容旧代码：如果传入的是字符串，转换为 asset 对象
  const asset: ImageAsset = typeof imageAsset === 'string' 
    ? { uri: imageAsset } 
    : imageAsset;
  return uploadImages(boardId, token, [asset]);
};
