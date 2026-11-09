import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../app/providers.dart';

/// What the member started typing in a chat, kept per member and chat (back, the app killed in the background) until
/// it is sent; all wiped on sign-out.
class ChatDrafts {
  ChatDrafts(this._prefs);
  final SharedPreferences _prefs;

  static const _prefix = 'chat_draft:';
  static String _key(String memberId, String chatId) => '$_prefix$memberId:$chatId';

  String? read(String memberId, String chatId) => _prefs.getString(_key(memberId, chatId));

  Future<void> write(String memberId, String chatId, String text) =>
      text.trim().isEmpty ? _prefs.remove(_key(memberId, chatId)) : _prefs.setString(_key(memberId, chatId), text);

  Future<void> clearAll() async {
    for (final k in _prefs.getKeys().where((k) => k.startsWith(_prefix)).toList()) {
      await _prefs.remove(k);
    }
  }
}

final chatDraftsProvider = Provider<ChatDrafts>((ref) => ChatDrafts(ref.watch(sharedPreferencesProvider)));
