import 'package:flutter_secure_storage/flutter_secure_storage.dart';

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
