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

  /// Chats and a match's photos are on screen (lib/core/privacy/screen_privacy.dart): iOS can't block a screenshot,
  /// so the app hides them while the screen is recorded or mirrored and says so after a screenshot
  private var secure = false
  private var systemChannel: FlutterMethodChannel?

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    guard let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "NaseebakSystem") else { return }
    let channel = FlutterMethodChannel(name: "naseebak/system", binaryMessenger: registrar.messenger())
    systemChannel = channel
    channel.setMethodCallHandler { [weak self] call, result in
      switch call.method {
      // «فتح الإعدادات» on the notifications-off card (lib/core/push/push_permission.dart)
      case "openNotificationSettings":
        let page: String
        if #available(iOS 16.0, *) {
          page = UIApplication.openNotificationSettingsURLString
        } else {
          page = UIApplication.openSettingsURLString
        }
        if let url = URL(string: page) { UIApplication.shared.open(url) }
        result(nil)
      // «الإعدادات» after the microphone was refused (lib/core/system/app_settings.dart)
      case "openAppSettings":
        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
        result(nil)
      case "setSecure":
        self?.secure = (call.arguments as? Bool) ?? false
        // The current state, so a screen opened during a recording hides at once
        result(UIScreen.main.isCaptured)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
    NotificationCenter.default.addObserver(
      forName: UIScreen.capturedDidChangeNotification, object: nil, queue: .main
    ) { [weak self] _ in
      self?.systemChannel?.invokeMethod("captureChanged", arguments: UIScreen.main.isCaptured)
    }
    NotificationCenter.default.addObserver(
      forName: UIApplication.userDidTakeScreenshotNotification, object: nil, queue: .main
    ) { [weak self] _ in
      guard let self = self, self.secure else { return }
      self.systemChannel?.invokeMethod("screenshotTaken", arguments: nil)
    }
  }
}
