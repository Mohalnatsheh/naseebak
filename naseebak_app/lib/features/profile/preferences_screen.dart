import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/localization/digits.dart';
import '../../core/localization/safe_input_formatter.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/json.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/person.dart';
import '../../shared/religion.dart';
import '../../shared/widgets/common.dart';
import '../country_selection/country_providers.dart';
import '../home/counts.dart';
import '../home/gendered_copy.dart';
import '../onboarding/profile_options.dart';
import 'profile_repository.dart';

const prefAgeLimit = 70;

/// The web's age-range rule for preferences: both ends 18–70, min ≤ max.
String? prefAgeError(int? min, int? max) {
  if (min == null || max == null) return 'يُرجى تحديد العمر الأدنى والأقصى';
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
    final code = me?.country.code ?? 'JO';
    final details = ref.watch(countryDetailsProvider(code));
    // «الديانة» needs my stored religion, so `/api/profile` is waited for when the server sends the religion lists
    // (fail closed: never show a Christian the Muslim-only questions). With sect options only (Lebanon, switch off)
    // or a profile already cached, the stored religion is read too, but a failure then never blanks the screen.
    // With neither, the form builds as before and no request is made.
    final religionOptions = details.valueOrNull?.lists.option('prefReligion') ?? const <String>[];
    final sectOptions = details.valueOrNull?.lists.option('prefSect') ?? const <String>[];
    final religionAsked = religionOptions.isNotEmpty;
    final readMine = religionAsked || sectOptions.isNotEmpty || ref.exists(myProfileProvider);
    final mine = readMine ? ref.watch(myProfileProvider) : null;
    final mineRequired = religionAsked ? mine : null;
    Widget body;
    if (prefs.hasError || counts.hasError || details.hasError || (mineRequired?.hasError ?? false)) {
      body = ErrorView(
        error: prefs.error ?? counts.error ?? details.error ?? mineRequired!.error!,
        onRetry: () {
          ref.invalidate(partnerPrefsProvider);
          ref.invalidate(myProfileProvider);
          ref.invalidate(countsProvider);
          ref.invalidate(countryDetailsProvider(code));
        },
      );
    } else if (!prefs.hasValue || !counts.hasValue || !details.hasValue || (mine != null && mine.isLoading && !mine.hasValue)) {
      body = const SkeletonList(count: 5, itemHeight: 70);
    } else {
      final profile = mine?.valueOrNull;
      body = PreferencesForm(
        initial: prefs.requireValue,
        cities: details.requireValue.lists.cities,
        female: me?.isFemale ?? false,
        withDealbreakers: counts.requireValue.flags.mutualSuggestions,
        sectOptions: sectOptions,
        religionOptions: religionOptions,
        religion: asString(profile?.field('religion')),
        initialPrefReligion: asString(profile?.field('prefReligion')),
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
    this.sectOptions = const [],
    this.religionOptions = const [],
    this.religion,
    this.initialPrefReligion,
  });

  final PartnerPrefs initial;
  final List<String> cities;
  final bool female;
  final bool withDealbreakers;

  /// «المذهب» choices (`options.prefSect` of the member's country, Lebanon only); empty = not asked
  final List<String> sectOptions;

  /// «الديانة لدى الشريك» choices (`options.prefReligion`); empty = not asked, not sent
  final List<String> religionOptions;

  /// My STORED religion (a pending change doesn't count): a Christian has no hijab / beard / sect questions
  final String? religion;
  final String? initialPrefReligion;

  @override
  ConsumerState<PreferencesForm> createState() => _PreferencesFormState();
}

class _PreferencesFormState extends ConsumerState<PreferencesForm> {
  // Only her beard / his hijab preference is kept (as before)
  late PartnerPrefs _prefs = widget.initial.copyWith(
    hijab: widget.female ? null : widget.initial.hijab,
    beard: widget.female ? widget.initial.beard : null,
    clearHijab: widget.female,
    clearBeard: !widget.female,
  );
  // A lock saved earlier on an empty preference (older app versions) shows unticked
  late final _dealbreakers = {...widget.initial.activeDealbreakers(female: widget.female, christian: _christian)};
  late String _prefReligion = widget.initialPrefReligion ?? widget.initial.prefReligion ?? prefReligionSame;
  String? _ageError;
  bool _saving = false;

