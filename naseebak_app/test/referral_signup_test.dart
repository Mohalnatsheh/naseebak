import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/routing/website_links.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/auth/auth_repository.dart';
import 'package:naseebak_app/features/auth/pending_auth.dart';
import 'package:naseebak_app/features/auth/phone_screen.dart';
import 'package:naseebak_app/features/onboarding/setup_screen.dart';

import 'helpers/fake_api.dart';
import 'setup_lists_test.dart' show saDetails;
import 'widgets_test.dart' show countriesBody;

void main() {
  testWidgets('a referral link: «حساب جديد» says the friend\'s code will be added', (tester) async {
    final adapter = FakeAdapter()..on('GET', '/api/countries', const FakeResponse(200, countriesBody));
    final container = ProviderContainer(
      overrides: await testOverrides(adapter, prefs: {'selected_country': 'JO', pendingInvitationKey: 'AB12CD34'}),
    );
    addTearDown(container.dispose);
    container.read(authModeProvider.notifier).set(OtpContext.register);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const PhoneScreen())));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('invitation-banner')), findsOneWidget);
    expect(find.textContaining('AB12CD34'), findsOneWidget);

    // Not on «تسجيل الدخول»
    container.read(authModeProvider.notifier).set(OtpContext.login);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('invitation-banner')), findsNothing);
  });

  testWidgets('a code that wasn\'t applied: setup says why and takes another one', (tester) async {
    final adapter = FakeAdapter()
      ..on('GET', '/api/countries/SA', FakeResponse(200, saDetails()))
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson(country: 'SA', complete: false)}))
      ..on('GET', '/api/me/counts', const FakeResponse(200, {
        'flags': {'introRequests': true, 'chat': true, 'mutualSuggestions': true, 'creditOnInterest': true},
      }))
      ..on('GET', '/api/profile', const FakeResponse(200, {
        'user': {'firstName': 'ريم', 'lastName': 'س', 'gender': 'FEMALE', 'profile': null},
        'completeness': {'total': 0},
      }))
      ..on('GET', '/api/profile/parent-info', const FakeResponse(200, {'parentInfo': null}))
      ..on('POST', '/api/referral/apply', const FakeResponse(200, {'message': 'تم'}));
    final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t')));
    addTearDown(container.dispose);
    container.read(inviteWarningProvider.notifier).set('رمز الإحالة غير صالح');
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const SetupScreen())));
    await tester.pumpAndSettle();

    expect(find.text('لم يُطبَّق رمز الدعوة: رمز الإحالة غير صالح'), findsOneWidget);
    await tester.tap(find.text('إدخال رمز آخر'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('invite-retry-code')), 'zx98 yw76');
    await tester.tap(find.text('تطبيق'));
    await tester.pumpAndSettle();

    expect(adapter.to('POST', '/api/referral/apply').single.data, {'code': 'ZX98YW76'});
    expect(find.byKey(const Key('invite-warning')), findsNothing);
    expect(container.read(inviteWarningProvider), isNull);
  });
}
