import '../core/network/json.dart';

/// The profile details the API shows about another member (suggestion candidate / match partner).
/// Never includes photos or contact data: photos stay hidden until a mutual match (separate endpoint).
class PersonDetails {
  const PersonDetails({
    required this.id,
    required this.firstName,
    this.isVerified = false,
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
    this.smokingStatus,
    this.aboutMe,
    this.hobbies,
    this.interests,
    this.lifestyle,
    this.beard,
    this.hijab,
    this.tribe,
    this.familyOriginArea,
    this.numberOfSiblings,
    this.housingType,
    this.cookingAbility,
    this.drivingLicense,
    this.willingToRelocate,
    this.familyValues,
  });

  factory PersonDetails.fromJson(Map<String, dynamic> j) => PersonDetails(
        id: asStringOr(j['id']),
        firstName: asStringOr(j['firstName']),
        isVerified: asBool(j['isVerified']) ?? false,
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
        smokingStatus: asString(j['smokingStatus']),
        aboutMe: asString(j['aboutMe']),
        hobbies: asString(j['hobbies']),
        interests: asString(j['interests']),
        lifestyle: asString(j['lifestyle']),
        beard: asBool(j['beard']),
        hijab: asBool(j['hijab']),
        tribe: asString(j['tribe']),
        familyOriginArea: asString(j['familyOriginArea']),
        numberOfSiblings: asInt(j['numberOfSiblings']),
        housingType: asString(j['housingType']),
        cookingAbility: asString(j['cookingAbility']),
        drivingLicense: asBool(j['drivingLicense']),
        willingToRelocate: asString(j['willingToRelocate']),
        familyValues: asString(j['familyValues']),
      );

  final String id;
  final String firstName;
  final bool isVerified;
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
  final String? smokingStatus;
  final String? aboutMe;
  final String? hobbies;
  final String? interests;
  final String? lifestyle;
  final bool? beard;
  final bool? hijab;
  final String? tribe;
  final String? familyOriginArea;
  final int? numberOfSiblings;
  final String? housingType;
  final String? cookingAbility;
  final bool? drivingLicense;
  final String? willingToRelocate;
  final String? familyValues;
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
