import 'package:flutter/services.dart';

/// Keeps only [allowed] characters, at most [maxLength] of them, and never leaves the cursor or the keyboard's
/// composing region outside the text.
///
/// Why (Crashlytics, 2026-11-04): with `FilteringTextInputFormatter` + `LengthLimitingTextInputFormatter`, Android's SMS
/// code autofill (or a keyboard suggestion) can paste more than fits; the text is cut but the IME's composing region
/// still points past the end and Android throws `IndexOutOfBoundsException: invalid selection start: 6`. When this
/// formatter changes the text it collapses the selection to a valid offset and clears the composing region.
class SafeInputFormatter extends TextInputFormatter {
  SafeInputFormatter({required this.allowed, required this.maxLength});

  /// One allowed character, e.g. `RegExp(r'[0-9٠-٩۰-۹]')`
  final RegExp allowed;
  final int maxLength;

  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final kept = StringBuffer();
    var count = 0;
    // Where the cursor lands: the kept characters before the original cursor
    final cursor = newValue.selection.isValid ? newValue.selection.extentOffset.clamp(0, newValue.text.length) : newValue.text.length;
    var newCursor = 0;
    var i = 0;
    for (final rune in newValue.text.runes) {
      final ch = String.fromCharCode(rune);
      if (count < maxLength && allowed.hasMatch(ch)) {
        kept.write(ch);
        count++;
        if (i < cursor) newCursor = kept.length;
      }
      i += ch.length;
    }
    final text = kept.toString();
    if (text == newValue.text) {
      // Nothing removed: keep what the keyboard sent, only make sure it fits
      return _fits(newValue) ? newValue : newValue.copyWith(composing: TextRange.empty, selection: TextSelection.collapsed(offset: text.length));
    }
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: newCursor.clamp(0, text.length)),
      composing: TextRange.empty,
    );
  }

  static bool _fits(TextEditingValue v) {
    final n = v.text.length;
    bool inside(int o) => o >= -1 && o <= n;
    return inside(v.selection.baseOffset) &&
        inside(v.selection.extentOffset) &&
        (!v.composing.isValid || (v.composing.start <= n && v.composing.end <= n));
  }
}
