import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/network/api_client.dart';
import '../../core/network/json.dart';
import '../home/counts.dart';
import 'suggestion_models.dart';

/// Discovery endpoints. The server decides matches and credits; the app only sends the answer.
class SuggestionsRepository {
  SuggestionsRepository(this._api);
  final ApiClient _api;

  /// `GET /api/suggestions` page 1: tops up new suggestions, returns why the list may be empty.
  Future<SuggestionsMeta> topUp() async => SuggestionsMeta.fromJson(await _api.get('/api/suggestions'));

  /// «جديدة» with no one left: which of my own filters to ease, in words (`GET /api/suggestions/filter-tip`, the
  /// website's tip). Null: nothing worth changing.
  Future<String?> filterTip() async {
    final j = await _api.get('/api/suggestions/filter-tip');
    final text = asString(j['text'])?.trim();
    return text == null || text.isEmpty ? null : text;
  }

  Future<FeedPage> feed(FeedTab tab, {int page = 1}) async {
    final j = await _api.get('/api/suggestions/feed', query: {'tab': tab.apiName, 'page': page});
    return FeedPage(items: asMapList(j['items']).map(FeedItem.fromJson).toList(), page: PageInfo.fromJson(j));
  }

  /// «مهتم» (`interested: true`) or «لا» on any card kind.
  Future<DecisionResult> answer(
    FeedItem item, {
    required bool interested,
    String? introPreference,
    bool? guardianConsent,
  }) async {
    switch (item.kind) {
      case FeedKind.mutual:
        final j = await _api.post('/api/suggestions/${item.id}/decide', body: {
          'interested': interested,
          if (interested && introPreference != null) 'introPreference': introPreference,
          if (interested && guardianConsent != null) 'guardianConsent': guardianConsent,
        });
        return DecisionResult(
          match: asBool(j['match']) ?? false,
          matchId: asString(j['matchId']),
          creditsLeft: asInt(j['creditsLeft']),
          intro: asString(j['intro']),
          conversationId: asString(j['conversationId']),
          myPreference: interested ? introPreference : null,
        );
      case FeedKind.legacySuggestion:
        final j = await _api.post('/api/suggestions/${item.id}/${interested ? 'like' : 'reject'}');
        return DecisionResult(match: asBool(j['match']) ?? false, message: asString(j['message']));
      case FeedKind.legacyInterest:
        final j = await _api.post('/api/interests/${item.id}/${interested ? 'accept' : 'reject'}');
        return DecisionResult(match: asBool(j['match']) ?? false, message: asString(j['message']));
      case FeedKind.legacySent:
      case FeedKind.unknown:
        throw StateError('This card has no answer');
    }
  }
}

final suggestionsRepositoryProvider = Provider<SuggestionsRepository>(
  (ref) => SuggestionsRepository(ref.watch(apiClientProvider)),
);

/// The filter tip for an empty «جديدة» (no one fits). A failed read is no tip: the page shows without it.
final filterTipProvider = FutureProvider.autoDispose<String?>((ref) async {
  ref.watch(currentMemberIdProvider);
  try {
    return await ref.watch(suggestionsRepositoryProvider).filterTip();
  } catch (_) {
    return null;
  }
});

/// Runs the top-up once per visit of the suggestions screen (invalidate to run it again).
final suggestionsMetaProvider = FutureProvider<SuggestionsMeta>((ref) {
  ref.watch(currentMemberIdProvider);
  return ref.watch(suggestionsRepositoryProvider).topUp();
});
