/**
 * 安全检测工具
 * 用于检测和过滤潜在的恶意内容，防止XSS、SQL注入、命令注入等攻击
 */

// 安全检查结果类型
export interface SafetyCheckResult {
  safe: boolean;
  reason?: string;
}

// 安全检查配置选项
export interface SecurityCheckOptions {
  maxLength?: number;           // 最大内容长度限制
  checkScripts?: boolean;       // 是否检测脚本注入
  checkSQLInjection?: boolean;  // 是否检测SQL注入
  checkCommandInjection?: boolean; // 是否检测命令注入
  checkInternalUrls?: boolean;  // 是否检测内网地址
  logSuspiciousParams?: boolean; // 是否记录可疑URL参数
}

// 默认配置
const DEFAULT_OPTIONS: SecurityCheckOptions = {
  maxLength: 4096,
  checkScripts: true,
  checkSQLInjection: true,
  checkCommandInjection: true,
  checkInternalUrls: true,
  logSuspiciousParams: true,
};

/**
 * 检测内容是否安全
 * @param content 待检测的内容
 * @param options 检测选项
 * @returns 安全检查结果
 */
export const isContentSafe = (
  content: string,
  options: SecurityCheckOptions = {}
): SafetyCheckResult => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 1. 长度限制：防止超大内容导致的性能问题或攻击
  if (opts.maxLength && content.length > opts.maxLength) {
    return { safe: false, reason: '内容长度超过限制' };
  }

  // 2. 检测常见的恶意脚本模式
  if (opts.checkScripts) {
    const scriptPatterns = [
      // JavaScript 相关
      /<script[\s\S]*?>/i,
      /javascript\s*:/i,
      /on\w+\s*=/i,  // onclick, onerror 等事件处理器
      /eval\s*\(/i,
      /Function\s*\(/i,
      /setTimeout\s*\(/i,
      /setInterval\s*\(/i,
      
      // 数据URI可能包含恶意内容
      /data\s*:\s*text\/html/i,
      /data\s*:\s*application\/javascript/i,
      
      // SSRF相关
      /\b(file|gopher|dict|ldap)\s*:\/\//i,
      
      // 特殊字符序列
      /\x00/,  // NULL字符
      /[\x01-\x08\x0b\x0c\x0e-\x1f]/,  // 控制字符
    ];

    for (const pattern of scriptPatterns) {
      if (pattern.test(content)) {
        return { safe: false, reason: '检测到可疑内容' };
      }
    }
  }

  // 3. 检测SQL注入
  if (opts.checkSQLInjection) {
    const sqlPattern = /(\b(union|select|insert|update|delete|drop|truncate|exec|execute)\b.*\b(from|into|table|database)\b)/i;
    if (sqlPattern.test(content)) {
      return { safe: false, reason: '检测到可疑内容' };
    }
  }

  // 4. 检测命令注入
  if (opts.checkCommandInjection) {
    const commandPattern = /[;&|`$].*\b(rm|wget|curl|bash|sh|python|perl|ruby|nc|netcat)\b/i;
    if (commandPattern.test(content)) {
      return { safe: false, reason: '检测到可疑内容' };
    }
  }

  // 5. 检查URL中的可疑参数和内网地址
  if (content.startsWith('http://') || content.startsWith('https://')) {
    const urlCheckResult = checkUrlSafety(content, opts);
    if (!urlCheckResult.safe) {
      return urlCheckResult;
    }
  }

  return { safe: true };
};

/**
 * 检查URL安全性
 * @param url URL字符串
 * @param options 检测选项
 * @returns 安全检查结果
 */
export const checkUrlSafety = (
  url: string,
  options: SecurityCheckOptions = {}
): SafetyCheckResult => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    // 使用简单的URL解析方式，兼容React Native
    const urlMatch = url.match(/^(https?):\/\/([^/:]+)(:\d+)?(\/[^?#]*)?\??([^#]*)?(#.*)?$/i);
    if (urlMatch) {
      const hostname = (urlMatch[2] || '').toLowerCase();
      const queryString = urlMatch[5] || '';

      // 检查是否包含可疑的查询参数
      if (opts.logSuspiciousParams) {
        const suspiciousParams = ['redirect', 'callback', 'return_url', 'next', 'url', 'goto', 'target'];
        for (const param of suspiciousParams) {
          const paramMatch = queryString.match(new RegExp(`${param}=([^&]+)`, 'i'));
          if (paramMatch) {
            try {
              const value = decodeURIComponent(paramMatch[1]);
              if (value.startsWith('http') || value.includes('://')) {
                // 允许但记录日志，用户需要手动确认
                console.warn('URL包含重定向参数:', { param, value: value.substring(0, 50) });
              }
            } catch (e) {
              // decodeURIComponent 可能失败
            }
          }
        }
      }

      // 检查是否为内网地址
      if (opts.checkInternalUrls) {
        if (isInternalHost(hostname)) {
          return { safe: false, reason: '不允许访问内网地址' };
        }
      }
    }
  } catch (e) {
    // URL解析失败，可能是格式问题
    console.warn('URL解析失败:', e);
  }

  return { safe: true };
};

/**
 * 检查是否为内网主机地址
 * @param hostname 主机名
 * @returns 是否为内网地址
 */
export const isInternalHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan')
  );
};

/**
 * 安全过滤：清理显示内容中的危险字符
 * @param content 原始内容
 * @returns 过滤后的安全内容
 */
export const sanitizeForDisplay = (content: string): string => {
  // 移除控制字符
  let sanitized = content.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  // 转义HTML特殊字符（防止某些场景下的XSS）
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return sanitized;
};

/**
 * 清理HTML标签（更彻底的过滤）
 * @param content 原始内容
 * @returns 移除HTML标签后的内容
 */
export const stripHtmlTags = (content: string): string => {
  return content
    .replace(/<[^>]*>/g, '')  // 移除所有HTML标签
    .replace(/&nbsp;/g, ' ')  // 替换HTML空格
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
};

/**
 * 截断内容并添加省略号
 * @param content 原始内容
 * @param maxLength 最大长度
 * @returns 截断后的内容
 */
export const truncateContent = (content: string, maxLength: number = 200): string => {
  if (content.length <= maxLength) {
    return content;
  }
  return content.substring(0, maxLength) + '...';
};

/**
 * 二维码内容安全检查（便捷方法）
 * @param data 二维码数据
 * @returns 安全检查结果
 */
export const isQRCodeSafe = (data: string): SafetyCheckResult => {
  return isContentSafe(data, {
    maxLength: 4096,
    checkScripts: true,
    checkSQLInjection: true,
    checkCommandInjection: true,
    checkInternalUrls: true,
    logSuspiciousParams: true,
  });
};

/**
 * 检测内容类型
 * @param content 内容字符串
 * @returns 内容类型
 */
export const detectContentType = (content: string): 'url' | 'json' | 'text' => {
  if (content.startsWith('http://') || content.startsWith('https://')) {
    return 'url';
  }
  
  try {
    JSON.parse(content);
    return 'json';
  } catch {
    return 'text';
  }
};
