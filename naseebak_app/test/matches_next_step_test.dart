// Review A2 #3: each match tile says that match's own next step (the server's additive `nextStep`).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/matches/match_models.dart';
import 'package:naseebak_app/features/matches/matches_screen.dart';

import 'helpers/fake_api.dart';

Map<String, dynamic> _m(String id, String? step) => {
      'id': id,
      'closed': null,
      'photosRevealed': true,
      'compatibilityScore': 80,
      'nextStep': step,
      'partner': {'id': 'p$id', 'firstName': 'هدى', 'age': 28, 'city': 'عمّان'},
    };

void main() {
  test('the next step line says what waits, and on whom', () {
    expect(matchNextStepLine('reply_family', name: 'هدى', viewerFemale: false).text, 'هدى تطلب تعارفاً عائلياً · ردّك مطلوب');
    expect(matchNextStepLine('choose', name: 'هدى', viewerFemale: true).text, 'اختاري طريقة التعارف');
    expect(matchNextStepLine('waiting_chat', name: 'هدى', viewerFemale: false).text, 'طلب المحادثة بانتظار الرد');
    // An older server sends none
    expect(matchNextStepLine(null, name: 'هدى', viewerFemale: false).text, 'توافق متبادل');
    expect(MatchSummary.fromJson(_m('m1', 'chat_open')).nextStep, 'chat_open');
  });

  testWidgets('the matches list shows each match\'s own step', (tester) async {
    tester.view.physicalSize = const Size(420, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final adapter = FakeAdapter()
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': {...meJson(), 'gender': 'MALE'}}))
      ..on('GET', '/api/me/counts', const FakeResponse(200, {'flags': {'introRequests': true}}))
      ..on('GET', '/api/matches', FakeResponse(200, {
        'matches': [_m('m1', 'reply_family'), _m('m2', 'chat_open')],
        'page': 1,
        'total': 2,
        'totalPages': 1,
      }));
    final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
    addTearDown(container.dispose);
    await tester.runAsync(() => settled(container));
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlApp(const MatchesScreen())));
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(find.text('هدى تطلب تعارفاً عائلياً · ردّك مطلوب'), findsOneWidget);
    expect(find.text('المحادثة مفتوحة'), findsOneWidget);
  });
}
