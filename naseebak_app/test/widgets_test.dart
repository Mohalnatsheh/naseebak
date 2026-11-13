import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/auth/auth_repository.dart';
import 'package:naseebak_app/features/auth/otp_screen.dart';
import 'package:naseebak_app/features/auth/pending_auth.dart';
import 'package:naseebak_app/features/auth/phone_screen.dart';
import 'package:naseebak_app/features/chat/chat_bubble.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';
import 'package:naseebak_app/features/country_selection/country.dart';
import 'package:naseebak_app/features/country_selection/country_picker_screen.dart';
import 'package:naseebak_app/features/credits/credits_screen.dart';
import 'package:naseebak_app/features/discovery/suggestion_card.dart';
import 'package:naseebak_app/features/discovery/suggestion_models.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fake_api.dart';

const countriesBody = {'defaultCountry': 'JO', 'countries': [joJson, saJson]};

/// Pumps in small steps (a spinner never lets pumpAndSettle finish).
Future<void> pumpFor(WidgetTester tester, [int steps = 20]) async {
  for (var i = 0; i < steps; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

Widget scoped(List<Override> overrides, Widget child) => ProviderScope(overrides: overrides, child: rtlApp(child));

void main() {
  testWidgets('country picker lists countries right-to-left and saves the pick', (tester) async {
    final adapter = FakeAdapter()..on('GET', '/api/countries', const FakeResponse(200, countriesBody));
    Country? picked;
    await tester.pumpWidget(scoped(await testOverrides(adapter), CountryPickerScreen(onPicked: (c) => picked = c)));
    await tester.pumpAndSettle();

    expect(find.text('الأردن'), findsOneWidget);
    expect(find.text('السعودية'), findsOneWidget);
    expect(Directionality.of(tester.element(find.text('الأردن'))), TextDirection.rtl);
    // RTL: the country name sits to the right of its dial code
    expect(tester.getCenter(find.text('الأردن')).dx, greaterThan(tester.getCenter(find.text('+962')).dx));

    await tester.tap(find.text('السعودية'));
    await tester.pumpAndSettle();
    expect(picked?.code, 'SA');
    expect((await SharedPreferences.getInstance()).getString('selected_country'), 'SA');
  });

  testWidgets('country picker shows a retry on failure', (tester) async {
    final adapter = FakeAdapter()..on('GET', '/api/countries', const FakeResponse.network());
    await tester.pumpWidget(scoped(await testOverrides(adapter), const CountryPickerScreen()));
    await tester.pumpAndSettle();
    expect(find.text('إعادة المحاولة'), findsOneWidget);

    adapter.on('GET', '/api/countries', const FakeResponse(200, countriesBody));
    await tester.tap(find.text('إعادة المحاولة'));
    await tester.pumpAndSettle();
    expect(find.text('الأردن'), findsOneWidget);
  });

  testWidgets('phone screen validates the number and sends the code', (tester) async {
    final adapter = FakeAdapter()
      ..on('GET', '/api/countries', const FakeResponse(200, countriesBody))
      ..on('POST', '/api/auth/send-otp', const FakeResponse(200, {'message': 'تم إرسال رمز التحقق', 'userExists': true}));
    final router = GoRouter(initialLocation: '/auth/phone', routes: [
      GoRoute(path: '/auth/phone', builder: (_, _) => const PhoneScreen()),
      GoRoute(path: '/auth/otp', builder: (_, _) => const Scaffold(body: Text('OTP PAGE'))),
    ]);
    final overrides = await testOverrides(adapter, prefs: {'selected_country': 'JO'});
    final container = ProviderContainer(overrides: overrides);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(
        routerConfig: router,
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('+962'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('phone-field')), '0766');
    await tester.tap(find.byKey(const Key('send-otp')));
    await tester.pumpAndSettle();
    expect(find.textContaining('رقم هاتف غير صالح'), findsOneWidget);
    expect(adapter.to('POST', '/api/auth/send-otp'), isEmpty);

    // Arabic-Indic digits are accepted and sent as Western digits; the error goes once the number is valid (A2-L2)
    await tester.enterText(find.byKey(const Key('phone-field')), '٠٧٩٦٩٢٢٢٩٢');
    await tester.pumpAndSettle();
    expect(find.textContaining('رقم هاتف غير صالح'), findsNothing);
    await tester.tap(find.byKey(const Key('send-otp')));
    await tester.pumpAndSettle();
    final body = adapter.to('POST', '/api/auth/send-otp').single.data as Map;
    expect(body, {'phone': '0796922292', 'context': 'login', 'country': 'JO'});
    expect(find.text('OTP PAGE'), findsOneWidget);
    expect(container.read(pendingAuthProvider)?.userExists, isTrue);
  });

  testWidgets('phone screen shows the server error (e.g. rate limit)', (tester) async {
    final adapter = FakeAdapter()
      ..on('GET', '/api/countries', const FakeResponse(200, countriesBody))
      ..on('POST', '/api/auth/send-otp', const FakeResponse(429, {'error': 'تم تجاوز الحد المسموح. حاول مرة أخرى بعد 5 دقائق.'}));
    await tester.pumpWidget(scoped(await testOverrides(adapter, prefs: {'selected_country': 'JO'}), const PhoneScreen()));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('phone-field')), '0796922292');
    await tester.tap(find.byKey(const Key('send-otp')));
    await tester.pumpAndSettle();
    expect(find.text('تم تجاوز الحد المسموح. حاول مرة أخرى بعد 5 دقائق.'), findsOneWidget);
  });

  testWidgets('code screen: countdown, server error, resend, then sign-in', (tester) async {
    final store = MemoryTokenStore();
    final adapter = FakeAdapter()
      ..on('POST', '/api/auth/verify-otp', const FakeResponse(400, {'error': 'رمز التحقق غير صحيح'}))
      ..on('POST', '/api/auth/send-otp', const FakeResponse(200, {'message': 'ok', 'userExists': true}));
    final container = ProviderContainer(overrides: await testOverrides(adapter, store: store));
    addTearDown(container.dispose);
    container.read(pendingAuthProvider.notifier).set(
          const PendingAuth(phone: '0796922292', countryCode: 'JO', mode: OtpContext.login, userExists: true),
        );
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const OtpScreen())));
    await tester.pump();

    expect(find.text('يمكنك طلب رمز جديد بعد 60 ثانية'), findsOneWidget);
    expect(find.byKey(const Key('resend')), findsNothing);

    await tester.enterText(find.byKey(const Key('otp-field')), '123456');
    await tester.pump();
    await tester.pump();
    expect(find.text('رمز التحقق غير صحيح'), findsOneWidget);

    await tester.pump(const Duration(seconds: 61));
    expect(find.byKey(const Key('resend')), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('resend')));
    await tester.tap(find.byKey(const Key('resend')));
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 50));
    expect(adapter.to('POST', '/api/auth/send-otp'), hasLength(1));

    adapter
      ..on('POST', '/api/auth/verify-otp', const FakeResponse(200, {'verified': true}))
      ..on('POST', '/api/mobile/auth/token',
          FakeResponse(201, {'token': 'nsb_x', 'expiresAt': '2026-12-28T00:00:00Z', 'user': meJson()}));
    await tester.enterText(find.byKey(const Key('otp-field')), '١١١١١١');
    await pumpFor(tester);
    expect(container.read(authControllerProvider).isSignedIn, isTrue);
    expect(await store.read(), 'nsb_x');
    // Let the 60s cooldown timer finish
    await tester.pump(const Duration(seconds: 61));
  });

  group('suggestion card', () {
    final item = FeedItem.fromJson({
      'kind': 'mutual',
      'id': 's1',
      'compatibilityScore': 72,
      'reason': 'يوافق ما تبحثين عنه في العمر والمدينة',
      'createdAt': '2026-10-29T14:30:30.893Z',
      'candidate': {
        'id': 'c1',
        'firstName': 'أحمد',
        'age': 33,
        'city': 'إربد',
        'education': 'دكتوراه',
        'job': 'طبيب',
        'maritalStatus': 'أعزب/عزباء',
        'religiosity': 'ملتزم جداً',
        'childrenCount': 0,
        'aboutMe': 'طبيب متخصص',
      },
    });

    testWidgets('shows the key facts, «عنه» and the score, never a photo; a tap opens the profile', (tester) async {
      // A regular phone height (a short one shows four facts: suggestions_flow_test)
      tester.view.physicalSize = const Size(400, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      var taps = 0;
      var opened = 0;
      await tester.pumpWidget(rtlApp(Scaffold(
        body: SingleChildScrollView(
          child: SuggestionCard(
            item: item,
            tab: FeedTab.newTab,
            candidateFemale: false,
            onInterested: () => taps++,
            onDecline: () {},
            onOpen: () => opened++,
          ),
        ),
      )));
      // The short card: «الاسم، العمر», the city, the score pill, the facts, «عنه»; the why line is in the profile
      expect(find.text('أحمد، 33'), findsOneWidget);
      expect(find.text('إربد'), findsOneWidget);
      expect(find.text('توافق 72%'), findsOneWidget);
      expect(find.text('يوافق ما تبحثين عنه في العمر والمدينة'), findsNothing);
      expect(find.text('طبيب'), findsOneWidget);
      expect(find.text('دكتوراه'), findsOneWidget);
      expect(find.text('عنه'), findsOneWidget);
      expect(find.text('طبيب متخصص'), findsOneWidget);
      expect(find.byType(Image), findsNothing);
      expect(find.byKey(const Key('card-details-open')), findsNothing);
      await tester.tap(find.byKey(const Key('card-full-s1')));
      await tester.tap(find.text('أحمد، 33'));
      expect(opened, 2);
      await tester.tap(find.byKey(const Key('interested-s1')));
      expect(taps, 1);
      expect(opened, 2);
    });

    testWidgets('busy disables both answers; the waiting tab has none', (tester) async {
      var taps = 0;
      await tester.pumpWidget(rtlApp(Scaffold(
        body: SingleChildScrollView(
          child: SuggestionCard(
            item: item,
            tab: FeedTab.newTab,
            candidateFemale: false,
            busy: true,
            onInterested: () => taps++,
            onDecline: () => taps++,
            onOpen: () {},
          ),
        ),
      )));
      await tester.tap(find.byKey(const Key('interested-s1')), warnIfMissed: false);
      await tester.tap(find.byKey(const Key('decline-s1')), warnIfMissed: false);
      expect(taps, 0);

      await tester.pumpWidget(rtlApp(Scaffold(
        body: SingleChildScrollView(
          child: SuggestionCard(
            item: item,
            tab: FeedTab.waiting,
            candidateFemale: false,
            onInterested: () {},
            onDecline: () {},
            onOpen: () {},
          ),
        ),
      )));
      expect(find.byKey(const Key('interested-s1')), findsNothing);
      expect(find.textContaining('بانتظار الطرف الآخر'), findsOneWidget);
    });
  });

  testWidgets('chat bubbles: mine on the end side (left in Arabic), theirs on the start side (right)', (tester) async {
    final now = DateTime(2026, 10, 29, 14, 5);
    await tester.pumpWidget(rtlApp(Scaffold(
      body: Column(children: [
        ChatBubble(message: ChatMessage(id: '1', body: 'السلام عليكم', createdAt: now, mine: true)),
        ChatBubble(message: ChatMessage(id: '2', body: 'وعليكم السلام', createdAt: now, mine: false)),
        ChatBubble(
          message: ChatMessage(id: '3', body: 'رقمي 0791234567', createdAt: now, mine: true)
              .copyWith(state: SendState.failed, error: 'لا يمكن مشاركة أرقام الهواتف', filtered: true),
          onRetry: () {},
        ),
      ]),
    )));
    final width = tester.getSize(find.byType(Scaffold)).width;
    expect(tester.getCenter(find.text('السلام عليكم')).dx, lessThan(width / 2));
    expect(tester.getCenter(find.text('وعليكم السلام')).dx, greaterThan(width / 2));
    expect(find.text('لا يمكن مشاركة أرقام الهواتف'), findsOneWidget);
    expect(find.text('تعديل الرسالة'), findsOneWidget);
  });

  group('credits screen', () {
    const joPlans = {
      'country': 'JO',
      'purchasesEnabled': true,
      'packages': [
        {'id': 'launch_10', 'name': '10 أرصدة', 'credits': 10, 'price': 3, 'currency': 'JOD', 'currencySymbol': 'د.أ', 'chargeLabel': '4.23\$', 'wasPrice': 7},
        {'id': 'launch_25', 'name': '25 رصيداً', 'credits': 25, 'price': 6, 'currency': 'JOD', 'currencySymbol': 'د.أ', 'popular': true},
      ],
    };

    Future<List<Override>> signedIn(FakeAdapter adapter) async {
      adapter.on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson(credits: 4)}));
      return testOverrides(adapter, store: MemoryTokenStore('t'));
    }

    testWidgets('Jordan: packages with prices and a buy button; mock purchase updates the balance', (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/countries/JO', const FakeResponse(200, {'country': joJson}))
        ..on('GET', '/api/payments/plans', const FakeResponse(200, joPlans))
        ..on('POST', '/api/payments/checkout', const FakeResponse(200, {'mock': true, 'paymentId': 'p1'}))
        ..on('POST', '/api/dev/mock-checkout/p1', const FakeResponse(200, {'result': 'credited'}))
        ..on('GET', '/api/payments/p1/status',
            const FakeResponse(200, {'payment': {'id': 'p1', 'status': 'COMPLETED'}, 'credits': 14}))
        ..on('GET', '/api/payments/history', const FakeResponse(200, {'payments': [], 'matchCredits': 14}))
        ..on('GET', '/api/me/counts', const FakeResponse(200, {'flags': {}}));
      await tester.pumpWidget(scoped(await signedIn(adapter), const CreditsScreen(showMockButton: true)));
      await tester.pumpAndSettle();

      expect(find.text('10 أرصدة'), findsOneWidget);
      expect(find.text('3 د.أ'), findsOneWidget);
      expect(find.text('الأكثر طلباً'), findsOneWidget);
      expect(find.byKey(const Key('balance')), findsOneWidget);
      expect(find.text('4'), findsOneWidget);

      await tester.tap(find.byKey(const Key('buy-launch_10')));
      await pumpFor(tester);
      expect(find.text('دفع تجريبي'), findsOneWidget);
      await tester.tap(find.byKey(const Key('mock-pay')));
      await pumpFor(tester);
      expect(adapter.to('POST', '/api/dev/mock-checkout/p1').single.data, {'outcome': 'paid'});
      expect(find.text('14'), findsOneWidget);
      expect(find.textContaining('تم الدفع بنجاح'), findsOneWidget);
    });

    testWidgets('Saudi Arabia: packages shown as unavailable, no buy', (tester) async {
      final adapter = FakeAdapter()
        ..on('GET', '/api/payments/plans', const FakeResponse(200, {
          'country': 'SA',
          'purchasesEnabled': false,
          'packages': [
            {'id': 'sa_10', 'name': '10 أرصدة', 'credits': 10, 'price': 15, 'currency': 'SAR', 'currencySymbol': 'ر.س'},
          ],
        }));
      await tester.pumpWidget(scoped(await signedIn(adapter), const CreditsScreen()));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('purchases-disabled')), findsOneWidget);
      expect(find.text('غير متاح'), findsOneWidget);
      expect(find.byKey(const Key('buy-sa_10')), findsNothing);
    });

    testWidgets('loading then error with retry', (tester) async {
      final adapter = FakeAdapter()..on('GET', '/api/payments/plans', const FakeResponse(500, {'error': 'حدث خطأ في الخادم'}));
      await tester.pumpWidget(scoped(await signedIn(adapter), const CreditsScreen()));
      await tester.pump();
      await tester.pumpAndSettle();
      expect(find.text('حدث خطأ في الخادم'), findsOneWidget);
      adapter.on('GET', '/api/payments/plans', const FakeResponse(200, joPlans));
      await tester.tap(find.text('إعادة المحاولة'));
      await tester.pumpAndSettle();
      expect(find.text('25 رصيداً'), findsOneWidget);
    });
  });
}
