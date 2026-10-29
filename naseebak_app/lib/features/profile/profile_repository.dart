import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/network/api_client.dart';
import '../../core/network/json.dart';

/// `GET /api/profile` → `{ user, completeness }`.
class MyProfile {
  const MyProfile({required this.user, required this.profile, required this.completeness});

  factory MyProfile.fromJson(Map<String, dynamic> j) {
    final user = asMap(j['user']);
    return MyProfile(user: user, profile: asMapOrNull(user['profile']), completeness: _percent(j['completeness']));
  }

  static int _percent(Object? v) {
    if (v is num) return v.round();
    if (v is Map) return asInt(v['percentage'] ?? v['total'] ?? v['score']) ?? 0;
    return 0;
  }

  final Map<String, dynamic> user;
  final Map<String, dynamic>? profile;
  final int completeness;

  String get firstName => asStringOr(user['firstName']);
  String get lastName => asStringOr(user['lastName']);
  bool get female => user['gender'] == 'FEMALE';
  bool get complete => asBool(profile?['isComplete']) ?? false;
  bool get hasGuardian => user['parentInfo'] != null;
  bool get guardianConsented => asMapOrNull(user['parentInfo'])?['shareConsentAt'] != null;

  Object? field(String key) => profile?[key];
}

class GuardianInfo {
  const GuardianInfo({required this.name, required this.phone, required this.relationship, required this.address, this.consented = false});
  final String name;
  final String phone;
  final String relationship;
  final String address;
  final bool consented;
}

class ProfileRepository {
  ProfileRepository(this._api);
  final ApiClient _api;

  Future<MyProfile> load() async => MyProfile.fromJson(await _api.get('/api/profile'));

  /// `PUT /api/profile` (setup save; after setup only empty fields may be filled — 409
  /// `PROFILE_EDIT_NEEDS_REVIEW` otherwise).
  Future<void> save(Map<String, dynamic> payload) async {
    await _api.put('/api/profile', body: payload);
  }

  /// `POST /api/profile/update-request` — changes to stored values wait for an admin review
  /// (partner preferences are applied at once by the server).
  Future<String?> requestUpdate(Map<String, dynamic> changes, {String? message}) async {
    final j = await _api.post('/api/profile/update-request', body: {'changes': changes, 'message': ?message});
    return asString(j['message']);
  }

  Future<GuardianInfo?> guardian() async {
    final j = await _api.get('/api/profile/parent-info');
    final p = asMapOrNull(j['parentInfo']);
    if (p == null) return null;
    return GuardianInfo(
      name: asStringOr(p['parentName']),
      phone: asStringOr(p['parentPhone']),
      relationship: asStringOr(p['relationship']),
      address: asStringOr(p['address']),
      consented: p['shareConsentAt'] != null,
    );
  }

  /// `shareConsent`: true = agree to share with the other family after an accepted family introduction;
  /// null = keep the current choice.
  Future<void> saveGuardian({
    required String name,
    required String phone,
    required String relationship,
    required String address,
    bool? shareConsent,
  }) async {
    await _api.put('/api/profile/parent-info', body: {
      'parentName': name.trim(),
      'parentPhone': phone,
      'relationship': relationship,
      'address': address.trim(),
      'shareConsent': ?shareConsent,
    });
  }
}

final profileRepositoryProvider = Provider<ProfileRepository>((ref) => ProfileRepository(ref.watch(apiClientProvider)));

final myProfileProvider = FutureProvider.autoDispose<MyProfile>((ref) => ref.watch(profileRepositoryProvider).load());
