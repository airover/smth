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

  // 1. 处理协议相对URL（以 // 开头）
  if (trimmedUrl.startsWith('//')) {
    return `https:${trimmedUrl}`;
  }

  // 2. 如果是相对路径，添加HTTPS域名
  if (!trimmedUrl.startsWith('http')) {
    return `https://file.mysmth.net/${trimmedUrl}`;
  }

  // 3. 强制转换 HTTP 为 HTTPS
  if (trimmedUrl.startsWith('http://')) {
    return trimmedUrl.replace('http://', 'https://');
  }

  // 4. 已经是 HTTPS，直接返回
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
 * 判断附件是否为图片类型（基于接口返回的type字段）
 * @param attachment 附件对象
 * @returns 是否为图片附件
 */
export const isImageAttachment = (attachment: any): boolean => {
  if (!attachment) return false;
  const type = attachment.type || '';
  // 根据接口返回的type字段判断，如 "image/jpeg", "image/png" 等
  return type.startsWith('image/');
};

/**
 * 判断URL是否为图片（基于URL或文件名后缀）
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
 * 判断附件是否为视频类型（基于接口返回的type字段）
 * @param attachment 附件对象
 * @returns 是否为视频附件
 */
export const isVideoAttachment = (attachment: any): boolean => {
  if (!attachment) return false;
  const type = attachment.type || '';
  // 根据接口返回的type字段判断，如 "video/mp4", "video/quicktime" 等
  return type.startsWith('video/');
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
  
  const imgRegex = /<img[^>]+src="([^"]+)"/gi;
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
 * 从文章 HTML 中提取静态附件地址
 * 支持两种格式：
 * 1. static.mysmth.net 格式: //static.mysmth.net/nForum/att/BoardName/PostId/AttId
 * 2. M 站相对路径格式: /att/BoardName/PostId/AttId（需补全为 https://m.newsmth.net/att/...）
 * @param html HTML 内容
 * @returns 去重后的静态附件地址列表
 */
export const extractStaticAttachmentUrls = (html: string): string[] => {
  if (!html) return [];

  const urls: string[] = [];

  // 格式1: <a> 标签中 href="//static.mysmth.net/nForum/att/..."
  const staticLinkRegex = /<a[^>]+href="(\/\/static\.mysmth\.net\/nForum\/att\/[^\"#?]+)"/gi;
  let match;
  while ((match = staticLinkRegex.exec(html)) !== null) {
    if (match[1]) {
      urls.push(normalizeImageUrl(match[1]));
    }
  }

  // 格式2: <a> 标签中 href="/att/BoardName/PostId/AttId"（M 站相对路径）
  // 提取原图链接（不带 /middle 后缀的）
  const mSiteLinkRegex = /<a[^>]+href="(\/att\/[^\"#?]+)"/gi;
  while ((match = mSiteLinkRegex.exec(html)) !== null) {
    if (match[1]) {
      // M 站相对路径补全为完整 URL
      urls.push(`https://m.newsmth.net${match[1]}`);
    }
  }

  // 格式3: <img> 标签中 src="/att/BoardName/PostId/AttId/middle"（M 站缩略图）
  // 如果上面的 <a> 链接没有匹配到，再从 <img> 标签中提取
  if (urls.length === 0) {
    const mSiteImgRegex = /<img[^>]+src="(\/att\/[^\"#?]+)"/gi;
    while ((match = mSiteImgRegex.exec(html)) !== null) {
      if (match[1]) {
        // 去掉 /middle 后缀以获取原图 URL
        const imgPath = match[1].replace(/\/middle$/, '');
        urls.push(`https://m.newsmth.net${imgPath}`);
      }
    }
  }

  return Array.from(new Set(urls));
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

/**
 * 判断图片是否需要转码为 JPEG
 * @param mimeType MIME 类型
 * @param fileName 文件名
 * @returns 是否需要转码
 */
export const needsJpegConversion = (mimeType?: string, fileName?: string): boolean => {
  // 已经是 JPEG 格式，不需要转码
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return false;
  }
  
  // 根据文件扩展名判断
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') {
      return false;
    }
    // 这些格式需要转码
    if (ext === 'heic' || ext === 'heif' || ext === 'png' || ext === 'webp' || ext === 'bmp') {
      return true;
    }
  }
  
  // 根据 MIME 类型判断
  if (mimeType) {
    const needConvertTypes = ['image/heic', 'image/heif', 'image/png', 'image/webp', 'image/bmp'];
    return needConvertTypes.includes(mimeType.toLowerCase());
  }
  
  return false;
};

