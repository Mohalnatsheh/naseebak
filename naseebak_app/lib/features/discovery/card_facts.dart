import '../../shared/person.dart';
import '../../shared/religion.dart';

/// One fact on a suggestion card.
class CardFact {
  const CardFact({required this.key, required this.label, required this.value});
  final String key;
  final String label;
  final String value;
}

/// Up to nine facts (a different religion leads, when [viewerReligion] is known) in a fixed order, the same as the website's `cardFacts`
/// (src/lib/suggestions/card-facts.ts): job, education, religiosity, veil (a woman) or beard (a man), height,
/// marital status, smoking, then «المذهب» (Lebanon, when shown) or the country's tribe word. Empty ones are left out.
/// Values read as the app's person details do.
List<CardFact> cardFacts(
  PersonDetails p, {
  required bool female,
  required String tribeLabel,
  required bool lebanon,
  String? viewerReligion,
}) {
  final facts = <CardFact>[];
  void add(String key, String label, String? value) {
    if (value != null && value.isNotEmpty) facts.add(CardFact(key: key, label: label, value: value));
  }

  String? d(String field, String? v) => v == null || v.isEmpty ? null : OptionLabels.describe(field, v, female: female);

  add('religion', 'الديانة', religionFact(p.religion, viewerReligion, female: female));
  add('job', 'العمل', d('job', p.job));
  add('education', 'التعليم', p.education);
  add('religiosity', 'الالتزام', d('religiosity', p.religiosity));
  if (female) {
    add('veil', 'الحجاب', hijabLabel(p.hijab, p.niqab));
  } else if (p.beard != null) {
    add('beard', 'اللحية', p.beard! ? 'ملتحٍ' : 'غير ملتحٍ');
  }
  add('height', 'الطول', p.height != null ? '${p.height} سم' : null);
  add('maritalStatus', 'الحالة الاجتماعية', d('maritalStatus', p.maritalStatus));
  add('smoking', 'التدخين', d('smokingStatus', p.smokingStatus));
  final sect = p.sect;
  if (lebanon && sect != null && sect.isNotEmpty && sect != sectUndisclosed) {
    add('sect', 'المذهب', d('sect', sect));
  } else {
    add('tribe', tribeLabel, p.tribe);
  }
  return facts;
}
