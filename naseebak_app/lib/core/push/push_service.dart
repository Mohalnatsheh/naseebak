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
/// A start that fails (no network for the registration…) is tried again on the next resume.
class PushService with WidgetsBindingObserver {
  PushService(this._ref);

  final Ref _ref;
  final _local = FlutterLocalNotificationsPlugin();
  final _subs = <StreamSubscription<dynamic>>[];

  /// Signed in: push is wanted (start, and retry on resume until it worked)
  bool _wanted = false;
  bool _starting = false;
  bool _started = false;
  bool _observing = false;

  /// Started at least once (Firebase ready): there may be notifications of this member to take off on sign-out
  bool _used = false;

  /// The push that opened the app is read once per launch, before (and whatever happens to) the registration
  bool _initialRead = false;
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
    if (!_ready) return;
    _wanted = _used = true;
    if (!_observing) {
      WidgetsBinding.instance.addObserver(this);
      _observing = true;
    }
    if (_started || _starting) return;
    _starting = true;
    final messaging = FirebaseMessaging.instance;
    // Opened from a push while the app was closed: whatever happens to the registration below
    if (!_initialRead) {
      try {
        final initial = await messaging.getInitialMessage();
        _initialRead = true;
        if (initial != null) _open(initial.data['url'] as String?);
      } catch (e) {
        debugPrint('[push] initial message failed: $e');
      }
    }
    try {
      await _initLocal();
      // No system prompt here (it came bare over the first setup step): home asks once after setup, with a word on
      // what the notices are for (`PushAskGate`); a member who already allowed gets pushes as before
      // No system banner while the app is open (on iOS either): `_showForeground` shows one, except for the screen
      // already open
      await messaging.setForegroundNotificationPresentationOptions(alert: false, badge: true, sound: false);

      if (_subs.isEmpty) {
        _subs
          ..add(messaging.onRegistered.listen(_register))
          ..add(FirebaseMessaging.onMessage.listen(_showForeground))
          ..add(FirebaseMessaging.onMessageOpenedApp.listen((m) => _open(m.data['url'] as String?)));
      }
      // The FID arrives through onRegistered (now, and again whenever FCM changes it)
      await messaging.register();
      // Signed out meanwhile: reset() already stopped everything
      _started = _wanted;
    } catch (e) {
      // Not started: the next resume (or sign-in) tries again
      debugPrint('[push] start failed: $e');
    } finally {
      _starting = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _wanted && !_started) start();
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

  /// Signed out (also after a 401): stop listening and take the previous member's notifications off the tray (on
  /// Android this also clears those FCM showed); the next sign-in registers again.
  void reset() {
    for (final s in _subs) {
      s.cancel();
    }
    _subs.clear();
    _wanted = false;
    _started = false;
    _fid = null;
    if (_observing) {
      WidgetsBinding.instance.removeObserver(this);
      _observing = false;
    }
    // Not `_ready`: this also runs when the provider is disposed, when it can no longer be read
    if (_used) {
      _local.cancelAll().catchError((Object e) => debugPrint('[push] clearing notifications failed: $e'));
    }
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

  /// No system banner while the app is open (Android never shows one, iOS is told not to): show it ourselves, on both.
  /// Not for the screen already open: a message in the chat being read just appears in it, like WhatsApp.
  /// iOS presents it only while AppDelegate is the notification center delegate (`UNUserNotificationCenter.current()
  /// .delegate = self`), so that firebase_messaging leaves local notifications to this plugin.
  void _showForeground(RemoteMessage m) {
    final n = m.notification;
    if (n == null) return;
    final url = m.data['url'] as String?;
    if (url != null && _ref.read(routerProvider).state.uri.toString() == appRouteForLink(url: url)) return;
    final tag = n.android?.tag ?? m.collapseKey ?? m.threadId;
    _local.show(
      id: foregroundNoticeId(tag: tag, messageId: m.messageId, title: n.title, body: n.body),
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
        // Same chat thread as the system's pushes; sound like they would have had
        iOS: DarwinNotificationDetails(
          presentAlert: true,
          presentBanner: true,
          presentList: true,
          presentSound: true,
          threadIdentifier: m.threadId,
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

/// Android tells notices apart by tag and id together, and FCM's own tray notice for a tagged push has id 0: a tagged
/// banner uses id 0 too, so it replaces the tray notice of the same chat instead of showing beside it (QA A2-L7)
int foregroundNoticeId({String? tag, String? messageId, String? title, String? body}) =>
    tag != null ? 0 : (messageId ?? '$title$body').hashCode;
