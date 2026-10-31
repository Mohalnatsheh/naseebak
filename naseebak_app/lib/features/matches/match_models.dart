import '../../core/network/json.dart';
import '../../shared/person.dart';
import '../home/counts.dart';

/// One item of `GET /api/matches`.
class MatchSummary {
  const MatchSummary({
    required this.id,
    required this.partner,
    this.closed,
    this.blockId,
    this.photosRevealed = false,
    this.createdAt,
    this.visitStatus,
    this.scheduledDate,
    this.compatibilityScore = 0,
  });

  factory MatchSummary.fromJson(Map<String, dynamic> j) => MatchSummary(
        id: asStringOr(j['id']),
        closed: asString(j['closed']),
        blockId: asString(j['blockId']),
        photosRevealed: asBool(j['photosRevealed']) ?? false,
        createdAt: asDate(j['createdAt']),
        visitStatus: asString(j['visitStatus']),
        scheduledDate: asDate(j['scheduledDate']),
        compatibilityScore: asDouble(j['compatibilityScore']) ?? 0,
        partner: PersonDetails.fromJson(asMap(j['partner'])),
      );

  final String id;

  /// `blocked` | `inactive` | `finished` | `ended` | `engaged` | null
  final String? closed;
  final String? blockId;
  final bool photosRevealed;
  final DateTime? createdAt;

  /// Legacy admin-arranged visit: REQUESTED | FAMILIES_CONTACTED | SCHEDULED | COMPLETED | CANCELLED
  final String? visitStatus;
  final DateTime? scheduledDate;
  final double compatibilityScore;
  final PersonDetails partner;

  String? get closedLabel => switch (closed) {
        'blocked' => 'محظور',
        'inactive' => 'الحساب غير نشط',
        'finished' => 'انتهى',
        'ended' => 'لم يحصل نصيب',
        'engaged' => 'تمت الخطبة',
        _ => null,
      };
}

String visitStatusLabel(String status) => switch (status) {
      'REQUESTED' => 'طلب زيارة قيد المراجعة',
      'FAMILIES_CONTACTED' => 'تم التواصل مع العائلتين',
      'SCHEDULED' => 'تم تحديد موعد الزيارة',
      'COMPLETED' => 'تمت الزيارة',
      'CANCELLED' => 'أُلغيت الزيارة',
      _ => status,
    };

class GuardianContact {
  const GuardianContact({required this.name, required this.relationship, required this.phone});
  factory GuardianContact.fromJson(Map<String, dynamic> j) => GuardianContact(
        name: asStringOr(j['name']),
        relationship: asStringOr(j['relationship']),
        phone: asStringOr(j['phone']),
      );
  final String name;
  final String relationship;
  final String phone;

  String get relationshipLabel => switch (relationship) {
        'father' => 'الأب',
        'mother' => 'الأم',
        'brother' => 'الأخ',
        'guardian' => 'وليّ الأمر',
        _ => relationship,
      };
}

/// `GET /api/matches/{id}/intro` (IntroState in src/lib/intro/requests.ts).
class IntroState {
  const IntroState({
    required this.flags,
    required this.familyStatus,
    required this.chatStatus,
    this.outcome,
    this.closed,
    this.credits = 0,
    this.familyRequestId,
    this.familyExpiresAt,
    this.familyDeclinedByMe = false,
    this.familyFree = false,
    this.familyOpenUntil,
    this.contacts,
    this.chatRequestId,
    this.chatExpiresAt,
    this.chatDeclinedByMe = false,
    this.conversationId,
    this.chatPaused = false,
    this.followUpMine,
    this.followUpPartner,
    this.followUpAsk = false,
    this.guardianExists = false,
    this.guardianConsented = false,
    this.guardianShared = false,
    this.askShare = false,
  });

  factory IntroState.fromJson(Map<String, dynamic> j) {
    final family = asMap(j['family']);
    final chat = asMap(j['chat']);
    final follow = asMap(j['followUp']);
    final guardian = asMap(j['myGuardian']);
    final contacts = asMapOrNull(family['contacts']);
    return IntroState(
      flags: CycleFlags.fromJson(asMap(j['flags'])),
      outcome: asString(j['outcome']),
      closed: asString(j['closed']),
      credits: asInt(j['credits']) ?? 0,
      familyStatus: asStringOr(family['status'], 'none'),
      familyRequestId: asString(family['requestId']),
      familyExpiresAt: asDate(family['expiresAt']),
      familyDeclinedByMe: asBool(family['declinedByMe']) ?? false,
      familyFree: asBool(family['free']) ?? false,
      familyOpenUntil: asDate(family['openUntil']),
      contacts: contacts == null ? null : GuardianContact.fromJson(contacts),
      chatStatus: asStringOr(chat['status'], 'none'),
      chatRequestId: asString(chat['requestId']),
      chatExpiresAt: asDate(chat['expiresAt']),
      chatDeclinedByMe: asBool(chat['declinedByMe']) ?? false,
      conversationId: asString(chat['conversationId']),
      chatPaused: asBool(chat['paused']) ?? false,
      followUpMine: asString(follow['mine']),
      followUpPartner: asString(follow['partner']),
      followUpAsk: asBool(follow['ask']) ?? false,
      guardianExists: asBool(guardian['exists']) ?? false,
      guardianConsented: asBool(guardian['consented']) ?? false,
      guardianShared: asBool(guardian['sharedForMatch']) ?? false,
      askShare: asBool(guardian['askShare']) ?? false,
    );
  }

  final CycleFlags flags;
  final String? outcome;
  final String? closed;
  final int credits;

  /// none | pending_sent | pending_received | accepted | declined | legacy_admin | closed
  final String familyStatus;
  final String? familyRequestId;
  final DateTime? familyExpiresAt;

  /// `declined`: I turned the request down (else the other side did)
  final bool familyDeclinedByMe;
  final bool familyFree;

  /// After a chat ran out: the (free) move to a family introduction stays open until this date
  final DateTime? familyOpenUntil;
  final GuardianContact? contacts;

  /// none | pending_sent | pending_received | declined | open | ended | expired | disabled
  final String chatStatus;
  final String? chatRequestId;
  final DateTime? chatExpiresAt;
  final bool chatDeclinedByMe;
  final String? conversationId;
  final bool chatPaused;

  /// CONTINUING | NOT_A_MATCH | ENGAGED
  final String? followUpMine;
  final String? followUpPartner;
  final bool followUpAsk;
  final bool guardianExists;
  final bool guardianConsented;
  final bool guardianShared;
  final bool askShare;
}
