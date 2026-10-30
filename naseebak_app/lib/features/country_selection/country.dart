import '../../core/network/json.dart';

/// One served country, as `GET /api/countries` returns it.
class Country {
  const Country({
    required this.code,
    required this.nameAr,
    required this.nameEn,
    required this.inName,
    required this.flagEmoji,
    required this.dialCode,
    required this.phonePlaceholder,
    required this.phoneExample,
    required this.nationalPattern,
    required this.currencyCode,
    required this.currencySymbol,
    required this.isDefault,
    required this.registrationOpen,
    required this.purchasesEnabled,
    required this.chatEnabled,
    required this.pollsEnabled,
    required this.phoneWord,
    required this.tribeWord,
    required this.nationalityMale,
    required this.nationalityFemale,
  });

  factory Country.fromJson(Map<String, dynamic> j) {
    final name = asMap(j['name']);
    final flag = asMap(j['flag']);
    final phone = asMap(j['phone']);
    final currency = asMap(j['currency']);
    final features = asMap(j['features']);
    final words = asMap(j['words']);
    final code = asStringOr(j['code']).toUpperCase();
    return Country(
      code: code,
      nameAr: asStringOr(name['ar'], code),
      nameEn: asStringOr(name['en'], code),
      inName: asStringOr(j['inName']),
      flagEmoji: asStringOr(flag['emoji']),
      dialCode: asStringOr(j['dialCode']),
      phonePlaceholder: asStringOr(phone['placeholder']),
      phoneExample: asStringOr(phone['example']),
      nationalPattern: asStringOr(phone['nationalPattern'], r'^\d{8,10}$'),
      currencyCode: asStringOr(currency['code']),
      currencySymbol: asStringOr(currency['symbol']),
      isDefault: asBool(j['isDefault']) ?? false,
      registrationOpen: asBool(j['registrationOpen']) ?? true,
      purchasesEnabled: asBool(j['purchasesEnabled']) ?? false,
      chatEnabled: asBool(features['chat']) ?? true,
      pollsEnabled: asBool(features['polls']) ?? true,
      phoneWord: asStringOr(words['phone'], 'هاتف'),
      tribeWord: asStringOr(words['tribe'], 'العائلة'),
      nationalityMale: asStringOr(words['nationalityMale']),
      nationalityFemale: asStringOr(words['nationalityFemale']),
    );
  }

  final String code;
  final String nameAr;
  final String nameEn;
  final String inName;
  final String flagEmoji;

  /// e.g. "+962"
  final String dialCode;
  final String phonePlaceholder;
  final String phoneExample;

  /// Validates the national number (after the dial code, without the leading 0).
  final String nationalPattern;
  final String currencyCode;
  final String currencySymbol;
  final bool isDefault;
  final bool registrationOpen;
  final bool purchasesEnabled;
  final bool chatEnabled;
  final bool pollsEnabled;
  final String phoneWord;
  final String tribeWord;
  final String nationalityMale;
  final String nationalityFemale;

  /// Dial code digits without "+", e.g. "962".
  String get dialDigits => dialCode.replaceAll(RegExp(r'[^0-9]'), '');
}

/// `GET /api/countries/{code}`: the country plus its links and support contacts.
class CountryDetails {
  const CountryDetails({required this.country, required this.links, this.supportEmail, this.lists = CountryLists.empty});

  factory CountryDetails.fromJson(Map<String, dynamic> j) {
    final c = asMap(j['country']);
    final links = asMap(c['links']);
    final support = asMap(c['support']);
    return CountryDetails(
      country: Country.fromJson(c),
      links: CountryLinks(
        home: asString(links['home']),
        terms: asString(links['terms']),
        privacy: asString(links['privacy']),
        refundPolicy: asString(links['refundPolicy']),
        faq: asString(links['faq']),
        contact: asString(links['contact']),
      ),
      supportEmail: asString(support['email']),
      lists: CountryLists.fromJson(asMap(c['lists']), asMap(c['options'])),
    );
  }

  final Country country;
  final CountryLinks links;
  final String? supportEmail;

  /// Cities, districts and nationalities of the country (the profile wizard's options)
  final CountryLists lists;
}

/// `lists` of `GET /api/countries/{code}`: the stored values the profile fields accept for that country.
class CountryLists {
  const CountryLists({
    this.cities = const [],
    this.areas = const {},
    this.nationalitiesMale = const [],
    this.nationalitiesFemale = const [],
    this.incomeRanges = const [],
    this.expenseRanges = const [],
    this.tribeLabel = 'العشيرة',
    this.options = const {},
  });

  static const empty = CountryLists();

  factory CountryLists.fromJson(Map<String, dynamic> j, [Map<String, dynamic> options = const {}]) {
    final areas = asMap(j['areas']);
    final nat = asMap(j['nationalities']);
    return CountryLists(
      cities: asStringList(j['cities']),
      areas: {for (final e in areas.entries) e.key: asStringList(e.value)},
      nationalitiesMale: asStringList(nat['male']),
      nationalitiesFemale: asStringList(nat['female']),
      incomeRanges: asStringList(j['incomeRanges']),
      expenseRanges: asStringList(j['expenseRanges']),
      tribeLabel: asString(j['tribeLabel']) ?? 'العشيرة',
      options: {for (final e in options.entries) e.key: asStringList(e.value)},
    );
  }

  final List<String> cities;
  final Map<String, List<String>> areas;
  final List<String> nationalitiesMale;
  final List<String> nationalitiesFemale;
  final List<String> incomeRanges;
  final List<String> expenseRanges;
  final String tribeLabel;

  /// `options` of the same answer: fixed values of the profile forms (job, skinColor, housingType…)
  final Map<String, List<String>> options;

  List<String> option(String key) => options[key] ?? const [];

  bool get isEmpty => cities.isEmpty;

  /// Nationalities in the member's own gender («أردنية» for women), the member's country first.
  List<String> nationalities({required bool female}) => female ? nationalitiesFemale : nationalitiesMale;
}

class CountryLinks {
  const CountryLinks({this.home, this.terms, this.privacy, this.refundPolicy, this.faq, this.contact});
  final String? home;
  final String? terms;
  final String? privacy;
  final String? refundPolicy;
  final String? faq;
  final String? contact;
}

/// The list answer of `GET /api/countries`.
class CountryList {
  const CountryList({required this.countries, required this.defaultCode});
  final List<Country> countries;
  final String defaultCode;

  Country? byCode(String? code) {
    if (code == null) return null;
    for (final c in countries) {
      if (c.code == code.toUpperCase()) return c;
    }
    return null;
  }
}
