import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/discovery/candidate_profile_screen.dart';
import 'package:naseebak_app/features/discovery/suggestion_models.dart';
import 'package:naseebak_app/shared/person.dart';

FeedItem item() => FeedItem(
      kind: FeedKind.mutual,
      id: 's1',
      compatibilityScore: 82,
      reason: 'قيم متقاربة وسكن قريب',
      activity: 'نشطة اليوم',
      candidate: PersonDetails.fromJson({
        'id': 'p1',
        'firstName': 'هدى',
        'age': 27,
        'city': 'عمّان',
        'job': 'مهندسة',
        'education': 'بكالوريوس',
        'maritalStatus': 'عزباء',
        'religiosity': 'ملتزم',
        'height': 165,
        'aboutMe': 'نص تعريفي',
        'hobbies': 'القراءة',
      }),
    );

Widget host(Widget Function(BuildContext) screen, void Function(ProfileAnswer?) onResult) => MaterialApp(
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Builder(
        builder: (context) => Scaffold(
          body: TextButton(
            onPressed: () async =>
                onResult(await Navigator.of(context).push<ProfileAnswer>(MaterialPageRoute(builder: screen))),
            child: const Text('open'),
          ),
        ),
      ),
    );

CandidateProfileScreen screen({
  FeedTab tab = FeedTab.newTab,
  bool interestEnabled = true,
  VoidCallback? onReport,
  VoidCallback? onBlock,
}) =>
    CandidateProfileScreen(
      item: item(),
      tab: tab,
      candidateFemale: true,
      tribeLabel: 'العشيرة',
      answerNote: const Text('NOTE-LINE'),
      interestEnabled: interestEnabled,
      onReport: onReport,
      onBlock: onBlock,
    );

Future<void> open(WidgetTester t, CandidateProfileScreen s, [void Function(ProfileAnswer?)? r]) async {
  await t.pumpWidget(host((_) => s, r ?? (_) {}));
  await t.tap(find.text('open'));
  await t.pumpAndSettle();
}

void main() {
  testWidgets('shows name, lock line, reason, every detail and the back button', (t) async {
    await open(t, screen());
    expect(find.text('هدى'), findsOneWidget);
    expect(find.text('الصور تظهر بعد التوافق المتبادل فقط'), findsOneWidget);
    expect(find.text('قيم متقاربة وسكن قريب'), findsOneWidget);
    expect(find.text('165 سم'), findsOneWidget);
    expect(find.text('نص تعريفي'), findsOneWidget);
    expect(find.text('القراءة'), findsOneWidget);
    expect(find.byTooltip('الاقتراحات'), findsOneWidget);
    expect(find.text('NOTE-LINE'), findsOneWidget);
  });

  testWidgets('«مهتم» pops interested', (t) async {
    ProfileAnswer? got;
    await open(t, screen(), (a) => got = a);
    await t.tap(find.text('مهتم'));
    await t.pumpAndSettle();
    expect(got, ProfileAnswer.interested);
  });

  testWidgets('«لا» pops declined', (t) async {
    ProfileAnswer? got;
    await open(t, screen(), (a) => got = a);
    await t.tap(find.text('لا'));
    await t.pumpAndSettle();
    expect(got, ProfileAnswer.declined);
  });

  testWidgets('interestEnabled false disables «مهتم»; the note sits above the buttons', (t) async {
    await open(t, screen(interestEnabled: false));
    final btn = t.widget<FilledButton>(find.byKey(const Key('profile-interested-s1')));
    expect(btn.onPressed, isNull);
    expect(t.getTopLeft(find.text('NOTE-LINE')).dy, lessThan(t.getTopLeft(find.byKey(const Key('profile-interested-s1'))).dy));
    expect(t.widget<OutlinedButton>(find.byKey(const Key('profile-decline-s1'))).onPressed, isNotNull);
  });

  testWidgets('waiting tab: no answer buttons, the note stays; menu offers report', (t) async {
    await open(t, screen(tab: FeedTab.waiting, onReport: () {}));
    expect(find.text('مهتم'), findsNothing);
    expect(find.text('لا'), findsNothing);
    expect(find.text('NOTE-LINE'), findsOneWidget);
    await t.tap(find.byKey(const Key('profile-menu-s1')));
    await t.pumpAndSettle();
    expect(find.text('إبلاغ وحظر'), findsOneWidget);
  });

  testWidgets('report pops null first, then calls the callback', (t) async {
    var reported = 0;
    ProfileAnswer? got = ProfileAnswer.interested;
    var popped = false;
    await open(t, screen(onReport: () => reported++), (a) {
      got = a;
      popped = true;
    });
    await t.tap(find.byKey(const Key('profile-menu-s1')));
    await t.pumpAndSettle();
    await t.tap(find.text('إبلاغ وحظر'));
    await t.pumpAndSettle();
    expect(popped, isTrue);
    expect(got, isNull);
    expect(reported, 1);
    expect(find.text('NOTE-LINE'), findsNothing);
  });
}
