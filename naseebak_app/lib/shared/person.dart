import '../core/network/json.dart';

/// The profile details the API shows about another member (suggestion candidate / match partner).
/// Never includes photos or contact data: photos stay hidden until a mutual match (separate endpoint).
class PersonDetails {
  const PersonDetails({
    required this.id,
    required this.firstName,
    this.isVerified = false,
    this.isPro = false,
    this.age,
    this.city,
    this.area,
    this.nationality,
    this.education,
    this.fieldOfStudy,
    this.job,
    this.incomeRange,
    this.height,
    this.weight,
    this.skinColor,
    this.maritalStatus,
    this.childrenCount = 0,
    this.religiosity,
    this.sect,
    this.smokingStatus,
    this.aboutMe,
    this.hobbies,
    this.interests,
    this.lifestyle,
    this.beard,
    this.hijab,
    this.niqab,
    this.tribe,
    this.familyOriginArea,
    this.numberOfSiblings,
    this.housingType,
    this.cookingAbility,
    this.drivingLicense,
    this.willingToRelocate,
    this.familyValues,
    this.religion,
    this.photoPreview,
  });

  factory PersonDetails.fromJson(Map<String, dynamic> j) => PersonDetails(
        id: asStringOr(j['id']),
        firstName: asStringOr(j['firstName']),
        isVerified: asBool(j['isVerified']) ?? false,
        isPro: asBool(j['isPro']) ?? false,
        age: asInt(j['age']),
        city: asString(j['city']),
        area: asString(j['area']),
        nationality: asString(j['nationality']),
        education: asString(j['education']),
        fieldOfStudy: asString(j['fieldOfStudy']),
        job: asString(j['job']),
        incomeRange: asString(j['incomeRange']),
        height: asInt(j['height']),
        weight: asInt(j['weight']),
        skinColor: asString(j['skinColor']),
        maritalStatus: asString(j['maritalStatus']),
        childrenCount: asInt(j['childrenCount']) ?? 0,
        religiosity: asString(j['religiosity']),
        sect: asString(j['sect']),
        smokingStatus: asString(j['smokingStatus']),
        aboutMe: asString(j['aboutMe']),
        hobbies: asString(j['hobbies']),
        interests: asString(j['interests']),
        lifestyle: asString(j['lifestyle']),
        beard: asBool(j['beard']),
        hijab: asBool(j['hijab']),
        niqab: asBool(j['niqab']),
        tribe: asString(j['tribe']),
        familyOriginArea: asString(j['familyOriginArea']),
        numberOfSiblings: asInt(j['numberOfSiblings']),
        housingType: asString(j['housingType']),
        cookingAbility: asString(j['cookingAbility']),
        drivingLicense: asBool(j['drivingLicense']),
        willingToRelocate: asString(j['willingToRelocate']),
        familyValues: asString(j['familyValues']),
        religion: asString(j['religion']),
        photoPreview: asString(j['photoPreview']),
      );

  final String id;
  final String firstName;
  final bool isVerified;

  /// A Pro member (badge only; `partner.isPro` of matches and chats)
  final bool isPro;
  final int? age;
  final String? city;
  final String? area;
  final String? nationality;
  final String? education;
  final String? fieldOfStudy;
  final String? job;
  final String? incomeRange;
  final int? height;
  final int? weight;
  final String? skinColor;
  final String? maritalStatus;
  final int childrenCount;
  final String? religiosity;

  /// «المذهب» (Lebanon only); null when not answered or «أفضّل عدم الذكر» (the server never sends that one)
  final String? sect;
  final String? smokingStatus;
  final String? aboutMe;
  final String? hobbies;
  final String? interests;
  final String? lifestyle;
  final bool? beard;
  final bool? hijab;

  /// Women only, null = not answered (older rows, app 1.0.0). True implies [hijab].
  final bool? niqab;
  final String? tribe;
  final String? familyOriginArea;
  final int? numberOfSiblings;
  final String? housingType;
  final String? cookingAbility;
  final bool? drivingLicense;
  final String? willingToRelocate;
  final String? familyValues;

  /// «الديانة» (null: switch off or an older server)
  final String? religion;

  /// Before a match only: a tiny, already strongly blurred copy of their main photo as a
  /// `data:image/webp;base64,…` URI (≤ 1 KB, spec 2026-11-14), shown under a blur in the locked avatar. Null when
  /// they have none, the setting is off, or an older server. Never a photo URL.
  final String? photoPreview;
}

