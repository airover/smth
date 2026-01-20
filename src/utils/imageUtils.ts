/**
 * 图片URL处理工具函数
 * 用于确保所有图片URL都符合安全标准（HTTPS）
 */

/**
 * 标准化图片URL，确保使用HTTPS协议
 * @param url 原始图片URL
 * @returns 标准化后的HTTPS URL
 */
export const normalizeImageUrl = (url: string | undefined | null): string => {
  if (!url) return '';

  // 去除首尾空格
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return '';

  // 1. 如果是相对路径，添加HTTPS域名
  if (!trimmedUrl.startsWith('http')) {
    return `https://file.mysmth.net/${trimmedUrl}`;
  }

  // 2. 强制转换 HTTP 为 HTTPS
  if (trimmedUrl.startsWith('http://')) {
    return trimmedUrl.replace('http://', 'https://');
  }

  // 3. 已经是 HTTPS，直接返回
  return trimmedUrl;
};

/**
 * 批量标准化图片URL列表
 * @param urls 图片URL数组
 * @returns 标准化后的URL数组
 */
export const normalizeImageUrls = (urls: (string | undefined | null)[]): string[] => {
  return urls
    .filter(url => url) // 过滤空值
    .map(url => normalizeImageUrl(url))
    .filter(url => url); // 过滤标准化后仍为空的URL
};

/**
 * 判断URL是否为图片
 * @param url 图片URL
 * @param name 可选的文件名
 * @returns 是否为图片
 */
export const isImageUrl = (url: string, name?: string): boolean => {
  const imageReg = /\.(jpg|jpeg|png|gif|webp|bmp|svg)($|\?)/i;
  return (
    imageReg.test(url) ||
    (name ? imageReg.test(name) : false) ||
    url.includes('/file/') ||
    url.includes('/attachment/')
  );
};

/**
 * 判断URL是否为视频
 * @param url 视频URL
 * @param name 可选的文件名
 * @returns 是否为视频
 */
export const isVideoUrl = (url: string, name?: string): boolean => {
  const videoReg = /\.(mp4|mov|m4v|webm|avi|mkv)($|\?)/i;
  return videoReg.test(url) || (name ? videoReg.test(name) : false);
};

/**
 * 获取图片的缩略图URL（如果支持）
 * @param url 原始图片URL
 * @param width 缩略图宽度
 * @param height 缩略图高度
 * @returns 缩略图URL或原始URL
 */
export const getThumbnailUrl = (
  url: string,
  width: number = 400,
  height: number = 400
): string => {
  const normalizedUrl = normalizeImageUrl(url);
  
  // 如果是水木社区的图片服务器，可以添加缩略图参数
  if (normalizedUrl.includes('file.mysmth.net') || normalizedUrl.includes('ks3-cn-beijing.ksyun.com')) {
    // 某些CDN支持参数化缩略图，例如：?x-oss-process=image/resize,w_400,h_400
    // 这里暂时返回原图，如果服务器支持缩略图，可以添加相应参数
    return normalizedUrl;
  }
  
  return normalizedUrl;
};

/**
 * 验证图片URL是否可访问（仅做基本格式验证）
 * @param url 图片URL
 * @returns 是否为有效的URL格式
 */
export const isValidImageUrl = (url: string): boolean => {
  try {
    const normalizedUrl = normalizeImageUrl(url);
    if (!normalizedUrl) return false;
    
    // 基本的URL格式验证
    const urlPattern = /^https:\/\/.+\..+/i;
    return urlPattern.test(normalizedUrl);
  } catch {
    return false;
  }
};

/**
 * 从HTML内容中提取图片URL
 * @param html HTML内容
 * @returns 图片URL数组
 */
export const extractImagesFromHtml = (html: string): string[] => {
  if (!html) return [];
  
  const imgRegex = /<img[^>]+src="([^">]+)"/gi;
  const urls: string[] = [];
  let match;
  
  while ((match = imgRegex.exec(html)) !== null) {
    if (match[1]) {
      urls.push(normalizeImageUrl(match[1]));
    }
  }
  
  return urls;
};

/**
 * 生成图片占位符URL（用于加载失败时显示）
 * @param width 宽度
 * @param height 高度
 * @returns 占位符URL
 */
export const getPlaceholderImageUrl = (width: number = 400, height: number = 300): string => {
  // 可以使用 placeholder.com 或其他占位图服务
  return `https://via.placeholder.com/${width}x${height}/CCCCCC/666666?text=Image`;
};
