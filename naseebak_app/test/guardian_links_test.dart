import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/matches/match_detail_screen.dart';
import 'package:naseebak_app/features/matches/match_models.dart';

void main() {
  group('guardianLinks', () {
    test('Jordan: local, +, spaced and 00 forms give the same links', () {
      for (final raw in ['0791234567', '+962791234567', '+962 79 123 4567', '00962791234567', '962791234567']) {
        final l = guardianLinks(raw, '962');
        expect(l.tel.toString(), 'tel:+962791234567', reason: raw);
        expect(l.wa.toString(), 'https://wa.me/962791234567', reason: raw);
      }
    });
    test('Saudi Arabia and Lebanon take their dial codes', () {
      expect(guardianLinks('0501234567', '966').tel.toString(), 'tel:+966501234567');
      expect(guardianLinks('+966 50 123 4567', '966').wa.toString(), 'https://wa.me/966501234567');
      expect(guardianLinks('03123456', '961').tel.toString(), 'tel:+9613123456');
      expect(guardianLinks('0096171123456', '961').wa.toString(), 'https://wa.me/96171123456');
    });
  });

  testWidgets('the card shows the call and WhatsApp buttons, tall enough, and launches the links', (tester) async {
    final opened = <Uri>[];
    await tester.pumpWidget(MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          body: GuardianCard(
            contact: const GuardianContact(name: 'محمود', relationship: 'father', phone: '0791234567'),
            dialCode: '962',
            openLink: (u) async {
              opened.add(u);
              return true;
            },
          ),
        ),
      ),
    ));
    expect(find.text('اتصال'), findsOneWidget);
    expect(find.text('واتساب'), findsOneWidget);
    expect(find.byType(SelectableText), findsOneWidget);
    expect(tester.getSize(find.byKey(const Key('guardian-اتصال'))).height, greaterThanOrEqualTo(44));
    expect(tester.getSize(find.byKey(const Key('guardian-واتساب'))).height, greaterThanOrEqualTo(44));
    await tester.tap(find.byKey(const Key('guardian-اتصال')));
    await tester.tap(find.byKey(const Key('guardian-واتساب')));
    expect(opened.map((u) => u.toString()), ['tel:+962791234567', 'https://wa.me/962791234567']);
  });
}