  bool get _christian => isChristian(widget.religion);
  bool get _religionAsked => widget.religionOptions.isNotEmpty;

  /// The preferences as they are on screen, with the ticked locks
  PartnerPrefs get _current => _prefs.copyWith(
        education: ProfileOptions.education.where(_prefs.education.contains).toList(),
        sect: widget.sectOptions.where(_prefs.sect.contains).toList(),
        dealbreakers: _dealbreakers,
        prefReligion: _prefReligion,
      );

  /// A change to a preference: a «شرط أساسي» whose preference is now empty is unticked with it
  void _change(PartnerPrefs next) {
    setState(() {
      _prefs = next;
      _dealbreakers.removeWhere((k) => k != 'age' && !next.dealbreakerFilled(k, female: widget.female));
    });
  }

  Future<void> _save() async {
    final err = prefAgeError(_prefs.ageMin, _prefs.ageMax);
    setState(() => _ageError = err);
    if (err != null) return;
    final prefs = _current;
    setState(() => _saving = true);
    // Taken before the request: the saved preferences still refresh if she leaves meanwhile
    // (Crashlytics: ref after dispose)
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      await ref
          .read(profileRepositoryProvider)
          .savePartnerPrefs(
            prefs,
            female: widget.female,
            withDealbreakers: widget.withDealbreakers,
            withSect: widget.sectOptions.isNotEmpty,
            withReligion: _religionAsked,
            christian: _christian,
          );
      container.invalidate(partnerPrefsProvider);
      // The form's «الديانة لدى الشريك» is seeded from my profile: reopening must not show the old answer
      if (_religionAsked) container.invalidate(myProfileProvider);
      if (mounted) showSnack(context, 'تم حفظ تفضيلاتك');
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
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
        // Spliced into the list (not one long item), so the list stays lazy and scrolls to each question as before
        ...PartnerPrefsFields(
          value: _current,
          onChanged: _change,
          cities: widget.cities,
          female: widget.female,
          christian: _christian,
          sectOptions: widget.sectOptions,
          religionOptions: widget.religionOptions,
          prefReligion: _prefReligion,
          onPrefReligion: (v) => setState(() {
            if (v != null) _prefReligion = v;
          }),
          ageError: _ageError,
          // «شرط أساسي» next to each preference (only with shared suggestions on, like the web)
          lockFor: widget.withDealbreakers
              ? (key, filled) => DealbreakerLock(
                    lockKey: key,
                    on: _dealbreakers.contains(key),
                    onChanged: filled || _dealbreakers.contains(key)
                        ? (on) => setState(() => on ? _dealbreakers.add(key) : _dealbreakers.remove(key))
                        : null,
                    tooltip: filled ? null : 'يلزم اختيار تفضيل أولاً',
                  )
              : null,
        ).fields(),
        const SizedBox(height: 24),
        LoadingButton(key: const Key('save-prefs'), label: 'حفظ التفضيلات', loading: _saving, onPressed: _save),
      ],
    );
  }
}

extension PartnerPrefsCopy on PartnerPrefs {
  /// A copy with the given fields replaced ([clearHijab] / [clearBeard] / [clearChildren] / [clearAgeMin] /
  /// [clearAgeMax] set them to null).
  PartnerPrefs copyWith({
    int? ageMin,
    int? ageMax,
    List<String>? cities,
    List<String>? education,
    List<String>? maritalStatus,
    List<String>? religiosity,
    List<String>? sect,
    List<String>? smoking,
    String? hijab,
    String? beard,
    String? children,
    Set<String>? dealbreakers,
    String? prefReligion,
    bool clearAgeMin = false,
    bool clearAgeMax = false,
    bool clearHijab = false,
    bool clearBeard = false,
    bool clearChildren = false,
  }) =>
      PartnerPrefs(
        ageMin: clearAgeMin ? null : ageMin ?? this.ageMin,
        ageMax: clearAgeMax ? null : ageMax ?? this.ageMax,
        cities: cities ?? this.cities,
        education: education ?? this.education,
        maritalStatus: maritalStatus ?? this.maritalStatus,
        religiosity: religiosity ?? this.religiosity,
        sect: sect ?? this.sect,
        smoking: smoking ?? this.smoking,
        hijab: clearHijab ? null : hijab ?? this.hijab,
        beard: clearBeard ? null : beard ?? this.beard,
        children: clearChildren ? null : children ?? this.children,
        dealbreakers: dealbreakers ?? this.dealbreakers,
        prefReligion: prefReligion ?? this.prefReligion,
      );
}

