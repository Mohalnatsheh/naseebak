import 'package:shared_preferences/shared_preferences.dart';

/// Remembers the country picked before sign-in (only the code; everything else comes from the API).
class CountryStore {
  CountryStore(this._prefs);

  static const _key = 'selected_country';
  final SharedPreferences _prefs;

  String? read() {
    final v = _prefs.getString(_key);
    return v == null || v.isEmpty ? null : v.toUpperCase();
  }

  Future<void> write(String code) => _prefs.setString(_key, code.toUpperCase());

  Future<void> clear() => _prefs.remove(_key);
}
