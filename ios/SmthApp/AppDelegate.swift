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
    
    // 启动 React Native
    factory.startReactNative(withModuleName: "SmthApp", in: window, launchOptions: launchOptions)
    
    // 显示窗口
    window?.makeKeyAndVisible()

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
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
