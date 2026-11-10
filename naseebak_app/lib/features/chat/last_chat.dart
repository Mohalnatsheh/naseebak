import 'package:shared_preferences/shared_preferences.dart';

/// The chat on screen, remembered so a cold start soon after Android or iOS ended the app in the background reopens
/// it (QA A2-L11: after process death the app came back on home). Leaving the chat normally forgets it.
class LastChat {
  LastChat._();

  static const key = 'last_open_chat';

  /// How long after the app went away the chat is still reopened
  static const window = Duration(minutes: 30);

  static Future<void> remember(SharedPreferences prefs, String chatId, {DateTime? now}) =>
      prefs.setString(key, '$chatId|${(now ?? DateTime.now()).millisecondsSinceEpoch}');

  static Future<void> forget(SharedPreferences prefs, String chatId) async {
    final v = prefs.getString(key);
    if (v != null && v.split('|').first == chatId) await prefs.remove(key);
  }

  /// The route to reopen at start (`/chats/<id>`), once: it is forgotten as it is read
  static String? take(SharedPreferences prefs, {DateTime? now}) {
    final v = prefs.getString(key);
    if (v == null) return null;
    prefs.remove(key);
    final parts = v.split('|');
    if (parts.length != 2 || parts.first.isEmpty) return null;
    final at = int.tryParse(parts[1]);
    if (at == null) return null;
    final age = (now ?? DateTime.now()).difference(DateTime.fromMillisecondsSinceEpoch(at));
    if (age.isNegative || age > window) return null;
    return '/chats/${parts.first}';
  }
}
