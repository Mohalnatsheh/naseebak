import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../person.dart';

/// Key facts (always shown) + the rest behind «عرض التفاصيل».
class PersonDetailsView extends StatefulWidget {
  const PersonDetailsView({
    super.key,
    required this.person,
    required this.female,
    this.initiallyExpanded = false,
    this.tribeLabel = 'العائلة',
  });

  /// «العشيرة» (Jordan) / «القبيلة» (Saudi Arabia)
  final String tribeLabel;

  final PersonDetails person;

  /// Gender of the person described (the viewer's opposite)
  final bool female;
  final bool initiallyExpanded;

  @override
  State<PersonDetailsView> createState() => _PersonDetailsViewState();
}

class _PersonDetailsViewState extends State<PersonDetailsView> {
  late bool _expanded = widget.initiallyExpanded;

  String _d(String field, String? v) => v == null || v.isEmpty ? '' : OptionLabels.describe(field, v, female: widget.female);

  @override
  Widget build(BuildContext context) {
    final p = widget.person;
    final f = widget.female;
    final place = [p.city, p.area].where((e) => e != null && e.isNotEmpty).join('، ');
    final key = <_Fact>[
      if (place.isNotEmpty) _Fact(Icons.place_outlined, 'السكن', place),
      if (p.education != null) _Fact(Icons.school_outlined, 'التعليم', [p.education, p.fieldOfStudy].whereType<String>().where((e) => e.isNotEmpty).join(' · ')),
      if (p.job != null && p.job!.isNotEmpty) _Fact(Icons.work_outline_rounded, 'العمل', _d('job', p.job)),
      if (p.maritalStatus != null)
        _Fact(Icons.favorite_border_rounded, 'الحالة الاجتماعية',
            '${_d('maritalStatus', p.maritalStatus)}${p.childrenCount > 0 ? ' · ${_children(p.childrenCount)}' : ''}'),
      if (p.religiosity != null) _Fact(Icons.mosque_outlined, 'التدين', _d('religiosity', p.religiosity)),
    ];
    final more = <_Fact>[
      if (p.nationality != null) _Fact(Icons.flag_outlined, 'الجنسية', p.nationality!),
      if (p.height != null) _Fact(Icons.height_rounded, 'الطول', '${p.height} سم'),
      if (p.weight != null) _Fact(Icons.monitor_weight_outlined, 'الوزن', '${p.weight} كغ'),
      if (p.skinColor != null) _Fact(Icons.palette_outlined, 'لون البشرة', p.skinColor!),
      if (p.smokingStatus != null) _Fact(Icons.smoke_free_rounded, 'التدخين', _d('smokingStatus', p.smokingStatus)),
      if (f && hijabLabel(p.hijab, p.niqab) != null) _Fact(Icons.checkroom_outlined, 'الحجاب', hijabLabel(p.hijab, p.niqab)!),
      if (!f && p.beard != null) _Fact(Icons.face_outlined, 'اللحية', p.beard! ? 'ملتحٍ' : 'غير ملتحٍ'),
      if (p.incomeRange != null) _Fact(Icons.payments_outlined, 'الدخل الشهري', p.incomeRange!),
      if (p.lifestyle != null) _Fact(Icons.self_improvement_rounded, 'نمط الحياة', _d('lifestyle', p.lifestyle)),
      if (p.housingType != null) _Fact(Icons.home_outlined, 'السكن الحالي', p.housingType!),
      if (p.cookingAbility != null) _Fact(Icons.restaurant_outlined, 'الطبخ', _d('cookingAbility', p.cookingAbility)),
      if (p.drivingLicense != null) _Fact(Icons.directions_car_outlined, 'رخصة القيادة', p.drivingLicense! ? 'نعم' : 'لا'),
      if (p.willingToRelocate != null) _Fact(Icons.flight_takeoff_rounded, 'الانتقال لمدينة أخرى', _relocate(p.willingToRelocate!)),
      if (p.tribe != null && p.tribe!.isNotEmpty) _Fact(Icons.groups_outlined, widget.tribeLabel, p.tribe!),
      if (p.familyOriginArea != null) _Fact(Icons.map_outlined, 'الأصل', p.familyOriginArea!),
      if (p.numberOfSiblings != null) _Fact(Icons.people_outline_rounded, 'عدد الإخوة', '${p.numberOfSiblings}'),
    ];
    final texts = <(String, String)>[
      if (p.aboutMe != null && p.aboutMe!.isNotEmpty) ('نبذة', p.aboutMe!),
      if (p.familyValues != null && p.familyValues!.isNotEmpty) ('قيم الأسرة', p.familyValues!),
      if (p.hobbies != null && p.hobbies!.isNotEmpty) ('الهوايات', p.hobbies!),
      if (p.interests != null && p.interests!.isNotEmpty) ('الاهتمامات', p.interests!),
    ];
    final hasMore = more.isNotEmpty || texts.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ...key.where((e) => e.value.isNotEmpty).map((e) => _FactRow(fact: e)),
        if (_expanded) ...[
          ...more.where((e) => e.value.isNotEmpty).map((e) => _FactRow(fact: e)),
          for (final t in texts) ...[
            const SizedBox(height: 10),
            Text(t.$1, style: const TextStyle(color: AppColors.muted, fontSize: 13, fontWeight: FontWeight.w600)),
            const SizedBox(height: 2),
            Text(t.$2, style: const TextStyle(fontSize: 14.5, height: 1.6)),
          ],
        ],
        if (hasMore)
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              onPressed: () => setState(() => _expanded = !_expanded),
              icon: Icon(_expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded),
              label: Text(_expanded ? 'إخفاء التفاصيل' : 'عرض كل التفاصيل'),
            ),
          ),
      ],
    );
  }

  static String _children(int n) {
    if (n == 1) return 'طفل واحد';
    if (n == 2) return 'طفلان';
    if (n <= 10) return '$n أطفال';
    return '$n طفلاً';
  }

  static String _relocate(String v) => switch (v) {
        'yes' => 'نعم',
        'no' => 'لا',
        'maybe' => 'ربما',
        _ => v,
      };
}

class _Fact {
  const _Fact(this.icon, this.label, this.value);
  final IconData icon;
  final String label;
  final String value;
}

class _FactRow extends StatelessWidget {
  const _FactRow({required this.fact});
  final _Fact fact;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(fact.icon, size: 18, color: AppColors.gold),
          const SizedBox(width: 10),
          SizedBox(
            width: 110,
            child: Text(fact.label, style: const TextStyle(color: AppColors.muted, fontSize: 13.5)),
          ),
          Expanded(child: Text(fact.value, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}

/// Compatibility % as a gold ring.
class ScoreRing extends StatelessWidget {
  const ScoreRing({super.key, required this.score, this.size = 56});
  final num score;
  final double size;

  @override
  Widget build(BuildContext context) {
    final v = score.clamp(0, 100).round();
    return Semantics(
      label: 'نسبة التوافق $v٪',
      child: SizedBox(
        width: size,
        height: size,
        child: Stack(
          alignment: Alignment.center,
          children: [
            SizedBox(
              width: size,
              height: size,
              child: CircularProgressIndicator(
                value: v / 100,
                strokeWidth: 4,
                backgroundColor: AppColors.gold.withValues(alpha: 0.15),
                color: AppColors.gold,
              ),
            ),
            Text('$v%', style: TextStyle(fontWeight: FontWeight.w800, fontSize: size * 0.27, color: AppColors.navy)),
          ],
        ),
      ),
    );
  }
}
