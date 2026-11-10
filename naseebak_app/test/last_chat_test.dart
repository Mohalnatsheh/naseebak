// QA A2-L11: after Android ended the app in the background during a chat, it reopened on home.
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/chat/last_chat.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  final t0 = DateTime(2026, 11, 10, 20);

  test('a chat left in the background reopens at the next start within 30 minutes, once', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    await LastChat.remember(prefs, 'c1', now: t0);
    expect(LastChat.take(prefs, now: t0.add(const Duration(minutes: 5))), '/chats/c1');
    expect(LastChat.take(prefs, now: t0.add(const Duration(minutes: 6))), isNull);
  });

  test('too long ago, or left normally: home', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    await LastChat.remember(prefs, 'c1', now: t0);
    expect(LastChat.take(prefs, now: t0.add(const Duration(hours: 2))), isNull);
    await LastChat.remember(prefs, 'c2', now: t0);
    await LastChat.forget(prefs, 'c1');
    expect(prefs.getString(LastChat.key), isNotNull);
    await LastChat.forget(prefs, 'c2');
    expect(LastChat.take(prefs, now: t0), isNull);
  });
}