/// The «المذهب» answer never shown to other members (the server already sends null for it) and never a partner
/// preference. The sect values come from the country's `options` (`sect`, `prefSect`): Lebanon only.
const sectUndisclosed = 'أفضّل عدم الذكر';

/// Her answer to «الحجاب»: «منتقبة» when niqab, else «محجبة» / «غير محجبة»; null when not answered.
String? hijabLabel(bool? hijab, bool? niqab) {
  if (niqab == true) return 'منتقبة';
  if (hijab == null) return null;
  return hijab ? 'محجبة' : 'غير محجبة';
}

/// Stored option values described in the third person for a man / a woman (mirrors the web's
/// `describeOption()` in src/lib/profile-options.ts; stored values never change).
class OptionLabels {
  OptionLabels._();

  static const _femaleSelf = <String, Map<String, String>>{
    'job': {
      'مهندس': 'مهندسة', 'طبيب': 'طبيبة', 'صيدلي': 'صيدلانية', 'محامي': 'محامية',
      'معلم/أستاذ': 'معلمة/أستاذة', 'محاسب': 'محاسبة', 'ممرض': 'ممرضة',
      'ضابط/عسكري': 'ضابطة/عسكرية', 'موظف حكومي': 'موظفة حكومية', 'موظف قطاع خاص': 'موظفة قطاع خاص',
      'رجل أعمال': 'سيدة أعمال', 'تاجر': 'تاجرة', 'مبرمج/مطور': 'مبرمجة/مطورة', 'مصمم': 'مصممة',
      'صحفي/إعلامي': 'صحفية/إعلامية', 'مقاول': 'مقاولة', 'سائق': 'سائقة', 'حرفي/فني': 'حرفية/فنية',
      'طالب/طالبة': 'طالبة', 'متقاعد': 'متقاعدة', 'لا يعمل حالياً': 'لا تعمل حالياً',
    },
    'maritalStatus': {'أعزب/عزباء': 'عزباء', 'مطلق/مطلقة': 'مطلقة', 'أرمل/أرملة': 'أرملة'},
    'religiosity': {'ملتزم جداً': 'ملتزمة جداً', 'ملتزم': 'ملتزمة', 'متوسط': 'متوسطة', 'غير ملتزم': 'غير ملتزمة'},
    'sect': {'سني': 'سنية', 'شيعي': 'شيعية'},
    'religion': {'مسلم': 'مسلمة', 'مسيحي': 'مسيحية'},
    'lifestyle': {'نشيط': 'نشيطة', 'هادئ': 'هادئة', 'متوازن': 'متوازنة', 'اجتماعي': 'اجتماعية'},
    'smokingStatus': {'لا أدخن': 'غير مدخنة', 'أدخن': 'مدخنة', 'أدخن أحياناً': 'تدخن أحياناً', 'تركت التدخين': 'تركت التدخين'},
    'cookingAbility': {'لا أطبخ': 'لا تطبخ', 'أطبخ قليلاً': 'تطبخ قليلاً', 'أطبخ جيداً': 'تطبخ جيداً', 'أطبخ ممتازاً': 'تطبخ بإتقان'},
  };

  static const _maleSelf = <String, Map<String, String>>{
    'job': {'طالب/طالبة': 'طالب'},
    'maritalStatus': {'أعزب/عزباء': 'أعزب', 'مطلق/مطلقة': 'مطلق', 'أرمل/أرملة': 'أرمل'},
    'smokingStatus': {'لا أدخن': 'غير مدخن', 'أدخن': 'مدخن', 'أدخن أحياناً': 'يدخن أحياناً', 'تركت التدخين': 'ترك التدخين'},
    'cookingAbility': {'لا أطبخ': 'لا يطبخ', 'أطبخ قليلاً': 'يطبخ قليلاً', 'أطبخ جيداً': 'يطبخ جيداً', 'أطبخ ممتازاً': 'يطبخ بإتقان'},
  };

  /// How a stored value reads when describing a person of that gender.
  static String describe(String field, String value, {required bool female}) {
    final table = female ? _femaleSelf : _maleSelf;
    return table[field]?[value] ?? value;
  }

  /// How my own stored value reads to me (feminine forms for women; first person kept for smoking/cooking).
  static String self(String field, String value, {required bool female}) {
    if (field == 'smokingStatus' || field == 'cookingAbility') return value;
    return describe(field, value, female: female);
  }
}
