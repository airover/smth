//
//  QRCodeScanner.m
//  SmthApp
//
//  Created by AI Assistant
//

#import "QRCodeScanner.h"
#import <React/RCTLog.h>
#import <UIKit/UIKit.h>
#import <CoreImage/CoreImage.h>

@implementation QRCodeScanner

RCT_EXPORT_MODULE();

// 从图片路径中识别二维码
RCT_EXPORT_METHOD(detectQRCode:(NSString *)imagePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    @try {
      // 移除 file:// 前缀
      NSString *cleanPath = imagePath;
      if ([cleanPath hasPrefix:@"file://"]) {
        cleanPath = [cleanPath substringFromIndex:7];
      }
      
      RCTLogInfo(@"正在加载图片: %@", cleanPath);
      
      // 尝试多种方式加载图片
      UIImage *image = nil;
      
      // 方法1: 直接从文件路径加载
      image = [UIImage imageWithContentsOfFile:cleanPath];
      
      // 方法2: 如果失败，尝试使用 NSData 加载
      if (!image) {
        NSData *imageData = [NSData dataWithContentsOfFile:cleanPath];
        if (imageData) {
          image = [UIImage imageWithData:imageData];
        }
      }
      
      // 方法3: 尝试URL方式加载
      if (!image) {
        NSURL *imageURL = [NSURL fileURLWithPath:cleanPath];
        NSData *imageData = [NSData dataWithContentsOfURL:imageURL];
        if (imageData) {
          image = [UIImage imageWithData:imageData];
        }
      }
      
      if (!image) {
        RCTLogError(@"无法加载图片: %@", cleanPath);
        reject(@"IMAGE_LOAD_ERROR", @"无法加载图片", nil);
        return;
      }
      
      RCTLogInfo(@"图片加载成功，尺寸: %@", NSStringFromCGSize(image.size));
      
      // 确保图片方向正确
      UIImage *normalizedImage = [self normalizeImage:image];
      
      // 转换为 CIImage
      CIImage *ciImage = [[CIImage alloc] initWithImage:normalizedImage];
      
      if (!ciImage) {
        // 如果CIImage创建失败，尝试从CGImage创建
        CGImageRef cgImage = normalizedImage.CGImage;
        if (cgImage) {
          ciImage = [CIImage imageWithCGImage:cgImage];
        }
      }
      
      if (!ciImage) {
        RCTLogError(@"无法转换图片格式");
        reject(@"IMAGE_CONVERT_ERROR", @"无法转换图片格式", nil);
        return;
      }
      
      // 创建二维码检测器（使用高精度）
      NSDictionary *options = @{CIDetectorAccuracy: CIDetectorAccuracyHigh};
      CIDetector *detector = [CIDetector detectorOfType:CIDetectorTypeQRCode
                                                context:nil
                                                options:options];
      
      // 检测二维码
      NSArray *features = [detector featuresInImage:ciImage];
      
      RCTLogInfo(@"检测到 %lu 个二维码特征", (unsigned long)features.count);
      
      if (features.count > 0) {
        // 获取第一个二维码的内容
        CIQRCodeFeature *feature = (CIQRCodeFeature *)features[0];
        NSString *qrCodeString = feature.messageString;
        
        if (qrCodeString && qrCodeString.length > 0) {
          RCTLogInfo(@"成功识别二维码: %@", qrCodeString);
          resolve(qrCodeString);
          return;
        }
      }
      
      // 如果第一次失败，尝试不同方向
      for (int orientation = 1; orientation <= 8; orientation++) {
        CIImage *rotatedImage = [ciImage imageByApplyingOrientation:orientation];
        NSArray *rotatedFeatures = [detector featuresInImage:rotatedImage];
        
        if (rotatedFeatures.count > 0) {
          CIQRCodeFeature *feature = (CIQRCodeFeature *)rotatedFeatures[0];
          NSString *qrCodeString = feature.messageString;
          
          if (qrCodeString && qrCodeString.length > 0) {
            RCTLogInfo(@"旋转后成功识别二维码 (方向 %d): %@", orientation, qrCodeString);
            resolve(qrCodeString);
            return;
          }
        }
      }
      
      // 未识别到二维码
      RCTLogInfo(@"未识别到二维码");
      resolve([NSNull null]);
      
    } @catch (NSException *exception) {
      RCTLogError(@"识别二维码异常: %@", exception.reason);
      reject(@"QR_DETECT_ERROR", exception.reason, nil);
    }
  });
}

// 修正图片方向
- (UIImage *)normalizeImage:(UIImage *)image {
  if (image.imageOrientation == UIImageOrientationUp) {
    return image;
  }
  
  UIGraphicsBeginImageContextWithOptions(image.size, NO, image.scale);
  [image drawInRect:CGRectMake(0, 0, image.size.width, image.size.height)];
  UIImage *normalizedImage = UIGraphicsGetImageFromCurrentImageContext();
  UIGraphicsEndImageContext();
  
  return normalizedImage ?: image;
}

@end