/// The «شرط أساسي» lock chip (pale gold when on, navy label both ways).
class DealbreakerLock extends StatelessWidget {
  const DealbreakerLock({super.key, required this.lockKey, required this.on, required this.onChanged, this.tooltip});

  final String lockKey;
  final bool on;
  final ValueChanged<bool>? onChanged;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    return FilterChip(
      key: Key('db-$lockKey'),
      label: const Text('شرط أساسي'),
      avatar: Icon(on ? Icons.lock_rounded : Icons.lock_open_rounded, size: 16),
      selected: on,
      showCheckmark: false,
      selectedColor: AppColors.gold.withValues(alpha: 0.22),
      // Pale gold when on: the theme's white picked label would vanish, so navy both ways
      labelStyle: const TextStyle(color: AppColors.navy),
      onSelected: onChanged,
      tooltip: tooltip,
    );
  }
}

/// The partner-preference questions of «تفضيلات الشريك» (and setup's «من تبحث عنه»): «الديانة لدى الشريك» (when the
/// server sends its list), the age range, then the rest. No save button; «شرط أساسي» locks only through [lockFor].
class PartnerPrefsFields extends StatelessWidget {
  const PartnerPrefsFields({
    super.key,
    required this.value,
    required this.onChanged,
    required this.cities,
    required this.female,
    required this.christian,
    this.sectOptions = const [],
    this.religionOptions = const [],
    this.prefReligion,
    this.onPrefReligion,
    this.ageError,
    this.lockFor,
  });

  final PartnerPrefs value;
  final ValueChanged<PartnerPrefs> onChanged;
  final List<String> cities;

  /// The member is a woman (her preference is on his beard, his on her hijab)
  final bool female;

  /// The member is a Christian: no hijab / beard / sect question
  final bool christian;

  /// «المذهب» choices (Lebanon only); empty = not asked
  final List<String> sectOptions;

  /// «الديانة لدى الشريك» choices; empty = not asked
  final List<String> religionOptions;
  final String? prefReligion;
  final ValueChanged<String?>? onPrefReligion;

  /// Shown under the age range
  final String? ageError;

  /// The «شرط أساسي» lock next to a question ([filled]: its preference is filled in); null = no locks
  final Widget Function(String key, bool filled)? lockFor;

  bool get _partnerFemale => !female;

  Widget _title(String text, String key, {bool filled = true}) {
    return Padding(
      padding: const EdgeInsets.only(top: 18, bottom: 8),
      child: Row(
        children: [
          Expanded(child: Text(text, style: AppText.body.copyWith(fontWeight: FontWeight.w700))),
          if (lockFor != null) lockFor!(key, filled),
        ],
      ),
    );
  }

