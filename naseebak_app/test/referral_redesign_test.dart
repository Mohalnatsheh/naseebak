import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/referral/referral_screen.dart';

import 'helpers/fake_api.dart';

Future<void> pump(
  WidgetTester tester,
  Map<String, dynamic> body, {
  bool signedIn = false,
}) async {
  tester.view.physicalSize = const Size(390 * 3, 1800 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final adapter = FakeAdapter()
    ..on('GET', '/api/referral', FakeResponse(200, body))
    ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}));
  final container = ProviderContainer(
    overrides: await testOverrides(
      adapter,
      store: signedIn ? MemoryTokenStore('t') : null,
    ),
  );
  addTearDown(container.dispose);
  if (signedIn) await tester.runAsync(() => settled(container));
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: rtlApp(const ReferralScreen()),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'code, copy, share, three steps, progress and the friends list with first names only',
    (tester) async {
      String? copied;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          if (call.method == 'Clipboard.setData') {
            copied = (call.arguments as Map)['text'] as String;
          }
          return null;
        },
      );
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          null,
        ),
      );
      await pump(tester, {
        'referralCode': 'AB12CD34',
        'totalReferrals': 2,
        'completedReferrals': 1,
        'referrals': [
          {
            'id': 'a',
            'creditsAwarded': true,
            'referee': {
              'firstName': 'سارة',
              'lastName': 'خفي',
              'phone': '0799999999',
            },
          },
          {
            'id': 'b',
            'creditsAwarded': false,
            'referee': {'firstName': 'ليلى'},
          },
        ],
      });
      expect(find.descendant(of: find.byType(AppBar), matching: find.text('ادعُ صديقاً')), findsOneWidget);
      expect(find.byKey(const Key('referral-code')), findsOneWidget);
      expect(find.text('نسخ'), findsOneWidget);
      expect(find.text('مشاركة الدعوة'), findsOneWidget);
      expect(find.text('كيف تعمل'), findsOneWidget);
      expect(find.text('شارك رمزك مع من يبحث عن الزواج بجدية'), findsOneWidget);
      expect(
        find.text(
          'رصيدان لك ورصيد لصديقك، بعد أن يكمل الإعداد القصير، حتى 10 دعوات.',
        ),
        findsOneWidget,
      );
      expect(find.text('يسجّل صديقك ويكمل الإعداد القصير'), findsOneWidget);
      expect(find.text('تحصل على رصيدين، وصديقك على رصيد'), findsOneWidget);
      expect(find.text('دعوات مكتملة 1 من 10'), findsOneWidget);
      expect(find.text('سارة'), findsOneWidget);
      expect(find.text('ليلى'), findsOneWidget);
      expect(find.text('اكتمل'), findsOneWidget);
      expect(find.text('لم يكمل الإعداد بعد'), findsOneWidget);
      expect(find.textContaining('خفي'), findsNothing);
      expect(find.textContaining('0799'), findsNothing);

      await tester.tap(find.text('نسخ'));
      await tester.pump();
      expect(copied, 'https://naseebak.com/register?invitationCode=AB12CD34');
      await tester.pump(const Duration(seconds: 10));
      await tester.pump(const Duration(seconds: 1));
    },
  );

  testWidgets('no friends list when referrals is absent', (tester) async {
    await pump(tester, {
      'referralCode': 'AB12CD34',
      'totalReferrals': 0,
      'completedReferrals': 0,
    });
    expect(find.text('أصدقاؤك'), findsNothing);
    expect(find.text('دعوات مكتملة 0 من 10'), findsOneWidget);
  });

  testWidgets('no friends list when referrals is empty', (tester) async {
    await pump(tester, {'referralCode': 'AB12CD34', 'referrals': []});
    expect(find.text('أصدقاؤك'), findsNothing);
  });

  testWidgets('at most 10 friends are listed', (tester) async {
    await pump(tester, {
      'referralCode': 'AB12CD34',
      'referrals': [
        for (var i = 0; i < 12; i++)
          {
            'id': '$i',
            'creditsAwarded': false,
            'referee': {'firstName': 'اسم$i'},
          },
      ],
    });
    expect(find.textContaining('اسم'), findsNWidgets(10));
  });

  testWidgets('a female viewer gets feminine steps and reward line', (
    tester,
  ) async {
    await pump(tester, {'referralCode': 'AB12CD34'}, signedIn: true);
    expect(
      find.text('شاركي رمزكِ مع من تعرفين ممن يبحث عن الزواج بجدية'),
      findsOneWidget,
    );
    expect(find.text('تحصلين على رصيدين، وصديقك على رصيد'), findsOneWidget);
    expect(
      find.text(
        'رصيدان لكِ ورصيد لصديقك، بعد أن يكمل الإعداد القصير، حتى 10 دعوات.',
      ),
      findsOneWidget,
    );
    expect(find.text('شارك رمزك مع من يبحث عن الزواج بجدية'), findsNothing);
  });
}
