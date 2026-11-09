// «حساب جديد» with a number that already has an account: once the code is verified (verify-otp says
// userExists after the code, never before), the member is signed in instead of being asked to fill the
// sign-up form for nothing.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/auth/auth_repository.dart';
import 'package:naseebak_app/features/auth/otp_screen.dart';
import 'package:naseebak_app/features/auth/pending_auth.dart';

import 'helpers/fake_api.dart';

Future<void> pumpFor(WidgetTester tester, [int steps = 20]) async {
  for (var i = 0; i < steps; i++) {
    await tester.pump(const Duration(milliseconds: 20));
  }
}

void main() {
  testWidgets('a registered number on «حساب جديد» is signed in after the code', (tester) async {
    final adapter = FakeAdapter()
      ..on('POST', '/api/auth/verify-otp', const FakeResponse(200, {'verified': true, 'userExists': true}))
      ..on('POST', '/api/mobile/auth/token',
          FakeResponse(201, {'token': 'nsb_x', 'expiresAt': '2026-12-28T00:00:00Z', 'user': meJson()}));
    final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore()));
    addTearDown(container.dispose);
    container
        .read(pendingAuthProvider.notifier)
        .set(const PendingAuth(phone: '0796922292', countryCode: 'JO', mode: OtpContext.register));
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const OtpScreen())));
    await tester.pump();
    await tester.enterText(find.byKey(const Key('otp-field')), '123456');
    await pumpFor(tester);
    expect(adapter.to('POST', '/api/mobile/auth/token'), hasLength(1));
    expect(container.read(authControllerProvider).isSignedIn, isTrue);
  });
}
