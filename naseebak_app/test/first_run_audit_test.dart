import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/features/auth/logout_button.dart';
import 'package:naseebak_app/features/home/counts.dart';
import 'package:naseebak_app/features/onboarding/setup_screen.dart';

import 'helpers/fake_api.dart';
import 'setup_progress_test.dart' show basics, setupWith;

/// The first-run and account audit (2026-11-14): setup, sign-in, splash, gates and settings.
void main() {
  group('setup', () {
    Future<ProviderContainer> openSetup(WidgetTester tester, FakeAdapter adapter, List<Override> overrides) async {
      final container = ProviderContainer(overrides: overrides);
      addTearDown(container.dispose);
      await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const SetupScreen())));
      await tester.pumpAndSettle();
      return container;
    }

    testWidgets('I1: a counts refresh (back in the app, a push) keeps the form, never the skeleton', (tester) async {
      final (adapter, overrides) = await setupWith(basics, savedStep: 1);
      final container = await openSetup(tester, adapter, overrides);
      expect(find.text('الخطوة 2 من 3'), findsOneWidget);
      final release = Completer<void>();
      adapter.hold('GET', '/api/me/counts', release.future);
      container.invalidate(countsProvider);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(container.read(countsProvider).isLoading, isTrue);
      expect(find.byKey(const Key('setup-next')), findsOneWidget);
      expect(find.text('الخطوة 2 من 3'), findsOneWidget);
      release.complete();
      await tester.pumpAndSettle();
      expect(find.text('الخطوة 2 من 3'), findsOneWidget);
    });

    testWidgets('I2: /api/profile failing shows an error with a retry, never an empty form that could save',
        (tester) async {
      final (adapter, overrides) = await setupWith(basics, savedStep: 1);
      final good = adapter.handlers['GET /api/profile']!;
      adapter.on('GET', '/api/profile', const FakeResponse.network());
      await openSetup(tester, adapter, overrides);
      expect(find.byKey(const Key('setup-next')), findsNothing);
      expect(find.text('إعادة المحاولة'), findsOneWidget);

      adapter.handlers['GET /api/profile'] = good;
      await tester.tap(find.text('إعادة المحاولة'));
      await tester.pumpAndSettle();
      // The draft came back: prefilled and resumed at the saved step
      expect(find.text('الخطوة 2 من 3'), findsOneWidget);
    });

    testWidgets('I3: saved but `me` could not be read: a clear line, and the next tap only re-reads `me`',
        (tester) async {
      final (adapter, overrides) = await setupWith(
        {...basics, 'maritalStatus': 'أعزب/عزباء', 'childrenCount': 0, 'religiosity': 'ملتزم', 'prefAgeMin': 25, 'prefAgeMax': 35},
        savedStep: 2,
      );
      adapter.on('PUT', '/api/profile', const FakeResponse(200, {'profile': {}}));
      final container = await openSetup(tester, adapter, overrides);
      expect(find.text('الخطوة 3 من 3'), findsOneWidget);

      adapter.on('GET', '/api/mobile/me', const FakeResponse.network());
      await tester.ensureVisible(find.byKey(const Key('setup-next')));
      await tester.tap(find.byKey(const Key('setup-next')));
      await tester.pumpAndSettle();
      expect(adapter.to('PUT', '/api/profile'), hasLength(1));
      expect(find.text('تم الحفظ، لكن تعذّر المتابعة. يُرجى المحاولة مرة أخرى.'), findsOneWidget);

      adapter.on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson(country: 'SA')}));
      await tester.ensureVisible(find.byKey(const Key('setup-next')));
      await tester.tap(find.byKey(const Key('setup-next')));
      await tester.pumpAndSettle();
      expect(adapter.to('PUT', '/api/profile'), hasLength(1));
      expect(container.read(authControllerProvider).me!.profileComplete, isTrue);
    });

    testWidgets('M15: an 80-year-old draft birth date opens the picker (inside its range)', (tester) async {
      final now = DateTime.now();
      final dob = DateTime(now.year - 81, now.month, now.day + 2);
      final iso = '${dob.year.toString().padLeft(4, '0')}-${dob.month.toString().padLeft(2, '0')}-'
          '${dob.day.toString().padLeft(2, '0')}T00:00:00.000Z';
      expect(dateOfBirthError(dob), isNull);
      final (adapter, overrides) = await setupWith({...basics, 'dateOfBirth': iso});
      await openSetup(tester, adapter, overrides);
      await tester.tap(find.byIcon(Icons.calendar_month_outlined));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.byType(DatePickerDialog), findsOneWidget);
    });

    testWidgets('M16: «خروج» on the setup asks first', (tester) async {
      final (adapter, overrides) = await setupWith(basics);
      await openSetup(tester, adapter, overrides);
      expect(tester.widget<LogoutButton>(find.byType(LogoutButton)).confirm, isTrue);
    });
  });
}
