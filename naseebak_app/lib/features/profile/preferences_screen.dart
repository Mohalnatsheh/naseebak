import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/localization/digits.dart';
import '../../core/localization/safe_input_formatter.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/person.dart';
import '../../shared/widgets/common.dart';
import '../country_selection/country_providers.dart';
import '../home/counts.dart';
import '../onboarding/profile_options.dart';
import 'profile_repository.dart';

const prefAgeLimit = 70;

/// The web's age-range rule for preferences: both ends 18–70, min ≤ max.
String? prefAgeError(int? min, int? max) {
  if (min == null || max == null) return 'حدّد العمر الأدنى والأقصى';
  if (min < 18 || max < 18 || min > prefAgeLimit || max > prefAgeLimit) return 'العمر يجب أن يكون بين 18 و$prefAgeLimit';
  if (min > max) return 'العمر الأدنى يجب أن يكون أقل من العمر الأقصى';
  return null;
}

final partnerPrefsProvider =
    FutureProvider.autoDispose<PartnerPrefs>((ref) => ref.watch(profileRepositoryProvider).partnerPrefs());

/// «تفضيلات الشريك» + «شروطي الأساسية»: private, saved at once (no review), like the web's step 3.
class PreferencesScreen extends ConsumerWidget {
  const PreferencesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(partnerPrefsProvider);
    final counts = ref.watch(countsProvider);
    final me = ref.watch(authControllerProvider).me;
    final details = ref.watch(countryDetailsProvider(me?.country.code ?? 'JO'));
    Widget body;
    if (prefs.hasError || counts.hasError || details.hasError) {
      body = ErrorView(
        error: prefs.error ?? counts.error ?? details.error!,
        onRetry: () {
          ref.invalidate(partnerPrefsProvider);
          ref.invalidate(countsProvider);
          ref.invalidate(countryDetailsProvider(me?.country.code ?? 'JO'));
        },
      );
    } else if (!prefs.hasValue || !counts.hasValue || !details.hasValue) {
      body = const SkeletonList(count: 5, itemHeight: 70);
    } else {
      body = PreferencesForm(
        initial: prefs.requireValue,
        cities: details.requireValue.lists.cities,
        female: me?.isFemale ?? false,
        withDealbreakers: counts.requireValue.flags.mutualSuggestions,
      );
    }
    return Scaffold(appBar: AppBar(title: const Text('تفضيلات الشريك')), body: body);
  }
}

class PreferencesForm extends ConsumerStatefulWidget {
  const PreferencesForm({
    super.key,
    required this.initial,
    required this.cities,
    required this.female,
    required this.withDealbreakers,
  });

  final PartnerPrefs initial;
  final List<String> cities;
  final bool female;
  final bool withDealbreakers;

  @override
  ConsumerState<PreferencesForm> createState() => _PreferencesFormState();
}

class _PreferencesFormState extends ConsumerState<PreferencesForm> {
  late final _ageMin = TextEditingController(text: widget.initial.ageMin?.toString() ?? '');
  late final _ageMax = TextEditingController(text: widget.initial.ageMax?.toString() ?? '');
  late final _cities = {...widget.initial.cities};
  late final _education = {...widget.initial.education};
  late final _marital = {...widget.initial.maritalStatus};
  late final _religiosity = {...widget.initial.religiosity};
  late final _smoking = {...widget.initial.smoking};
  late String? _yesNo = widget.female ? widget.initial.beard : widget.initial.hijab;
  late String? _children = widget.initial.children;
  // A lock saved earlier on an empty preference (older app versions) shows unticked
  late final _dealbreakers = {...widget.initial.activeDealbreakers(female: widget.female)};
  String? _ageError;
  bool _saving = false;

  bool get _partnerFemale => !widget.female;

  /// The preferences as they are on screen ([min] / [max] from the age fields)
  PartnerPrefs _current({int? min, int? max}) => PartnerPrefs(
        ageMin: min,
        ageMax: max,
        cities: _cities.toList(),
        education: ProfileOptions.education.where(_education.contains).toList(),
        maritalStatus: _marital.toList(),
        religiosity: _religiosity.toList(),
        smoking: _smoking.toList(),
        hijab: widget.female ? null : _yesNo,
        beard: widget.female ? _yesNo : null,
        children: _children,
        dealbreakers: _dealbreakers,
      );

  /// A change to a preference: a «شرط أساسي» whose preference is now empty is unticked with it
  void _change(VoidCallback edit) {
    setState(() {
      edit();
      final now = _current(min: 18, max: 18);
      _dealbreakers.removeWhere((k) => k != 'age' && !now.dealbreakerFilled(k, female: widget.female));
    });
  }

