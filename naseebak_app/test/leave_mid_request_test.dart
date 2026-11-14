// Crashlytics (1.0.0): a screen closed while its request was still running crashed when the answer came
// («Cannot use "ref" after the widget was disposed», and in release builds «Null check operator» from a
// setState after dispose). Each test leaves the screen mid-request, then lets the answer arrive.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/auth/auth_repository.dart';
import 'package:naseebak_app/features/auth/otp_screen.dart';
import 'package:naseebak_app/features/auth/pending_auth.dart';
import 'package:naseebak_app/features/home/counts.dart';
import 'package:naseebak_app/features/profile/guardian_form.dart';
import 'package:naseebak_app/features/profile/preferences_screen.dart';
import 'package:naseebak_app/features/profile/profile_edit_screen.dart';
import 'package:naseebak_app/features/profile/profile_repository.dart';
import 'package:naseebak_app/features/settings/settings_screen.dart';

import 'helpers/fake_api.dart';
import 'profile_required_and_locks_test.dart' show profileWith, stored, lists;

/// The screen inside one provider scope, so it can be closed while the scope (and its requests) live on
Future<(ProviderContainer, ValueNotifier<bool>)> mount(WidgetTester tester, FakeAdapter adapter, Widget screen) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
  addTearDown(container.dispose);
  final open = ValueNotifier(true);
  addTearDown(open.dispose);
  await tester.pumpWidget(UncontrolledProviderScope(
    container: container,
    child: rtlApp(ValueListenableBuilder<bool>(
      valueListenable: open,
      builder: (_, on, _) => on ? screen : const SizedBox(),
    )),
  ));
  return (container, open);
}

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 20));
  }
}

