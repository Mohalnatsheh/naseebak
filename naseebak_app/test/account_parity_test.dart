import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/country_selection/country.dart';
import 'package:naseebak_app/features/profile/profile_edit_plan.dart';
import 'package:naseebak_app/features/profile/profile_edit_screen.dart';
import 'package:naseebak_app/features/profile/profile_repository.dart';
import 'package:naseebak_app/features/referral/referral_screen.dart';
import 'package:naseebak_app/features/support/support_screen.dart';

import 'helpers/fake_api.dart';

Widget scoped(List<Override> overrides, Widget child) => ProviderScope(overrides: overrides, child: rtlApp(child));
Map<String, dynamic> bodyOf(RequestOptions r) => Map<String, dynamic>.from(r.data as Map);

void phone(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
}

Future<void> scrollTo(WidgetTester tester, Finder f) =>
    tester.scrollUntilVisible(f, 300, scrollable: find.byType(Scrollable).first);

const storedProfile = {
  'dateOfBirth': '1998-04-02T00:00:00.000Z',
  'nationality': 'أردنية',
  'city': 'عمّان',
  'education': 'بكالوريوس',
  'maritalStatus': 'أعزب/عزباء',
  'religiosity': 'ملتزم',
  'childrenCount': 0,
  'prefAgeMin': 25,
  'prefAgeMax': 35,
  'height': null,
  'aboutMe': 'نبذة قديمة',
  'hijab': false,
  'isComplete': true,
};

MyProfile profileWith(Map<String, Object?> p) => MyProfile.fromJson({
      'user': {'id': 'u1', 'firstName': 'سارة', 'lastName': 'أحمد', 'gender': 'FEMALE', 'profile': p},
      'completeness': {'total': 60, 'sections': []},
    });

const lists = CountryLists(
  cities: ['عمّان', 'إربد'],
  nationalitiesFemale: ['أردنية'],
  incomeRanges: ['أقل من 500 د.أ'],
  expenseRanges: ['أقل من 300 د.أ'],
  tribeLabel: 'العشيرة',
  options: {
    'education': ['ثانوية عامة', 'بكالوريوس'],
    'job': ['مهندس', 'أخرى'],
    'maritalStatus': ['أعزب/عزباء', 'مطلق/مطلقة'],
    'religiosity': ['ملتزم', 'متوسط'],
    'smokingStatus': ['لا أدخن'],
    'cookingAbility': ['أطبخ جيداً'],
    'lifestyle': ['هادئ'],
    'skinColor': ['حنطي'],
    'housingType': ['ملك'],
  },
);

