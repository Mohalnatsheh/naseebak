import 'package:flutter/material.dart';

import '../../core/localization/digits.dart';
import '../../core/localization/safe_input_formatter.dart';
import '../../core/network/json.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/person.dart';
import '../country_selection/country.dart';

/// Arabic names of the profile fields (pending-request summary, errors)
const profileFieldLabels = <String, String>{
  'dateOfBirth': 'تاريخ الميلاد',
  'nationality': 'الجنسية',
  'city': 'المدينة',
  'area': 'المنطقة',
  'education': 'المستوى التعليمي',
  'fieldOfStudy': 'التخصص',
  'job': 'الوظيفة',
  'maritalStatus': 'الحالة الاجتماعية',
  'childrenCount': 'عدد الأبناء',
  'religion': 'الديانة',
  'religiosity': 'مستوى التدين',
  'sect': 'المذهب',
  'height': 'الطول',
  'weight': 'الوزن',
  'skinColor': 'لون البشرة',
  'incomeRange': 'مستوى الدخل',
  'smokingStatus': 'التدخين',
  'hijab': 'الحجاب',
  'niqab': 'النقاب',
  'beard': 'اللحية',
  'cookingAbility': 'مهارة الطبخ',
  'lifestyle': 'نمط الحياة',
  'drivingLicense': 'رخصة القيادة',
  'willingToRelocate': 'الاستعداد للانتقال',
  'aboutMe': 'نبذة عني',
  'partnerExpectations': 'مواصفات الشريك المطلوبة',
  'hobbies': 'الهوايات',
  'interests': 'الاهتمامات',
  'familyValues': 'القيم العائلية',
  'tribe': 'العشيرة',
  'familyOriginArea': 'منطقة أصل العائلة',
  'numberOfSiblings': 'عدد الإخوة والأخوات',
  'housingType': 'نوع السكن',
  'monthlyExpenses': 'المصاريف الشهرية',
  'healthConditions': 'حالات صحية',
};

/// Number fields and their allowed range (no length counter, Latin digits, number keypad)
const profileNumberLimits = <String, (int, int)>{
  'height': (100, 250),
  'weight': (30, 300),
  'childrenCount': (0, 20),
  'numberOfSiblings': (0, 20),
};

/// One-line texts (100 characters)
const profileShortTexts = {'fieldOfStudy', 'tribe', 'familyOriginArea'};

/// Free texts (500 characters, up to four lines)
const profileLongTexts = {'aboutMe', 'partnerExpectations', 'hobbies', 'interests', 'familyValues', 'healthConditions'};

/// The job chip that opens the free job text; while it is picked the field's value is this word
const profileJobOther = 'أخرى';

const _relocate = {'yes': 'نعم', 'no': 'لا', 'maybe': 'ربما'};

const _hints = {
  'fieldOfStudy': 'مثال: هندسة حاسوب، محاسبة، طب...',
  'healthConditions': 'اختياري — يراه من يتوافق معك فقط',
};

/// The area kept after a city change: only if it is one of the new city's areas (the website's `handleCityChange`)
String? areaAfterCityChange(String? area, List<String> newCityAreas) =>
    area != null && newCityAreas.contains(area) ? area : null;

/// Jobs only women pick («ربة منزل»), like the website's `jobValuesFor`: not offered to a man (a value he already
/// has still shows)
const femaleOnlyJobs = {'ربة منزل'};

List<String> jobOptionsFor(List<String> all, {required bool female, String? current}) =>
    [for (final j in all) if (female || !femaleOnlyJobs.contains(j) || j == current) j];

/// True when the job field stands on «أخرى»: the chip itself, or a stored job outside the list
bool jobIsOther(Object? job, List<String> jobs) {
  final j = asString(job);
  if (j == null || j.isEmpty) return false;
  return j == profileJobOther || !jobs.contains(j);
}

void _unfocus(PointerDownEvent _) => FocusManager.instance.primaryFocus?.unfocus();

