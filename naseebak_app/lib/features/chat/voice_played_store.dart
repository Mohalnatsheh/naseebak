import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../app/providers.dart';

/// The partner's voice notes I have played on this phone: the rest show an unplayed dot. Kept only here (the server
/// knows nothing about it), wiped on sign-out with the rest of the chat data.
class VoicePlayedStore extends ChangeNotifier {
  VoicePlayedStore(this._prefs) : _ids = (_prefs.getStringList(prefsKey) ?? const []).toList();

  final SharedPreferences _prefs;
  final List<String> _ids;

  static const prefsKey = 'chat_voice_played';

  /// The newest ids kept: an old note dropped from the list only shows its dot again
  static const maxKept = 500;

  bool isPlayed(String messageId) => _ids.contains(messageId);

  Future<void> markPlayed(String messageId) async {
    if (messageId.isEmpty || _ids.contains(messageId)) return;
    _ids.add(messageId);
    if (_ids.length > maxKept) _ids.removeRange(0, _ids.length - maxKept);
    notifyListeners();
    await _prefs.setStringList(prefsKey, List.of(_ids));
  }

  Future<void> clear() async {
    _ids.clear();
    notifyListeners();
    await _prefs.remove(prefsKey);
  }
}

final voicePlayedStoreProvider = Provider<VoicePlayedStore>((ref) {
  final store = VoicePlayedStore(ref.watch(sharedPreferencesProvider));
  ref.onDispose(store.dispose);
  return store;
});
