import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/localization/digits.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/json.dart';
import '../../shared/religion.dart';
import '../../shared/widgets/common.dart';
import '../country_selection/country.dart';
import '../country_selection/country_providers.dart';
import '../onboarding/profile_options.dart';
import '../onboarding/setup_screen.dart' show dateOfBirthError;
import 'profile_edit_plan.dart';
import 'profile_field_control.dart';
import 'profile_repository.dart';
import 'profile_screen.dart' show requiredPayload;

export 'profile_field_control.dart'
    show profileFieldLabels, areaAfterCityChange, femaleOnlyJobs, jobOptionsFor;

/// Single-choice fields the website's edit page requires (`validateStep`): a chip can be changed, never cleared
/// («المذهب» only shows where the country asks it)
const requiredChoices = {'nationality', 'city', 'education', 'maritalStatus', 'religion', 'religiosity', 'sect'};

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

/// The stored values the editor works on (only the fields it edits).
Map<String, Object?> editableValues(MyProfile p) => {
      for (final k in profileFieldLabels.keys)
        k: k == 'dateOfBirth'
            ? dayOf(p.field(k))
            : k == 'religion'
                ? religionOf(p.field(k))
                : p.field(k),
    };

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
  final _jobCustom = TextEditingController();
  final _message = TextEditingController();
  String? _error;
  bool _saving = false;
  bool _withdrawing = false;

  bool get _female => widget.profile.female;

  /// The religion question is asked only when the country's options carry it (old servers: nothing changes)
  bool get _religionAsked => widget.lists.option('religion').isNotEmpty;

  /// A Christian (picked, or stored while the switch is off) is never asked the Muslim-only rows
  bool get _christian => isChristian(_v['religion']);

  @override
  void initState() {
    super.initState();
    for (final k in [...profileShortTexts, ...profileLongTexts, ...profileNumberLimits.keys]) {
      _text[k] = TextEditingController(text: _v[k]?.toString() ?? '');
    }
    // A stored job outside the list stands on «أخرى» with its text
    final job = asString(_v['job']);
    if (job != profileJobOther && jobIsOther(job, widget.lists.option('job'))) _jobCustom.text = job!;
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
    for (final k in [...profileShortTexts, ...profileLongTexts]) {
      out[k] = _text[k]!.text.trim();
    }
    for (final e in profileNumberLimits.entries) {
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
    if (jobIsOther(_v['job'], widget.lists.option('job'))) {
      final custom = _jobCustom.text.trim();
      if (custom.isEmpty) return (null, 'يرجى تحديد الوظيفة');
      out['job'] = custom;
    }
    final dob = asString(out['dateOfBirth']);
    final dobError = dateOfBirthError(dob == null ? null : DateTime.tryParse(dob));
    if (dobError != null) return (null, dobError);
    final missing = missingRequiredChoice(out);
    if (missing != null) return (null, missing);
    final sects = widget.lists.option('sect');
    if (!_christian && sects.isNotEmpty && !sects.contains(out['sect'])) return (null, 'يرجى اختيار المذهب');
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
    // No religion list from the server: no religion key is sent (a stored Christian only hides the rows)
    if (!_religionAsked) out.remove('religion');
    return (withoutMuslimOnly(_v['religion'], out), null);
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
      setState(() => _error = 'لديك طلب تعديل قيد المراجعة. يمكنك سحبه أولاً لتغيير بيانات محفوظة، أو حفظ الحقول الفارغة فقط.');
      return;
    }
    setState(() => _saving = true);
    final repo = ref.read(profileRepositoryProvider);
    // Taken before the request: a save that lands after the member left still refreshes «ملفي», the pending badge
    // and me (audit M6); only the snack needs this screen
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      if (plan.fills.isNotEmpty) {
        await repo.save(withoutMuslimOnly(_v['religion'], {...requiredPayload(widget.profile), ...plan.fills}));
      }
      if (plan.reviewed.isNotEmpty) {
        final note = _message.text.trim();
        await repo.requestUpdate(plan.reviewed, message: note.isEmpty ? null : note);
      }
      container.invalidate(myProfileProvider);
      container.invalidate(pendingEditProvider);
      container.read(authControllerProvider.notifier).refreshMe();
      if (!mounted) return;
      showSnack(
        context,
        plan.reviewed.isEmpty
            ? 'تم الحفظ'
            : plan.fills.isEmpty
                ? 'أُرسل التعديل للمراجعة وسيظهر بعد اعتماده'
                : 'حُفظت الحقول الجديدة، وأُرسل تعديل البيانات المحفوظة للمراجعة',
      );
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

  /// One field as [ProfileFieldControl] draws it. A required field is changed by picking another option; tapping the
  /// chosen one never clears it
  Widget _control(String key) => ProfileFieldControl(
        fieldKey: key,
        values: _v,
        onChanged: (k, v) => setState(() => _v[k] = v),
        lists: widget.lists,
        female: _female,
        controller: key == 'job' ? _jobCustom : _text[key],
        clearable: !requiredChoices.contains(key),
      );

  Widget _section(String title, List<Widget> children) => Padding(
        padding: const EdgeInsets.only(top: 12),
        child: Card(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [SectionTitle(title), ...children]),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final lists = widget.lists;
    final pending = widget.pending;

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
          if (_religionAsked) _control('religion'),
          _control('dateOfBirth'),
          _control('nationality'),
          _control('city'),
          _control('education'),
          _control('fieldOfStudy'),
          _control('job'),
          _control('maritalStatus'),
          if (_v['maritalStatus'] != null && _v['maritalStatus'] != ProfileOptions.single) _control('childrenCount'),
          _control('religiosity'),
          if (!_christian && lists.option('sect').isNotEmpty) _control('sect'),
        ]),
        _section('المظهر والعمل', [
          for (final k in ['height', 'weight', 'skinColor', 'incomeRange']) _control(k),
        ]),
        _section('نمط الحياة', [
          _control('smokingStatus'),
          if (!_christian) _control(_female ? 'hijab' : 'beard'),
          for (final k in ['cookingAbility', 'lifestyle', 'drivingLicense', 'willingToRelocate']) _control(k),
        ]),
        _section('عنّي', [
          for (final k in ['aboutMe', 'partnerExpectations', 'hobbies', 'interests', 'familyValues']) _control(k),
        ]),
        _section('العائلة والسكن', [
          for (final k in ['tribe', 'familyOriginArea', 'numberOfSiblings', 'housingType', 'monthlyExpenses', 'healthConditions'])
            _control(k),
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
