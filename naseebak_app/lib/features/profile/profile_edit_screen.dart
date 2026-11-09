import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/localization/digits.dart';
import '../../core/localization/safe_input_formatter.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/json.dart';
import '../../shared/person.dart';
import '../../shared/widgets/common.dart';
import '../country_selection/country.dart';
import '../country_selection/country_providers.dart';
import '../onboarding/profile_options.dart';
import '../onboarding/setup_screen.dart' show dateOfBirthError;
import 'profile_edit_plan.dart';
import 'profile_repository.dart';
import 'profile_screen.dart' show requiredPayload;

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
  'religiosity': 'مستوى التدين',
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

const _numberLimits = <String, (int, int)>{
  'height': (100, 250),
  'weight': (30, 300),
  'childrenCount': (0, 20),
  'numberOfSiblings': (0, 20),
};

/// Single-choice fields the website's edit page requires (`validateStep`): a chip can be changed, never cleared
const requiredChoices = {'nationality', 'city', 'education', 'maritalStatus', 'religiosity'};

/// The area kept after a city change: only if it is one of the new city's areas (the website's `handleCityChange`)
String? areaAfterCityChange(String? area, List<String> newCityAreas) =>
    area != null && newCityAreas.contains(area) ? area : null;

/// The first required field left empty, as the website words it, or null
String? missingRequiredChoice(Map<String, Object?> values) {
  const messages = {
    'nationality': 'يرجى إدخال الجنسية',
    'city': 'يرجى اختيار المدينة',
    'education': 'يرجى اختيار المستوى التعليمي',
    'maritalStatus': 'يرجى اختيار الحالة الاجتماعية',
    'religiosity': 'يرجى اختيار مستوى التدين',
  };
  for (final e in messages.entries) {
    final v = values[e.key];
    if (v == null || (v is String && v.trim().isEmpty)) return e.value;
  }
  return null;
}

const _shortTexts = {'fieldOfStudy', 'tribe', 'familyOriginArea'};
const _longTexts = {'aboutMe', 'partnerExpectations', 'hobbies', 'interests', 'familyValues', 'healthConditions'};
const _jobOther = 'أخرى';
const _relocate = {'yes': 'نعم', 'no': 'لا', 'maybe': 'ربما'};

/// The stored values the editor works on (only the fields it edits).
Map<String, Object?> editableValues(MyProfile p) => {
      for (final k in profileFieldLabels.keys) k: k == 'dateOfBirth' ? dayOf(p.field(k)) : p.field(k),
    };

/// Jobs only women pick («ربة منزل»), like the website's `jobValuesFor`: not offered to a man (a value he already
/// has still shows)
const femaleOnlyJobs = {'ربة منزل'};

List<String> jobOptionsFor(List<String> all, {required bool female, String? current}) =>
    [for (final j in all) if (female || !femaleOnlyJobs.contains(j) || j == current) j];

/// «تعديل ملفي»: every profile field of the website. Empty fields save at once; changing a stored value is sent to
/// the Naseebak team for review (one request at a time, «سحب الطلب» to change it), like `/dashboard/profile/edit`.
class ProfileEditScreen extends ConsumerWidget {
  const ProfileEditScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(myProfileProvider);
    final pending = ref.watch(pendingEditProvider);
    final me = ref.watch(authControllerProvider).me;
    final details = ref.watch(countryDetailsProvider(me?.country.code ?? 'JO'));
    Widget body;
    final error = profile.error ?? pending.error ?? details.error;
    if (error != null) {
      body = ErrorView(
        error: error,
        onRetry: () {
          ref.invalidate(myProfileProvider);
          ref.invalidate(pendingEditProvider);
          ref.invalidate(countryDetailsProvider(me?.country.code ?? 'JO'));
        },
      );
    } else if (!profile.hasValue || !pending.hasValue || !details.hasValue) {
      body = const SkeletonList(count: 6, itemHeight: 70);
    } else {
      body = ProfileEditForm(
        key: ValueKey(profile.requireValue.hashCode),
        profile: profile.requireValue,
        lists: details.requireValue.lists,
        pending: pending.requireValue,
      );
    }
    return Scaffold(appBar: AppBar(title: const Text('تعديل ملفي')), body: body);
  }
}

class ProfileEditForm extends ConsumerStatefulWidget {
  const ProfileEditForm({super.key, required this.profile, required this.lists, required this.pending});
  final MyProfile profile;
  final CountryLists lists;
  final PendingEdit? pending;

