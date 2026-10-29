import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/localization/digits.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/json.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/person.dart';
import '../../shared/widgets/common.dart';
import '../auth/phone_validation.dart';
import '../country_selection/country.dart';
import '../country_selection/country_providers.dart';
import '../home/counts.dart';
import '../profile/guardian_form.dart';
import '../profile/profile_repository.dart';
import 'profile_options.dart';

/// Age in full years on [now].
int ageOn(DateTime dob, DateTime now) {
  var age = now.year - dob.year;
  if (now.month < dob.month || (now.month == dob.month && now.day < dob.day)) age--;
  return age;
}

/// The web's `dateOfBirthError()`: 18–80.
String? dateOfBirthError(DateTime? dob, {DateTime? now}) {
  if (dob == null) return 'تاريخ الميلاد مطلوب';
  final age = ageOn(dob, now ?? DateTime.now());
  if (age < 18) return 'يجب أن يكون عمرك 18 سنة على الأقل للتسجيل في نصيبك';
  if (age > 80) return 'تاريخ الميلاد غير صالح';
  return null;
}

/// The short setup: only what the web wizard requires (birth date, nationality, city, education,
/// marital status (+children), religiosity, partner age range). Legacy mode (intro requests off) also
/// needs the guardian before the profile counts as complete, like the web's step 5.
class SetupScreen extends ConsumerStatefulWidget {
  const SetupScreen({super.key});