  /// Multi choice; a pick is added at the end, an unpick removed (the stored order is kept)
  Widget _multi(List<String> options, List<String> selected, ValueChanged<List<String>> onPick,
      {String Function(String)? labelOf}) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final o in options)
          FilterChip(
            label: Text(labelOf?.call(o) ?? o),
            selected: selected.contains(o),
            onSelected: (on) => onPick(on
                ? [...selected.where((s) => s != o), o]
                : [for (final s in selected) if (s != o) s]),
          ),
      ],
    );
  }

  Widget _single(String? current, ValueChanged<String?> onPick,
      {List<String> options = ProfileOptions.yesNo, String? keyPrefix}) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final o in options)
          ChoiceChip(
            key: keyPrefix == null ? null : Key('$keyPrefix-$o'),
            label: Text(o),
            selected: current == o,
            onSelected: (on) => onPick(on ? o : null),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: fields());

  /// The questions as a flat list, for a host that lays them out in its own [ListView]
  List<Widget> fields() {
    final yesNoKey = female ? 'beard' : 'hijab';
    final yesNo = female ? value.beard : value.hijab;
    return [
      if (religionOptions.isNotEmpty) ...[
        Padding(
          padding: const EdgeInsets.only(top: 18, bottom: 8),
          child: Text('الديانة لدى الشريك', style: AppText.body.copyWith(fontWeight: FontWeight.w700)),
        ),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final o in religionOptions)
              ChoiceChip(
                key: Key('pref-religion-$o'),
                label: Text(o),
                selected: prefReligion == o,
                onSelected: (on) {
                  if (on) onPrefReligion?.call(o);
                },
              ),
          ],
        ),
        for (final line in prefReligionHints(
          christian ? religionChristian : religionMuslim,
          prefReligion,
          value.activeDealbreakers(female: female, christian: christian),
        ))
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(line, style: AppText.labelRegular.copyWith(color: AppColors.muted)),
          ),
      ],
      _title('العمر المفضل', 'age'),
      _AgeRange(
        min: value.ageMin,
        max: value.ageMax,
        onChanged: (min, max) =>
            onChanged(value.copyWith(ageMin: min, ageMax: max, clearAgeMin: min == null, clearAgeMax: max == null)),
      ),
      if (ageError != null)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(ageError!, style: AppText.labelRegular.copyWith(color: AppColors.danger)),
        ),
      _title('المدن المفضلة', 'city', filled: value.cities.isNotEmpty),
      _multi(cities, value.cities, (v) => onChanged(value.copyWith(cities: v))),
      _title('المستوى التعليمي (كل مستوى يشمل ما فوقه)', 'education', filled: value.education.isNotEmpty),
      _multi(ProfileOptions.education, value.education, (v) => onChanged(value.copyWith(education: v))),
      _title('الحالة الاجتماعية', 'maritalStatus', filled: value.maritalStatus.isNotEmpty),
      _multi(ProfileOptions.maritalStatus, value.maritalStatus, (v) => onChanged(value.copyWith(maritalStatus: v)),
          labelOf: (v) => OptionLabels.describe('maritalStatus', v, female: _partnerFemale)),
      if (!christian) ...[
        _title(female ? 'هل تفضلين ملتحياً؟' : 'هل تفضل محجبة؟', yesNoKey, filled: yesNo != null && yesNo != 'لا يهم'),
        _single(
          yesNo,
          (v) => onChanged(female
              ? value.copyWith(beard: v, clearBeard: v == null)
              : value.copyWith(hijab: v, clearHijab: v == null)),
          options: female ? ProfileOptions.yesNo : ProfileOptions.prefHijab,
          keyPrefix: 'pref-$yesNoKey',
        ),
      ],
      _title('مستوى التدين', 'religiosity', filled: value.religiosity.isNotEmpty),
      _multi(ProfileOptions.religiosity, value.religiosity, (v) => onChanged(value.copyWith(religiosity: v)),
          labelOf: (v) => OptionLabels.describe('religiosity', v, female: _partnerFemale)),
      if (sectOptions.isNotEmpty && !christian) ...[
        _title('المذهب', 'sect', filled: value.sect.isNotEmpty),
        _multi(sectOptions, value.sect, (v) => onChanged(value.copyWith(sect: v)),
            labelOf: (v) => OptionLabels.describe('sect', v, female: _partnerFemale)),
      ],
      _title('التدخين', 'smokingStatus', filled: value.smoking.isNotEmpty),
      _multi(ProfileOptions.smokingStatus, value.smoking, (v) => onChanged(value.copyWith(smoking: v)),
          labelOf: (v) => OptionLabels.describe('smokingStatus', v, female: _partnerFemale)),
      _title('قبول وجود أبناء من زواج سابق', 'children', filled: value.children == 'لا'),
      _single(value.children, (v) => onChanged(value.copyWith(children: v, clearChildren: v == null))),
    ];
  }
}

/// «العمر الأدنى» / «العمر الأقصى»: the typed text is kept here, the parsed ages reported (null when empty).
class _AgeRange extends StatefulWidget {
  const _AgeRange({required this.min, required this.max, required this.onChanged});

  final int? min;
  final int? max;
  final void Function(int? min, int? max) onChanged;

  @override
  State<_AgeRange> createState() => _AgeRangeState();
}

class _AgeRangeState extends State<_AgeRange> {
  late final _min = TextEditingController(text: widget.min?.toString() ?? '');
  late final _max = TextEditingController(text: widget.max?.toString() ?? '');

  int? _parse(TextEditingController c) => int.tryParse(toLatinDigits(c.text.trim()));

