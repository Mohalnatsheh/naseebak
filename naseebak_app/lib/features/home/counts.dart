import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/network/json.dart';

/// The new-cycle switches (`flags` of `/api/me/counts`).
class CycleFlags {
  const CycleFlags({
    this.introRequests = false,
    this.chat = false,
    this.mutualSuggestions = false,
    this.creditOnInterest = false,
    this.freeInterestReply = false,
  });

  factory CycleFlags.fromJson(Map<String, dynamic> j) => CycleFlags(
        introRequests: asBool(j['introRequests']) ?? false,
        chat: asBool(j['chat']) ?? false,
        mutualSuggestions: asBool(j['mutualSuggestions']) ?? false,
        creditOnInterest: asBool(j['creditOnInterest']) ?? false,
        freeInterestReply: asBool(j['freeInterestReply']) ?? false,
      );

  final bool introRequests;
  final bool chat;
  final bool mutualSuggestions;
  final bool creditOnInterest;

  /// Switch free_interest_reply: «مهتم» on a card that already says «أبدى اهتمامه بك» costs nothing, also at 0
  final bool freeInterestReply;
}

/// `GET /api/me/counts`
class Counts {
  const Counts({
    required this.flags,
    this.pendingIntros = 0,
    this.pendingIntroMatchId,
    this.unreadChats = 0,
    this.hasChats = false,
    this.guardianExists,
    this.guardianConsented,
    this.actionableMatches = 0,
    this.credits,
    this.newSuggestions,
    this.likedYou,
    this.isPro = false,
    this.proCancelAtPeriodEnd = false,
    this.interestPaywall = false,
  });

  factory Counts.fromJson(Map<String, dynamic> j) {
    final guardian = asMapOrNull(j['guardian']);
    final pro = asMap(j['pro']);
    return Counts(
      flags: CycleFlags.fromJson(asMap(j['flags'])),
      pendingIntros: asInt(j['pendingIntros']) ?? 0,
      pendingIntroMatchId: asString(j['pendingIntroMatchId']),
      unreadChats: asInt(j['unreadChats']) ?? 0,
      hasChats: asBool(j['hasChats']) ?? false,
      guardianExists: guardian == null ? null : asBool(guardian['exists']),
      guardianConsented: guardian == null ? null : asBool(guardian['consented']),
      actionableMatches: asInt(j['actionableMatches']) ?? 0,
      credits: asInt(j['credits']),
      newSuggestions: asInt(j['newSuggestions']),
      likedYou: asInt(j['likedYou']),
      isPro: asBool(pro['isPro']) ?? false,
      proCancelAtPeriodEnd: asBool(pro['cancelAtPeriodEnd']) ?? false,
      interestPaywall: asBool(j['interestPaywall']) ?? false,
    );
  }

  final CycleFlags flags;
  final int pendingIntros;
  final String? pendingIntroMatchId;
  final int unreadChats;
  final bool hasChats;
  final bool? guardianExists;
  final bool? guardianConsented;
  final int actionableMatches;

  /// Only with credit on interest
  final int? credits;

  /// Only with shared suggestions
  final int? newSuggestions;
  final int? likedYou;

  /// Pro membership of the signed-in member (`pro` of the response)
  final bool isPro;
  final bool proCancelAtPeriodEnd;

  /// Switch interest_paywall, for a member who can buy: at 0 credits «مهتم» opens the «انتهى رصيدك» step
  /// instead of being greyed. Missing (older server) = false
  final bool interestPaywall;
}

/// The signed-in member's id: providers that cache member data watch it, so signing in as someone else
/// (or signing out) never shows the previous member's numbers.
final currentMemberIdProvider = Provider<String?>(
  (ref) => ref.watch(authControllerProvider.select((s) => s.me?.id)),
);

final countsProvider = FutureProvider<Counts>((ref) async {
  ref.watch(currentMemberIdProvider);
  final j = await ref.watch(apiClientProvider).get('/api/me/counts');
  return Counts.fromJson(j);
});

final unreadNotificationsProvider = FutureProvider<int>((ref) async {
  ref.watch(currentMemberIdProvider);
  final j = await ref.watch(apiClientProvider).get('/api/notifications/unread-count');
  return asInt(j['count']) ?? 0;
});