/// One profile field as «تعديل ملفي» shows it: its title, its control and an optional error under it. Shared by the
/// edit form and the setup steps. It holds no state: every answer goes through [onChanged] (key, value); texts and
/// numbers live in [controller] (for `job`, the controller of the «أخرى» text).
class ProfileFieldControl extends StatelessWidget {
  const ProfileFieldControl({
    super.key,
    required this.fieldKey,
    required this.values,
    required this.onChanged,
    required this.lists,
    required this.female,
    this.controller,
    this.error,
    this.clearable = true,
    this.onTextChanged,
  });

  final String fieldKey;
  final Map<String, Object?> values;
  final void Function(String key, Object? value) onChanged;
  final CountryLists lists;
  final bool female;
  final TextEditingController? controller;
  final String? error;

  /// false: tapping the chosen chip keeps it (a required choice is changed, never cleared)
  final bool clearable;

  /// Typing in the field's text (a text, a number, the «أخرى» job text), with [fieldKey]: lets the owner clear a
  /// shown error while the member types
  final ValueChanged<String>? onTextChanged;

  void _typed(String _) => onTextChanged?.call(fieldKey);

  String get _title => switch (fieldKey) {
        'height' => 'الطول (سم)',
        'weight' => 'الوزن (كغ)',
        'beard' => 'هل أنت ملتحٍ؟',
        'drivingLicense' => female ? 'هل لديكِ رخصة قيادة؟' : 'هل لديك رخصة قيادة؟',
        'tribe' => lists.tribeLabel,
        _ => profileFieldLabels[fieldKey] ?? fieldKey,
      };

