import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../features/notifications/notifications_screen.dart';
import '../routing/router.dart';

/// True once `Firebase.initializeApp()` worked in `main()` (needs android/app/google-services.json).
/// False in tests and in builds without Firebase: push is then simply off.
final firebaseReadyProvider = Provider<bool>((ref) => false);

final pushServiceProvider = Provider<PushService>((ref) {
  final service = PushService(ref);
  ref.onDispose(service.reset);
  return service;
});

/// Push through Firebase Cloud Messaging (the website stays on OneSignal).
///
/// The device is its Firebase Installation ID (FID, FCM direct send). Signed in → ask permission, `register()`, send
/// each `onRegistered` FID to `POST /api/mobile/push`. The server ties it to this sign-in, so a revoked sign-in gets no
/// more pushes. Logout → `DELETE /api/mobile/push` first, then `unregister()`.
/// A push carries `data.url` (the website path); a tap opens the same screen as the in-app list (`appRouteForLink`).
class PushService {
  PushService(this._ref);

  final Ref _ref;
  final _local = FlutterLocalNotificationsPlugin();
  final _subs = <StreamSubscription<dynamic>>[];
  bool _started = false;
  bool _localReady = false;
  String? _fid;

  /// Same id as the server's `FCM_ANDROID_CHANNEL` and the manifest's default channel
  static const channel = AndroidNotificationChannel(
    'naseebak_default',
    'إشعارات نصيبك',
    description: 'التوافقات والاقتراحات والرسائل',
    importance: Importance.high,
  );

  bool get _ready => _ref.read(firebaseReadyProvider);

  /// After sign-in (or a restored session). Safe to call more than once.
  Future<void> start() async {
    if (!_ready || _started) return;
    _started = true;
    try {
      await _initLocal();
      final messaging = FirebaseMessaging.instance;
      // Android 13+ and iOS show the system prompt once; a refusal just means no pushes
      await messaging.requestPermission();
      await messaging.setForegroundNotificationPresentationOptions(alert: true, badge: true, sound: true);

      _subs
        ..add(messaging.onRegistered.listen(_register))
        ..add(FirebaseMessaging.onMessage.listen(_showForeground))
        ..add(FirebaseMessaging.onMessageOpenedApp.listen((m) => _open(m.data['url'] as String?)));
      // The FID arrives through onRegistered (now, and again whenever FCM changes it)
      await messaging.register();

      // Opened from a push while the app was closed
      final initial = await messaging.getInitialMessage();
      if (initial != null) _open(initial.data['url'] as String?);
    } catch (e) {
      debugPrint('[push] start failed: $e');
    }
  }

  /// Before `/api/mobile/auth/logout` (needs the sign-in still valid): this device gets no more pushes.
  Future<void> unregister() async {
    if (!_ready) return;
    try {
      final fid = _fid;
      if (fid != null) await _ref.read(apiClientProvider).delete('/api/mobile/push', body: {'fid': fid});
      await FirebaseMessaging.instance.unregister();
    } catch (e) {
      debugPrint('[push] unregister failed: $e');
    }
    reset();
  }

  /// Signed out (also after a 401): stop listening; the next sign-in registers again.
  void reset() {
    for (final s in _subs) {
      s.cancel();
    }
    _subs.clear();
    _started = false;
    _fid = null;
  }

  Future<void> _initLocal() async {
    if (_localReady) return;
    await _local.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('ic_stat_notify'),
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
      onDidReceiveNotificationResponse: (r) => _open(r.payload),
    );
    await _local
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);
    _localReady = true;
  }

  Future<void> _register(String fid) async {
    _fid = fid;
    try {
      await _ref
          .read(apiClientProvider)
          .post('/api/mobile/push', body: {'fid': fid, 'platform': Platform.isIOS ? 'ios' : 'android'});
    } catch (e) {
      debugPrint('[push] register failed: $e');
    }
  }

  /// Android doesn't show a push while the app is open: show it ourselves (iOS does, see the presentation options).
  /// Not for the screen already open: a message in the chat being read just appears in it, like WhatsApp.
  void _showForeground(RemoteMessage m) {
    final n = m.notification;
    if (n == null || !Platform.isAndroid) return;
    final url = m.data['url'] as String?;
    if (url != null && _ref.read(routerProvider).state.uri.toString() == appRouteForLink(url: url)) return;
    final tag = n.android?.tag;
    _local.show(
      id: (tag ?? m.messageId ?? '${n.title}${n.body}').hashCode,
      title: n.title,
      body: n.body,
      payload: m.data['url'] as String?,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          channel.id,
          channel.name,
          channelDescription: channel.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: 'ic_stat_notify',
          color: const Color(0xFFC19250),
          tag: tag,
        ),
      ),
    );
  }

  /// Opens the push's screen once the app is past the splash / sign-in screens (a cold start lands on the splash).
  void _open(String? url) {
    final route = appRouteForLink(url: url);
    final router = _ref.read(routerProvider);

    bool atEntry() {
      final path = router.routerDelegate.currentConfiguration.uri.path;
      return path.isEmpty || const ['/splash', '/intro', '/country'].contains(path) || path.startsWith('/auth/');
    }

    void show() => openAppRoute(router, route);

    if (!atEntry()) {
      show();
      return;
    }
    late VoidCallback listener;
    listener = () {
      if (atEntry()) return;
      router.routerDelegate.removeListener(listener);
      show();
    };
    router.routerDelegate.addListener(listener);
  }
}