void main() {
  group('edit plan (same split as the website)', () {
    test('empty fields are filled at once, stored values go to review, unchanged ones are skipped', () {
      final plan = planProfileEdit(
        {'height': null, 'aboutMe': 'قديم', 'city': 'عمّان', 'hijab': false, 'dateOfBirth': '1998-04-02T00:00:00.000Z'},
        {'height': 165, 'aboutMe': 'جديد', 'city': 'عمّان', 'hijab': false, 'dateOfBirth': '1998-04-02'},
      );
      expect(plan.fills, {'height': 165});
      expect(plan.reviewed, {'aboutMe': 'جديد'});
    });

    test('false is an answer, clearing a stored value needs review', () {
      final plan = planProfileEdit({'hijab': null, 'tribe': 'العلي'}, {'hijab': false, 'tribe': ''});
      expect(plan.fills, {'hijab': false});
      expect(plan.reviewed, {'tribe': null});
    });
  });

  testWidgets('editor: new fields save directly, a changed one becomes a review request', (tester) async {
    phone(tester);
    final adapter = FakeAdapter()
      ..on('PUT', '/api/profile', const FakeResponse(200, {'message': 'ok'}))
      ..on('POST', '/api/profile/update-request', const FakeResponse(200, {'message': 'تم إرسال طلب التعديل بنجاح', 'requested': true}))
      ..on('GET', '/api/profile', const FakeResponse(200, {'user': {}}))
      ..on('GET', '/api/profile/update-request', const FakeResponse(200, {'requests': []}));
    await tester.pumpWidget(scoped(
      await testOverrides(adapter),
      Scaffold(body: ProfileEditForm(profile: profileWith(storedProfile), lists: lists, pending: null)),
    ));
    await tester.pumpAndSettle();

    await scrollTo(tester, find.byKey(const Key('field-height')));
    await tester.enterText(find.byKey(const Key('field-height')), '165');
    await scrollTo(tester, find.byKey(const Key('field-aboutMe')));
    await tester.enterText(find.byKey(const Key('field-aboutMe')), 'نبذة جديدة');
    await scrollTo(tester, find.byKey(const Key('save-profile')));
    await tester.tap(find.byKey(const Key('save-profile')));
    await tester.pumpAndSettle();

    final put = bodyOf(adapter.to('PUT', '/api/profile').single);
    expect(put['height'], 165);
    expect(put['city'], 'عمّان'); // the stored basics travel with a fill
    expect(put.containsKey('aboutMe'), isFalse);
    expect(bodyOf(adapter.to('POST', '/api/profile/update-request').single)['changes'], {'aboutMe': 'نبذة جديدة'});
  });

  testWidgets('editor: with a request pending, changing a stored value is refused before sending', (tester) async {
    phone(tester);
    final adapter = FakeAdapter();
    await tester.pumpWidget(scoped(
      await testOverrides(adapter),
      Scaffold(
        body: ProfileEditForm(
          profile: profileWith(storedProfile),
          lists: lists,
          pending: const PendingEdit(id: 'r1', fields: ['city']),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.textContaining('طلب تعديل قيد المراجعة: المدينة'), findsOneWidget);
    await tester.tap(find.byKey(const Key('city-إربد')));
    await scrollTo(tester, find.byKey(const Key('save-profile')));
    await tester.tap(find.byKey(const Key('save-profile')));
    await tester.pumpAndSettle();
    expect(adapter.requests, isEmpty);
    expect(find.textContaining('يمكنك سحبه أولاً'), findsOneWidget);
  });

  group('support', () {
    test('ticket rules match the website', () {
      expect(ticketError(type: null, subject: 'مشكلة في الدفع', description: 'x' * 30), 'يرجى اختيار نوع التذكرة');
      expect(ticketError(type: 'ISSUE', subject: 'قصير', description: 'x' * 30), contains('5 أحرف'));
      expect(ticketError(type: 'ISSUE', subject: 'مشكلة في الدفع', description: 'قصير'), contains('20 حرف'));
      expect(ticketError(type: 'ISSUE', subject: 'مشكلة في الدفع', description: 'x' * 30), isNull);
    });

    testWidgets('a new ticket is sent and the list shows the team reply', (tester) async {
      phone(tester);
      var sent = false;
      final adapter = FakeAdapter()
        ..handlers['GET /api/support'] = ((_) => FakeResponse(200, {
              'tickets': sent
                  ? [
                      {'id': 't1', 'type': 'ISSUE', 'subject': 'لا تصلني الإشعارات', 'description': 'd' * 25, 'status': 'RESOLVED', 'adminNote': 'تم الإصلاح'}
                    ]
                  : [],
            }))
        ..handlers['POST /api/support'] = (_) {
          sent = true;
          return const FakeResponse(201, {'ticket': {}});
        };
      await tester.pumpWidget(scoped(await testOverrides(adapter), const SupportScreen()));
      await tester.pumpAndSettle();
      expect(find.text('لا توجد تذاكر بعد'), findsOneWidget);

      await tester.tap(find.byKey(const Key('new-ticket')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('type-ISSUE')));
      await tester.enterText(find.byKey(const Key('ticket-subject')), 'لا تصلني الإشعارات');
      await tester.enterText(find.byKey(const Key('ticket-description')), 'منذ يومين لا تصلني إشعارات المحادثات');
      await tester.tap(find.byKey(const Key('send-ticket')));
      await tester.pumpAndSettle();

      expect(bodyOf(adapter.to('POST', '/api/support').single), {
        'type': 'ISSUE',
        'subject': 'لا تصلني الإشعارات',
        'description': 'منذ يومين لا تصلني إشعارات المحادثات',
      });
      expect(find.text('رد فريق نصيبك: تم الإصلاح'), findsOneWidget);
    });
  });

  group('referral', () {
    test('codes are cleaned like the website and the link matches it', () {
      expect(cleanReferralCode(' ab12-cd34xyz '), 'AB12CD34');
      expect(const ReferralInfo(code: 'AB12CD34', total: 0, completed: 0).link('https://naseebak.com/'),
          'https://naseebak.com/register?invitationCode=AB12CD34');
    });

    testWidgets('shows my code and counts', (tester) async {
      phone(tester);
      final adapter = FakeAdapter()
        ..on('GET', '/api/referral', const FakeResponse(200, {'referralCode': 'AB12CD34', 'totalReferrals': 3, 'completedReferrals': 1}));
      await tester.pumpWidget(scoped(await testOverrides(adapter), const ReferralScreen()));
      await tester.pumpAndSettle();
      expect(find.text('AB12CD34'), findsOneWidget);
      expect(find.text('3', skipOffstage: false), findsOneWidget);
      expect(find.text('1', skipOffstage: false), findsOneWidget);
    });
  });

  test('completeness sections open the right app screen', () {
    StrengthSection s(String key, [List<String> missing = const []]) =>
        StrengthSection(key: key, label: key, percentage: 0, missing: missing);
    expect(s('photos').route, '/profile/photos');
    expect(s('quiz').route, '/profile/quiz');
    expect(s('preferences').route, '/profile/preferences');
    expect(s('family', ['معلومات ولي الأمر']).route, '/profile/guardian');
    expect(s('family', ['عدد الأخوة', 'معلومات ولي الأمر']).route, '/profile/edit');
  });
}