  void _report(String _) => widget.onChanged(_parse(_min), _parse(_max));

  @override
  void dispose() {
    _min.dispose();
    _max.dispose();
    super.dispose();
  }

  Widget _field(String key, TextEditingController c, String label) => TextField(
        key: Key(key),
        controller: c,
        keyboardType: TextInputType.number,
        inputFormatters: [LatinDigitsFormatter()],
        textDirection: TextDirection.ltr,
        // The number pad has no «تم» on iPhone
        onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
        onChanged: _report,
        decoration: InputDecoration(labelText: label),
      );

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: _field('age-min', _min, 'العمر الأدنى')),
        const SizedBox(width: 12),
        Expanded(child: _field('age-max', _max, 'العمر الأقصى')),
      ],
    );
  }
}

/// Setup's «شروط أساسية»: one row per filled preference that can be a «شرط أساسي», with its lock. Nothing filled:
/// a line saying the step can be skipped.
class DealbreakerToggles extends StatelessWidget {
  const DealbreakerToggles({
    super.key,
    required this.value,
    required this.selected,
    required this.onChanged,
    required this.female,
    required this.christian,
  });

  final PartnerPrefs value;
  final Set<String> selected;
  final ValueChanged<Set<String>> onChanged;
  final bool female;
  final bool christian;

  bool get _partnerFemale => !female;

  /// The keys shown, in the website's order
  List<String> get _keys => [
        for (final k in ProfileOptions.dealbreakerKeys)
          if (value.dealbreakerFilled(k, female: female) && !(christian && muslimOnlyDealbreakers.contains(k))) k,
      ];

  String _title(String key) => switch (key) {
        'age' => 'العمر المفضل',
        'city' => 'المدن المفضلة',
        'education' => 'المستوى التعليمي',
        'maritalStatus' => 'الحالة الاجتماعية',
        'religiosity' => 'مستوى التدين',
        'sect' => 'المذهب',
        'smokingStatus' => 'التدخين',
        'hijab' => 'الحجاب',
        'beard' => 'اللحية',
        'children' => 'أبناء من زواج سابق',
        _ => key,
      };

  String _list(String field, List<String> values) =>
      values.map((v) => OptionLabels.describe(field, v, female: _partnerFemale)).join('، ');

  String _summary(String key) => switch (key) {
        'age' => [
            if (value.ageMin != null) 'من ${value.ageMin}',
            if (value.ageMax != null) 'إلى ${value.ageMax}',
          ].join(' '),
        'city' => value.cities.join('، '),
        'education' => value.education.join('، '),
        'maritalStatus' => _list('maritalStatus', value.maritalStatus),
        'religiosity' => _list('religiosity', value.religiosity),
        'sect' => _list('sect', value.sect),
        'smokingStatus' => _list('smokingStatus', value.smoking),
        'hijab' => switch (value.hijab) {
            'نعم' => 'محجبة',
            ProfileOptions.niqab => 'منتقبة',
            _ => 'غير محجبة',
          },
        'beard' => value.beard == 'نعم' ? 'ملتحٍ' : 'غير ملتحٍ',
        'children' => 'بلا أبناء من زواج سابق',
        _ => '',
      };

  @override
  Widget build(BuildContext context) {
    final keys = _keys;
    if (keys.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Text(
          forViewer(female, 'لم تحدّد تفضيلات بعد، يمكنك المتابعة.', 'لم تحدّدي تفضيلات بعد، يمكنكِ المتابعة.'),
          style: AppText.body.copyWith(color: AppColors.muted),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          forViewer(female, 'لن نقترح عليك من لا يحققه', 'لن نقترح عليكِ من لا يحققه'),
          style: AppText.labelRegular.copyWith(color: AppColors.muted),
        ),
        for (final k in keys)
          Padding(
            padding: const EdgeInsets.only(top: 14),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_title(k), style: AppText.body.copyWith(fontWeight: FontWeight.w700)),
                      if (_summary(k).isNotEmpty)
                        Text(_summary(k), style: AppText.labelRegular.copyWith(color: AppColors.muted)),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                DealbreakerLock(
                  lockKey: k,
                  on: selected.contains(k),
                  onChanged: (on) => onChanged(on ? {...selected, k} : ({...selected}..remove(k))),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
