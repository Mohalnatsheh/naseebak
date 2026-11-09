import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/network/api_client.dart';
import '../../core/network/json.dart';

/// One sellable plan of the member's country (`offers[]` of `GET /api/pro`).
class ProOffer {
  const ProOffer({
    required this.id,
    required this.price,
    required this.currency,
    required this.chargeCurrency,
    required this.chargeAmount,
    required this.credits,
    required this.interval,
  });

  factory ProOffer.fromJson(Map<String, dynamic> j) => ProOffer(
        id: asStringOr(j['id']),
        price: asDouble(j['price']) ?? 0,
        currency: asStringOr(j['currency']),
        chargeCurrency: asStringOr(j['chargeCurrency']),
        chargeAmount: asInt(j['chargeAmount']) ?? 0,
        credits: asInt(j['credits']) ?? 0,
        interval: asStringOr(j['interval']),
      );

  /// weekly | monthly | yearly
  final String id;
  final double price;

  /// JOD | SAR (what the member sees)
  final String currency;

  /// usd | sar (what the card is charged); [chargeAmount] is in cents/halalas
  final String chargeCurrency;
  final int chargeAmount;

  /// Credits per grant (yearly: per month)
  final int credits;

  /// week | month | year
  final String interval;
}

/// `GET /api/pro`
class MyProState {
  const MyProState({
    this.enabled = false,
    this.isPro = false,
    this.cancelAtPeriodEnd = false,
    this.pastDue = false,
    this.canBuy = false,
    this.plan,
    this.renewsAt,
    this.offers = const [],
  });

  factory MyProState.fromJson(Map<String, dynamic> j) => MyProState(
        enabled: asBool(j['enabled']) ?? false,
        isPro: asBool(j['isPro']) ?? false,
        cancelAtPeriodEnd: asBool(j['cancelAtPeriodEnd']) ?? false,
        pastDue: asBool(j['pastDue']) ?? false,
        canBuy: asBool(j['canBuy']) ?? false,
        plan: asString(j['plan']),
        renewsAt: asDate(j['renewsAt']),
        offers: asMapList(j['offers']).map(ProOffer.fromJson).toList(),
      );

  final bool enabled;
  final bool isPro;
  final bool cancelAtPeriodEnd;
  final bool pastDue;
  final bool canBuy;
  final String? plan;
  final DateTime? renewsAt;
  final List<ProOffer> offers;
}

/// A started Pro checkout: the Stripe page, or (local mock only) the payment to finish in the app
class ProCheckout {
  const ProCheckout({this.url, this.mockPaymentId});
  final Uri? url;
  final String? mockPaymentId;
}

class ProRepository {
  ProRepository(this._api);
  final ApiClient _api;

  Future<MyProState> state() async => MyProState.fromJson(await _api.get('/api/pro'));

  /// Starts a Stripe checkout; the returned page is opened in the phone's browser. Only https is accepted.
  Future<Uri> checkout(String plan) async => (await startCheckout(plan)).url!;

  /// Same, also reading a local mock checkout (`PAYMENTS_MOCK`: a relative `/dashboard/pro?mockPro=<id>`), which
  /// only a debug build talking to a local backend accepts ([allowMock], like the credits' «دفع تجريبي»)
  Future<ProCheckout> startCheckout(String plan, {bool allowMock = false}) async {
    final j = await _api.post('/api/pro/checkout', body: {'plan': plan});
    final raw = (asString(j['url']) ?? '').trim();
    final uri = Uri.tryParse(raw);
    final mockId = uri?.queryParameters['mockPro'];
    if (allowMock && uri != null && !uri.hasScheme && mockId != null && mockId.isNotEmpty) {
      return ProCheckout(mockPaymentId: mockId);
    }
    if (uri == null || uri.scheme.toLowerCase() != 'https' || uri.host.isEmpty) {
      throw const FormatException('Pro checkout url is not https');
    }
    return ProCheckout(url: uri);
  }

  /// Local mock payments only (404 on real servers)
  Future<void> completeMock(String paymentId, {required bool paid}) async {
    await _api.post('/api/dev/mock-checkout/$paymentId', body: {'outcome': paid ? 'paid' : 'cancelled'});
  }

  /// Stops the renewal; Pro stays until the paid period ends. Never refunds.
  Future<void> cancel() async {
    await _api.post('/api/pro/cancel');
  }

  Future<void> resume() async {
    await _api.post('/api/pro/resume');
  }
}

final proRepositoryProvider = Provider<ProRepository>((ref) => ProRepository(ref.watch(apiClientProvider)));

final proStateProvider = FutureProvider.autoDispose<MyProState>((ref) => ref.watch(proRepositoryProvider).state());

/// The Pro screen, its menu entry and the link card on the credits screen: only where the app shows payments, to
/// buyers (the server says they can buy) and to current Pro members. A test or review account (app payments off)
/// never sees a plan or «اشتراكي», even if it is Pro (owner, 2026-11-10).
bool showPlans(MyProState s, bool appPayments) => appPayments && (s.canBuy || s.isPro);

enum MediaButtons { enabled, locked, hidden }

/// Photo and voice buttons in a chat: usable for Pro in an ACTIVE chat (also a Pro test account: sending is not a
/// purchase), greyed with a «Pro» tag that opens `/pro` only where the app shows payments and the member could buy,
/// hidden otherwise (test and review accounts: app payments off, and `canBuy: false`).
MediaButtons mediaButtonsMode({
  required bool isPro,
  required bool appPayments,
  required bool canBuy,
  required bool chatActive,
}) {
  if (!chatActive) return MediaButtons.hidden;
  if (isPro) return MediaButtons.enabled;
  if (appPayments && canBuy) return MediaButtons.locked;
  return MediaButtons.hidden;
}
