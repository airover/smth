// 验证码相关服务

const CAPTCHA_BASE_URL = 'https://wap.newsmth.net';

/**
 * 获取验证码图片URL
 */
export const getCaptchaImageUrl = (): string => {
  const timestamp = new Date().getTime();
  return `${CAPTCHA_BASE_URL}/bbsimg/captcha.png?t=${timestamp}`;
};

/**
 * 检查页面是否需要验证码
 */
export const checkCaptchaRequired = (html: string): boolean => {
  // 检查HTML中是否包含验证码相关元素
  const captchaPatterns = [
    /captcha/i,
    /验证码/i,
    /img.*captcha/i,
    /input.*captcha/i,
  ];
  
  return captchaPatterns.some(pattern => pattern.test(html));
};

/**
 * 从HTML中提取验证码图片URL
 */
export const extractCaptchaImageUrl = (html: string): string | null => {
  // 尝试多种方式提取验证码图片URL
  const patterns = [
    /<img[^>]*src=["']([^"']*captcha[^"']*)["'][^>]*>/i,
    /<img[^>]*alt=["'][^"']*验证码[^"']*["'][^>]*src=["']([^"']*)["'][^>]*>/i,
    /captcha[^"']*\.(png|jpg|jpeg|gif)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      let url = match[1];
      // 如果是相对路径，转换为绝对路径
      if (url.startsWith('/')) {
        url = `${CAPTCHA_BASE_URL}${url}`;
      } else if (!url.startsWith('http')) {
        url = `${CAPTCHA_BASE_URL}/${url}`;
      }
      return url;
    }
  }

  return null;
};

