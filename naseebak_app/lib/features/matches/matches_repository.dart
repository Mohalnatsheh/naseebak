import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/network/api_client.dart';
import '../../core/network/json.dart';
import 'match_models.dart';

class MatchesRepository {
  MatchesRepository(this._api);
  final ApiClient _api;

  Future<({List<MatchSummary> items, PageInfo page})> list({int page = 1, String? focus}) async {
    final j = await _api.get('/api/matches', query: {'page': page, 'focus': ?focus});
    return (items: asMapList(j['matches']).map(MatchSummary.fromJson).toList(), page: PageInfo.fromJson(j));
  }

  /// There is no `GET /api/matches/{id}`: `?focus=` returns the page holding that match.
  Future<MatchSummary?> find(String id) async {
    final res = await list(focus: id);
    for (final m in res.items) {
      if (m.id == id) return m;
    }
    return null;
  }

  Future<IntroState> intro(String matchId) async => IntroState.fromJson(await _api.get('/api/matches/$matchId/intro'));

  /// FAMILY needs `consent: true` (guardian share); CHAT none.
  Future<void> sendIntro(String matchId, String type, {bool consent = false}) async {
    await _api.post('/api/matches/$matchId/intro', body: {'type': type, if (consent) 'consent': true});
  }

  Future<void> respond(String requestId, {required bool accept, bool? consent}) async {
    await _api.post('/api/intro-requests/$requestId/respond', body: {'accept': accept, 'consent': ?consent});
  }

  Future<void> cancelRequest(String requestId) async {
    await _api.post('/api/intro-requests/$requestId/cancel');
  }

  Future<IntroState> shareGuardian(String matchId) async =>
      IntroState.fromJson(await _api.post('/api/matches/$matchId/guardian-share', body: {'consent': true}));

  Future<IntroState> outcome(String matchId, String outcome) async =>
      IntroState.fromJson(await _api.post('/api/matches/$matchId/outcome', body: {'outcome': outcome}));

  Future<List<String>> photos(String matchId) async {
    final j = await _api.get('/api/matches/$matchId/photos');
    return asMapList(j['photos']).map((p) => asStringOr(p['url'])).where((u) => u.isNotEmpty).toList();
  }

  Future<void> block(String userId) async {
    await _api.post('/api/blocks', body: {'blockedId': userId});
  }

  Future<void> report(String userId, String reason, {String? details}) async {
    await _api.post('/api/reports', body: {
      'reportedId': userId,
      'reason': reason,
      if (details != null && details.trim().isNotEmpty) 'details': details.trim(),
    });
  }
}

final matchesRepositoryProvider = Provider<MatchesRepository>((ref) => MatchesRepository(ref.watch(apiClientProvider)));
