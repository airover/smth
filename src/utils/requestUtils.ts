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

class FetchHttpError extends Error {
  status: number;
  statusText: string;
  retryAfterMs?: number;

  constructor(response: Response) {
    super(`HTTP ${response.status}: ${response.statusText}`);
    this.name = 'FetchHttpError';
    this.status = response.status;
    this.statusText = response.statusText;

    const retryAfter = response.headers.get('Retry-After');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (!Number.isNaN(seconds)) {
        this.retryAfterMs = seconds * 1000;
      } else {
        const timestamp = Date.parse(retryAfter);
        if (!Number.isNaN(timestamp)) {
          this.retryAfterMs = Math.max(0, timestamp - Date.now());
        }
      }
    }
  }
}

/**
 * 延迟函数
 */
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const getRetryDelay = (attempt: number, baseDelay: number, retryAfterMs?: number): number => {
  if (retryAfterMs != null) {
    return Math.min(retryAfterMs, 5000);
  }
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(exponentialDelay + jitter, 5000);
};

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
  retryCount?: number,
  retryDelay: number = RETRY_DELAY
): Promise<Response> => {
  let lastError: Error | null = null;
  const method = (options.method || 'GET').toString().toUpperCase();
  const isIdempotentRequest = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
  const effectiveRetryCount = retryCount ?? (isIdempotentRequest ? 2 : DEFAULT_RETRY_COUNT);
  
  // 尝试请求（初次 + 重试）
  for (let attempt = 0; attempt <= effectiveRetryCount; attempt++) {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const isRetry = attempt > 0;
      if (isRetry) {
        await delay(getRetryDelay(attempt, retryDelay, (lastError as FetchHttpError | null)?.retryAfterMs));
      }

      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // 检查 HTTP 状态码
      if (!response.ok) {
        throw new FetchHttpError(response);
      }
      
      return response;
      
    } catch (error: any) {
      lastError = error;
      
      // 判断错误类型
      const isTimeout = error.name === 'AbortError';
      const isNetworkError = error.message.includes('Network') || 
                             error.message.includes('Failed to fetch');
      const isRetryableHttpError = error instanceof FetchHttpError &&
                                   (error.status === 408 || error.status === 429 || error.status >= 500);
      
      // 可重试的错误类型
      const shouldRetry = (isTimeout || isNetworkError || isRetryableHttpError) &&
                          attempt < effectiveRetryCount;
      
      if (isTimeout) {
        console.error(`⏱️ 请求超时 (尝试 ${attempt + 1}/${effectiveRetryCount + 1}):`, url);
      } else {
        console.error(`❌ 请求失败 (尝试 ${attempt + 1}/${effectiveRetryCount + 1}):`, url, error.message);
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
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
  
  // 所有重试都失败了
  throw new Error(`请求失败（已重试${effectiveRetryCount}次）: ${lastError?.message || '未知错误'}`);
};

/**
 * 安全的 JSON 解析
 * @param response Response 对象
 * @returns 解析后的 JSON 对象
 */
export const safeJsonParse = async (response: Response): Promise<any> => {
  try {
    const text = await response.text();
    
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
  start: (_url: string, _method: string = 'GET') => {
    // 日志已禁用
  },
  
  params: (_params: any) => {
    // 日志已禁用
  },
  
  success: (_url: string, _data: any) => {
    // 日志已禁用
  },
  
  error: (url: string, error: any) => {
    console.error(`❌ 请求失败: ${url}`);
    console.error(`💥 错误信息:`, error.message || error);
  },
  
  cache: (_url: string, _hit: boolean) => {
    // 日志已禁用
  },
};

/**
 * HTTP Header 构建工具
 * 统一封装所有后台接口访问的通用 header
 * 
 * 使用示例：
 * 
 * // 1. GET 请求 - 获取数据
 * const cookies = await getCookies();
 * const headers = buildGetHeaders(cookies, 'https://wap.newsmth.net/board/123');
 * const response = await fetchWithRetry(url, { headers });
 * 
 * // 2. POST 请求 - 提交表单
 * const cookies = await getCookies();
 * const headers = buildPostHeaders(
 *   cookies,
 *   'application/x-www-form-urlencoded',
 *   'https://wap.newsmth.net/post/123'
 * );
 * const response = await fetchWithRetry(url, {
 *   method: 'POST',
 *   headers,
 *   body: formData.toString()
 * });
 * 
 * // 3. DELETE 请求 - 删除资源
 * const cookies = await getCookies();
 * const headers = buildDeleteHeaders(
 *   cookies,
 *   'https://wap.newsmth.net/article/123'
 * );
 * const response = await fetchWithRetry(url, { method: 'DELETE', headers });
 * 
 * // 4. 登录请求
 * const cookies = await getCookies();
 * const headers = buildLoginHeaders(cookies);
 * const response = await fetchWithRetry(loginUrl, {
 *   method: 'POST',
 *   headers,
 *   body: formData.toString()
 * });
 * 
 * // 5. 自定义配置
 * const headers = buildHeaders({
 *   cookie: cookies,
 *   acceptType: 'html',
 *   referer: 'https://wap.newsmth.net/board/123',
 *   customHeaders: {
 *     'X-Custom-Header': 'custom-value'
 *   }
 * });
 */

// User-Agent 常量
export const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

// Accept 类型常量
export const ACCEPT_TYPE = {
  JSON: 'application/json, text/plain, */*',
  HTML: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// 基础 URL
export const BASE_URL = 'https://wap.newsmth.net';

/**
 * 构建通用 HTTP Headers
 * @param options 配置选项
 * @returns Headers 对象
 */
export interface BuildHeadersOptions {
  /** Cookie 字符串 */
  cookie?: string | null;
  /** Accept 类型，默认为 JSON */
  acceptType?: 'json' | 'html';
  /** Content-Type，用于 POST/PUT 请求 */
  contentType?: string;
  /** Referer URL */
  referer?: string;
  /** Origin URL，默认为 BASE_URL */
  origin?: string;
  /** 是否包含 Authorization header，默认为 true */
  includeAuth?: boolean;
  /** 是否包含 X-Requested-With header，默认为 false */
  includeXRequestedWith?: boolean;
  /** 额外的自定义 headers */
  customHeaders?: Record<string, string>;
}

export const buildHeaders = (options: BuildHeadersOptions = {}): Record<string, string> => {
  const {
    cookie,
    acceptType = 'json',
    contentType,
    referer,
    origin,
    includeAuth = true,
    includeXRequestedWith = false,
    customHeaders = {},
  } = options;

  const headers: Record<string, string> = {
    // User-Agent (必需)
    'User-Agent': USER_AGENT,
    
    // Accept (必需)
    'Accept': acceptType === 'html' ? ACCEPT_TYPE.HTML : ACCEPT_TYPE.JSON,
    
    // Accept-Language (必需)
    'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    
    // Authorization (大部分接口需要)
    ...(includeAuth && { 'Authorization': 'Basic Og==' }),
    
    // Cache Control
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    
    // Access Control
    'Access-Control-Allow-Origin': '*',
  };

  // Cookie (如果提供)
  if (cookie) {
    headers['Cookie'] = cookie;
  }

  // Content-Type (POST/PUT 请求)
  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  // Referer (部分接口需要)
  if (referer) {
    headers['Referer'] = referer;
  }

  // Origin (POST/DELETE 请求需要)
  if (origin !== undefined) {
    headers['Origin'] = origin;
  } else if (contentType || referer) {
    // 如果有 Content-Type 或 Referer，自动添加 Origin
    headers['Origin'] = BASE_URL;
  }

  // X-Requested-With (AJAX 请求标识)
  if (includeXRequestedWith) {
    headers['X-Requested-With'] = 'XMLHttpRequest';
  }

  // 合并自定义 headers (会覆盖默认值)
  return {
    ...headers,
    ...customHeaders,
  };
};

/**
 * 构建 GET 请求的 Headers
 * @param cookie Cookie 字符串
 * @param referer Referer URL
 * @param customHeaders 自定义 headers
 * @returns Headers 对象
 */
export const buildGetHeaders = (
  cookie?: string | null,
  referer?: string,
  customHeaders?: Record<string, string>
): Record<string, string> => {
  return buildHeaders({
    cookie,
    referer,
    customHeaders,
  });
};

/**
 * 构建 POST 请求的 Headers
 * @param cookie Cookie 字符串
 * @param contentType Content-Type，默认为 application/x-www-form-urlencoded
 * @param referer Referer URL
 * @param customHeaders 自定义 headers
 * @returns Headers 对象
 */
export const buildPostHeaders = (
  cookie?: string | null,
  contentType: string = 'application/x-www-form-urlencoded',
  referer?: string,
  customHeaders?: Record<string, string>
): Record<string, string> => {
  return buildHeaders({
    cookie,
    contentType,
    referer,
    origin: BASE_URL,
    customHeaders,
  });
};

/**
 * 构建 DELETE 请求的 Headers
 * @param cookie Cookie 字符串
 * @param referer Referer URL
 * @param customHeaders 自定义 headers
 * @returns Headers 对象
 */
export const buildDeleteHeaders = (
  cookie?: string | null,
  referer?: string,
  customHeaders?: Record<string, string>
): Record<string, string> => {
  return buildHeaders({
    cookie,
    contentType: 'application/x-www-form-urlencoded',
    referer,
    origin: BASE_URL,
    customHeaders,
  });
};

/**
 * 构建登录请求的 Headers
 * @param cookie Cookie 字符串
 * @returns Headers 对象
 */
export const buildLoginHeaders = (cookie?: string | null): Record<string, string> => {
  return buildHeaders({
    cookie,
    contentType: 'application/x-www-form-urlencoded',
    referer: `${BASE_URL}/login`,
    origin: BASE_URL,
    includeXRequestedWith: true,
    customHeaders: {
      'Accept': 'application/json, text/plain, */*',
    },
  });
};
