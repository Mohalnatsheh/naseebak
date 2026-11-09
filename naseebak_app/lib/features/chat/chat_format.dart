import 'package:flutter/widgets.dart' show TextDirection;

import '../../core/localization/digits.dart';
import 'chat_models.dart';

/// Day separator in a chat: «اليوم», «أمس», else the date (with the year only when it isn't this year).
String chatDayLabel(DateTime date, {DateTime? now}) {
  final local = date.toLocal();
  final n = (now ?? DateTime.now()).toLocal();
  final diff = DateTime(n.year, n.month, n.day).difference(DateTime(local.year, local.month, local.day)).inDays;
  if (diff == 0) return 'اليوم';
  if (diff == 1) return 'أمس';
  return formatDate(local, withYear: local.year != n.year);
}

bool sameChatDay(DateTime a, DateTime b) {
  final x = a.toLocal(), y = b.toLocal();
  return x.year == y.year && x.month == y.month && x.day == y.day;
}

/// «تبقّى 12 يوماً» on an open chat; [urgent] in its last 3 days. Null once it's over.
({String text, bool urgent})? chatTimeLeft(DateTime? expiresAt, {DateTime? now}) {
  if (expiresAt == null) return null;
  final left = expiresAt.difference(now ?? DateTime.now());
  if (left.isNegative) return null;
  final days = (left.inMinutes / (24 * 60)).ceil();
  final text = switch (days) {
    0 || 1 => left.inHours < 24 ? 'تبقّى أقل من يوم' : 'تبقّى يوم واحد',
    2 => 'تبقّى يومان',
    <= 10 => 'تبقّى $days أيام',
    _ => 'تبقّى $days يوماً',
  };
  return (text: text, urgent: days <= 3);
}

/// Messages from one person within this gap read as one group: tighter spacing, one time under the last
const chatGroupGap = Duration(minutes: 5);

bool _grouped(ChatMessage a, ChatMessage b) =>
    a.mine == b.mine &&
    sameChatDay(a.createdAt, b.createdAt) &&
    a.createdAt.difference(b.createdAt).abs() <= chatGroupGap;

/// Layout of message [i] in [newestFirst] (the reversed list the chat draws): a day separator above it, the time
/// under it (last of its group, or not sent yet), a tight gap to the one before it.
({bool daySeparator, bool showTime, bool tightTop}) chatRowLayout(List<ChatMessage> newestFirst, int i) {
  final m = newestFirst[i];
  final older = i + 1 < newestFirst.length ? newestFirst[i + 1] : null;
  final newer = i > 0 ? newestFirst[i - 1] : null;
  return (
    daySeparator: older == null || !sameChatDay(older.createdAt, m.createdAt),
    showTime: m.state != SendState.sent || newer == null || !_grouped(m, newer) || newer.state != SendState.sent,
    tightTop: older != null && _grouped(m, older),
  );
}

/// A message's own direction, from its first strong letter: Arabic (and other right-to-left scripts) → RTL, a Latin
/// letter → LTR. Nothing strong (a number, emoji, punctuation) → LTR, so `07 9 12 34 567` reads in its own order and
/// isn't reversed group by group inside the Arabic layout.
TextDirection messageDirection(String text) {
  for (final r in text.runes) {
    if (_rtl(r)) return TextDirection.rtl;
    if (_ltrLetter(r)) return TextDirection.ltr;
  }
  return TextDirection.ltr;
}

/// Arabic-Indic digits are numbers, not letters: they don't decide the direction
bool _rtl(int r) =>
    !(r >= 0x0660 && r <= 0x0669) && !(r >= 0x06F0 && r <= 0x06F9) && (r >= 0x0590 && r <= 0x08FF) || (r >= 0xFB1D && r <= 0xFDFF) || (r >= 0xFE70 && r <= 0xFEFF);

bool _ltrLetter(int r) =>
    (r >= 0x41 && r <= 0x5A) || (r >= 0x61 && r <= 0x7A) || (r >= 0xC0 && r <= 0x24F) || (r >= 0x370 && r <= 0x52F);