void main() {
  testWidgets('notification settings closed before they load', (tester) async {
    final gate = Completer<void>();
    final adapter = FakeAdapter()
      ..on('GET', '/api/notifications/preferences', const FakeResponse(200, {'preferences': {}}))
      ..hold('GET', '/api/notifications/preferences', gate.future);
    final (_, open) = await mount(tester, adapter, const NotificationPrefsScreen());
    await tester.pump();
    open.value = false;
    await tester.pump();
    gate.complete();
    await settle(tester);
    expect(tester.takeException(), isNull);
  });

  testWidgets('sign-in code screen closed while a new code is being sent', (tester) async {
    final gate = Completer<void>();
    final adapter = FakeAdapter()
      ..on('POST', '/api/auth/send-otp', const FakeResponse(200, {'message': 'ok'}))
      ..hold('POST', '/api/auth/send-otp', gate.future);
    final (container, open) = await mount(tester, adapter, const OtpScreen(resendSeconds: 0));
    container
        .read(pendingAuthProvider.notifier)
        .set(const PendingAuth(phone: '0796922292', countryCode: 'JO', mode: OtpContext.login, userExists: true));
    await settle(tester);
    await tester.ensureVisible(find.byKey(const Key('resend')));
    await tester.tap(find.byKey(const Key('resend')));
    await tester.pump();
    open.value = false;
    await tester.pump();
    gate.complete();
    await settle(tester);
    expect(tester.takeException(), isNull);
  });

  testWidgets('preferences closed while saving', (tester) async {
    final gate = Completer<void>();
    final adapter = FakeAdapter()
      ..on('POST', '/api/profile/update-request', const FakeResponse(200, {'message': 'ok', 'requested': false}))
      ..hold('POST', '/api/profile/update-request', gate.future);
    final (_, open) = await mount(
      tester,
      adapter,
      const Scaffold(
        body: PreferencesForm(
          initial: PartnerPrefs(ageMin: 24, ageMax: 34),
          cities: [],
          female: false,
          withDealbreakers: false,
        ),
      ),
    );
    await settle(tester);
    await tester.scrollUntilVisible(find.byKey(const Key('save-prefs')), 300, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.byKey(const Key('save-prefs')));
    await tester.pump();
    open.value = false;
    await tester.pump();
    gate.complete();
    await settle(tester);
    expect(tester.takeException(), isNull);
  });

  // Audit 2026-11-14 I4: the guardian form is opened in the middle of family steps, so back while it loads or saves
  // is likely
  const guardian = {
    'parentInfo': {
      'parentName': 'محمد',
      'parentPhone': '962791234567',
      'relationship': 'father',
      'address': 'عمّان',
      'shareConsentAt': null,
    },
  };

  Future<(ProviderContainer, ValueNotifier<bool>)> mountGuardian(WidgetTester tester, FakeAdapter adapter) async {
    adapter.on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}));
    final mounted = await mount(tester, adapter, const GuardianScreen());
    final container = mounted.$1;
    container.read(authControllerProvider);
    for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    return mounted;
  }

  testWidgets('guardian form closed before it loads', (tester) async {
    final gate = Completer<void>();
    final adapter = FakeAdapter()
      ..on('GET', '/api/profile/parent-info', const FakeResponse(200, guardian))
      ..hold('GET', '/api/profile/parent-info', gate.future);
    final (_, open) = await mountGuardian(tester, adapter);
    open.value = false;
    await tester.pump();
    gate.complete();
    await settle(tester);
    expect(tester.takeException(), isNull);
  });

  testWidgets('guardian form closed while saving: no crash, and «ملفي» and counts still refresh', (tester) async {
    final gate = Completer<void>();
    final adapter = FakeAdapter()
      ..on('GET', '/api/profile/parent-info', const FakeResponse(200, guardian))
      ..on('PUT', '/api/profile/parent-info', const FakeResponse(200, {'ok': true}))
      ..on('GET', '/api/me/counts', const FakeResponse(200, {'flags': {}}))
      ..hold('PUT', '/api/profile/parent-info', gate.future);
    final (container, open) = await mountGuardian(tester, adapter);
    await settle(tester);
    // Watched elsewhere (home): the save must still refresh it
    final sub = container.listen(countsProvider, (_, _) {});
    addTearDown(sub.close);
    await settle(tester);
    final countsBefore = adapter.to('GET', '/api/me/counts').length;
    await tester.ensureVisible(find.text('حفظ'));
    await tester.tap(find.text('حفظ'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    expect(adapter.to('PUT', '/api/profile/parent-info'), hasLength(1));
    open.value = false;
    await tester.pump();
    gate.complete();
    await settle(tester);
    expect(tester.takeException(), isNull);
    expect(adapter.to('GET', '/api/me/counts').length, greaterThan(countsBefore));
  });

  // Audit 2026-11-14 M6: a profile edit that lands after the form was left still refreshes «ملفي», the pending badge
  // and me
  testWidgets('profile edit closed while saving: «ملفي», the pending edit and me still refresh', (tester) async {
    final gate = Completer<void>();
    final adapter = FakeAdapter()
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
      ..on('POST', '/api/profile/update-request', const FakeResponse(200, {'message': 'ok', 'requested': true}))
      ..on('GET', '/api/profile/update-request', const FakeResponse(200, {'requests': []}))
      ..hold('POST', '/api/profile/update-request', gate.future);
    final (container, open) = await mount(
      tester,
      adapter,
      Scaffold(body: ProfileEditForm(profile: profileWith(stored), lists: lists, pending: null)),
    );
    container.read(authControllerProvider);
    for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    // Watched elsewhere («ملفي»): it must be read again after the save
    final sub = container.listen(pendingEditProvider, (_, _) {});
    addTearDown(sub.close);
    await settle(tester);
    final pendingBefore = adapter.to('GET', '/api/profile/update-request').length;
    final meBefore = adapter.to('GET', '/api/mobile/me').length;
    await tester.tap(find.byKey(const Key('city-إربد')));
    await tester.pump();
    await tester.scrollUntilVisible(find.byKey(const Key('save-profile')), 300, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.byKey(const Key('save-profile')));
    await tester.pump(const Duration(milliseconds: 20));
    expect(adapter.to('POST', '/api/profile/update-request'), hasLength(1));
    open.value = false;
    await tester.pump();
    gate.complete();
    await settle(tester);
    expect(tester.takeException(), isNull);
    expect(adapter.to('GET', '/api/profile/update-request').length, greaterThan(pendingBefore));
    expect(adapter.to('GET', '/api/mobile/me').length, greaterThan(meBefore));
  });
}
