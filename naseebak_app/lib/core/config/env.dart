import 'package:flutter/foundation.dart';

/// Build-time configuration.
///
/// The API base URL comes from `--dart-define=API_BASE_URL=...`. Without it, debug builds talk to the
/// local backend (`10.0.2.2` is the host machine as seen from the Android emulator) and release builds
/// to production.
class Env {
  Env._();

  static const String _definedBaseUrl = String.fromEnvironment('API_BASE_URL');

  static String get apiBaseUrl {
    if (_definedBaseUrl.isNotEmpty) return stripTrailingSlash(_definedBaseUrl);
    if (kReleaseMode) return 'https://naseebak.com';
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3020';
    }
    return 'http://localhost:3020';
  }

  /// The «دفع تجريبي» button (local mock payments) only exists in debug builds.
  static bool get showMockPayments => kDebugMode;

  static String stripTrailingSlash(String url) =>
      url.endsWith('/') ? url.substring(0, url.length - 1) : url;
}