  @override
  ConsumerState<ProfileEditForm> createState() => _ProfileEditFormState();
}

class _ProfileEditFormState extends ConsumerState<ProfileEditForm> {
  late final Map<String, Object?> _stored = editableValues(widget.profile);
  late final Map<String, Object?> _v = {..._stored};
  final _text = <String, TextEditingController>{};
  late bool _jobIsOther;
  final _jobCustom = TextEditingController();
  final _message = TextEditingController();
  String? _error;
  bool _saving = false;
  bool _withdrawing = false;

  bool get _female => widget.profile.female;

  @override
  void initState() {
    super.initState();
    for (final k in [..._shortTexts, ..._longTexts, ..._numberLimits.keys]) {
      _text[k] = TextEditingController(text: _v[k]?.toString() ?? '');
    }
    final job = asString(_v['job']);
    final jobs = widget.lists.option('job');
    _jobIsOther = job != null && job.isNotEmpty && !jobs.contains(job);
    if (_jobIsOther) _jobCustom.text = job!;
  }

  @override
  void dispose() {
    for (final c in _text.values) {
      c.dispose();
    }
    _jobCustom.dispose();
    _message.dispose();
    super.dispose();
  }

  /// The form as the API takes it; null + an error message when something is invalid
  (Map<String, Object?>?, String?) _collect() {
    final out = <String, Object?>{..._v};
    for (final k in [..._shortTexts, ..._longTexts]) {
      out[k] = _text[k]!.text.trim();
    }
    for (final e in _numberLimits.entries) {
      final raw = toLatinDigits(_text[e.key]!.text.trim());
      if (raw.isEmpty) {
        out[e.key] = null;
        continue;
      }
      final n = int.tryParse(raw);
      if (n == null || n < e.value.$1 || n > e.value.$2) {
        return (null, '${profileFieldLabels[e.key]} يجب أن يكون بين ${e.value.$1} و${e.value.$2}');
      }
      out[e.key] = n;
    }
    if (_jobIsOther) {
      final custom = _jobCustom.text.trim();
      if (custom.isEmpty) return (null, 'يرجى تحديد الوظيفة');
      out['job'] = custom;
    }
    final dob = asString(out['dateOfBirth']);
    final dobError = dateOfBirthError(dob == null ? null : DateTime.tryParse(dob));
    if (dobError != null) return (null, dobError);
    final missing = missingRequiredChoice(out);
    if (missing != null) return (null, missing);
    if (out['maritalStatus'] == ProfileOptions.single) out['childrenCount'] = 0;
    if (out['maritalStatus'] != ProfileOptions.single && out['childrenCount'] == null) {
      return (null, 'عدد الأبناء مطلوب');
    }
    // The other gender's question is never sent
    if (_female) {
      out.remove('beard');
    } else {
      out
        ..remove('hijab')
        ..remove('niqab');
    }
    return (out, null);
  }

  Future<void> _save() async {
    final (values, err) = _collect();
    setState(() => _error = err);
    if (values == null) return;
    final plan = keepHijabPairTogether(planProfileEdit(_stored, values));
    if (plan.isEmpty) {
      showSnack(context, 'لا توجد تغييرات');
      return;
    }
    if (plan.reviewed.isNotEmpty && widget.pending != null) {
      setState(() => _error = 'لديك طلب تعديل قيد المراجعة. اسحبه أولاً لتغيير بيانات محفوظة، أو احفظ الحقول الفارغة فقط.');
      return;
    }
    setState(() => _saving = true);
    final repo = ref.read(profileRepositoryProvider);
    try {
      if (plan.fills.isNotEmpty) {
        await repo.save({...requiredPayload(widget.profile), ...plan.fills});
      }
      if (plan.reviewed.isNotEmpty) {
        final note = _message.text.trim();
        await repo.requestUpdate(plan.reviewed, message: note.isEmpty ? null : note);
      }
      if (!mounted) return;
      showSnack(
        context,
        plan.reviewed.isEmpty
            ? 'تم الحفظ'
            : plan.fills.isEmpty
                ? 'أُرسل التعديل للمراجعة وسيظهر بعد اعتماده'
                : 'حُفظت الحقول الجديدة، وأُرسل تعديل البيانات المحفوظة للمراجعة',
      );
      ref.invalidate(myProfileProvider);
      ref.invalidate(pendingEditProvider);
      ref.read(authControllerProvider.notifier).refreshMe();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _withdraw() async {
    setState(() => _withdrawing = true);
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      await ref.read(profileRepositoryProvider).withdrawPendingEdit();
      container.invalidate(pendingEditProvider);
      if (mounted) showSnack(context, 'تم سحب الطلب');
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message);
    } finally {
      if (mounted) setState(() => _withdrawing = false);
    }
  }

