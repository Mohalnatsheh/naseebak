import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/network/api_exception.dart';
import 'package:naseebak_app/features/pro/pro_repository.dart';

import 'helpers/fake_api.dart';

const _state = {
  'enabled': true,
  'isPro': false,
  'plan': null,
  'renewsAt': null,
  'cancelAtPeriodEnd': false,
  'pastDue': false,
  'canBuy': true,
  'offers': [
    {'id': 'weekly', 'price': 1.5, 'currency': 'JOD', 'chargeCurrency': 'usd', 'chargeAmount': 212, 'credits': 2, 'interval': 'week'},
    {'id': 'monthly', 'price': 4, 'currency': 'JOD', 'chargeCurrency': 'usd', 'chargeAmount': 564, 'credits': 5, 'interval': 'month'},
  ],
};

MyProState _s({bool isPro = false, bool canBuy = false}) => MyProState(isPro: isPro, canBuy: canBuy);

void main() {
  test('parses a full state', () async {
    final a = FakeAdapter()
      ..on('GET', '/api/pro', FakeResponse(200, {..._state, 'isPro': true, 'plan': 'monthly', 'renewsAt': '2026-12-01T10:00:00.000Z', 'cancelAtPeriodEnd': true, 'pastDue': true}));
    final s = await ProRepository(fakeClient(a)).state();
    expect(s.enabled, isTrue);
    expect(s.isPro, isTrue);
    expect(s.plan, 'monthly');
    expect(s.renewsAt, DateTime.utc(2026, 12, 1, 10));
    expect(s.cancelAtPeriodEnd, isTrue);
    expect(s.pastDue, isTrue);
    expect(s.canBuy, isTrue);
    expect(s.offers.length, 2);
    expect(s.offers[1].id, 'monthly');
    expect(s.offers[1].price, 4.0);
    expect(s.offers[1].chargeCurrency, 'usd');
    expect(s.offers[1].chargeAmount, 564);
    expect(s.offers[1].credits, 5);
    expect(s.offers[1].interval, 'month');
  });

  test('an empty answer parses to a closed state', () async {
    final a = FakeAdapter()..on('GET', '/api/pro', const FakeResponse(200, {}));
    final s = await ProRepository(fakeClient(a)).state();
    expect(s.enabled, isFalse);
    expect(s.isPro, isFalse);
    expect(s.canBuy, isFalse);
    expect(s.offers, isEmpty);
    expect(s.renewsAt, isNull);
  });

  test('checkout returns an https url and sends the plan', () async {
    final a = FakeAdapter()..on('POST', '/api/pro/checkout', const FakeResponse(200, {'url': 'https://checkout.stripe.com/c/x'}));
    final uri = await ProRepository(fakeClient(a)).checkout('monthly');
    expect(uri.scheme, 'https');
    expect(a.to('POST', '/api/pro/checkout').single.data, {'plan': 'monthly'});
  });

  test('checkout refuses an http url', () async {
    final a = FakeAdapter()..on('POST', '/api/pro/checkout', const FakeResponse(200, {'url': 'http://evil.test/x'}));
    expect(ProRepository(fakeClient(a)).checkout('monthly'), throwsA(isA<Exception>()));
  });

  test('checkout refuses a missing url', () async {
    final a = FakeAdapter()..on('POST', '/api/pro/checkout', const FakeResponse(200, {}));
    expect(ProRepository(fakeClient(a)).checkout('monthly'), throwsA(isA<Exception>()));
  });

  test('409 ALREADY_PRO carries the Arabic message', () async {
    final a = FakeAdapter()
      ..on('POST', '/api/pro/checkout', const FakeResponse(409, {'error': 'أنت مشترك في Pro بالفعل', 'code': 'ALREADY_PRO'}));
    await expectLater(
      ProRepository(fakeClient(a)).checkout('monthly'),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'أنت مشترك في Pro بالفعل').having((e) => e.code, 'code', 'ALREADY_PRO')),
    );
  });

  test('cancel and resume post to their routes', () async {
    final a = FakeAdapter()
      ..on('POST', '/api/pro/cancel', const FakeResponse(200, {}))
      ..on('POST', '/api/pro/resume', const FakeResponse(200, {}));
    final repo = ProRepository(fakeClient(a));
    await repo.cancel();
    await repo.resume();
    expect(a.to('POST', '/api/pro/cancel'), hasLength(1));
    expect(a.to('POST', '/api/pro/resume'), hasLength(1));
  });

  test('showPlans truth table: appPayments && (canBuy || isPro)', () {
    const table = {
      // (appPayments, isPro, canBuy): shown
      (true, false, false): false,
      (true, false, true): true,
      (true, true, false): true,
      (true, true, true): true,
      // A test or review account (app payments off) never sees Pro, even when Pro (owner, 2026-11-10)
      (false, false, false): false,
      (false, false, true): false,
      (false, true, false): false,
      (false, true, true): false,
    };
    table.forEach((k, shown) {
      final (appPayments, isPro, canBuy) = k;
      expect(showPlans(_s(isPro: isPro, canBuy: canBuy), appPayments), shown,
          reason: 'app=$appPayments pro=$isPro buy=$canBuy');
    });
  });

  test('mediaButtonsMode truth table', () {
    MediaButtons mode({required bool pro, required bool pay, required bool buy, required bool active}) =>
        mediaButtonsMode(isPro: pro, appPayments: pay, canBuy: buy, chatActive: active);
    for (final pay in [true, false]) {
      for (final buy in [true, false]) {
        // Pro + active chat: always enabled
        expect(mode(pro: true, pay: pay, buy: buy, active: true), MediaButtons.enabled);
        // Pro + ended chat: hidden
        expect(mode(pro: true, pay: pay, buy: buy, active: false), MediaButtons.hidden);
        // Not Pro + ended chat: hidden
        expect(mode(pro: false, pay: pay, buy: buy, active: false), MediaButtons.hidden);
      }
    }
    // A Pro test account (app payments off) still sends: sending is not a purchase
    expect(mode(pro: true, pay: false, buy: false, active: true), MediaButtons.enabled);
    expect(mode(pro: false, pay: true, buy: true, active: true), MediaButtons.locked);
    expect(mode(pro: false, pay: false, buy: true, active: true), MediaButtons.hidden);
    // A test account: canBuy false, not Pro
    expect(mode(pro: false, pay: true, buy: false, active: true), MediaButtons.hidden);
    expect(mode(pro: false, pay: false, buy: false, active: true), MediaButtons.hidden);
  });
}
