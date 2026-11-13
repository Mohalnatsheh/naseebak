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

/// The share of a chat's time still left, for the gold arc round the partner's avatar (S4): out of 14 days, or 21 when
/// more than 14 are left (extended by 7). Null when the chat isn't running.
double? chatTimeFraction(DateTime? expiresAt, {DateTime? now}) {
  if (expiresAt == null) return null;
  final left = expiresAt.difference(now ?? DateTime.now());
  if (left.isNegative) return null;
  final total = Duration(days: left > const Duration(days: 14) ? 21 : 14);
  return (left.inMinutes / total.inMinutes).clamp(0.0, 1.0);
}

/// Layout of message [i] in [newestFirst] (the reversed list the chat draws): a day chip above it, the «رسائل جديدة»
/// divider above it ([unreadFromId]), and whether it starts a run from one sender (the bubble's tail, 8 px above) or
/// continues one (no tail, 2 px above). A run is broken by the other sender, a new day or the unread divider. Every
/// bubble carries its own time, so a pause inside a run doesn't break it.
({bool daySeparator, bool unreadDivider, bool tail, bool tightTop}) chatRowLayout(
  List<ChatMessage> newestFirst,
  int i, {
  String? unreadFromId,
}) {
  final m = newestFirst[i];
  final older = i + 1 < newestFirst.length ? newestFirst[i + 1] : null;
  final daySeparator = older == null || !sameChatDay(older.createdAt, m.createdAt);
  final unreadDivider = unreadFromId != null && m.id == unreadFromId;
  final tail = older == null || daySeparator || unreadDivider || older.mine != m.mine;
  return (daySeparator: daySeparator, unreadDivider: unreadDivider, tail: tail, tightTop: !tail);
}

/// Where «رسائل جديدة» goes when the chat opens: the oldest of the other person's unread messages after my last one
/// (anything before my own reply was seen). Null when nothing of theirs is unread.
String? firstUnreadId(List<ChatMessage> oldestFirst) {
  String? first;
  for (final m in oldestFirst) {
    if (m.mine) {
      first = null;
    } else if (m.readAt == null && m.state == SendState.sent) {
      first ??= m.id;
    }
  }
  return first;
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

/// The partner's messages are marked read only while the chat is the screen on top and the app is in front, and only
/// when they wrote after the last read sent (audit B1). [readUpTo] null = nothing marked yet.
bool readIsDue({
  required bool onTop,
  required bool foreground,
  required DateTime? newestPartnerAt,
  required DateTime? readUpTo,
}) {
  if (!onTop || !foreground || newestPartnerAt == null) return false;
  return readUpTo == null || newestPartnerAt.isAfter(readUpTo);
}
