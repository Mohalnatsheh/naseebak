import '../../core/network/json.dart';
import '../country_selection/country.dart';

/// `GET /api/mobile/me` → `user`.
class Me {
  const Me({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.gender,
    required this.phone,
    required this.country,
    required this.credits,
    required this.status,
    required this.deactivated,
    required this.profileExists,
    required this.profileComplete,
    this.appPayments = true,
    this.deletionScheduledFor,
  });

  factory Me.fromJson(Map<String, dynamic> j) {
    final profile = asMap(j['profile']);
    return Me(
      id: asStringOr(j['id']),
      firstName: asStringOr(j['firstName']),
      lastName: asStringOr(j['lastName']),
      gender: asStringOr(j['gender'], 'MALE'),
      phone: asStringOr(j['phone']),
      country: Country.fromJson(asMap(j['country'])),
      credits: asInt(j['credits']) ?? 0,
      status: asStringOr(j['status']),
      deactivated: asBool(j['deactivated']) ?? false,
      profileExists: asBool(profile['exists']) ?? false,
      profileComplete: asBool(profile['complete']) ?? false,
      appPayments: asBool(j['appPayments']) ?? true,
      deletionScheduledFor: asDate(asMap(j['deletion'])['scheduledFor']),
    );
  }

  final String id;
  final String firstName;
  final String lastName;

  /// "MALE" | "FEMALE"
  final String gender;
  final String phone;
  final Country country;
  final int credits;
  final String status;
  final bool deactivated;
  final bool profileExists;
  final bool profileComplete;

  /// Buying credits shown in the app (Admin → Settings → Mobile app; always off for test accounts)
  final bool appPayments;

  /// A pending deletion request: the account is paused until then and deleted for good on this date
  final DateTime? deletionScheduledFor;

  bool get isFemale => gender == 'FEMALE';

  Me copyWith({int? credits}) => Me(
        id: id,
        firstName: firstName,
        lastName: lastName,
        gender: gender,
        phone: phone,
        country: country,
        credits: credits ?? this.credits,
        status: status,
        deactivated: deactivated,
        profileExists: profileExists,
        profileComplete: profileComplete,
        appPayments: appPayments,
        deletionScheduledFor: deletionScheduledFor,
      );
}
