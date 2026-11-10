import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../app/providers.dart';
import '../../core/auth/auth_controller.dart';
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
    this.creditsPerGrant,
    this.nextGrantAt,
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
        creditsPerGrant: asInt(j['creditsPerGrant']),
        nextGrantAt: asDate(j['nextGrantAt']),
      );

  final bool enabled;
  final bool isPro;
  final bool cancelAtPeriodEnd;
  final bool pastDue;
  final bool canBuy;
  final String? plan;
  final DateTime? renewsAt;
  final List<ProOffer> offers;

  /// A Pro member's own subscription: the credits of each grant as they were when it was bought (today's offers apply
  /// to new subscribers only). Null when not Pro, and from servers before the field.
  final int? creditsPerGrant;

  /// When the next credits come; null when none are due (cancelled, failing, or the paid time is used up)
  final DateTime? nextGrantAt;
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

/// How the Pro checkout page sent the member back (`…/dashboard/pro?pro=success|cancel`, Stripe's return link opened
/// in the app): the router writes it, the Pro screen reads it for the checkout it opened and clears it before the next
final proReturnProvider = StateProvider<ProReturn?>((ref) => null);

enum ProReturn { success, cancel }

final proRepositoryProvider = Provider<ProRepository>((ref) => ProRepository(ref.watch(apiClientProvider)));

final proStateProvider = FutureProvider.autoDispose<MyProState>((ref) async {
  final state = await ref.watch(proRepositoryProvider).state();
  // Remembered for the next «حسابي» paint (smoke QA: the «عضوية Pro» row arrived after first paint and moved the list)
  final memberId = ref.read(authControllerProvider).me?.id;
  if (memberId != null) await ref.read(proMenuMemoryProvider).save(memberId, state);
  return state;
});

/// The last `/api/pro` answer's menu facts per member on this device, so «حسابي» draws the «عضوية Pro» row (or
/// leaves it out) in its first frame while `/api/pro` reloads, instead of adding it a moment later. The live answer
/// always wins once it arrives; only `canBuy` and `isPro` are kept.
class ProMenuMemory {
  const ProMenuMemory(this._prefs);
  final SharedPreferences _prefs;

  static String _key(String memberId) => 'pro_menu:$memberId';

  /// null: nothing remembered yet for this member
  ({bool canBuy, bool isPro})? read(String memberId) {
    final raw = _prefs.getInt(_key(memberId));
    if (raw == null) return null;
    return (canBuy: raw & 1 != 0, isPro: raw & 2 != 0);
  }

  Future<void> save(String memberId, MyProState s) =>
      _prefs.setInt(_key(memberId), (s.canBuy ? 1 : 0) | (s.isPro ? 2 : 0));
}

final proMenuMemoryProvider = Provider<ProMenuMemory>((ref) => ProMenuMemory(ref.watch(sharedPreferencesProvider)));

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

/// Pausing the account stopped the Pro renewal (the deactivate answer's `proRenewalStopped`, QA A-M01 / A2-H1).
/// Remembered per member on the phone with the paid period's end, so the paused page (also after a cold start, before
/// `/api/pro` answers) and «اشتراكي» after reactivating say why Pro no longer renews, instead of «ألغيت التجديد».
///
/// It only speaks for the subscription it was written for (review A2 #1): it is stale, and cleared, once that period
/// has ended, or once `/api/pro` says Pro is gone or renewing again (a resume, a new subscription), and it is cleared
/// when the member cancels or resumes in the app.
class ProPauseNote {
  const ProPauseNote(this._prefs);
  final SharedPreferences _prefs;

  static String _key(String memberId) => 'pro_stopped_by_pause:$memberId';

  /// Whether the note still applies. [pro]: the latest `/api/pro` answer, when there is one.
  bool stopped(String? memberId, {MyProState? pro, DateTime? now}) {
    if (memberId == null) return false;
    final raw = _prefs.get(_key(memberId));
    if (raw == null) return false;
    // A note from the first build (a bare true) has no date: it still follows the server's answer
    final end = raw is int && raw > 0 ? DateTime.fromMillisecondsSinceEpoch(raw) : null;
    final stale = (end != null && !(now ?? DateTime.now()).isBefore(end)) ||
        (pro != null && (!pro.isPro || !pro.cancelAtPeriodEnd));
    if (stale) {
      _prefs.remove(_key(memberId));
      return false;
    }
    return true;
  }

  /// [periodEnd]: when the paid period of the subscription that stopped renewing ends
  Future<void> mark(String memberId, {DateTime? periodEnd}) =>
      _prefs.setInt(_key(memberId), periodEnd?.millisecondsSinceEpoch ?? 0);

  Future<void> clear(String memberId) => _prefs.remove(_key(memberId));
}

final proPauseNoteProvider = Provider<ProPauseNote>((ref) => ProPauseNote(ref.watch(sharedPreferencesProvider)));

/// Whether the deactivate answer says the renewal stopped. An older server sends no field: then a renewing Pro
/// ([wasRenewing]) is taken as stopped, which is what pausing does.
bool pauseStoppedRenewal(Map<String, dynamic> answer, {required bool wasRenewing}) =>
    asBool(answer['proRenewalStopped']) ?? wasRenewing;
