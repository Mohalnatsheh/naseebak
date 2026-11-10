// QA A2-M4: a family request asked for consent, then the server answered that the guardian was missing.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/matches/match_detail_screen.dart';
import 'package:naseebak_app/features/profile/guardian_form.dart' show GuardianSaved;

import 'helpers/fake_api.dart';
import 'matches_detail_test.dart' show introJson, matchJson, pumpFor;

void main() {
  testWidgets('no guardian: the form opens first, and the request goes once it is saved with consent', (tester) async {
    await tester.binding.setSurfaceSize(const Size(800, 2000));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    var guardian = false;
    final intro = introJson();
    final adapter = FakeAdapter()
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': {...meJson(), 'gender': 'MALE'}}))
      ..on('GET', '/api/me/counts', FakeResponse(200, {'flags': intro['flags']}))
      ..on('POST', '/api/matches/m1/intro', const FakeResponse(201, {'ok': true}));
    adapter.handlers['GET /api/matches'] = (_) => FakeResponse(200, {'matches': [matchJson()], 'page': 1, 'total': 1, 'totalPages': 1});
    adapter.handlers['GET /api/matches/m1/intro'] = (_) => FakeResponse(200, {
          ...intro,
          'myGuardian': {'exists': guardian, 'consented': false, 'askShare': false},
        });
    final container = ProviderContainer(overrides: await testOverrides(adapter, store: MemoryTokenStore('t1')));
    addTearDown(container.dispose);
    await tester.runAsync(() => settled(container));
    final router = GoRouter(initialLocation: '/m', routes: [
      GoRoute(path: '/m', builder: (_, _) => const MatchDetailScreen(matchId: 'm1')),
      GoRoute(
        path: '/profile/guardian',
        builder: (context, _) => Scaffold(
          body: TextButton(
            onPressed: () {
              guardian = true;
              Navigator.of(context).pop(GuardianSaved.consented);
            },
            child: const Text('حفظ الوليّ'),
          ),
        ),
      ),
    ]);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: rtlRouterApp(router)));
    await pumpFor(tester);
    await tester.tap(find.textContaining('طلب تعارف عائلي'));
    await pumpFor(tester);
    // The guardian form, not the consent question
    expect(find.text('حفظ الوليّ'), findsOneWidget);
    expect(find.text('أوافق'), findsNothing);
    await tester.tap(find.text('حفظ الوليّ'));
    await pumpFor(tester);
    final sent = adapter.to('POST', '/api/matches/m1/intro');
    expect(sent, hasLength(1));
    expect((sent.single.data as Map)['consent'], isTrue);
  });
}
