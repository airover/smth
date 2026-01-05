// 验证码识别服务
import AsyncStorage from '@react-native-async-storage/async-storage';

// 使用百度 OCR API 进行验证码识别
// 注意：需要替换为你的 API Key 和 Secret Key
// 获取方式：https://ai.baidu.com/ai-doc/OCR/zk3h7xz52
const BAIDU_OCR_API_KEY = process.env.BAIDU_OCR_API_KEY || 'YOUR_API_KEY';
const BAIDU_OCR_SECRET_KEY = process.env.BAIDU_OCR_SECRET_KEY || 'YOUR_SECRET_KEY';
const BAIDU_OCR_ACCESS_TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token';
const BAIDU_OCR_API_URL = 'https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic';

interface RecognitionResult {
  success: boolean;
  text?: string;
  confidence?: number;
  error?: string;
}

/**
 * 获取百度 OCR Access Token
 */
const getBaiduAccessToken = async (): Promise<string | null> => {
  try {
    // 先检查缓存的 token
    const cachedToken = await AsyncStorage.getItem('baidu_ocr_token');
    const cachedExpire = await AsyncStorage.getItem('baidu_ocr_token_expire');
    
    if (cachedToken && cachedExpire) {
      const expireTime = parseInt(cachedExpire, 10);
      if (Date.now() < expireTime) {
        return cachedToken;
      }
    }

    // 获取新的 token
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: BAIDU_OCR_API_KEY,
      client_secret: BAIDU_OCR_SECRET_KEY,
    });

    const response = await fetch(`${BAIDU_OCR_ACCESS_TOKEN_URL}?${params.toString()}`, {
      method: 'POST',
    });

    const data = await response.json();
    
    if (data.access_token) {
      // 缓存 token（有效期通常为 30 天，这里缓存 29 天）
      const expireTime = Date.now() + 29 * 24 * 60 * 60 * 1000;
      await AsyncStorage.setItem('baidu_ocr_token', data.access_token);
      await AsyncStorage.setItem('baidu_ocr_token_expire', expireTime.toString());
      return data.access_token;
    }
    
    return null;
  } catch (error) {
    console.error('Get Baidu OCR access token error:', error);
    return null;
  }
};

/**
 * 使用百度 OCR 识别验证码
 * 支持 base64 或 URL 方式
 */
