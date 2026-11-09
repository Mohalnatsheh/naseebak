import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/auth/auth_repository.dart';
import 'package:naseebak_app/features/auth/pending_auth.dart';
import 'package:naseebak_app/features/auth/register_screen.dart';

import 'helpers/fake_api.dart';

void main() {
  testWidgets('a sign-up error goes away once that answer is given', (tester) async {
    tester.view.physicalSize = const Size(1179, 2556);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final container = ProviderContainer(overrides: await testOverrides(FakeAdapter()));
    addTearDown(container.dispose);
    container.read(pendingAuthProvider.notifier).set(
          const PendingAuth(phone: '0796922292', countryCode: 'JO', mode: OtpContext.register),
        );
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const RegisterScreen())));
    await tester.pump();

    await tester.ensureVisible(find.byKey(const Key('register-submit')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('register-submit')));
    await tester.pumpAndSettle();
    expect(find.text('الجنس مطلوب'), findsOneWidget);

    await tester.ensureVisible(find.text('امرأة'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('امرأة'));
    await tester.pump();
    expect(find.text('الجنس مطلوب'), findsNothing);

    await tester.dragUntilVisible(find.byKey(const Key('first-name')), find.byType(Scrollable).first, const Offset(0, 300));
    await tester.pumpAndSettle();
    expect(find.text('الاسم الأول مطلوب'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('first-name')), 'مريم');
    await tester.pump();
    expect(find.text('الاسم الأول مطلوب'), findsNothing);
  });
}
