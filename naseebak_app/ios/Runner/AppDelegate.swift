import Flutter
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // The app shows foreground pushes itself (flutter_local_notifications, never for the open screen) and routes their
    // taps: it must be the notification delegate, or iOS answers with firebase_messaging's "no alert" setting
    UNUserNotificationCenter.current().delegate = self
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    // «فتح الإعدادات» on the notifications-off card (lib/core/push/push_permission.dart)
    guard let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "NaseebakSystem") else { return }
    FlutterMethodChannel(name: "naseebak/system", binaryMessenger: registrar.messenger()).setMethodCallHandler { call, result in
      guard call.method == "openNotificationSettings" else { return result(FlutterMethodNotImplemented) }
      let page: String
      if #available(iOS 16.0, *) {
        page = UIApplication.openNotificationSettingsURLString
      } else {
        page = UIApplication.openSettingsURLString
      }
      if let url = URL(string: page) { UIApplication.shared.open(url) }
      result(nil)
    }
  }
}
