import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/network/api_client.dart';
import '../../core/network/json.dart';

class CreditPackage {
  const CreditPackage({
    required this.id,
    required this.name,
    required this.credits,
    required this.price,
    required this.currency,
    required this.currencySymbol,
    this.chargeLabel,
    this.popular = false,
    this.wasPrice,
    this.bonusCredits = 0,
  });

  factory CreditPackage.fromJson(Map<String, dynamic> j) => CreditPackage(
        id: asStringOr(j['id']),
        name: asStringOr(j['name']),
        credits: asInt(j['credits']) ?? 0,
        price: asDouble(j['price']) ?? 0,
        currency: asStringOr(j['currency']),
        currencySymbol: asStringOr(j['currencySymbol']),
        chargeLabel: asString(j['chargeLabel']),
        popular: asBool(j['popular']) ?? false,
        wasPrice: asDouble(j['wasPrice']),
        bonusCredits: asInt(j['bonusCredits']) ?? 0,
      );

  final String id;
  final String name;
  final int credits;
  final double price;
  final String currency;
  final String currencySymbol;

  /// What the card is actually charged, e.g. "4.23$" (Jordan is charged in USD)
  final String? chargeLabel;
  final bool popular;
  final double? wasPrice;

  /// Extra credits from a sale offer (0 = none). [name] already carries «+ N هدية» for older apps; [credits] stays
  /// the package's own.
  final int bonusCredits;
}

/// The sale offer open now (`offer` of `/api/payments/plans`, sent only where buying is open)
class CreditOffer {
  const CreditOffer({required this.percent, required this.title, required this.endsAt});

  /// Null when the server sent no usable offer (an older server sends none at all)
  static CreditOffer? fromJson(Object? raw) {
    final j = asMap(raw);
    final endsAt = asDate(j['endsAt']);
    final percent = asInt(j['percent']) ?? 0;
    if (endsAt == null || percent <= 0) return null;
    return CreditOffer(percent: percent, title: asStringOr(j['title']), endsAt: endsAt);
  }

  final int percent;
  final String title;
  final DateTime endsAt;
}

class Plans {
  const Plans({required this.country, required this.purchasesEnabled, required this.packages, this.offer});
  factory Plans.fromJson(Map<String, dynamic> j) => Plans(
        country: asStringOr(j['country']),
        purchasesEnabled: asBool(j['purchasesEnabled']) ?? false,
        packages: asMapList(j['packages']).map(CreditPackage.fromJson).toList(),
        offer: CreditOffer.fromJson(j['offer']),
      );
  final String country;
  final bool purchasesEnabled;
  final List<CreditPackage> packages;
  final CreditOffer? offer;
}

class CheckoutStart {
  const CheckoutStart({required this.paymentId, this.checkoutUrl, this.mock = false});
  final String paymentId;
  final String? checkoutUrl;
  final bool mock;
}

class PaymentStatus {
  const PaymentStatus({required this.id, required this.status, required this.credits});
  final String id;

  /// PENDING | COMPLETED | FAILED | REFUNDED
  final String status;
  final int credits;
}

/// A paid amount's currency the way the rest of the app writes it («3 د.أ», not «JOD 3»); an unknown code stays as is
String currencyLabel(String code) => switch (code.toUpperCase()) {
      'JOD' => 'د.أ',
      'SAR' => 'ر.س',
      'USD' => r'$',
      _ => code,
    };

class PaymentRecord {
  const PaymentRecord({
    required this.id,
    required this.status,
    required this.amount,
    required this.currency,
    this.description,
    this.createdAt,
  });

  factory PaymentRecord.fromJson(Map<String, dynamic> j) => PaymentRecord(
        id: asStringOr(j['id']),
        status: asStringOr(j['status']),
        amount: asDouble(j['amount']) ?? 0,
        currency: asStringOr(j['currency']),
        description: asString(j['description']),
        createdAt: asDate(j['createdAt']),
      );

  final String id;
  final String status;
  final double amount;
  final String currency;
  final String? description;
  final DateTime? createdAt;
}

class CreditsRepository {
  CreditsRepository(this._api);
  final ApiClient _api;

  Future<Plans> plans() async => Plans.fromJson(await _api.get('/api/payments/plans'));

  Future<CheckoutStart> checkout(String packageId) async {
    final j = await _api.post('/api/payments/checkout', body: {'packageId': packageId, 'mode': 'hosted'});
    return CheckoutStart(
      paymentId: asStringOr(j['paymentId']),
      checkoutUrl: asString(j['checkoutUrl']),
      mock: asBool(j['mock']) ?? false,
    );
  }

  Future<PaymentStatus> status(String paymentId) async {
    final j = await _api.get('/api/payments/$paymentId/status');
    final p = asMap(j['payment']);
    return PaymentStatus(id: asStringOr(p['id']), status: asStringOr(p['status'], 'PENDING'), credits: asInt(j['credits']) ?? 0);
  }

  /// `POST /api/payments/cancel`: closes the Stripe page and fails the row, or credits it if it was paid meanwhile
  /// (`paid: true`). Read [status] afterwards for the outcome (a page Stripe could not close stays PENDING).
  Future<bool> cancel(String paymentId) async {
    final j = await _api.post('/api/payments/cancel', body: {'paymentId': paymentId});
    return asBool(j['paid']) ?? false;
  }

  /// Local mock payments only (404 on real servers).
  Future<void> completeMock(String paymentId, {required bool paid}) async {
    await _api.post('/api/dev/mock-checkout/$paymentId', body: {'outcome': paid ? 'paid' : 'cancelled'});
  }

  Future<({List<PaymentRecord> items, int balance, PageInfo page})> history({int page = 1}) async {
    final j = await _api.get('/api/payments/history', query: {'page': page});
    return (
      items: asMapList(j['payments']).map(PaymentRecord.fromJson).toList(),
      balance: asInt(j['matchCredits']) ?? 0,
      page: PageInfo.fromJson(j),
    );
  }
}

final creditsRepositoryProvider = Provider<CreditsRepository>((ref) => CreditsRepository(ref.watch(apiClientProvider)));

final plansProvider = FutureProvider.autoDispose<Plans>((ref) => ref.watch(creditsRepositoryProvider).plans());

final paymentHistoryProvider = FutureProvider.autoDispose((ref) => ref.watch(creditsRepositoryProvider).history());

/// Polls the payment until it leaves PENDING (every [interval], up to [timeout]); null on timeout or when [cancelled].
/// The window is counted in polls, so time the app spends frozen in the background doesn't use it up.
Future<PaymentStatus?> waitForPayment(
  CreditsRepository repo,
  String paymentId, {
  Duration interval = const Duration(milliseconds: 2500),
  Duration timeout = const Duration(minutes: 10),
  bool Function()? cancelled,
}) async {
  var waited = Duration.zero;
  while (waited < timeout) {
    if (cancelled?.call() ?? false) return null;
    try {
      final s = await repo.status(paymentId);
      if (cancelled?.call() ?? false) return null;
      if (s.status != 'PENDING') return s;
    } catch (_) {
      // Keep polling through a brief network gap
    }
    await Future<void>.delayed(interval);
    waited += interval;
  }
  return null;
}
