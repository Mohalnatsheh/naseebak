import 'package:flutter/foundation.dart';

/// Build-time configuration.
///
/// The app talks to production (`https://naseebak.com`) in every build. A local backend is chosen at build time with
/// `--dart-define=API_BASE_URL=...`, e.g. `http://10.0.2.2:3020` (the host machine as seen from the Android emulator).
class Env {
  Env._();

  static const productionUrl = 'https://naseebak.com';
  static const String _definedBaseUrl = String.fromEnvironment('API_BASE_URL');

  static String get apiBaseUrl => _definedBaseUrl.isNotEmpty ? stripTrailingSlash(_definedBaseUrl) : productionUrl;

  /// The «دفع تجريبي» button (local mock payments) exists only in debug builds talking to a local backend; the
  /// production server refuses mock payments anyway.
  static bool get showMockPayments => kDebugMode && isLocal(apiBaseUrl);

  static bool isLocal(String url) => RegExp(r'^http://(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+)(:\d+)?').hasMatch(url);

  static String stripTrailingSlash(String url) => url.endsWith('/') ? url.substring(0, url.length - 1) : url;
}
