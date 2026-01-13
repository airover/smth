/**
 * 统一的请求工具函数
 * - 超时控制
 * - 自动重试
 * - 错误处理
 * - 详细日志
 */

// 默认超时时间（毫秒）
export const DEFAULT_TIMEOUT = 10000; // 10秒
export const LOGIN_TIMEOUT = 15000; // 登录接口15秒
export const SEARCH_TIMEOUT = 20000; // 搜索接口20秒

// 重试配置
export const DEFAULT_RETRY_COUNT = 1; // 默认重试1次
export const RETRY_DELAY = 1000; // 重试延迟1秒

/**
 * 延迟函数
 */
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * 带超时和重试的 fetch 函数
 * @param url 请求URL
 * @param options fetch 选项
 * @param timeout 超时时间（毫秒）
 * @param retryCount 重试次数
 * @param retryDelay 重试延迟（毫秒）
 * @returns Response 对象
 */
export const fetchWithRetry = async (
  url: string,
  options: RequestInit = {},
  timeout: number = DEFAULT_TIMEOUT,
  retryCount: number = DEFAULT_RETRY_COUNT,
  retryDelay: number = RETRY_DELAY
): Promise<Response> => {
  let lastError: Error | null = null;
  
  // 尝试请求（初次 + 重试）
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const isRetry = attempt > 0;
      if (isRetry) {
        console.log(`🔄 重试请求 (${attempt}/${retryCount}):`, url);
        await delay(retryDelay);
      } else {
        console.log('📤 发起请求:', url);
      }
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // 检查 HTTP 状态码
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      console.log('✅ 请求成功:', url, '状态:', response.status);
      return response;
      
    } catch (error: any) {
      lastError = error;
      
      // 判断错误类型
      const isTimeout = error.name === 'AbortError';
      const isNetworkError = error.message.includes('Network') || 
                             error.message.includes('Failed to fetch');
      const isServerError = error.message.includes('HTTP 5');
      
      // 可重试的错误类型
      const shouldRetry = (isTimeout || isNetworkError || isServerError) && 
                          attempt < retryCount;
      
      if (isTimeout) {
        console.error(`⏱️ 请求超时 (尝试 ${attempt + 1}/${retryCount + 1}):`, url);
      } else {
        console.error(`❌ 请求失败 (尝试 ${attempt + 1}/${retryCount + 1}):`, url, error.message);
      }
      
      // 如果不应该重试，直接抛出错误
      if (!shouldRetry) {
        // 格式化错误消息
        if (isTimeout) {
          throw new Error('请求超时，请检查网络连接');
        } else if (isNetworkError) {
          throw new Error('网络连接失败，请检查网络设置');
        } else {
          throw new Error(`请求失败: ${error.message}`);
        }
      }
    }
  }
  
  // 所有重试都失败了
  throw new Error(`请求失败（已重试${retryCount}次）: ${lastError?.message || '未知错误'}`);
};

/**
 * 安全的 JSON 解析
 * @param response Response 对象
 * @returns 解析后的 JSON 对象
 */
export const safeJsonParse = async (response: Response): Promise<any> => {
  try {
    const text = await response.text();
    console.log('📥 响应内容:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
    
    if (!text || text.trim() === '') {
      throw new Error('响应内容为空');
    }
    
    return JSON.parse(text);
  } catch (error: any) {
    console.error('❌ JSON 解析失败:', error.message);
    throw new Error(`数据解析失败: ${error.message}`);
  }
};

/**
 * 请求结果包装器
 */
export interface RequestResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  fromCache?: boolean;
}

/**
 * 创建成功结果
 */
export const successResult = <T>(data: T, fromCache: boolean = false): RequestResult<T> => ({
  success: true,
  data,
  fromCache,
});

/**
 * 创建失败结果
 */
export const errorResult = <T>(error: string): RequestResult<T> => ({
  success: false,
  error,
});

/**
 * 检查响应是否成功
 * @param json API 响应的 JSON 数据
 * @returns 是否成功
 */
export const isApiSuccess = (json: any): boolean => {
  // 水木社区 API 成功标志
  // 1. code === 1 或 code === 0 (不同接口可能不同)
  // 2. 或者直接有 data 字段
  // 3. 或者 success === true
  return (
    json.code === 1 ||
    json.code === 0 ||
    json.success === true ||
    (json.data !== undefined && json.data !== null)
  );
};

/**
 * 提取 API 错误消息
 * @param json API 响应的 JSON 数据
 * @returns 错误消息
 */
export const extractErrorMessage = (json: any): string => {
  return json.message || json.msg || json.error || '请求失败';
};

/**
 * 日志工具
 */
export const logRequest = {
  start: (url: string, method: string = 'GET') => {
    console.log(`\n🚀 [${method}] ${url}`);
  },
  
  params: (params: any) => {
    console.log('📋 请求参数:', JSON.stringify(params, null, 2));
  },
  
  success: (url: string, data: any) => {
    const dataStr = typeof data === 'string' 
      ? data.substring(0, 200) 
      : JSON.stringify(data).substring(0, 200);
    console.log(`✅ 请求成功: ${url}`);
    console.log(`📦 响应数据: ${dataStr}${dataStr.length >= 200 ? '...' : ''}`);
  },
  
  error: (url: string, error: any) => {
    console.error(`❌ 请求失败: ${url}`);
    console.error(`💥 错误信息:`, error.message || error);
  },
  
  cache: (url: string, hit: boolean) => {
    if (hit) {
      console.log(`💾 缓存命中: ${url}`);
    } else {
      console.log(`🔍 缓存未命中: ${url}`);
    }
  },
};