  @override
  void dispose() {
    _ageMin.dispose();
    _ageMax.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final min = int.tryParse(toLatinDigits(_ageMin.text.trim()));
    final max = int.tryParse(toLatinDigits(_ageMax.text.trim()));
    final err = prefAgeError(min, max);
    setState(() => _ageError = err);
    if (err != null) return;
    final prefs = _current(min: min, max: max);
    setState(() => _saving = true);
    // Taken before the request: the saved preferences still refresh if she leaves meanwhile
    // (Crashlytics: ref after dispose)
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      await ref
          .read(profileRepositoryProvider)
          .savePartnerPrefs(prefs, female: widget.female, withDealbreakers: widget.withDealbreakers);
      container.invalidate(partnerPrefsProvider);
      if (mounted) showSnack(context, 'تم حفظ تفضيلاتك');
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// «شرط أساسي» switch next to a preference (only with shared suggestions on, like the web)
  Widget _title(String text, String key, {bool filled = true}) {
    return Padding(
      padding: const EdgeInsets.only(top: 18, bottom: 8),
      child: Row(
        children: [
          Expanded(child: Text(text, style: AppText.body.copyWith(fontWeight: FontWeight.w700))),
          if (widget.withDealbreakers)
            FilterChip(
              key: Key('db-$key'),
              label: const Text('شرط أساسي'),
              avatar: Icon(_dealbreakers.contains(key) ? Icons.lock_rounded : Icons.lock_open_rounded, size: 16),
              selected: _dealbreakers.contains(key),
              showCheckmark: false,
              selectedColor: AppColors.gold.withValues(alpha: 0.22),
              // Pale gold when on: the theme's white picked label would vanish, so navy both ways
              labelStyle: const TextStyle(color: AppColors.navy),
              onSelected: filled || _dealbreakers.contains(key)
                  ? (on) => setState(() => on ? _dealbreakers.add(key) : _dealbreakers.remove(key))
                  : null,
              tooltip: filled ? null : 'يلزم اختيار تفضيل أولاً',
            ),
        ],
      ),
    );
  }

  Widget _multi(List<String> options, Set<String> selected, {String Function(String)? labelOf}) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final o in options)
          FilterChip(
            label: Text(labelOf?.call(o) ?? o),
            selected: selected.contains(o),
            onSelected: (on) => _change(() => on ? selected.add(o) : selected.remove(o)),
          ),
      ],
    );
  }

  Widget _single(String? value, ValueChanged<String?> onPick, {List<String> options = ProfileOptions.yesNo, String? keyPrefix}) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final o in options)
          ChoiceChip(
            key: keyPrefix == null ? null : Key('$keyPrefix-$o'),
            label: Text(o),
            selected: value == o,
            onSelected: (on) => onPick(on ? o : null),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final yesNoKey = widget.female ? 'beard' : 'hijab';
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        InfoBanner(
          icon: Icons.visibility_off_outlined,
          text: widget.withDealbreakers
              ? (widget.female
                  ? 'تفضيلاتك لا يراها أحد وتُحفظ فوراً. ضعي علامة «شرط أساسي» على ما لا تقبلين التنازل عنه: لن نقترح عليكِ من لا يحققه. كثرة الشروط تقلّل الاقتراحات.'
                  : 'تفضيلاتك لا يراها أحد وتُحفظ فوراً. ضع علامة «شرط أساسي» على ما لا تقبل التنازل عنه: لن نقترح عليك من لا يحققه. كثرة الشروط تقلّل الاقتراحات.')
              : 'تفضيلاتك لا يراها أحد وتُحفظ فوراً، وتُستخدم في حساب نسبة التوافق.',
        ),
        _title('العمر المفضل', 'age'),
        Row(
          children: [
            Expanded(
              child: TextField(
                key: const Key('age-min'),
                controller: _ageMin,
                keyboardType: TextInputType.number,
                inputFormatters: [LatinDigitsFormatter()],
                textDirection: TextDirection.ltr,
                decoration: const InputDecoration(labelText: 'العمر الأدنى'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: TextField(
                key: const Key('age-max'),
                controller: _ageMax,
                keyboardType: TextInputType.number,
                inputFormatters: [LatinDigitsFormatter()],
                textDirection: TextDirection.ltr,
                decoration: const InputDecoration(labelText: 'العمر الأقصى'),
              ),
            ),
          ],
        ),
        if (_ageError != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(_ageError!, style: AppText.labelRegular.copyWith(color: AppColors.danger)),
          ),
        _title('المدن المفضلة', 'city', filled: _cities.isNotEmpty),
        _multi(widget.cities, _cities),
        _title('المستوى التعليمي (كل مستوى يشمل ما فوقه)', 'education', filled: _education.isNotEmpty),
        _multi(ProfileOptions.education, _education),
        _title('الحالة الاجتماعية', 'maritalStatus', filled: _marital.isNotEmpty),
        _multi(ProfileOptions.maritalStatus, _marital,
            labelOf: (v) => OptionLabels.describe('maritalStatus', v, female: _partnerFemale)),
        _title(widget.female ? 'هل تفضلين ملتحياً؟' : 'هل تفضل محجبة؟', yesNoKey,
            filled: _yesNo != null && _yesNo != 'لا يهم'),
        _single(_yesNo, (v) => _change(() => _yesNo = v),
            options: widget.female ? ProfileOptions.yesNo : ProfileOptions.prefHijab, keyPrefix: 'pref-$yesNoKey'),
        _title('مستوى التدين', 'religiosity', filled: _religiosity.isNotEmpty),
        _multi(ProfileOptions.religiosity, _religiosity,
            labelOf: (v) => OptionLabels.describe('religiosity', v, female: _partnerFemale)),
        _title('التدخين', 'smokingStatus', filled: _smoking.isNotEmpty),
        _multi(ProfileOptions.smokingStatus, _smoking,
            labelOf: (v) => OptionLabels.describe('smokingStatus', v, female: _partnerFemale)),
        _title('قبول وجود أبناء من زواج سابق', 'children', filled: _children == 'لا'),
        _single(_children, (v) => _change(() => _children = v)),
        const SizedBox(height: 24),
        LoadingButton(key: const Key('save-prefs'), label: 'حفظ التفضيلات', loading: _saving, onPressed: _save),
      ],
    );
  }
}
