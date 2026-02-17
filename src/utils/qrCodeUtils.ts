import jsQR from 'jsqr';
import RNFetchBlob from 'rn-fetch-blob';

/**
 * 从图片路径中解码二维码
 * @param imagePath 图片路径（支持 file:// 协议）
 * @returns 二维码内容，如果识别失败返回 null
 */
export const decodeQRCodeFromImage = async (imagePath: string): Promise<string | null> => {
  try {
    // 移除 file:// 前缀
    const cleanPath = imagePath.replace('file://', '');
    
    // 读取图片为 base64
    const base64Data = await RNFetchBlob.fs.readFile(cleanPath, 'base64');
    
    // 将 base64 转换为 ImageData
    // 注意：这里需要使用 Canvas API 或者原生模块来解码图片
    // 由于 React Native 没有内置的 Canvas API，我们需要使用一个变通方案
    
    // 方案：使用 react-native-image-picker 的 base64 数据
    // 但 jsQR 需要 ImageData 格式（包含 width, height, data）
    
    // 这里我们需要一个辅助函数来将图片转换为 ImageData
    const imageData = await convertImageToImageData(cleanPath);
    
    if (!imageData) {
      console.error('无法转换图片为 ImageData');
      return null;
    }
    
    // 使用 jsQR 解码
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });
    
    if (code && code.data) {
      return code.data;
    }
    
    return null;
  } catch (error) {
    console.error('解码二维码失败:', error);
    return null;
  }
};

/**
 * 将图片转换为 ImageData 格式
 * 注意：这个函数需要原生模块支持
 * 在 React Native 中，我们需要使用原生代码来解码图片并获取像素数据
 */
const convertImageToImageData = async (imagePath: string): Promise<{
  data: Uint8ClampedArray;
  width: number;
  height: number;
} | null> => {
  try {
    // 这里需要原生模块支持
    // 暂时返回 null，需要实现原生桥接
    console.warn('convertImageToImageData 需要原生模块支持');
    return null;
  } catch (error) {
    console.error('转换图片失败:', error);
    return null;
  }
};

/**
 * 简化版：使用 react-native-image-picker 直接获取图片数据
 * 这个方法依赖于图片选择器返回的数据
 */
export const decodeQRCodeFromBase64 = (
  base64Data: string,
  width: number,
  height: number
): string | null => {
  try {
    // 将 base64 转换为 Uint8ClampedArray
    // 注意：这里假设 base64Data 是 RGBA 格式的原始像素数据
    // React Native 环境没有全局 atob，使用手动解码
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lookup = new Uint8Array(256);
    for (let i = 0; i < chars.length; i++) {
      lookup[chars.charCodeAt(i)] = i;
    }
    let bufferLength = base64Data.length * 0.75;
    if (base64Data[base64Data.length - 1] === '=') bufferLength--;
    if (base64Data[base64Data.length - 2] === '=') bufferLength--;
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const binaryBytes = new Uint8Array(arrayBuffer);
    let p = 0;
    for (let i = 0; i < base64Data.length; i += 4) {
      const encoded1 = lookup[base64Data.charCodeAt(i)];
      const encoded2 = lookup[base64Data.charCodeAt(i + 1)];
      const encoded3 = lookup[base64Data.charCodeAt(i + 2)];
      const encoded4 = lookup[base64Data.charCodeAt(i + 3)];
      binaryBytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
      binaryBytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
      binaryBytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }
    const binaryString = String.fromCharCode(...binaryBytes);
    const len = binaryString.length;
    const bytes = new Uint8ClampedArray(len);
    
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // 使用 jsQR 解码
    const code = jsQR(bytes, width, height, {
      inversionAttempts: 'dontInvert',
    });
    
    if (code && code.data) {
      return code.data;
    }
    
    return null;
  } catch (error) {
    console.error('解码二维码失败:', error);
    return null;
  }
};
