import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/features/home/counts.dart';
import 'package:naseebak_app/features/home/widgets/next_step_card.dart';
import 'package:naseebak_app/features/profile/profile_repository.dart';

MyProfile profile(int pct, {List<StrengthSection> sections = const []}) =>
    MyProfile(
      user: const {},
      profile: null,
      completeness: pct,
      sections: sections,
    );

void main() {
  const flags = CycleFlags(mutualSuggestions: true);

  test('priority: likedYou > new > unread > quiet; a family request is not the card\'s (the waiting row shows it)', () {
    final all = Counts(
      flags: flags,
      pendingIntros: 1,
      pendingIntroMatchId: 'm1',
      likedYou: 2,
      newSuggestions: 3,
      unreadChats: 4,
    );
    expect(nextStepFor(all).title, 'شخصان أبديا اهتمامهما بك');
    final onlyRequest = nextStepFor(const Counts(flags: flags, pendingIntros: 1, pendingIntroMatchId: 'm1'));
    expect(onlyRequest.title, 'اقتراحات جديدة تصلك كل صباح');
    expect(onlyRequest.route, isNot(startsWith('/matches')));

    final noReq = Counts(
      flags: flags,
      likedYou: 2,
      newSuggestions: 3,
      unreadChats: 4,
    );
    expect(nextStepFor(noReq).title, 'شخصان أبديا اهتمامهما بك');
    expect(nextStepFor(noReq).route, '/suggestions?tab=interested');

    final fresh = Counts(flags: flags, newSuggestions: 3, unreadChats: 4);
    expect(nextStepFor(fresh).title, '3 اقتراحات جديدة بانتظارك');
    expect(nextStepFor(fresh).route, '/suggestions?tab=new');

    final chats = Counts(flags: flags, unreadChats: 4);
    expect(nextStepFor(chats).title, 'رسائل جديدة في محادثاتك');
    expect(nextStepFor(chats).route, '/chats');
  });

  test('counted nouns', () {
    String liked(int n) => nextStepFor(Counts(flags: flags, likedYou: n)).title;
    expect(liked(1), 'شخص أبدى اهتمامه بك');
    expect(liked(5), '5 أشخاص أبدوا اهتمامهم بك');
    expect(liked(12), '12 شخصاً أبدوا اهتمامهم بك');
    String fresh(int n) =>
        nextStepFor(Counts(flags: flags, newSuggestions: n)).title;
    expect(fresh(1), 'اقتراح جديد بانتظارك');
    expect(fresh(2), 'اقتراحان جديدان بانتظارك');
    expect(fresh(11), '11 اقتراحاً جديداً بانتظارك');
  });

  test('free reply line only with the switch', () {
    expect(nextStepFor(Counts(flags: flags, likedYou: 1)).body, isNull);
    final on = nextStepFor(
      const Counts(flags: CycleFlags(freeInterestReply: true), likedYou: 1),
    );
    expect(on.body, 'ردّك على من أبدى اهتمامه بك مجاني.');
  });

  test('gendered forms', () {
    expect(
      nextStepFor(
        const Counts(flags: CycleFlags(freeInterestReply: true), likedYou: 1),
        female: true,
      ).body,
      'ردّكِ على من أبدى اهتمامه بكِ مجاني.',
    );
    expect(
      nextStepFor(
        const Counts(flags: flags, newSuggestions: 3),
        female: true,
      ).title,
      '3 اقتراحات جديدة بانتظاركِ',
    );
    expect(
      nextStepFor(
        const Counts(flags: flags, unreadChats: 1),
        female: true,
      ).title,
      'رسائل جديدة في محادثاتكِ',
    );
    expect(
      nextStepFor(
        const Counts(flags: flags),
        female: true,
        profile: profile(60),
      ).ctaLabel,
      'أكملي ملفكِ',
    );
  });

  test('quiet: older server fields null; profile steps', () {
    final unfinished = profile(
      60,
      sections: const [
        StrengthSection(key: 'basic', label: 'الأساسية', percentage: 100),
        StrengthSection(key: 'quiz', label: 'اختبار', percentage: 0),
      ],
    );
    final n = nextStepFor(
      const Counts(flags: CycleFlags()),
      profile: unfinished,
    );
    expect(n.title, 'اقتراحات جديدة تصلك كل صباح');
    expect(n.ctaLabel, 'أكمل ملفك');
    expect(n.route, '/profile/quiz');
    expect(
      nextStepFor(
        const Counts(flags: CycleFlags()),
        profile: profile(80),
      ).route,
      '/profile/edit',
    );

    final done = nextStepFor(
      const Counts(flags: CycleFlags()),
      profile: profile(100),
    );
    expect(done.ctaLabel, 'راجع شروطك الأساسية');
    expect(done.route, '/profile/preferences');
    // Profile not loaded (or failed): the quiet message alone, never the "complete" step
    final unknown = nextStepFor(const Counts(flags: CycleFlags()));
    expect(unknown.title, 'اقتراحات جديدة تصلك كل صباح');
    expect(unknown.route, isNull);
    expect(unknown.ctaLabel, isNull);
  });

  testWidgets('quiet with no profile: no button on the card', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: NextStepCard(counts: Counts(flags: CycleFlags()), female: false)),
    ));
    expect(find.byKey(const Key('next-step-title')), findsOneWidget);
    expect(find.byKey(const Key('next-step-cta')), findsNothing);
  });

  testWidgets(
    'card shows title, stats (0 shown) and the CTA goes to its route',
    (tester) async {
      String? at;
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (_, _) => Scaffold(
              body: NextStepCard(
                counts: const Counts(
                  flags: CycleFlags(mutualSuggestions: true),
                  newSuggestions: 3,
                  unreadChats: 0,
                ),
                female: false,
              ),
            ),
          ),
          GoRoute(
            path: '/suggestions',
            builder: (_, s) {
              at = s.uri.toString();
              return const Scaffold();
            },
          ),
        ],
      );
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      expect(find.text('3 اقتراحات جديدة بانتظارك'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byKey(const Key('next-step-stat-new')),
          matching: find.text('3'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byKey(const Key('next-step-stat-liked')),
          matching: find.text('0'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byKey(const Key('next-step-stat-chats')),
          matching: find.text('0'),
        ),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const Key('next-step-cta')));
      await tester.pumpAndSettle();
      expect(at, '/suggestions?tab=new');
    },
  );
}
