import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/app/app.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/localization/arabic_count.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/home/counts.dart';
import 'package:naseebak_app/features/home/profile_strength_card.dart';
import 'package:naseebak_app/features/profile/profile_repository.dart';

import 'helpers/fake_api.dart';

void main() {
  group('«قوة ملفك» rows', () {
    test('the quiz row never repeats its own name: it says what the quiz adds', () {
      const quiz = StrengthSection(key: 'quiz', label: 'اختبار الشخصية', percentage: 0, missing: ['اختبار الشخصية']);
      expect(strengthSubtitle(quiz), 'أسئلة قصيرة تجعل نسبة التوافق أدق');
    });

    test('other rows list what is missing (up to three)', () {
      const basic = StrengthSection(key: 'basic', label: 'البيانات الأساسية', percentage: 50, missing: ['الطول', 'الوزن', 'الوظيفة', 'التخصص']);
      expect(strengthSubtitle(basic), 'الطول، الوزن، الوظيفة');
      const done = StrengthSection(key: 'family', label: 'العائلة', percentage: 80);
      expect(strengthSubtitle(done), isNull);
    });
  });

  test('counted nouns: one, two, 3–10, 11+', () {
    String requests(int n) => arabicCount(n, one: 'طلب', two: 'طلبان', few: 'طلبات', many: 'طلباً');
    expect(requests(1), 'طلب');
    expect(requests(2), 'طلبان');
    expect(requests(3), '3 طلبات');
    expect(requests(11), '11 طلباً');
  });

  testWidgets('back in the app: the counts and the bell are read again (no timer)', (tester) async {
    final adapter = FakeAdapter()
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
      ..on('GET', '/api/me/counts', const FakeResponse(200, {'flags': {}}))
      ..on('GET', '/api/notifications/unread-count', const FakeResponse(200, {'count': 0}));
    final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
    addTearDown(container.dispose);
    container.read(authControllerProvider);
    await tester.pumpWidget(const SizedBox());
    for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: rtlApp(ResumeRefresh(
        child: Consumer(builder: (context, ref, _) {
          ref.watch(countsProvider);
          ref.watch(unreadNotificationsProvider);
          return const SizedBox();
        }),
      )),
    ));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(adapter.to('GET', '/api/me/counts'), hasLength(1));
    expect(adapter.to('GET', '/api/notifications/unread-count'), hasLength(1));

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(adapter.to('GET', '/api/me/counts'), hasLength(2));
    expect(adapter.to('GET', '/api/notifications/unread-count'), hasLength(2));
  });
}
