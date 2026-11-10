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
    this.nextStep,
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
        nextStep: asString(j['nextStep']),
        partner: PersonDetails.fromJson(asMap(j['partner'])),
      );

  /// The viewer's next step from the server (`reply_family`, `reply_chat`, `waiting_family`, `waiting_chat`,
  /// `chat_open`, `family_accepted`, `choose`); null when closed, nothing waits, or an older server
  final String? nextStep;

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

/// A guardian's number as the website shows it (`formatGuardianPhone` in src/components/intro/intro-utils.ts):
/// "+962 79 123 4567". A local "07…" number takes [dialCode] (the member's country).
String formatGuardianPhone(String raw, {String dialCode = '962'}) {
  final digits = raw.replaceAll(RegExp(r'\D'), '');
  String? known;
  for (final d in const ['962', '966']) {
    if (digits.startsWith(d) && digits.length > 10) known = d;
  }
  final dial = known ?? dialCode;
  final intl = known != null ? digits : digits.startsWith('0') ? '$dial${digits.substring(1)}' : digits;
  final local = intl.startsWith(dial) ? intl.substring(dial.length) : intl;
  return local.length == 9
      ? '+$dial ${local.substring(0, 2)} ${local.substring(2, 5)} ${local.substring(5)}'
      : '+$intl';
}

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
