import 'package:intl/intl.dart';

/// Arabic-Indic (٠-٩) and Persian (۰-۹) digits → Western digits (0-9).
String toLatinDigits(String input) {
  final buffer = StringBuffer();
  for (final rune in input.runes) {
    if (rune >= 0x0660 && rune <= 0x0669) {
      buffer.writeCharCode(0x30 + rune - 0x0660);
    } else if (rune >= 0x06F0 && rune <= 0x06F9) {
      buffer.writeCharCode(0x30 + rune - 0x06F0);
    } else {
      buffer.writeCharCode(rune);
    }
  }
  return buffer.toString();
}

/// Dates in Arabic with Western digits, e.g. «12 نوفمبر 2026».
String formatDate(DateTime date, {bool withYear = true}) {
  final local = date.toLocal();
  try {
    final f = withYear ? DateFormat('d MMMM y', 'ar') : DateFormat('d MMMM', 'ar');
    return toLatinDigits(f.format(local));
  } catch (_) {
    return '${local.year}-${_two(local.month)}-${_two(local.day)}';
  }
}

String formatTime(DateTime date) {
  final local = date.toLocal();
  return '${_two(local.hour)}:${_two(local.minute)}';
}

/// «اليوم 14:05» / «أمس» / «12 نوفمبر»
String formatRelative(DateTime date, {DateTime? now}) {
  final local = date.toLocal();
  final n = (now ?? DateTime.now()).toLocal();
  final today = DateTime(n.year, n.month, n.day);
  final day = DateTime(local.year, local.month, local.day);
  final diff = today.difference(day).inDays;
  if (diff == 0) return formatTime(local);
  if (diff == 1) return 'أمس';
  return formatDate(local, withYear: local.year != n.year);
}

String _two(int v) => v.toString().padLeft(2, '0');

/// Prices: «3 د.أ», «4.23$» — whole numbers without decimals.
String formatAmount(num value) {
  if (value == value.roundToDouble()) return value.toInt().toString();
  return value.toStringAsFixed(2);
}
