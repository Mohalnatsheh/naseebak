import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/localization/digits.dart';
import 'package:naseebak_app/features/chat/chat_format.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';

ChatMessage msg(String id, DateTime at, {bool mine = false, SendState state = SendState.sent}) =>
    ChatMessage(id: id, body: id, createdAt: at, mine: mine, state: state);

void main() {
  final now = DateTime(2026, 10, 31, 16, 0);

  test('day labels: today, yesterday, then the date', () {
    expect(chatDayLabel(DateTime(2026, 10, 31, 9), now: now), 'اليوم');
    expect(chatDayLabel(DateTime(2026, 10, 30, 23), now: now), 'أمس');
    expect(chatDayLabel(DateTime(2026, 10, 20, 9), now: now), formatDate(DateTime(2026, 10, 20, 9), withYear: false));
  });

  test('time left: Arabic counting, urgent in the last 3 days, nothing once over', () {
    expect(chatTimeLeft(now.add(const Duration(days: 14)), now: now)!.text, 'تبقّى 14 يوماً');
    expect(chatTimeLeft(now.add(const Duration(days: 5)), now: now)!.text, 'تبقّى 5 أيام');
    final two = chatTimeLeft(now.add(const Duration(days: 2)), now: now)!;
    expect(two.text, 'تبقّى يومان');
    expect(two.urgent, isTrue);
    expect(chatTimeLeft(now.add(const Duration(hours: 5)), now: now)!.text, 'تبقّى أقل من يوم');
    expect(chatTimeLeft(now.subtract(const Duration(minutes: 1)), now: now), isNull);
  });

  test('a run from one person: a tail on its first bubble, tight gaps after it, a chip per day', () {
    // newest first, as the chat draws it
    final items = [
      msg('c', DateTime(2026, 10, 31, 15, 3)),
      msg('b', DateTime(2026, 10, 31, 15, 1)),
      msg('a', DateTime(2026, 10, 30, 22, 0)),
    ];
    final c = chatRowLayout(items, 0), b = chatRowLayout(items, 1), a = chatRowLayout(items, 2);
    expect(b.tail, isTrue, reason: 'first of today');
    expect(c.tail, isFalse);
    expect(c.tightTop, isTrue);
    expect(b.daySeparator, isTrue, reason: 'first message of today');
    expect(a.daySeparator, isTrue, reason: 'oldest message');
    expect(c.daySeparator, isFalse);
  });

  test('a message still sending stays in its run (its own time and state are on its bubble)', () {
    final items = [
      msg('new', DateTime(2026, 10, 31, 15, 2), mine: true, state: SendState.sending),
      msg('old', DateTime(2026, 10, 31, 15, 1), mine: true),
    ];
    expect(chatRowLayout(items, 0).tail, isFalse);
    expect(chatRowLayout(items, 1).tail, isTrue);
  });
}
