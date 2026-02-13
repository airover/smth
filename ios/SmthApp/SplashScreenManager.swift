import UIKit
import React

/// 启动屏管理器 - 将 LaunchScreen.storyboard 作为覆盖层显示在窗口上
/// JS 端在准备好后调用 hide() 来移除覆盖层，实现无缝过渡
@objc(SplashScreenManager)
class SplashScreenManager: NSObject {
  
  /// 覆盖层视图，静态持有以便在 show/hide 之间共享
  private static var overlayView: UIView?
  
  /// 在主线程上执行，确保 UI 操作安全
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }
  
  /// 显示启动屏覆盖层（从 AppDelegate 调用）
  @objc
  static func show() {
    DispatchQueue.main.async {
      guard let window = UIApplication.shared.delegate?.window ?? nil else { return }
      // 避免重复添加
      guard overlayView == nil else { return }
      
      // 从 LaunchScreen.storyboard 加载视图
      let storyboard = UIStoryboard(name: "LaunchScreen", bundle: nil)
      if let vc = storyboard.instantiateInitialViewController() {
        let view = vc.view!
        view.frame = window.bounds
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.tag = 9999
        window.addSubview(view)
        overlayView = view
      }
    }
  }
  
  /// 隐藏启动屏覆盖层（从 JS 端调用）
  @objc
  func hide(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard let overlay = SplashScreenManager.overlayView else {
        resolve(nil)
        return
      }
      
      // 直接移除，不做动画，避免任何视觉跳变
      overlay.removeFromSuperview()
      SplashScreenManager.overlayView = nil
      resolve(nil)
    }
  }
}
