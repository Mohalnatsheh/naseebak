import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/push/push_permission.dart';

void main() {
  test('the notifications prompt asks again daily (owner, 2026-11-11): home card and chat chip hide for one day', () {
    expect(pushCardSnooze, const Duration(days: 1));
    expect(pushChipHide, const Duration(days: 1));
  });

  test('push code uses the colour tokens, never a raw hex colour (audit M10)', () {
    for (final f in Directory('lib/core/push').listSync().whereType<File>().where((f) => f.path.endsWith('.dart'))) {
      expect(RegExp(r'Color\(0x').hasMatch(f.readAsStringSync()), isFalse, reason: f.path);
    }
  });
}