  @override
  ConsumerState<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends ConsumerState<SetupScreen> {
  int _step = 0;
  DateTime? _dob;
  String? _nationality;
  String? _city;
  String? _education;
  String? _marital;
  final _children = TextEditingController();
  String? _religiosity;
  final _ageMin = TextEditingController();
  final _ageMax = TextEditingController();
  final _guardian = GuardianFields();
  Map<String, String?> _errors = {};
  String? _error;
  bool _saving = false;
  bool _prefilled = false;

  @override
  void initState() {
    super.initState();
    // A guardian saved earlier (e.g. on the website) pre-fills the guardian step
    ref.read(profileRepositoryProvider).guardian().then((g) {
      final dial = ref.read(authControllerProvider).me?.country.dialDigits ?? '962';
      if (g != null && mounted) setState(() => _guardian.fill(g, dial));
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _children.dispose();
    _ageMin.dispose();
    _ageMax.dispose();
    _guardian.dispose();
    super.dispose();
  }

  /// Fill from a saved draft (a member who started on the website).
  void _prefill(MyProfile p) {
    if (_prefilled) return;
    _prefilled = true;
    _dob = asDate(p.field('dateOfBirth'));
    _nationality = asString(p.field('nationality'));
    _city = asString(p.field('city'));
    _education = asString(p.field('education'));
    _marital = asString(p.field('maritalStatus'));
    _religiosity = asString(p.field('religiosity'));
    final kids = asInt(p.field('childrenCount'));
    if (kids != null && kids > 0) _children.text = '$kids';
    final min = asInt(p.field('prefAgeMin'));
    final max = asInt(p.field('prefAgeMax'));
    if (min != null) _ageMin.text = '$min';
    if (max != null) _ageMax.text = '$max';
  }

  bool _guardianStep(Counts? counts) => counts != null && !counts.flags.introRequests;

  Map<String, String?> _validate(int step) {
    final e = <String, String?>{};
    switch (step) {
      case 0:
        e['dob'] = dateOfBirthError(_dob);
        if (_nationality == null || _nationality!.isEmpty) e['nationality'] = 'الجنسية مطلوبة';
        if (_city == null) e['city'] = 'المدينة مطلوبة';
        if (_education == null) e['education'] = 'المستوى التعليمي مطلوب';
      case 1:
        if (_marital == null) e['marital'] = 'الحالة الاجتماعية مطلوبة';
        if (_marital != null && _marital != ProfileOptions.single) {
          final c = int.tryParse(toLatinDigits(_children.text.trim()));
          if (_children.text.trim().isEmpty) {
            e['children'] = 'عدد الأبناء مطلوب';
          } else if (c == null || c < 0 || c > 20) {
            e['children'] = 'عدد الأبناء يجب أن يكون بين 0 و 20';
          }
        }
        if (_religiosity == null) e['religiosity'] = 'مستوى التدين مطلوب';
      case 2:
        final min = int.tryParse(toLatinDigits(_ageMin.text.trim()));
        final max = int.tryParse(toLatinDigits(_ageMax.text.trim()));
        if (min == null) {
          e['ageMin'] = 'العمر الأدنى مطلوب';
        } else if (min < 18 || min > 70) {
          e['ageMin'] = 'العمر الأدنى يجب أن يكون بين 18 و 70';
        }
        if (max == null) {
          e['ageMax'] = 'العمر الأقصى مطلوب';
        } else if (max < 18 || max > 70) {
          e['ageMax'] = 'العمر الأقصى يجب أن يكون بين 18 و 70';
        }
        if (min != null && max != null && min > max) e['ageMin'] = 'العمر الأدنى يجب أن يكون أقل من العمر الأقصى';
      case 3:
        final country = ref.read(authControllerProvider).me?.country;
        e.addAll(validateGuardian(_guardian));
        if (country != null) {
          final pe = validatePhone(_guardian.phone.text, country);
          if (pe != null) e['parentPhone'] = pe;
        }
    }
    e.removeWhere((_, v) => v == null);
    return e;
  }

  Map<String, dynamic> _payload() {
    final single = _marital == ProfileOptions.single;
    final dob = _dob!;
    return {
      'dateOfBirth': '${dob.year.toString().padLeft(4, '0')}-${dob.month.toString().padLeft(2, '0')}-${dob.day.toString().padLeft(2, '0')}',
      'nationality': _nationality,
      'city': _city,
      'education': _education,
      'maritalStatus': _marital,
      'childrenCount': single ? 0 : (int.tryParse(toLatinDigits(_children.text.trim())) ?? 0),
      'religiosity': _religiosity,
      'prefAgeMin': int.parse(toLatinDigits(_ageMin.text.trim())),
      'prefAgeMax': int.parse(toLatinDigits(_ageMax.text.trim())),
    };
  }

  Future<void> _next(int total, bool guardianStep) async {
    final errors = _validate(_step);
    setState(() {
      _errors = errors;
      _error = null;
    });
    if (errors.isNotEmpty) return;
    if (_step < total - 1) {
      setState(() => _step++);
      return;
    }
    await _submit(guardianStep);
  }

  Future<void> _submit(bool guardianStep) async {
    if (_saving) return;
    setState(() => _saving = true);
    final repo = ref.read(profileRepositoryProvider);
    try {
      if (guardianStep) {
        final country = ref.read(authControllerProvider).me!.country;
        await repo.saveGuardian(
          name: _guardian.name.text,
          phone: localPhone(_guardian.phone.text, country),
          relationship: _guardian.relationship!,
          address: _guardian.address.text,
          shareConsent: _guardian.consent,
        );
      }
      await repo.save(_payload());
      ref.invalidate(countsProvider);
      // The router leaves the setup once `/api/mobile/me` says the profile is complete
      await ref.read(authControllerProvider.notifier).refreshMe();
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.code == 'GUARDIAN_REQUIRED' && !guardianStep) {
        setState(() => _error = '${e.message}. أضفه من الخطوة التالية.');
      } else {
        setState(() => _error = e.message);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickDob() async {
    final now = DateTime.now();
    final last = DateTime(now.year - 18, now.month, now.day);
    final picked = await showDatePicker(
      context: context,
      initialDate: _dob ?? DateTime(now.year - 25, 1, 1),
      firstDate: DateTime(now.year - 80, 1, 1),
      lastDate: last,
      initialDatePickerMode: DatePickerMode.year,
      helpText: 'تاريخ الميلاد',
    );
    if (picked != null) setState(() => _dob = picked);
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(authControllerProvider).me;
    final counts = ref.watch(countsProvider);
    final profile = ref.watch(myProfileProvider);
    // Cities and nationalities of the member's country come from the API (`lists`)
    final details = ref.watch(countryDetailsProvider(me?.country.code ?? 'JO'));
    if (counts.isLoading || profile.isLoading || details.isLoading) {
      return const Scaffold(body: SkeletonList(count: 5, itemHeight: 56));
    }
    if (counts.hasError) {
      return Scaffold(body: ErrorView(error: counts.error!, onRetry: () => ref.invalidate(countsProvider)));
    }
    if (details.hasError || (details.valueOrNull?.lists.isEmpty ?? true)) {
      return Scaffold(
        appBar: AppBar(title: const Text('إكمال ملفك')),
        body: ErrorView(
          error: details.error ?? ApiException(kind: ApiErrorKind.server, message: 'تعذّر تحميل قائمة المدن. حاول مرة أخرى.'),
          onRetry: () => ref.invalidate(countryDetailsProvider(me?.country.code ?? 'JO')),
        ),
      );
    }
    final lists = details.requireValue.lists;
    final p = profile.valueOrNull;
    if (p != null) _prefill(p);
    final guardianStep = _guardianStep(counts.valueOrNull);
    final total = guardianStep ? 4 : 3;
    final female = me?.isFemale ?? false;
    _nationality ??= female ? me?.country.nationalityFemale : me?.country.nationalityMale;
    final titles = ['معلوماتك الأساسية', 'حالتك الاجتماعية', 'من تبحث عنه', 'وليّ الأمر'];
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('إكمال ملفك'),
        leading: _step > 0
            ? IconButton(tooltip: 'السابق', icon: const Icon(Icons.arrow_back_rounded), onPressed: () => setState(() => _step--))
            : null,
        actions: [
          TextButton(
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
            child: const Text('خروج'),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
          children: [
            Row(
              children: [
                for (var i = 0; i < total; i++)
                  Expanded(
                    child: Container(
                      height: 5,
                      margin: const EdgeInsetsDirectional.only(end: 6),
                      decoration: BoxDecoration(
                        color: i <= _step ? AppColors.gold : AppColors.line,
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 18),
            Text('الخطوة ${_step + 1} من $total', style: const TextStyle(color: AppColors.muted)),
            Text(titles[_step], style: theme.textTheme.headlineSmall),
            const SizedBox(height: 6),
            Text(
              _step == 3
                  ? 'نطلبها لترتيب التعارف العائلي. لا تظهر لأي عضو إلا بموافقتك بعد تعارف مقبول.'
                  : 'أسئلة قليلة فقط، وباقي ملفك اختياري يمكنك إكماله لاحقاً.',
              style: theme.textTheme.bodyMedium?.copyWith(color: AppColors.muted),
            ),
            const SizedBox(height: 20),
            ..._stepFields(_step, female, lists),
            if (_error != null) ...[const SizedBox(height: 14), InfoBanner(text: _error!, tone: BannerTone.danger)],
            const SizedBox(height: 24),
            LoadingButton(
              key: const Key('setup-next'),
              label: _step == total - 1 ? 'حفظ والبدء' : 'التالي',
              loading: _saving,
              onPressed: () => _next(total, guardianStep),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _stepFields(int step, bool female, CountryLists lists) {
    switch (step) {
      case 0:
        return [
          _label('تاريخ الميلاد'),
          InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: _pickDob,
            child: InputDecorator(
              decoration: InputDecoration(
                errorText: _errors['dob'],
                suffixIcon: const Icon(Icons.calendar_month_outlined),
              ),
              child: Text(_dob == null ? 'اختر التاريخ' : formatDate(_dob!),
                  style: TextStyle(color: _dob == null ? AppColors.muted : AppColors.ink)),
            ),
          ),
          const SizedBox(height: 16),
          _label('الجنسية'),
          DropdownButtonFormField<String>(
            initialValue: lists.nationalities(female: female).contains(_nationality) ? _nationality : null,
            isExpanded: true,
            decoration: InputDecoration(errorText: _errors['nationality']),
            items: [
              for (final n in lists.nationalities(female: female))
                DropdownMenuItem(value: n, child: Text(n)),
            ],
            onChanged: (v) => setState(() => _nationality = v),
          ),
          const SizedBox(height: 16),
          _label('المدينة'),
          _chips(lists.cities, _city, (v) => setState(() => _city = v), _errors['city']),
          const SizedBox(height: 16),
          _label('المستوى التعليمي'),
          _chips(ProfileOptions.education, _education, (v) => setState(() => _education = v), _errors['education']),
        ];
      case 1:
        return [
          _label('الحالة الاجتماعية'),
          _chips(
            ProfileOptions.maritalStatus,
            _marital,
            (v) => setState(() => _marital = v),
            _errors['marital'],
            labelOf: (v) => OptionLabels.self('maritalStatus', v, female: female),
          ),
          if (_marital != null && _marital != ProfileOptions.single) ...[
            const SizedBox(height: 16),
            _label('عدد الأبناء'),
            TextField(
              controller: _children,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(hintText: '0', errorText: _errors['children']),
            ),
          ],
          const SizedBox(height: 16),
          _label('مستوى التدين'),
          _chips(
            ProfileOptions.religiosity,
            _religiosity,
            (v) => setState(() => _religiosity = v),
            _errors['religiosity'],
            labelOf: (v) => OptionLabels.self('religiosity', v, female: female),
          ),
        ];
      case 2:
        return [
          _label('عمر ${female ? 'الزوج' : 'الزوجة'} المناسب'),
          Row(
            children: [
              Expanded(
                child: TextField(
                  key: const Key('age-min'),
                  controller: _ageMin,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: 'من', errorText: _errors['ageMin'], errorMaxLines: 2),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  key: const Key('age-max'),
                  controller: _ageMax,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: 'إلى', errorText: _errors['ageMax'], errorMaxLines: 2),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          const Text('يمكنك إضافة تفضيلات أخرى لاحقاً من الموقع.', style: TextStyle(color: AppColors.muted, fontSize: 13)),
        ];
      default:
        return [GuardianFieldsView(fields: _guardian, errors: _errors, onChanged: () => setState(() {}))];
    }
  }

  Widget _label(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(t, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
      );

  Widget _chips(List<String> options, String? value, ValueChanged<String> onPick, String? error,
      {String Function(String)? labelOf}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final o in options)
              ChoiceChip(
                label: Text(labelOf?.call(o) ?? o),
                selected: value == o,
                onSelected: (_) => onPick(o),
                materialTapTargetSize: MaterialTapTargetSize.padded,
              ),
          ],
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(error, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
          ),
      ],
    );
  }
}
