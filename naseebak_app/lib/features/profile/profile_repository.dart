import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/json.dart';
import '../onboarding/profile_options.dart';

/// `GET /api/profile` → `{ user, completeness }`.
class MyProfile {
  const MyProfile({required this.user, required this.profile, required this.completeness, this.sections = const []});

  factory MyProfile.fromJson(Map<String, dynamic> j) {
    final user = asMap(j['user']);
    final c = asMapOrNull(j['completeness']);
    return MyProfile(
      user: user,
      profile: asMapOrNull(user['profile']),
      completeness: _percent(j['completeness']),
      sections: c == null ? const [] : asMapList(c['sections']).map(StrengthSection.fromJson).toList(),
    );
  }

  static int _percent(Object? v) {
    if (v is num) return v.round();
    if (v is Map) return asInt(v['percentage'] ?? v['total'] ?? v['score']) ?? 0;
    return 0;
  }

  final Map<String, dynamic> user;
  final Map<String, dynamic>? profile;
  final int completeness;

  /// The website's profile-strength sections (basic, preferences, quiz, photos, family)
  final List<StrengthSection> sections;

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

/// One of my photos (`GET /api/profile/photos`).
class MyPhoto {
  const MyPhoto({required this.id, required this.url, required this.isPrimary});

  factory MyPhoto.fromJson(Map<String, dynamic> j) =>
      MyPhoto(id: asStringOr(j['id']), url: asStringOr(j['url']), isPrimary: asBool(j['isPrimary']) ?? false);

  final String id;
  final String url;
  final bool isPrimary;
}

/// The private partner preferences and «شروطي الأساسية» (`GET /api/profile/dealbreakers`).
class PartnerPrefs {
  const PartnerPrefs({
    this.ageMin,
    this.ageMax,
    this.cities = const [],
    this.education = const [],
    this.maritalStatus = const [],
    this.religiosity = const [],
    this.smoking = const [],
    this.hijab,
    this.beard,
    this.children,
    this.dealbreakers = const {},
  });

  factory PartnerPrefs.fromJson(Map<String, dynamic> p) => PartnerPrefs(
        ageMin: asInt(p['prefAgeMin']),
        ageMax: asInt(p['prefAgeMax']),
        cities: asStringList(p['prefCity']),
        education: asStringList(p['prefEducation']),
        maritalStatus: asStringList(p['prefMaritalStatus']),
        religiosity: asStringList(p['prefReligiosity']),
        smoking: asStringList(p['prefSmokingStatus']),
        hijab: p['prefHijab'] == ProfileOptions.niqab ? ProfileOptions.niqab : _yesNo(p['prefHijab']),
        beard: _yesNo(p['prefBeard']),
        children: _children(p['prefChildrenAcceptance']),
        dealbreakers: asStringList(p['dealbreakers']).toSet(),
      );

  /// Older rows store yes / no in English (score.ts `prefYesNo`)
  static String? _yesNo(Object? v) => switch (v) {
        'yes' || 'نعم' => 'نعم',
        'no' || 'لا' => 'لا',
        'لا يهم' => 'لا يهم',
        _ => null,
      };

  static String? _children(Object? v) => v == 'no_children' ? 'لا' : _yesNo(v);

  final int? ageMin;
  final int? ageMax;
  final List<String> cities;
  final List<String> education;
  final List<String> maritalStatus;
  final List<String> religiosity;
  final List<String> smoking;
  final String? hijab;
  final String? beard;
  final String? children;
  final Set<String> dealbreakers;

  /// Whether the preference behind a «شرط أساسي» key is filled in, so it can work as a filter (the website's
  /// `dealbreakerSummary` ≠ null). [female] is the member: her lock is on the man's beard, his on the woman's hijab.
  bool dealbreakerFilled(String key, {required bool female}) => switch (key) {
        'age' => ageMin != null || ageMax != null,
        'city' => cities.isNotEmpty,
        'education' => education.isNotEmpty,
        'maritalStatus' => maritalStatus.isNotEmpty,
        'religiosity' => religiosity.isNotEmpty,
        'smokingStatus' => smoking.isNotEmpty,
        'hijab' => !female && (hijab == 'نعم' || hijab == 'لا' || hijab == ProfileOptions.niqab),
        'beard' => female && (beard == 'نعم' || beard == 'لا'),
        'children' => children == 'لا',
        _ => false,
      };

  /// The ticked keys whose preference is filled in (the website's `activeDealbreakers`): an emptied preference never
  /// keeps a lock that would filter on nothing
  List<String> activeDealbreakers({required bool female}) =>
      [for (final k in dealbreakers) if (dealbreakerFilled(k, female: female)) k];

  /// The `changes` for `POST /api/profile/update-request` (preferences only, so the server saves them at once)
  Map<String, dynamic> toChanges({required bool female}) => {
        'prefAgeMin': ageMin,
        'prefAgeMax': ageMax,
        'prefCity': cities,
        'prefEducation': education,
        'prefMaritalStatus': maritalStatus,
        'prefReligiosity': religiosity,
        'prefSmokingStatus': smoking,
        if (female) 'prefBeard': beard ?? '' else 'prefHijab': hijab ?? '',
        'prefChildrenAcceptance': children ?? '',
      };
}

/// The personality quiz (`GET /api/profile/personality-quiz`).
class QuizQuestion {
  const QuizQuestion({required this.id, required this.text});
  final String id;
  final String text;
}

class QuizResult {
  const QuizResult({required this.type, required this.vector, required this.canRetake, required this.daysRemaining});

