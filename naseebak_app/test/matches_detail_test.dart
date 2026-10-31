import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/matches/match_detail_screen.dart';
import 'package:naseebak_app/features/matches/match_models.dart';

import 'helpers/fake_api.dart';

Future<void> pumpFor(WidgetTester tester, [int steps = 20]) async {
  for (var i = 0; i < steps; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

Map<String, dynamic> matchJson({String? closed, String? blockId, bool photos = true}) => {
      'id': 'm1',
      'closed': closed,
      'blockId': blockId,
      'photosRevealed': photos,
      'compatibilityScore': 80,
      'partner': {'id': 'p1', 'firstName': 'هدى', 'age': 28, 'city': 'عمّان'},
    };

Map<String, dynamic> introJson({
  String? closed,
  Map<String, dynamic> family = const {'status': 'none'},
  Map<String, dynamic> chat = const {'status': 'none'},
  bool askShare = false,
}) =>
    {
      'flags': {'introRequests': true, 'chat': true, 'mutualSuggestions': true, 'creditOnInterest': true},
      'closed': closed,
      'credits': 3,
      'family': family,
      'chat': chat,
      'followUp': <String, dynamic>{},
      'myGuardian': {'exists': true, 'consented': true, 'askShare': askShare},
    };

/// A signed-in man (the partner is a woman) on one match. `match` / `intro` are read on every request,
/// so a test can change what the server answers after an action.
class Harness {
  Harness({required this.match, required this.intro, this.gender = 'MALE'});
  Map<String, dynamic> match;
  Map<String, dynamic> intro;
  final String gender;
  final adapter = FakeAdapter();

  int get matchFetches => adapter.to('GET', '/api/matches').length;

  Future<void> pump(WidgetTester tester) async {
    await tester.binding.setSurfaceSize(const Size(800, 2000));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    adapter
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': {...meJson(), 'gender': gender}}))
      ..on('GET', '/api/me/counts', FakeResponse(200, {'flags': intro['flags']}))
      ..on('POST', '/api/reports', const FakeResponse(201, {'ok': true}))
      ..on('DELETE', '/api/blocks/b1', const FakeResponse(200, {'ok': true}));
    adapter.handlers['GET /api/matches'] = (_) => FakeResponse(200, {
          'matches': [match],
          'page': 1,
          'total': 1,
          'totalPages': 1,
        });
    adapter.handlers['GET /api/matches/m1/intro'] = (_) => FakeResponse(200, intro);
    final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
    addTearDown(container.dispose);
    container.read(authControllerProvider);
    await tester.pumpWidget(const SizedBox());
    for (var i = 0; i < 50 && !container.read(authControllerProvider).isSignedIn; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: rtlApp(MatchDetailScreen(matchId: 'm1', initial: MatchSummary.fromJson(match))),
    ));
    await pumpFor(tester);
  }
}

void main() {
  testWidgets('«إبلاغ وحظر» reports and blocks, then the match reloads as blocked with «إلغاء الحظر»', (tester) async {
    final h = Harness(match: matchJson(), intro: introJson());
    h.adapter.handlers['POST /api/blocks'] = (_) {
      h.match = matchJson(closed: 'blocked', blockId: 'b1');
      return const FakeResponse(201, {'id': 'b1'});
    };
    await h.pump(tester);
    final fetches = h.matchFetches;

    await tester.tap(find.byKey(const Key('match-menu')));
    await pumpFor(tester);
    expect(find.text('إبلاغ'), findsNothing);
    await tester.tap(find.text('إبلاغ وحظر'));
    await pumpFor(tester);
    expect(find.text('إبلاغ وحظر هدى'), findsOneWidget);
    expect(find.textContaining('ويُحظر هدى فينتهي هذا التوافق'), findsOneWidget);
    await tester.tap(find.text('حساب غير حقيقي'));
    await tester.pump();
    await tester.tap(find.byKey(const Key('report-submit')));
    await pumpFor(tester, 30);

    expect(h.adapter.to('POST', '/api/reports').single.data['reportedId'], 'p1');
    expect(h.adapter.to('POST', '/api/blocks').single.data, {'blockedId': 'p1'});
    expect(h.matchFetches, greaterThan(fetches));
    expect(find.text('محظور'), findsOneWidget);

    // «إلغاء الحظر» with the parsed blockId
    h.match = matchJson();
    await tester.tap(find.byKey(const Key('unblock')));
    await pumpFor(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'إلغاء الحظر'));
    await pumpFor(tester, 30);
    expect(h.adapter.to('DELETE', '/api/blocks/b1'), hasLength(1));
    expect(find.text('توافق متبادل'), findsOneWidget);
  });

  testWidgets('a repeat report (409) still blocks', (tester) async {
    final h = Harness(match: matchJson(), intro: introJson());
    h.adapter
      ..on('POST', '/api/reports', const FakeResponse(409, {'error': 'سبق أن أبلغت'}))
      ..on('POST', '/api/blocks', const FakeResponse(201, {'id': 'b1'}));
    await h.pump(tester);
    await tester.tap(find.byKey(const Key('match-menu')));
    await pumpFor(tester);
    await tester.tap(find.text('إبلاغ وحظر'));
    await pumpFor(tester);
    await tester.tap(find.text('سبب آخر'));
    await tester.pump();
    await tester.tap(find.byKey(const Key('report-submit')));
    await pumpFor(tester, 30);
    expect(h.adapter.to('POST', '/api/blocks'), hasLength(1));
  });

  testWidgets('«إنهاء التوافق» confirms, sends NOT_A_MATCH and refreshes the header', (tester) async {
    final h = Harness(match: matchJson(), intro: introJson());
    h.adapter.handlers['POST /api/matches/m1/outcome'] = (_) {
      h.match = matchJson(closed: 'ended');
      h.intro = introJson(closed: 'ended');
      return FakeResponse(200, h.intro);
    };
    await h.pump(tester);
    await tester.tap(find.byKey(const Key('end-match')));
    await pumpFor(tester);
    expect(find.text('إنهاء التوافق مع هدى؟'), findsOneWidget);
    await tester.tap(find.text('نعم، إنهاء التوافق'));
    await pumpFor(tester, 30);

    expect(h.adapter.to('POST', '/api/matches/m1/outcome').single.data, {'outcome': 'NOT_A_MATCH'});
    expect(find.text('لم يحصل نصيب'), findsOneWidget); // header pill from the refetched match
    expect(find.text('عرض الصور'), findsNothing);
    expect(find.byKey(const Key('end-match')), findsNothing);
  });

  testWidgets('«لا أرغب بالمتابعة» on the share prompt ends the match', (tester) async {
    final h = Harness(match: matchJson(), intro: introJson(askShare: true));
    h.adapter.on('POST', '/api/matches/m1/outcome', FakeResponse(200, introJson(closed: 'ended')));
    await h.pump(tester);
    // The woman chose family: feminine forms for her, masculine for me
    expect(find.text('اختارت هدى التعارف العائلي. شارك بيانات وليّ أمرك لتظهر بيانات العائلتين.'), findsOneWidget);
    await tester.tap(find.byKey(const Key('not-continue')));
    await pumpFor(tester);
    await tester.tap(find.text('نعم، إنهاء التوافق'));
    await pumpFor(tester, 30);
    expect(h.adapter.to('POST', '/api/matches/m1/outcome').single.data, {'outcome': 'NOT_A_MATCH'});
  });

  testWidgets('engaged: «تراجع: ما زلنا نتعارف» sends CONTINUING', (tester) async {
    final h = Harness(match: matchJson(closed: 'engaged'), intro: introJson(closed: 'engaged'));
    h.adapter.on('POST', '/api/matches/m1/outcome', FakeResponse(200, introJson()));
    await h.pump(tester);
    await tester.tap(find.byKey(const Key('undo-engaged')));
    await pumpFor(tester, 30);
    expect(h.adapter.to('POST', '/api/matches/m1/outcome').single.data, {'outcome': 'CONTINUING'});
  });

  group('server states with their own wording', () {
    testWidgets('declined by me / by them, chat disabled, family closed', (tester) async {
      final h = Harness(
        match: matchJson(),
        intro: introJson(
          family: {'status': 'closed'},
          chat: {'status': 'declined', 'declinedByMe': true},
        ),
      );
      await h.pump(tester);
      expect(find.text('التعارف العائلي غير متاح بعد إنهاء المحادثة.'), findsOneWidget);
      expect(find.text('تم الاعتذار عن طلب المحادثة من طرفك.'), findsOneWidget);
    });

    testWidgets('family declined by them, chat disabled', (tester) async {
      final h = Harness(
        match: matchJson(),
        intro: introJson(family: {'status': 'declined', 'declinedByMe': false}, chat: {'status': 'disabled'}),
      );
      await h.pump(tester);
      expect(find.text('لم يتم قبول طلب التعارف العائلي على هذا التوافق.'), findsOneWidget);
      expect(find.text('المحادثة غير متاحة حالياً.'), findsOneWidget);
    });

    testWidgets('a chat ran out: the free family move shows its last day', (tester) async {
      final h = Harness(
        match: matchJson(),
        intro: introJson(
          family: {'status': 'none', 'free': true, 'openUntil': '2026-11-20T10:00:00.000Z'},
          chat: {'status': 'expired', 'conversationId': 'c1'},
        ),
      );
      await h.pump(tester);
      expect(find.byKey(const Key('family-open-until')), findsOneWidget);
      expect(find.textContaining('الانتقال مجاني ومتاح حتى'), findsOneWidget);
    });
  });

  group('gendered requests', () {
    testWidgets('a woman «تطلب», a man «يطلب»', (tester) async {
      final h = Harness(
        match: matchJson(),
        intro: introJson(
          family: {'status': 'pending_received', 'requestId': 'r1'},
          chat: {'status': 'pending_received', 'requestId': 'r2'},
        ),
      );
      await h.pump(tester);
      expect(find.text('هدى تطلب تعارفاً عائلياً.'), findsOneWidget);
      expect(find.text('هدى تطلب محادثة قصيرة داخل التطبيق.'), findsOneWidget);
    });

    testWidgets('seen by a woman: «يطلب»', (tester) async {
      final h = Harness(
        gender: 'FEMALE',
        match: matchJson(),
        intro: introJson(family: {'status': 'pending_received', 'requestId': 'r1'}),
      );
      await h.pump(tester);
      expect(find.text('هدى يطلب تعارفاً عائلياً.'), findsOneWidget);
    });
  });
}