/**
 * 将图片转码为 JPEG 格式
 * 使用 react-native-image-crop-picker 进行转换
 * @param imagePath 原始图片路径
 * @param quality JPEG 压缩质量 (0-1)，默认 0.8
 * @returns 转码后的图片信息，包含新路径、宽高等
 */
export const convertToJpeg = async (
  imagePath: string,
  quality: number = 0.8
): Promise<{
  path: string;
  width: number;
  height: number;
  mime: string;
  size: number;
}> => {
  // 动态导入 ImageCropPicker 以避免循环依赖
  const ImageCropPicker = require('react-native-image-crop-picker').default;
  
  try {
    // 使用 openCropper 进行转码，设置 freeStyleCropEnabled 允许自由裁剪
    // 但我们不真正裁剪，只是利用它的转码能力
    const result = await ImageCropPicker.openCropper({
      path: imagePath,
      mediaType: 'photo',
      compressImageQuality: quality,
      forceJpg: true, // 强制转换为 JPEG
      freeStyleCropEnabled: true,
      hideBottomControls: false,
      showCropGuidelines: false,
      includeBase64: false,
    });
    
    return {
      path: result.path,
      width: result.width,
      height: result.height,
      mime: result.mime || 'image/jpeg',
      size: result.size,
    };
  } catch (error: any) {
    // 如果用户取消裁剪，返回原图路径
    if (error.code === 'E_PICKER_CANCELLED') {
      throw error;
    }
    console.error('图片转码失败:', error);
    throw new Error(`图片转码失败: ${error.message}`);
  }
};

/**
 * 批量转码图片为 JPEG 格式（仅转换需要转码的图片）
 * @param imageAssets 图片 asset 数组
 * @param quality JPEG 压缩质量 (0-1)，默认 0.8
 * @param onProgress 进度回调 (已处理数量, 总数量)
 * @returns 转码后的图片 asset 数组
 */
export const convertImagesToJpeg = async (
  imageAssets: Array<{
    uri: string;
    fileName?: string;
    type?: string;
    fileSize?: number;
    width?: number;
    height?: number;
    originalPath?: string;
  }>,
  quality: number = 0.8,
  onProgress?: (processed: number, total: number) => void
): Promise<Array<{
  uri: string;
  fileName: string;
  type: string;
  fileSize?: number;
  width?: number;
  height?: number;
  originalPath?: string;
}>> => {
  const results = [];
  
  for (let i = 0; i < imageAssets.length; i++) {
    const asset = imageAssets[i];
    
    if (onProgress) {
      onProgress(i, imageAssets.length);
    }
    
    // 判断是否需要转码
    if (needsJpegConversion(asset.type, asset.fileName)) {
      try {
        const converted = await convertToJpeg(asset.uri, quality);
        
        // 生成新的文件名（替换扩展名为 .jpg）
        let newFileName = asset.fileName || `image_${Date.now()}.jpg`;
        const lastDotIndex = newFileName.lastIndexOf('.');
        if (lastDotIndex > 0) {
          newFileName = newFileName.substring(0, lastDotIndex) + '.jpg';
        } else {
          newFileName = newFileName + '.jpg';
        }
        
        results.push({
          uri: converted.path,
          fileName: newFileName,
          type: 'image/jpeg',
          fileSize: converted.size,
          width: converted.width,
          height: converted.height,
          originalPath: converted.path,
        });
      } catch (error: any) {
        // 转码失败时保留原图
        console.error(`图片 ${i + 1} 转码失败，使用原图:`, error.message);
        results.push({
          ...asset,
          fileName: asset.fileName || `image_${Date.now()}.jpg`,
          type: asset.type || 'image/jpeg',
        } as any);
      }
    } else {
      // 不需要转码，直接使用原图
      results.push({
        ...asset,
        fileName: asset.fileName || `image_${Date.now()}.jpg`,
        type: asset.type || 'image/jpeg',
      } as any);
    }
  }
  
  if (onProgress) {
    onProgress(imageAssets.length, imageAssets.length);
  }
  
  return results;
};
