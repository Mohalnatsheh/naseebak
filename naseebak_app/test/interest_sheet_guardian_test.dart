// Audit 2026-11-14 M5: GUARDIAN_REQUIRED → «إضافة بيانات وليّ الأمر» → saved with the consent box ticked: back on the
// «مهتم» sheet the consent is not asked again.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/core/network/api_exception.dart';
import 'package:naseebak_app/features/discovery/interest_sheet.dart';
import 'package:naseebak_app/features/discovery/suggestion_models.dart';
import 'package:naseebak_app/features/profile/guardian_form.dart';

import 'helpers/fake_api.dart';


void main() {
  Future<List<bool>> run(WidgetTester tester, GuardianSaved saved) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final sent = <bool>[];
    var calls = 0;
    final router = GoRouter(routes: [
      GoRoute(
        path: '/',
        builder: (context, _) => Scaffold(
          body: TextButton(
            onPressed: () => InterestSheet.show(
              context,
              InterestSheet(
                firstName: 'هدى',
                chatAvailable: false,
                creditOnInterest: false,
                credits: 5,
                guardianConsented: false,
                onSubmit: (pref, consent) async {
                  sent.add(consent);
                  if (calls++ == 0) {
                    throw ApiException(
                        kind: ApiErrorKind.invalid, message: 'أضف بيانات وليّ الأمر أولاً', code: 'GUARDIAN_REQUIRED');
                  }
                  return const DecisionResult(match: false);
                },
              ),
            ),
            child: const Text('open-sheet'),
          ),
        ),
      ),
      GoRoute(
        path: '/profile/guardian',
        builder: (context, _) => Scaffold(
          body: TextButton(onPressed: () => context.pop(saved), child: const Text('save-guardian')),
        ),
      ),
    ]);
    addTearDown(router.dispose);
    await tester.pumpWidget(rtlRouterApp(router));
    await tester.pumpAndSettle();
    await tester.tap(find.text('open-sheet'));
    await tester.pumpAndSettle();
    // First «مهتم»: consent ticked, but no guardian yet
    await tester.tap(find.byKey(const Key('guardian-consent')));
    await tester.tap(find.byKey(const Key('send-interest')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('interest-add-guardian')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('save-guardian'));
    await tester.pumpAndSettle();
    return sent;
  }

  testWidgets('saved with consent: the sheet no longer asks for it, and the second send carries it', (tester) async {
    final sent = await run(tester, GuardianSaved.consented);
    expect(find.byKey(const Key('guardian-consent')), findsNothing);
    await tester.tap(find.byKey(const Key('send-interest')));
    await tester.pumpAndSettle();
    expect(sent, [true, true]);
  });

  testWidgets('saved without consent: the box is still there', (tester) async {
    await run(tester, GuardianSaved.saved);
    expect(find.byKey(const Key('guardian-consent')), findsOneWidget);
  });
}
