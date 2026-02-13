import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // 立即触发网络权限对话框（主流 App 通用做法）
    triggerNetworkPermission()
    
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    // 创建窗口
    window = UIWindow(frame: UIScreen.main.bounds)
    
    // 设置窗口背景色与 LaunchScreen.storyboard 一致，避免原生启动屏消失时闪白/闪黑
    window?.backgroundColor = UIColor.systemBackground
    
    // 启动 React Native
    factory.startReactNative(withModuleName: "SmthApp", in: window, launchOptions: launchOptions)
    
    // 显示窗口
    window?.makeKeyAndVisible()
    
    // 在窗口上覆盖 LaunchScreen.storyboard 视图，等待 JS 端就绪后再移除
    SplashScreenManager.show()

    return true
  }
  
  /// 触发网络权限对话框
  /// 通过发起一个简单的网络请求，iOS 会自动弹出网络权限询问对话框
  private func triggerNetworkPermission() {
    guard let url = URL(string: "https://www.apple.com") else { return }
    let task = URLSession.shared.dataTask(with: url) { _, _, _ in }
    task.resume()
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    // 使用 RCTBundleURLProvider 自动检测 Metro bundler 地址
    // 支持远程调试和真机开发
    if let url = RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index") {
      return url
    }
    
    // 降级方案：使用 localhost（仅适用于模拟器）
    return URL(string: "http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
