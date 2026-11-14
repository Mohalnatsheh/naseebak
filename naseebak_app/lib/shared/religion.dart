import 'person.dart';

/// «الديانة» helpers (mirrors the web's `src/lib/profile-religion.ts`). Stored values never change.
const religionMuslim = 'مسلم';
const religionChristian = 'مسيحي';
const prefReligionSame = 'نفس ديانتي';
const prefReligionAny = 'لا مانع';

/// Answers never asked of, sent for or shown for a Christian.
const muslimOnlyFields = {'hijab', 'niqab', 'beard', 'sect', 'prefSect', 'prefHijab', 'prefBeard'};

/// «شروط أساسية» keys that only make sense for a Muslim.
const muslimOnlyDealbreakers = {'hijab', 'beard', 'sect'};

const prefReligionAnyHint = 'ستظهر لك اقتراحات من الديانة الأخرى ممن اختاروا ذلك أيضاً';
const dealbreakersStillApplyHint = 'شروطك الأساسية مثل الحجاب تبقى سارية';

/// «مسيحي» only for exactly that value; null and anything else read «مسلم».
String religionOf(Object? stored) => stored == religionChristian ? religionChristian : religionMuslim;

bool isChristian(Object? stored) => religionOf(stored) == religionChristian;

/// For a Christian: a copy without the Muslim-only fields and Muslim-only «شروط أساسية». Else [data] as is.
Map<String, Object?> withoutMuslimOnly(Object? religion, Map<String, Object?> data) {
  if (!isChristian(religion)) return data;
  final out = <String, Object?>{
    for (final e in data.entries)
      if (!muslimOnlyFields.contains(e.key)) e.key: e.value,
  };
  final db = out['dealbreakers'];
  if (db is List) {
    out['dealbreakers'] = [for (final k in db) if (!muslimOnlyDealbreakers.contains(k)) k];
  }
  return out;
}

/// The hints under the partner-religion choice.
List<String> prefReligionHints(Object? religion, String? prefReligion, Iterable<String> activeDealbreakers) {
  if (prefReligion != prefReligionAny) return const [];
  return [
    prefReligionAnyHint,
    if (!isChristian(religion) && activeDealbreakers.any((k) => k == 'hijab' || k == 'beard'))
      dealbreakersStillApplyHint,
  ];
}

/// The religion line on a card: only when the switch is on ([candidate] non-null), the viewer's own religion is
/// known and the two differ.
String? religionFact(String? candidate, String? viewer, {required bool female}) {
  if (candidate == null || viewer == null) return null;
  if (religionOf(candidate) == religionOf(viewer)) return null;
  return OptionLabels.describe('religion', religionOf(candidate), female: female);
}
