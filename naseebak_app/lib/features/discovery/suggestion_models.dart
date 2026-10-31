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
        FeedTab.waiting => 'بانتظار الرد',
      };

  static FeedTab parse(String? v) => switch (v) {
        'interested' => FeedTab.interested,
        'waiting' => FeedTab.waiting,
        _ => FeedTab.newTab,
      };
}

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
    this.likedYou = false,
    this.declined = false,
  });

  factory FeedItem.fromJson(Map<String, dynamic> j) => FeedItem(
        kind: parseFeedKind(asString(j['kind'])),
        id: asStringOr(j['id']),
        compatibilityScore: asDouble(j['compatibilityScore']) ?? 0,
        reason: asStringOr(j['reason']),
        createdAt: asDate(j['createdAt']),
        expiresAt: asDate(j['expiresAt']),
        candidate: PersonDetails.fromJson(asMap(j['candidate'])),
        likedYou: asBool(j['likedYou']) ?? false,
        declined: asBool(j['declined']) ?? false,
      );

  final FeedKind kind;

  /// Suggestion id (or the Like id for legacy interests)
  final String id;
  final double compatibilityScore;
  final String reason;
  final DateTime? createdAt;
  final DateTime? expiresAt;
  final PersonDetails candidate;
  final bool likedYou;
  final bool declined;

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
