import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';

/// The three intro pages are shown once per install (before the country picker); kept in shared preferences.
class IntroSeenNotifier extends Notifier<bool> {
  static const key = 'intro_seen';

  @override
  bool build() => ref.watch(sharedPreferencesProvider).getBool(key) ?? false;

  Future<void> markSeen() async {
    state = true;
    await ref.read(sharedPreferencesProvider).setBool(key, true);
  }
}

final introSeenProvider = NotifierProvider<IntroSeenNotifier, bool>(IntroSeenNotifier.new);

/// The animated splash holds the start of the app until its animation has played once.
class SplashDoneNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void done() => state = true;
}

final splashDoneProvider = NotifierProvider<SplashDoneNotifier, bool>(SplashDoneNotifier.new);
