import 'package:flutter/foundation.dart';

import '../../core/network/json.dart';
import '../../shared/person.dart';

enum FeedTab { newTab, interested, waiting }

extension FeedTabX on FeedTab {
  String get apiName => switch (this) {
        FeedTab.newTab => 'new',
        FeedTab.interested => 'interested',
        FeedTab.waiting => 'waiting',
      };

  String get label => switch (this) {
        FeedTab.newTab => 'جديدة',
        FeedTab.interested => 'مهتمون بك',
        FeedTab.waiting => 'بانتظار ردّهم',
      };

  static FeedTab parse(String? v) => switch (v) {
        'interested' => FeedTab.interested,
        'waiting' => FeedTab.waiting,
        _ => FeedTab.newTab,
      };
}

/// A link asked for a tab of the suggestions screen (home's chips, a notice, a push). The screen only learns its tab
/// from the route when the route changes, and going to the address it is already on changes nothing: without this,
/// a member who had swiped to another tab stayed there (`openAppRoute` calls [ask] on every such link).
class FeedTabRequest extends ChangeNotifier {
  FeedTab? tab;

  void ask(FeedTab t) {
    tab = t;
    notifyListeners();
  }
}

final feedTabRequest = FeedTabRequest();

/// Home asked the suggestions screen to open one card's full profile (a home suggestion or «مهتمون بك» card): the
/// tab's list opens it once that card is in it, through its own open path, so the answers run exactly as from the
/// list. A card no longer in the tab once it has loaded (answered, closed, gone) only shows the tab. A request left
/// unanswered for [maxAge] (the screen never loaded) is dropped, so it never opens a profile much later.
class FeedOpenRequest extends ChangeNotifier {
  FeedOpenRequest({DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  static const maxAge = Duration(minutes: 1);

  final DateTime Function() _clock;
  FeedTab? _tab;
  String? _id;
  DateTime? _at;

  void ask(FeedTab tab, String id) {
    _tab = tab;
    _id = id;
    _at = _clock();
    notifyListeners();
  }

  /// The card id waiting to be opened on [tab], if any (and still fresh)
  String? pendingFor(FeedTab tab) {
    final at = _at;
    if (_id == null || _tab != tab || at == null) return null;
    if (_clock().difference(at) > maxAge) {
      clear();
      return null;
    }
    return _id;
  }

  /// Done (opened, or the card is gone): nothing more to open
  void clear() {
    _tab = null;
    _id = null;
    _at = null;
  }
}

final feedOpenRequest = FeedOpenRequest();

/// `mutual` (shared suggestion: `/decide`) · `legacy_suggestion` (`/like`, `/reject`) ·
/// `legacy_interest` (`/api/interests/{id}/accept|reject`) · `legacy_sent` (read only).
enum FeedKind { mutual, legacySuggestion, legacyInterest, legacySent, unknown }

FeedKind parseFeedKind(String? v) => switch (v) {
      'mutual' => FeedKind.mutual,
      'legacy_suggestion' => FeedKind.legacySuggestion,
      'legacy_interest' => FeedKind.legacyInterest,
      'legacy_sent' => FeedKind.legacySent,
      _ => FeedKind.unknown,
    };

/// The candidate's map with the card's own `photoPreview` when the server put it on the card rather than the person
Map<String, dynamic> _withPreview(Map<String, dynamic> candidate, Object? cardPreview) =>
    candidate['photoPreview'] == null && cardPreview != null ? {...candidate, 'photoPreview': cardPreview} : candidate;

/// One card of `GET /api/suggestions/feed` (see src/lib/suggestions/feed-types.ts).
class FeedItem {
  const FeedItem({
    required this.kind,
    required this.id,
    required this.compatibilityScore,
    required this.reason,
    required this.candidate,
    this.createdAt,
    this.expiresAt,
    this.activity,
    this.likedYou = false,
    this.declined = false,
    this.isPro = false,
  });

  factory FeedItem.fromJson(Map<String, dynamic> j) => FeedItem(
        kind: parseFeedKind(asString(j['kind'])),
        id: asStringOr(j['id']),
        compatibilityScore: asDouble(j['compatibilityScore']) ?? 0,
        reason: asStringOr(j['reason']),
        createdAt: asDate(j['createdAt']),
        expiresAt: asDate(j['expiresAt']),
        activity: asString(j['activity']),
        candidate: PersonDetails.fromJson(_withPreview(asMap(j['candidate']), j['photoPreview'])),
        likedYou: asBool(j['likedYou']) ?? false,
        declined: asBool(j['declined']) ?? false,
        isPro: asBool(j['isPro']) ?? false,
      );

  final FeedKind kind;

  /// Suggestion id (or the Like id for legacy interests)
  final String id;
  final double compatibilityScore;
  final String reason;
  final DateTime? createdAt;
  final DateTime? expiresAt;

  /// «نشط اليوم» / «نشطة هذا الأسبوع»; null for older activity
  final String? activity;
  final PersonDetails candidate;
  final bool likedYou;
  final bool declined;

  /// The other person is a Pro member (badge only)
  final bool isPro;

  /// The answer buttons' words, the same on the card and the full profile («قبول» / «اعتذار» on an older interest)
  String get interestLabel => kind == FeedKind.legacyInterest ? 'قبول' : 'مهتم';
  String get declineLabel => kind == FeedKind.legacyInterest ? 'اعتذار' : 'لا';

  /// Whether «مهتم» / «لا» can be pressed on this card (the waiting tab holds my own «مهتم»).
  bool actionableIn(FeedTab tab) {
    if (declined) return false;
    return switch (kind) {
      FeedKind.mutual => tab != FeedTab.waiting,
      FeedKind.legacySuggestion || FeedKind.legacyInterest => true,
      FeedKind.legacySent || FeedKind.unknown => false,
    };
  }
}

/// Page 1 of `GET /api/suggestions` (tops up suggestions and explains an empty list).
class SuggestionsMeta {
  const SuggestionsMeta({
    this.mutualView = false,
    this.credits,
    this.emptyReason,
    this.nextSuggestionsAt,
  });

  factory SuggestionsMeta.fromJson(Map<String, dynamic> j) => SuggestionsMeta(
        mutualView: asBool(j['mutualView']) ?? false,
        credits: asInt(j['credits']),
        emptyReason: asString(j['emptyReason']),
        nextSuggestionsAt: asDate(j['nextSuggestionsAt']),
      );

  final bool mutualView;
  final int? credits;

  /// `weekly_cap` | `no_candidates` | `pending` | null
  final String? emptyReason;
  final DateTime? nextSuggestionsAt;
}

class FeedPage {
  const FeedPage({required this.items, required this.page});
  final List<FeedItem> items;
  final PageInfo page;
}

/// What a «مهتم» / «لا» answer led to.
class DecisionResult {
  const DecisionResult({
    required this.match,
    this.matchId,
    this.creditsLeft,
    this.message,
    this.intro,
    this.conversationId,
    this.myPreference,
  });
  final bool match;
  final String? matchId;
  final int? creditsLeft;
  final String? message;

  /// How the match opened (both chose on «مهتم»): CHAT (the chat is open: [conversationId]), FAMILY or NONE (request
  /// buttons). Null from servers before this field and on the older flows.
  final String? intro;
  final String? conversationId;

  /// What I chose in the sheet (CHAT / FAMILY)
  final String? myPreference;
}