  factory QuizResult.fromJson(Map<String, dynamic> j) => QuizResult(
        type: asStringOr(j['personalityType']),
        vector: (j['vector'] is List ? j['vector'] as List : const []).map((v) => asDouble(v) ?? 0).toList(),
        canRetake: asBool(j['canRetake']) ?? false,
        daysRemaining: asInt(j['daysRemaining']) ?? 0,
      );

  final String type;
  final List<double> vector;
  final bool canRetake;
  final int daysRemaining;
}

class Quiz {
  const Quiz({required this.questions, this.result});
  final List<QuizQuestion> questions;
  final QuizResult? result;
}

class ProfileRepository {
  ProfileRepository(this._api);
  final ApiClient _api;

  Future<List<MyPhoto>> photos() async =>
      asMapList((await _api.get('/api/profile/photos'))['photos']).map(MyPhoto.fromJson).toList();

  /// `photoData` is a `data:image/jpeg;base64,…` URL (≤ 5 MB; at most 5 photos, the first becomes the main one)
  Future<void> uploadPhoto(String photoData) async {
    await _api.post('/api/profile/photos', body: {'photoData': photoData});
  }

  Future<void> setMainPhoto(String id) async {
    await _api.patch('/api/profile/photos/$id');
  }

  Future<void> deletePhoto(String id) async {
    await _api.delete('/api/profile/photos/$id');
  }

  Future<PartnerPrefs> partnerPrefs() async =>
      PartnerPrefs.fromJson(asMap((await _api.get('/api/profile/dealbreakers'))['profile']));

  /// Preferences save directly (no review); «شروطي الأساسية» only when shared suggestions are on.
  Future<void> savePartnerPrefs(PartnerPrefs prefs, {required bool female, required bool withDealbreakers}) async {
    await _api.post('/api/profile/update-request', body: {'changes': prefs.toChanges(female: female)});
    if (withDealbreakers) {
      await _api.put('/api/profile/dealbreakers', body: {'keys': prefs.activeDealbreakers(female: female)});
    }
  }

  Future<Quiz> quiz() async {
    final j = await _api.get('/api/profile/personality-quiz');
    return Quiz(
      questions: asMapList(j['questions'])
          .map((q) => QuizQuestion(id: asStringOr(q['id']), text: asStringOr(q['text'])))
          .toList(),
      result: asMapOrNull(j['result']) == null ? null : QuizResult.fromJson(asMap(j['result'])),
    );
  }

  Future<QuizResult> submitQuiz(Map<String, int> answers) async {
    final j = await _api.post('/api/profile/personality-quiz', body: {'answers': answers});
    return QuizResult.fromJson({...asMap(j['result']), 'canRetake': false, 'daysRemaining': 90});
  }

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

  /// My review request still waiting for the team (`GET /api/profile/update-request`, newest first), or null.
  Future<PendingEdit?> pendingEdit() async {
    final j = await _api.get('/api/profile/update-request');
    final pending = asMapList(j['requests']).where((r) => r['status'] == 'PENDING');
    if (pending.isEmpty) return null;
    final r = pending.first;
    return PendingEdit(
      id: asStringOr(r['id']),
      fields: asMap(r['changes']).keys.toList(),
      createdAt: asDate(r['createdAt']),
    );
  }

  /// «سحب الطلب» (404 = already reviewed or withdrawn: nothing is pending any more either way)
  Future<void> withdrawPendingEdit() async {
    try {
      await _api.post('/api/profile/update-request/withdraw');
    } on ApiException catch (e) {
      if (e.statusCode != 404) rethrow;
    }
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

class PendingEdit {
  const PendingEdit({required this.id, required this.fields, this.createdAt});
  final String id;
  final List<String> fields;
  final DateTime? createdAt;
}

final pendingEditProvider =
    FutureProvider.autoDispose<PendingEdit?>((ref) => ref.watch(profileRepositoryProvider).pendingEdit());

/// One section of `completeness.sections` (src/lib/profile-completeness.ts).
class StrengthSection {
  const StrengthSection({required this.key, required this.label, required this.percentage, this.missing = const []});

  factory StrengthSection.fromJson(Map<String, dynamic> j) => StrengthSection(
        key: asStringOr(j['key']),
        label: asStringOr(j['label']),
        percentage: asInt(j['percentage']) ?? 0,
        missing: asStringList(j['missingFields']),
      );

  final String key;
  final String label;
  final int percentage;
  final List<String> missing;

  /// The app screen that fills this section
  String get route => switch (key) {
        'preferences' => '/profile/preferences',
        'quiz' => '/profile/quiz',
        'photos' => '/profile/photos',
        'family' when missing.length == 1 && missing.first.contains('ولي الأمر') => '/profile/guardian',
        _ => '/profile/edit',
      };
}