  String _self(String field, String v) => OptionLabels.self(field, v, female: female);

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(top: 16, bottom: 8),
        child: Text(text, style: AppText.body.copyWith(fontWeight: FontWeight.w700)),
      );

  List<String> _options(String key) => switch (key) {
        'nationality' => lists.nationalities(female: female),
        'city' => lists.cities,
        'area' => lists.areas[asString(values['city'])] ?? const [],
        'incomeRange' => lists.incomeRanges,
        'monthlyExpenses' => lists.expenseRanges,
        'willingToRelocate' => _relocate.keys.toList(),
        _ => lists.option(key),
      };

  String _optionLabel(String key, String v) => key == 'willingToRelocate' ? (_relocate[v] ?? v) : _self(key, v);

  void _pick(String key, String? value) {
    // The area under a city is optional: it always clears, whatever the city's own rule
    if (value == null && !clearable && key != 'area') return;
    if (key == 'city' && value != values['city']) {
      onChanged('area', areaAfterCityChange(asString(values['area']), lists.areas[value] ?? const []));
    }
    onChanged(key, value);
  }

  Widget _choice(String key, {String? title}) {
    final current = asString(values[key]);
    final options = _options(key);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label(title ?? profileFieldLabels[key] ?? key),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final o in {...options, if (current != null && current.isNotEmpty && !options.contains(current)) current})
              ChoiceChip(
                key: Key('$key-$o'),
                label: Text(_optionLabel(key, o)),
                selected: current == o,
                onSelected: (on) => _pick(key, on ? o : null),
              ),
          ],
        ),
      ],
    );
  }

  Widget _yesNo() {
    final current = values[fieldKey];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label(_title),
        Wrap(spacing: 8, children: [
          for (final (value, text) in const [(true, 'نعم'), (false, 'لا')])
            ChoiceChip(
              key: Key('$fieldKey-$value'),
              label: Text(text),
              selected: current == value,
              onSelected: (on) {
                if (!on && !clearable) return;
                onChanged(fieldKey, on ? value : null);
              },
            ),
        ]),
      ],
    );
  }

  /// Her «الحجاب»: one question, three answers stored as `hijab` + `niqab` (both always sent together)
  Widget _hijab() {
    final current = switch ((values['hijab'], values['niqab'])) {
      (_, true) => 'niqab',
      (true, _) => 'hijab',
      (false, _) => 'none',
      _ => null,
    };
    const choices = [('hijab', 'محجبة', true, false), ('niqab', 'منتقبة', true, true), ('none', 'غير محجبة', false, false)];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label(_title),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final (id, text, hijab, niqab) in choices)
            ChoiceChip(
              key: Key('hijab-$id'),
              label: Text(text),
              selected: current == id,
              onSelected: (on) {
                // Tapping the chosen answer clears it, like the other yes / no questions
                if (!on && !clearable) return;
                onChanged('hijab', on ? hijab : null);
                onChanged('niqab', on ? niqab : null);
              },
            ),
        ]),
      ],
    );
  }

  Widget _job() {
    final jobs = jobOptionsFor(lists.option('job'), female: female, current: asString(values['job']));
    final other = jobIsOther(values['job'], jobs);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _label(_title),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final j in jobs)
              ChoiceChip(
                label: Text(_self('job', j)),
                selected: j == profileJobOther ? other : (!other && values['job'] == j),
                onSelected: (on) {
                  if (!on && !clearable) return;
                  onChanged('job', on ? j : null);
                },
              ),
          ],
        ),
        if (other)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: TextField(
              key: const Key('field-jobCustom'),
              controller: controller,
              maxLength: 100,
              onTapOutside: _unfocus,
              onChanged: onTextChanged == null ? null : _typed,
              decoration: InputDecoration(hintText: female ? 'حدّدي وظيفتكِ...' : 'حدّد وظيفتك...'),
            ),
          ),
      ],
    );
  }

  Widget _date(BuildContext context) {
    final dob = DateTime.tryParse(asString(values['dateOfBirth']) ?? '');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _label(_title),
        OutlinedButton.icon(
          key: const Key('field-dateOfBirth'),
          onPressed: () => _pickDate(context, dob),
          icon: const Icon(Icons.calendar_month_outlined),
          label: Text(dob == null ? 'اختيار التاريخ' : formatDate(dob)),
        ),
      ],
    );
  }

  Future<void> _pickDate(BuildContext context, DateTime? current) async {
    final now = DateTime.now();
    final first = DateTime(now.year - 80);
    final last = DateTime(now.year - 18, now.month, now.day);
    // A stored date outside the range (the website allows others) must not break the picker
    var initial = current ?? DateTime(now.year - 25);
    if (initial.isBefore(first)) initial = first;
    if (initial.isAfter(last)) initial = last;
    final picked = await showDatePicker(context: context, initialDate: initial, firstDate: first, lastDate: last);
    if (picked != null) {
      onChanged('dateOfBirth',
          '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}');
    }
  }

  Widget _text() {
    final long = profileLongTexts.contains(fieldKey);
    final number = profileNumberLimits.containsKey(fieldKey);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _label(_title),
        TextField(
          key: Key('field-$fieldKey'),
          controller: controller,
          maxLength: number ? null : (long ? 500 : 100),
          maxLines: long ? 4 : 1,
          minLines: 1,
          keyboardType: number ? TextInputType.number : TextInputType.text,
          inputFormatters: [LatinDigitsFormatter()],
          textDirection: number ? TextDirection.ltr : null,
          onTapOutside: _unfocus,
          onChanged: onTextChanged == null ? null : _typed,
          decoration: InputDecoration(hintText: _hints[fieldKey]),
        ),
      ],
    );
  }

  Widget _control(BuildContext context) {
    if (fieldKey == 'dateOfBirth') return _date(context);
    if (fieldKey == 'hijab') return _hijab();
    if (fieldKey == 'beard' || fieldKey == 'drivingLicense') return _yesNo();
    if (fieldKey == 'job') return _job();
    if (profileNumberLimits.containsKey(fieldKey) ||
        profileShortTexts.contains(fieldKey) ||
        profileLongTexts.contains(fieldKey)) {
      return _text();
    }
    if (fieldKey == 'city') {
      final areas = _options('area');
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [_choice('city', title: _title), if (areas.isNotEmpty) _choice('area')],
      );
    }
    return _choice(fieldKey, title: _title);
  }

  @override
  Widget build(BuildContext context) {
    final err = error;
    if (err == null) return _control(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _control(context),
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(err, style: AppText.caption.copyWith(color: AppColors.danger)),
        ),
      ],
    );
  }
}