const recognizeWithBaiduOCR = async (
  imageBase64: string | null,
  imageUrl?: string,
): Promise<RecognitionResult> => {
  try {
    const accessToken = await getBaiduAccessToken();
    if (!accessToken) {
      return {
        success: false,
        error: '无法获取 OCR 访问令牌',
      };
    }

    // 构建请求体
    let body: string;
    if (imageBase64) {
      // 使用 base64
      body = `image=${encodeURIComponent(imageBase64)}`;
    } else if (imageUrl) {
      // 使用 URL（百度 OCR 支持）
      body = `url=${encodeURIComponent(imageUrl)}`;
    } else {
      return {
        success: false,
        error: '未提供图片数据',
      };
    }

    const response = await fetch(`${BAIDU_OCR_API_URL}?access_token=${accessToken}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body,
    });

    const data = await response.json();
    
    if (data.error_code) {
      return {
        success: false,
        error: data.error_msg || 'OCR API 错误',
      };
    }
    
    if (data.words_result && data.words_result.length > 0) {
      // 提取识别结果
      const words = data.words_result.map((item: any) => item.words).join('');
      // 清理结果：只保留字母和数字
      const cleanedText = words.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      
      return {
        success: true,
        text: cleanedText,
        confidence: 0.8, // 百度 OCR 不直接提供置信度，使用默认值
      };
    }
    
    return {
      success: false,
      error: '未识别到文字',
    };
  } catch (error) {
    console.error('Baidu OCR recognition error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '识别失败',
    };
  }
};

/**
 * 使用本地 OCR（Tesseract.js 的简化版本）
 * 注意：这是一个简单的实现，准确率可能不高
 */
const recognizeWithLocalOCR = async (imageBase64: string): Promise<RecognitionResult> => {
  // 本地 OCR 实现比较复杂，这里提供一个占位符
  // 实际可以使用 react-native-tesseract-ocr 或其他库
  // 但验证码识别通常需要专门的模型
  
  return {
    success: false,
    error: '本地 OCR 未实现',
  };
};

/**
 * 图像预处理：提高识别率
 */
const preprocessImage = async (imageUri: string): Promise<string> => {
  // 这里可以实现图像预处理逻辑
  // 1. 灰度化
  // 2. 二值化
  // 3. 去噪
  // 4. 锐化
  
  // 目前直接返回原图
  return imageUri;
};

/**
 * 从 URL 获取图片并转换为 base64
 * React Native 实现
 */
const imageUrlToBase64 = async (imageUrl: string): Promise<string | null> => {
  try {
    // 在 React Native 中，直接使用 fetch 获取图片
    // 对于 OCR API，通常可以直接传递图片 URL，不需要转换为 base64
    // 但如果需要 base64，可以使用以下方法：
    
    const response = await fetch(imageUrl);
    
    // 检查响应类型
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      console.error('Invalid image content type:', contentType);
      return null;
    }
    
    // 对于需要 base64 的情况，可以使用以下方法：
    // 注意：React Native 中不能直接使用 FileReader
    // 需要使用第三方库或原生模块
    
    // 临时方案：直接返回 URL，让 OCR API 处理
    // 或者使用 react-native-fs 等库来读取文件
    
    // 这里返回 null，表示使用 URL 方式
    // 实际的 OCR API 调用会直接使用 URL
    return null;
  } catch (error) {
    console.error('Convert image to base64 error:', error);
    return null;
  }
};

/**
 * 识别验证码（主函数）
 * @param imageUrl 验证码图片 URL
 * @param useBaiduOCR 是否使用百度 OCR（默认 true）
 * @returns 识别结果
 */
export const recognizeCaptcha = async (
  imageUrl: string,
  useBaiduOCR: boolean = true,
): Promise<RecognitionResult> => {
  try {
    // 1. 预处理图片
    const processedUrl = await preprocessImage(imageUrl);
    
    // 2. 尝试转换为 base64（可选）
    const imageBase64 = await imageUrlToBase64(processedUrl);
    
    // 3. 尝试识别
    let result: RecognitionResult;
    
    if (useBaiduOCR && BAIDU_OCR_API_KEY !== 'YOUR_API_KEY') {
      // 使用百度 OCR（支持 URL 或 base64）
      result = await recognizeWithBaiduOCR(imageBase64, processedUrl);
    } else {
      // 使用本地 OCR（如果实现）
      if (imageBase64) {
        result = await recognizeWithLocalOCR(imageBase64);
      } else {
        return {
          success: false,
          error: '无法加载验证码图片',
        };
      }
    }

    // 4. 验证结果格式（验证码通常是 4-6 位字母数字）
    if (result.success && result.text) {
      const text = result.text.trim();
      // 验证码通常是 4-6 位
      if (text.length >= 4 && text.length <= 6) {
        return {
          ...result,
          text: text,
        };
      } else {
        // 长度不符合，可能识别错误
        return {
          success: false,
          error: '识别结果格式不正确',
          text: text, // 仍然返回，让用户决定是否使用
        };
      }
    }

    return result;
  } catch (error) {
    console.error('Recognize captcha error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '识别失败',
    };
  }
};

/**
 * 简单的本地验证码识别（基于规则）
 * 适用于简单的验证码
 */
export const recognizeCaptchaSimple = async (imageUrl: string): Promise<RecognitionResult> => {
  // 这是一个占位符实现
  // 实际可以使用更简单的图像处理库
  // 或者调用其他免费的 OCR 服务
  
  return {
    success: false,
    error: '简单识别未实现，请使用百度 OCR 或手动输入',
  };
};

