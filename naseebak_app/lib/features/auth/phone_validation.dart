import '../../core/localization/digits.dart';
import '../country_selection/country.dart';

/// The national part of a typed number (no dial code, no leading 0), digits only.
///
/// Accepts Arabic-Indic digits, spaces, dashes, "+962…", "00962…" and "07…".
String nationalNumber(String input, Country country) {
  var v = toLatinDigits(input).replaceAll(RegExp(r'[^0-9+]'), '');
  final dial = country.dialDigits;
  if (v.startsWith('+')) v = v.substring(1);
  if (v.startsWith('00$dial')) {
    v = v.substring(2 + dial.length);
  } else if (dial.isNotEmpty && v.startsWith(dial) && v.length > dial.length + 7) {
    v = v.substring(dial.length);
  }
  v = v.replaceAll('+', '');
  while (v.startsWith('0')) {
    v = v.substring(1);
  }
  return v;
}

/// null when fine, else the Arabic message to show under the field.
String? validatePhone(String input, Country country) {
  final national = nationalNumber(input, country);
  if (national.isEmpty) return 'رقم ال${country.phoneWord} مطلوب';
  final RegExp pattern;
  try {
    pattern = RegExp(country.nationalPattern);
  } catch (_) {
    return national.length >= 8 ? null : 'رقم ${country.phoneWord} غير صالح';
  }
  if (!pattern.hasMatch(national)) {
    return 'رقم ${country.phoneWord} غير صالح. مثال: ${country.phoneExample}';
  }
  return null;
}

/// The number as the backend's forms accept it: local format with the leading 0 ("0791234567").
String localPhone(String input, Country country) => '0${nationalNumber(input, country)}';

/// A 6-digit code typed with any digits → Western digits, or null when it isn't 6 digits.
String? normalizeOtp(String input) {
  final v = toLatinDigits(input).replaceAll(RegExp(r'[^0-9]'), '');
  return v.length == 6 ? v : null;
}

/// Display form of a stored phone ("962791234567" → "+962 79 123 4567" is overkill; keep "0791234567").
String displayPhone(String stored, Country country) {
  final dial = country.dialDigits;
  if (stored.startsWith(dial)) return '0${stored.substring(dial.length)}';
  return stored;
}
