#import <React/RCTBridgeModule.h>

// SplashScreenManager Native Module 桥接文件
// 将 Swift 的 SplashScreenManager 暴露给 JS 端
@interface RCT_EXTERN_MODULE(SplashScreenManager, NSObject)

RCT_EXTERN_METHOD(hide:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
