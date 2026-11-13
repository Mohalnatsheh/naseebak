import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/home/counts.dart';
import 'package:naseebak_app/shared/person.dart';
import 'package:naseebak_app/shared/religion.dart';

import 'helpers/fake_api.dart';
import 'suggestions_flow_test.dart' show Harness, card;

void main() {
  group('religion helpers', () {
    test('religionOf: null and unknown read مسلم', () {
      expect(religionOf(null), 'مسلم');
      expect(religionOf('مسيحي'), 'مسيحي');
      expect(religionOf('x'), 'مسلم');
      expect(isChristian('مسيحي'), isTrue);
      expect(isChristian(null), isFalse);
    });
    test('withoutMuslimOnly drops the Muslim-only answers for a Christian only', () {
      final data = <String, Object?>{'religiosity': 'ملتزم', 'hijab': true, 'niqab': false, 'beard': null, 'sect': 'سني',
          'prefSect': ['سني'], 'prefHijab': 'نعم', 'prefBeard': 'لا', 'dealbreakers': ['age', 'hijab', 'sect']};
      expect(withoutMuslimOnly('مسيحي', data), {'religiosity': 'ملتزم', 'dealbreakers': ['age']});
      expect(withoutMuslimOnly('مسلم', data), data);
      expect(withoutMuslimOnly(null, data), data);
    });
    test('prefReligionHints', () {
      expect(prefReligionHints('مسلم', 'نفس ديانتي', ['hijab']), isEmpty);
      expect(prefReligionHints('مسلم', 'لا مانع', ['age']), [prefReligionAnyHint]);
      expect(prefReligionHints(null, 'لا مانع', ['beard']), [prefReligionAnyHint, dealbreakersStillApplyHint]);
      expect(prefReligionHints('مسيحي', 'لا مانع', ['hijab']), [prefReligionAnyHint]);
    });
    test('religionFact shows only a different, known religion', () {
      expect(religionFact('مسيحي', 'مسلم', female: true), 'مسيحية');
      expect(religionFact('مسلم', 'مسيحي', female: true), 'مسلمة');
      expect(religionFact('مسلم', 'مسيحي', female: false), 'مسلم');
      expect(religionFact('مسلم', 'مسلم', female: true), isNull);
      expect(religionFact(null, 'مسيحي', female: true), isNull);
      expect(religionFact('مسيحي', null, female: true), isNull);
    });
    test('labels, card field and the counts switch', () {
      expect(OptionLabels.describe('religion', 'مسيحي', female: true), 'مسيحية');
      expect(OptionLabels.self('religion', 'مسلم', female: false), 'مسلم');
      expect(PersonDetails.fromJson({'id': 'p', 'firstName': 'هدى', 'religion': 'مسيحي'}).religion, 'مسيحي');
      expect(Counts.fromJson({'flags': {}, 'religionEnabled': true}).religionEnabled, isTrue);
      expect(Counts.fromJson({'flags': {}}).religionEnabled, isFalse);
    });
  });

  group('cards', () {
    Map<String, dynamic> christian() => {
          ...card('s1'),
          'candidate': {'id': 'c-s1', 'firstName': 'أحمد', 'age': 30, 'religion': 'مسيحي'},
        };

    testWidgets('a Muslim viewer sees «الديانة» on a Christian card', (tester) async {
      final h = Harness(items: [christian()], gender: 'FEMALE');
      h.adapter.on('GET', '/api/profile',
          const FakeResponse(200, {'user': {'gender': 'FEMALE', 'profile': {'religion': 'مسلم'}}}));
      await h.pump(tester);
      expect(find.descendant(of: find.byKey(const Key('card-fact-s1-religion')), matching: find.textContaining('الديانة مسيحي')), findsOneWidget);
    });

    testWidgets('my religion null after loading reads مسلم: a Christian card shows «مسيحي»', (tester) async {
      final h = Harness(items: [christian()], gender: 'FEMALE');
      h.adapter.on('GET', '/api/profile',
          const FakeResponse(200, {'user': {'gender': 'FEMALE', 'profile': {'religion': null}}}));
      await h.pump(tester);
      expect(find.descendant(of: find.byKey(const Key('card-fact-s1-religion')), matching: find.textContaining('الديانة مسيحي')), findsOneWidget);
    });

    testWidgets('no religion fact while my profile cannot be read', (tester) async {
      final h = Harness(items: [christian()], gender: 'FEMALE');
      h.adapter.on('GET', '/api/profile', const FakeResponse(500, {'error': 'x'}));
      await h.pump(tester);
      expect(find.byKey(const Key('card-fact-s1-religion')), findsNothing);
    });

    testWidgets('a card without religion never reads my profile', (tester) async {
      final h = Harness(gender: 'FEMALE');
      await h.pump(tester);
      expect(h.adapter.to('GET', '/api/profile'), isEmpty);
    });
  });
}