  // ---- field widgets ----

  Widget _label(String key, {String? text}) => Padding(
        padding: const EdgeInsets.only(top: 16, bottom: 8),
        child: Text(text ?? profileFieldLabels[key]!, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
      );

  void _pick(String key, String? value) {
    // A required field is changed by picking another option; tapping the chosen one never clears it
    if (value == null && requiredChoices.contains(key)) return;
    setState(() {
      if (key == 'city' && value != _v['city']) {
        _v['area'] = areaAfterCityChange(asString(_v['area']), widget.lists.areas[value] ?? const []);
      }
      _v[key] = value;
    });
  }

  Widget _choice(String key, List<String> options, {String Function(String)? labelOf, String? title}) {
    final current = asString(_v[key]);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label(key, text: title),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final o in {...options, if (current != null && current.isNotEmpty && !options.contains(current)) current})
              ChoiceChip(
                key: Key('$key-$o'),
                label: Text(labelOf?.call(o) ?? o),
                selected: current == o,
                onSelected: (on) => _pick(key, on ? o : null),
              ),
          ],
        ),
      ],
    );
  }

  Widget _yesNo(String key, String title) {
    final current = _v[key];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label(key, text: title),
        Wrap(spacing: 8, children: [
          for (final (value, text) in const [(true, 'نعم'), (false, 'لا')])
            ChoiceChip(
              key: Key('$key-$value'),
              label: Text(text),
              selected: current == value,
              onSelected: (on) => setState(() => _v[key] = on ? value : null),
            ),
        ]),
      ],
    );
  }

  /// Her «الحجاب»: one question, three answers stored as `hijab` + `niqab` (both always sent together)
  Widget _hijab() {
    final current = switch ((_v['hijab'], _v['niqab'])) {
      (_, true) => 'niqab',
      (true, _) => 'hijab',
      (false, _) => 'none',
      _ => null,
    };
    const choices = [('hijab', 'محجبة', true, false), ('niqab', 'منتقبة', true, true), ('none', 'غير محجبة', false, false)];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label('hijab'),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final (id, text, hijab, niqab) in choices)
            ChoiceChip(
              key: Key('hijab-$id'),
              label: Text(text),
              selected: current == id,
              onSelected: (on) => setState(() {
                // Tapping the chosen answer clears it, like the other yes / no questions
                _v['hijab'] = on ? hijab : null;
                _v['niqab'] = on ? niqab : null;
              }),
            ),
        ]),
      ],
    );
  }

  Widget _field(String key, {String? hint, String? title}) {
    final long = _longTexts.contains(key);
    final number = _numberLimits.containsKey(key);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label(key, text: title),
        TextField(
          key: Key('field-$key'),
          controller: _text[key],
          maxLength: number ? null : (long ? 500 : 100),
          maxLines: long ? 4 : 1,
          minLines: 1,
          keyboardType: number ? TextInputType.number : TextInputType.text,
          inputFormatters: [LatinDigitsFormatter()],
          textDirection: number ? TextDirection.ltr : null,
          decoration: InputDecoration(hintText: hint),
        ),
      ],
    );
  }

  Widget _section(String title, List<Widget> children) => Padding(
        padding: const EdgeInsets.only(top: 12),
        child: Card(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [SectionTitle(title), ...children]),
          ),
        ),
      );

  Future<void> _pickDate() async {
    final current = DateTime.tryParse(asString(_v['dateOfBirth']) ?? '');
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: current ?? DateTime(now.year - 25),
      firstDate: DateTime(now.year - 80),
      lastDate: DateTime(now.year - 18, now.month, now.day),
    );
    if (picked != null) {
      setState(() => _v['dateOfBirth'] =
          '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}');
    }
  }

  @override
  Widget build(BuildContext context) {
    final lists = widget.lists;
    final city = asString(_v['city']);
    final areas = city == null ? const <String>[] : (lists.areas[city] ?? const <String>[]);
    final jobs = jobOptionsFor(lists.option('job'), female: _female, current: asString(_v['job']));
    final dob = DateTime.tryParse(asString(_v['dateOfBirth']) ?? '');
    final pending = widget.pending;
    String self(String field, String v) => OptionLabels.self(field, v, female: _female);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        if (pending != null)
          InfoBanner(
            tone: BannerTone.warning,
            text: 'طلب تعديل قيد المراجعة: ${pending.fields.map((f) => profileFieldLabels[f] ?? f).join('، ')}. '
                'يمكنك تعبئة الحقول الفارغة الآن، أما تغيير بيانات أخرى محفوظة فيكون بعد مراجعته أو سحبه.',
            action: TextButton(
              key: const Key('withdraw'),
              onPressed: _withdrawing ? null : _withdraw,
              child: Text(_withdrawing ? '…' : 'سحب الطلب'),
            ),
          )
        else
          const InfoBanner(
            text: 'الحقول الفارغة تُحفظ فوراً. تغيير بيانات محفوظة يُرسل لفريق نصيبك للمراجعة قبل ظهوره.',
          ),
        _section('البيانات الأساسية', [
          _label('dateOfBirth'),
          OutlinedButton.icon(
            key: const Key('field-dateOfBirth'),
            onPressed: _pickDate,
            icon: const Icon(Icons.calendar_month_outlined),
            label: Text(dob == null ? 'اختيار التاريخ' : formatDate(dob)),
          ),
          _choice('nationality', lists.nationalities(female: _female)),
          _choice('city', lists.cities),
          if (areas.isNotEmpty) _choice('area', areas),
          _choice('education', lists.option('education')),
          _field('fieldOfStudy', hint: 'مثال: هندسة حاسوب، محاسبة، طب...'),
          _label('job'),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final j in jobs)
                ChoiceChip(
                  label: Text(self('job', j)),
                  selected: j == _jobOther ? _jobIsOther : (!_jobIsOther && _v['job'] == j),
                  onSelected: (on) => setState(() {
                    _jobIsOther = on && j == _jobOther;
                    _v['job'] = on && j != _jobOther ? j : null;
                  }),
                ),
            ],
          ),
          if (_jobIsOther)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: TextField(
                key: const Key('field-jobCustom'),
                controller: _jobCustom,
                maxLength: 100,
                decoration: InputDecoration(hintText: _female ? 'حدّدي وظيفتكِ...' : 'حدّد وظيفتك...'),
              ),
            ),
          _choice('maritalStatus', lists.option('maritalStatus'), labelOf: (v) => self('maritalStatus', v)),
          if (_v['maritalStatus'] != null && _v['maritalStatus'] != ProfileOptions.single) _field('childrenCount'),
          _choice('religiosity', lists.option('religiosity'), labelOf: (v) => self('religiosity', v)),
        ]),
        _section('المظهر والعمل', [
          _field('height', title: 'الطول (سم)'),
          _field('weight', title: 'الوزن (كغ)'),
          _choice('skinColor', lists.option('skinColor')),
          _choice('incomeRange', lists.incomeRanges),
        ]),
        _section('نمط الحياة', [
          _choice('smokingStatus', lists.option('smokingStatus')),
          if (_female) _hijab() else _yesNo('beard', 'هل أنت ملتحٍ؟'),
          _choice('cookingAbility', lists.option('cookingAbility')),
          _choice('lifestyle', lists.option('lifestyle'), labelOf: (v) => self('lifestyle', v)),
          _yesNo('drivingLicense', _female ? 'هل لديكِ رخصة قيادة؟' : 'هل لديك رخصة قيادة؟'),
          _choice('willingToRelocate', _relocate.keys.toList(), labelOf: (v) => _relocate[v] ?? v),
        ]),
        _section('عنّي', [
          for (final k in ['aboutMe', 'partnerExpectations', 'hobbies', 'interests', 'familyValues']) _field(k),
        ]),
        _section('العائلة والسكن', [
          _field('tribe', title: lists.tribeLabel),
          _field('familyOriginArea'),
          _field('numberOfSiblings'),
          _choice('housingType', lists.option('housingType')),
          _choice('monthlyExpenses', lists.expenseRanges),
          _field('healthConditions', hint: 'اختياري — يراه من يتوافق معك فقط'),
        ]),
        if (pending == null) ...[
          const SizedBox(height: 16),
          TextField(
            controller: _message,
            maxLength: 1000,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'ملاحظة لفريق المراجعة (اختياري)'),
          ),
        ],
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: InfoBanner(tone: BannerTone.danger, text: _error!),
          ),
        const SizedBox(height: 16),
        LoadingButton(key: const Key('save-profile'), label: 'حفظ التعديلات', loading: _saving, onPressed: _save),
      ],
    );
  }
}
