import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the Bearer token lives. The app uses [SecureTokenStore]; tests use [MemoryTokenStore].
abstract class TokenStore {
  Future<String?> read();
  Future<void> write(String token);
  Future<void> clear();
}

class SecureTokenStore implements TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'naseebak_token';
  final FlutterSecureStorage _storage;
  String? _cache;
  bool _loaded = false;

  @override
  Future<String?> read() async {
    if (_loaded) return _cache;
    try {
      _cache = await _storage.read(key: _key);
    } catch (_) {
      // A broken keystore (rare, after a device restore) must not lock the member out: sign in again
      _cache = null;
    }
    _loaded = true;
    return _cache;
  }

  @override
  Future<void> write(String token) async {
    _cache = token;
    _loaded = true;
    await _storage.write(key: _key, value: token);
  }

  @override
  Future<void> clear() async {
    _cache = null;
    _loaded = true;
    try {
      await _storage.delete(key: _key);
    } catch (_) {}
  }
}

/// Set in shared preferences on the first launch of this installation.
const installMarkerKey = 'install_marker';

/// The iOS keychain outlives the app: after a delete and reinstall the previous token is still there, and the next
/// person to install would open the previous member's account. Shared preferences are deleted with the app, so a
/// launch without the marker is a fresh install: forget any saved token, then set the marker. (On Android both go
/// with the app; this is a no-op there.)
Future<void> forgetTokenAfterReinstall(SharedPreferences prefs, TokenStore store) async {
  if (prefs.getBool(installMarkerKey) == true) return;
  await store.clear();
  await prefs.setBool(installMarkerKey, true);
}

class MemoryTokenStore implements TokenStore {
  MemoryTokenStore([this._token]);
  String? _token;

  @override
  Future<String?> read() async => _token;

  @override
  Future<void> write(String token) async => _token = token;

  @override
  Future<void> clear() async => _token = null;
}
