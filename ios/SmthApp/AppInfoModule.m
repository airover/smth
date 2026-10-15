#import <React/RCTBridgeModule.h>

@interface AppInfoModule : NSObject <RCTBridgeModule>
@end

@implementation AppInfoModule

RCT_EXPORT_MODULE(AppInfo);

- (NSDictionary *)constantsToExport
{
  NSString *appVersion = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleShortVersionString"];
  return @{@"appVersion": appVersion ?: @""};
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
