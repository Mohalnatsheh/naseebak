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

  // Shared texts every member sees, whatever the gender (QA round 2 A-L03, A2-L1, A-L07)
  test('shared messages and labels say «يمكنك …» or a neutral form', () {
    const phrases = [
      'حاول مرة أخرى',
      'سجّل الدخول من جديد',
      'اضغط لإزالة',
      'اضغط مطولاً',
      'أرسل تذكرة',
      'اختر تفضيلاً',
      'ويحصل هو',
      'اختر التاريخ',
      'نصية فقط',
      "'عضو Pro'",
    ];
    for (final f in Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
      final text = f.readAsStringSync();
      for (final p in phrases) {
        expect(text.contains(p), isFalse, reason: '${f.path} has «$p»');
      }
      // The command «تحقق من …» wherever it stands (not the nouns «التحقق من» / «رمز تحقق من», review A2 minor 9)
      expect(RegExp(r'(?<!ال|رمز )تحقق من').hasMatch(text), isFalse, reason: '${f.path} has «تحقق من»');
    }
  });
}
