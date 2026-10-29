import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/network/media_url.dart';
import 'package:naseebak_app/features/chat/chat_live.dart';
import 'package:naseebak_app/features/profile/photos_screen.dart';
import 'package:naseebak_app/features/profile/preferences_screen.dart';
import 'package:naseebak_app/features/profile/profile_repository.dart';
import 'package:naseebak_app/features/profile/quiz_screen.dart';

import 'helpers/fake_api.dart';

Widget scoped(List<Override> overrides, Widget child) => ProviderScope(overrides: overrides, child: rtlApp(child));

Map<String, dynamic> bodyOf(RequestOptions r) => Map<String, dynamic>.from(r.data as Map);

/// A phone-sized screen (360 × 800)
void phone(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
}

Future<void> scrollTo(WidgetTester tester, Finder f, [double delta = 200]) =>
    tester.scrollUntilVisible(f, delta, scrollable: find.byType(Scrollable).first);

void main() {
  group('media URLs', () {
    test('relative local uploads resolve against the API, CDN links stay', () {
      expect(resolveMediaUrl('http://10.0.2.2:3020', '/api/dev/uploads/photos/u1/a.jpg'),
          'http://10.0.2.2:3020/api/dev/uploads/photos/u1/a.jpg');
      expect(resolveMediaUrl('http://x/', 'https://cdn.naseebak.com/photos/a.jpg'), 'https://cdn.naseebak.com/photos/a.jpg');
    });
  });

  group('photo data URLs', () {
    test('JPEG, PNG and WebP are accepted, anything else refused', () {
      expect(photoDataUrl(Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 1])), startsWith('data:image/jpeg;base64,'));
      expect(photoDataUrl(Uint8List.fromList([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0])), startsWith('data:image/png;base64,'));
      expect(photoDataUrl(Uint8List.fromList([...ascii.encode('RIFF'), 0, 0, 0, 0, ...ascii.encode('WEBP'), 0])),
          startsWith('data:image/webp;base64,'));
      expect(photoDataUrl(Uint8List.fromList(ascii.encode('....ftypheic....'))), isNull);
    });
  });

  group('partner preferences', () {
    test('older yes/no values are read in the wizard form', () {
      final p = PartnerPrefs.fromJson({'prefHijab': 'yes', 'prefChildrenAcceptance': 'no_children', 'dealbreakers': ['hijab']});
      expect(p.hijab, 'نعم');
      expect(p.children, 'لا');
      expect(p.dealbreakers, {'hijab'});
    });

    test('a woman sends the beard preference, never the hijab one', () {
      final changes = const PartnerPrefs(ageMin: 25, ageMax: 35, beard: 'نعم').toChanges(female: true);
      expect(changes['prefBeard'], 'نعم');
      expect(changes.containsKey('prefHijab'), isFalse);
      expect(changes['prefChildrenAcceptance'], '');
    });

    test('age range rule matches the website', () {
      expect(prefAgeError(25, 35), isNull);
      expect(prefAgeError(null, 35), isNotNull);
      expect(prefAgeError(17, 35), isNotNull);
      expect(prefAgeError(40, 30), 'العمر الأدنى يجب أن يكون أقل من العمر الأقصى');
    });

    testWidgets('saving sends the preferences, then «شروطي الأساسية»', (tester) async {
    phone(tester);
      final adapter = FakeAdapter()
        ..on('POST', '/api/profile/update-request', const FakeResponse(200, {'message': 'تم حفظ تفضيلات الشريك', 'requested': false}))
        ..on('PUT', '/api/profile/dealbreakers', const FakeResponse(200, {'keys': []}))
        ..on('GET', '/api/profile/dealbreakers', const FakeResponse(200, {'profile': {}}));
      await tester.pumpWidget(scoped(
        await testOverrides(adapter),
        const Scaffold(
          body: PreferencesForm(
            initial: PartnerPrefs(ageMin: 24, ageMax: 34, religiosity: ['ملتزم']),
            cities: ['عمّان', 'إربد'],
            female: true,
            withDealbreakers: true,
          ),
        ),
      ));
      await tester.pumpAndSettle();

      // A dealbreaker needs a preference first
      FilterChip cityLock() => tester.widget<FilterChip>(find.byKey(const Key('db-city')));
      expect(cityLock().onSelected, isNull);
      await tester.tap(find.text('إربد'));
      await tester.pump();
      expect(cityLock().onSelected, isNotNull);
      await scrollTo(tester, find.byKey(const Key('db-religiosity')));
      await tester.tap(find.byKey(const Key('db-religiosity')));
      await tester.pump();
      await scrollTo(tester, find.byKey(const Key('save-prefs')));
      await tester.tap(find.byKey(const Key('save-prefs')));
      await tester.pumpAndSettle();

      final changes = Map<String, dynamic>.from(bodyOf(adapter.to('POST', '/api/profile/update-request').single)['changes'] as Map);
      expect(changes['prefAgeMin'], 24);
      expect(changes['prefCity'], ['إربد']);
      expect(changes['prefReligiosity'], ['ملتزم']);
      expect(changes.containsKey('prefHijab'), isFalse);
      expect(bodyOf(adapter.to('PUT', '/api/profile/dealbreakers').single)['keys'], ['religiosity']);
      expect(find.text('تم حفظ تفضيلاتك'), findsOneWidget);
    });

    testWidgets('a wrong age range is refused before sending', (tester) async {
    phone(tester);
      final adapter = FakeAdapter();
      await tester.pumpWidget(scoped(
        await testOverrides(adapter),
        const Scaffold(
          body: PreferencesForm(initial: PartnerPrefs(ageMin: 40, ageMax: 30), cities: [], female: false, withDealbreakers: false),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('db-age')), findsNothing);
      await scrollTo(tester, find.byKey(const Key('save-prefs')));
      await tester.tap(find.byKey(const Key('save-prefs')));
      await tester.pumpAndSettle();
      expect(adapter.requests, isEmpty);
      await scrollTo(tester, find.text('العمر الأدنى يجب أن يكون أقل من العمر الأقصى'), -200);
    });
  });

  testWidgets('photos: a picked JPEG is uploaded as a data URL', (tester) async {
    phone(tester);
    var uploaded = false;
    final adapter = FakeAdapter()
      ..handlers['GET /api/profile/photos'] = ((_) => FakeResponse(200, {
            'photos': uploaded ? [{'id': 'p1', 'url': '/api/dev/uploads/photos/u1/a.jpg', 'isPrimary': true}] : [],
          }))
      ..handlers['POST /api/profile/photos'] = (_) {
        uploaded = true;
        return const FakeResponse(200, {'message': 'تم رفع الصورة'});
      };
    await tester.pumpWidget(scoped(
      await testOverrides(adapter),
      PhotosScreen(picker: () async => Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3])),
    ));
    await tester.pumpAndSettle();
    expect(find.text('0 من 5 صور'), findsOneWidget);

    await tester.tap(find.byKey(const Key('add-photo')));
    await tester.pumpAndSettle();
    expect(bodyOf(adapter.to('POST', '/api/profile/photos').single)['photoData'], startsWith('data:image/jpeg;base64,'));
    expect(find.text('الرئيسية'), findsOneWidget);
    expect(find.text('1 من 5 صور'), findsOneWidget);
  });

  testWidgets('quiz: every statement must be answered, then the answers are sent', (tester) async {
    phone(tester);
    final adapter = FakeAdapter()
      ..on('GET', '/api/profile/personality-quiz', const FakeResponse(200, {
        'questions': [
          {'id': 'q1', 'text': 'أحب قضاء وقتي مع الناس'},
          {'id': 'q2', 'text': 'أخطط لمستقبلي'},
        ],
        'result': null,
      }))
      ..on('POST', '/api/profile/personality-quiz', const FakeResponse(200, {
        'result': {'personalityType': 'الاجتماعية', 'vector': [5, 3, 3, 3, 3]},
      }));
    await tester.pumpWidget(scoped(await testOverrides(adapter), const QuizScreen()));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('q1-5')));
    await tester.tap(find.byKey(const Key('submit-quiz')));
    await tester.pump();
    expect(adapter.to('POST', '/api/profile/personality-quiz'), isEmpty);

    await tester.tap(find.byKey(const Key('q2-4')));
    await tester.tap(find.byKey(const Key('submit-quiz')));
    await tester.pumpAndSettle();
    expect(bodyOf(adapter.to('POST', '/api/profile/personality-quiz').single)['answers'], {'q1': 5, 'q2': 4});
  });

  group('live chat', () {
    test('SSE events are split on blank lines, heartbeats dropped', () {
      final p = SseParser();
      expect(p.add(':heartbeat\n\nid: 1\ndata: {"a"'), isEmpty);
      final events = p.add(':1}\r\n\r\nevent: x\ndata: 2\n\n');
      expect(events, [('message', '{"a":1}'), ('x', '2')]);
    });

    test('no Ably on the server (404) means no live link', () async {
      final adapter = FakeAdapter()..on('GET', '/api/chats/ably-token', const FakeResponse(404, {'error': 'غير متاح'}));
      expect(await ChatLive(fakeClient(adapter)).token(), isNull);
      final events = await ChatLive(fakeClient(adapter)).events('c1').toList();
      expect(events, isEmpty);
    });

    test('the server token request is exchanged with Ably for a token', () async {
      final api = FakeAdapter()
        ..on('GET', '/api/chats/ably-token', const FakeResponse(200, {'keyName': 'app.key', 'mac': 'm', 'nonce': 'n'}));
      final ablyAdapter = FakeAdapter()
        ..on('POST', 'https://rest.ably.io/keys/app.key/requestToken', const FakeResponse(200, {'token': 'tok'}));
      final ably = Dio()..httpClientAdapter = ablyAdapter;
      expect(await ChatLive(fakeClient(api), ably: ably).token(), 'tok');
      expect(bodyOf(ablyAdapter.requests.single)['mac'], 'm');
    });
  });
}
