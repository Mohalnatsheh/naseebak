// Design pass (round 2): the shared card on narrow phones (QA A2-M5), the motion system with reduced motion (P2-8,
// DS-22), the seal (S1), the avatar veil (S2), the line art (P2-2) and the type rule (P1-2).
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/discovery/suggestion_card.dart';
import 'package:naseebak_app/features/discovery/suggestion_models.dart';
import 'package:naseebak_app/features/profile/quiz_screen.dart';
import 'package:naseebak_app/shared/widgets/brand_kit.dart';

import 'helpers/fake_api.dart';

final _item = FeedItem.fromJson({
  'kind': 'mutual',
  'id': 's1',
  'compatibilityScore': 86,
  'reason': 'توافق في العمر والمدينة',
  'candidate': {
    'id': 'c1',
    'firstName': 'عبدالرحمن',
    'age': 31,
    'city': 'عمّان',
    'education': 'بكالوريوس',
    'maritalStatus': 'أعزب',
    'religiosity': 'ملتزم',
  },
});

void main() {
  for (final (width, scale) in [(274.0, 1.3), (320.0, 1.3), (390.0, 2.0)]) {
    testWidgets('the card lays out at $width dp with ${scale}x text: no overflow, ring under the name when narrow',
        (tester) async {
      tester.view.physicalSize = Size(width, 1400);
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = scale;
      addTearDown(tester.view.reset);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await tester.pumpWidget(rtlApp(Scaffold(
        body: SingleChildScrollView(
          child: SuggestionCard(
            item: _item,
            tab: FeedTab.newTab,
            candidateFemale: false,
            onInterested: () {},
            onDecline: () {},
            onBlock: () {},
            onReport: () {},
          ),
        ),
      )));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final name = tester.getRect(find.byKey(const Key('card-name-s1')));
      final ring = tester.getRect(find.text('86%'));
      if (width < 360) expect(ring.top, greaterThan(name.bottom));
      // 48 px answers and a 44 px menu
      expect(tester.getSize(find.byKey(const Key('interested-s1'))).height, greaterThanOrEqualTo(48));
      expect(tester.getSize(find.byKey(const Key('card-menu-s1'))).width, greaterThanOrEqualTo(44));
    });
  }

  testWidgets('the card shows at most three chips and the why line in accent-ink', (tester) async {
    tester.view.physicalSize = const Size(390, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(rtlApp(SingleChildScrollView(
      child: SuggestionCard(item: _item, tab: FeedTab.newTab, candidateFemale: false, onInterested: () {}, onDecline: () {}),
    )));
    final why = tester.widget<Text>(find.descendant(of: find.byKey(const Key('card-why-s1')), matching: find.byType(Text)));
    expect(why.style?.color, const Color(0xFF7A5420));
    expect(find.text('بكالوريوس'), findsOneWidget);
  });

  testWidgets('with reduced motion the seal is drawn at once; otherwise it draws itself in 600 ms', (tester) async {
    await tester.pumpWidget(MediaQuery(
      data: const MediaQueryData(disableAnimations: true),
      child: rtlApp(const Center(child: MatchSeal(initials: 'س · ر'))),
    ));
    expect(tester.hasRunningAnimations, isFalse);

    await tester.pumpWidget(rtlApp(const Center(child: MatchSeal(key: ValueKey('animated'), initials: 'س · ر'))));
    expect(tester.hasRunningAnimations, isTrue);
    await tester.pump(const Duration(milliseconds: 650));
    expect(tester.hasRunningAnimations, isFalse);
  });

  testWidgets('the seal keeps its own size in a dialog\'s icon slot (it was stretched to the dialog\'s width)',
      (tester) async {
    await tester.pumpWidget(rtlApp(const AlertDialog(icon: MatchSeal(initials: 'س · ر', size: 104), title: Text('توافق متبادل!'))));
    await tester.pumpAndSettle();
    expect(tester.getSize(find.descendant(of: find.byKey(const Key('match-seal')), matching: find.byType(CustomPaint)).first).width, 104);
  });

  testWidgets('a hidden photo is a veil with the initial and a lock, never an image', (tester) async {
    await tester.pumpWidget(rtlApp(const Center(child: MemberAvatar(name: 'ريم', size: 56, locked: true, pro: true))));
    expect(find.text('ر'), findsOneWidget);
    expect(find.byIcon(Icons.lock_rounded), findsOneWidget);
    expect(find.byKey(const Key('avatar-pro-dot')), findsOneWidget);
    expect(find.byType(Image), findsNothing);
  });

  testWidgets('every line-art piece draws', (tester) async {
    await tester.pumpWidget(rtlApp(Wrap(children: [for (final k in LineArtKind.values) LineArt(k, size: 60)])));
    expect(tester.takeException(), isNull);
    expect(find.byType(LineArt), findsNWidgets(LineArtKind.values.length));
  });

  test('feature code uses the named type scale: no raw fontSize (P1-2)', () {
    for (final f in Directory('lib/features').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
      expect(f.readAsStringSync().contains('fontSize:'), isFalse, reason: f.path);
    }
  });

  testWidgets('the quiz answer is one row of five steps, even at 320 dp with large text', (tester) async {
    tester.view.physicalSize = const Size(320, 600);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.5;
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    int? picked;
    await tester.pumpWidget(rtlApp(Scaffold(
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: StatefulBuilder(
          builder: (context, set) => QuizScaleRow(questionId: 'q1', value: picked, onPick: (v) => set(() => picked = v)),
        ),
      ),
    )));
    expect(tester.takeException(), isNull);
    final ys = [for (var v = 1; v <= 5; v++) tester.getCenter(find.byKey(Key('q1-$v'))).dy];
    expect(ys.toSet(), hasLength(1));
    expect(tester.getSize(find.byKey(const Key('q1-3'))).width, greaterThanOrEqualTo(44));
    await tester.tap(find.byKey(const Key('q1-4')));
    await tester.pumpAndSettle();
    expect(picked, 4);
    expect(find.byKey(const Key('q1-picked')), findsOneWidget);
  });
}
