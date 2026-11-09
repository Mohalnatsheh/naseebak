import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Screens shown before the gender is known (intro, sign-in, sign-up, the required update) use no masculine
/// commands: «يمكنك …» or neutral forms (CLAUDE.md).
void main() {
  const files = [
    'lib/features/welcome/intro_screen.dart',
    'lib/features/auth/phone_screen.dart',
    'lib/features/auth/otp_screen.dart',
    'lib/features/auth/register_screen.dart',
    'lib/core/update/app_update.dart',
  ];
  const masculine = ["'ابدأ", "'سجّل", "'أدخل", "'عرّفنا", "'افتح", "'أنشئ", "'حدّث", "'اختر "];

  for (final f in files) {
    test(f, () {
      final text = File(f).readAsStringSync();
      for (final m in masculine) {
        expect(text.contains(m), isFalse, reason: '$f has $m…');
      }
    });
  }
}
