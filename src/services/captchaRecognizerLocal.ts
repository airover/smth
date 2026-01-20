// 本地验证码识别服务（不依赖外部 API）
// 使用简单的图像处理和模式匹配

/**
 * 简单的验证码识别（基于图像处理）
 * 注意：这个方法准确率较低，主要用于简单验证码
 */
export const recognizeCaptchaLocal = async (imageUrl: string): Promise<{
  success: boolean;
  text?: string;
  confidence?: number;
  error?: string;
}> => {
  try {
    // 这里可以实现简单的图像处理逻辑
    // 1. 下载图片
    // 2. 转换为灰度图
    // 3. 二值化
    // 4. 字符分割
    // 5. 模式匹配
    
    // 由于 React Native 中图像处理比较复杂，
    // 这里提供一个占位符实现
    
    // 可以使用的库：
    // - react-native-image-manipulator (图像处理)
    // - react-native-svg (SVG 处理)
    // - 或者使用原生模块
    
    return {
      success: false,
      error: '本地识别需要实现图像处理逻辑',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '识别失败',
    };
  }
};

/**
 * 使用免费 OCR API（如 OCR.space）
 * 不需要 API Key，但有使用限制
 */
export const recognizeCaptchaWithFreeOCR = async (imageUrl: string): Promise<{
  success: boolean;
  text?: string;
  confidence?: number;
  error?: string;
}> => {
  try {
    // OCR.space 免费 API
    const apiUrl = 'https://api.ocr.space/parse/imageurl';
    const apiKey = 'helloworld'; // 免费 API Key，有使用限制
    
    const params = new URLSearchParams({
      apikey: apiKey,
      url: imageUrl,
      language: 'eng', // 英文
      isOverlayRequired: 'false',
    });

    const response = await fetch(`${apiUrl}?${params.toString()}`, {
      method: 'GET',
    });

    const data = await response.json();
    
    if (data.ParsedResults && data.ParsedResults.length > 0) {
      const text = data.ParsedResults[0].ParsedText.trim();
      // 清理结果：只保留字母和数字
      const cleanedText = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      
      if (cleanedText.length >= 4 && cleanedText.length <= 6) {
        return {
          success: true,
          text: cleanedText,
          confidence: 0.7,
        };
      }
    }
    
    return {
      success: false,
      error: '未识别到有效验证码',
    };
  } catch (error) {
    console.error('Free OCR recognition error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '识别失败',
    };
  }
};

