import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/analytics/analytics.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/localization/digits.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/json.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/religion.dart';
import '../../shared/widgets/common.dart';
import '../auth/pending_auth.dart';
import '../auth/logout_button.dart';
import '../auth/phone_validation.dart';
import '../country_selection/country.dart';
import '../country_selection/country_providers.dart';
import '../home/counts.dart';
import '../home/gendered_copy.dart';
import '../auth/me.dart';
import '../profile/guardian_form.dart';
import '../profile/preferences_screen.dart';
import '../profile/profile_edit_plan.dart';
import '../profile/profile_field_control.dart';
import '../profile/profile_repository.dart';
import '../referral/referral_screen.dart' show cleanReferralCode;
import 'profile_options.dart';
import 'setup_steps.dart';

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

/// The sign-up setup: every profile field in the website's 7 steps (6 without «شروط أساسية», where the server has no
/// shared suggestions), mirroring `short-setup.tsx` and `setup-steps.ts` through [setupSteps]. Each finished step is
/// saved as a draft; the last one saves everything with `PUT /api/profile`. It opens on the first step with a required
/// answer missing. Legacy mode (intro requests off) also needs the guardian before the profile counts as complete,
/// so a last guardian step follows, as before.
class SetupScreen extends ConsumerStatefulWidget {
  const SetupScreen({super.key});

  @override
  ConsumerState<SetupScreen> createState() => _SetupScreenState();
}

/// Text and number answers (each owns a controller)
final _textKeys = {...profileShortTexts, ...profileLongTexts, ...profileNumberLimits.keys};

/// Choices the server may not send on an older version: today's fixed lists stand in
const _fallbackOptions = <String, List<String>>{
  'education': ProfileOptions.education,
  'maritalStatus': ProfileOptions.maritalStatus,
  'religiosity': ProfileOptions.religiosity,
  'smokingStatus': ProfileOptions.smokingStatus,
};

/// Field labels said in the feminine («… مطلوبة»)
const _femLabels = {
  'nationality', 'city', 'religion', 'maritalStatus', 'job', 'beard', 'cookingAbility', 'drivingLicense',
  'monthlyExpenses',
};

/// Stored as free text: an emptied answer is sent as "" so the server clears it too
const _clearableTexts = {'area', 'prefHijab', 'prefBeard', 'prefChildrenAcceptance'};

class _SetupScreenState extends ConsumerState<SetupScreen> {
  int _step = 0;

  /// Own answers as the controls set them (choices, yes / no, the birth date as `YYYY-MM-DD`)
  final Map<String, Object?> _v = {};
  final _text = <String, TextEditingController>{for (final k in _textKeys) k: TextEditingController()};

  /// The «أخرى» job text
  final _jobCustom = TextEditingController();

  /// Step 6 and its «شروط أساسية»
  PartnerPrefs _prefs = const PartnerPrefs();
  String? _prefReligion;
  Set<String> _ticked = {};

  /// What the server held when the setup opened (an emptied answer is cleared there too)
  Map<String, Object?> _stored = const {};

  // Set on every build (the switches and lists may refresh)
  List<SetupStep> _steps = setupSteps(dealbreakers: true);
  CountryLists _lists = CountryLists.empty;
  bool _female = false;

  final _guardian = GuardianFields();
  Map<String, String?> _errors = {};

  /// One anchor per question, to bring the first error into view
  final _anchors = <String, GlobalKey>{};

  /// This step was checked and had errors: from then on the errors follow the answers, so an answered question
  /// loses its error at once instead of at the next «التالي»
  bool _checked = false;
  String? _error;
  bool _saving = false;
  bool _prefilled = false;

  /// The profile was saved but `/api/mobile/me` couldn't be read after it (weak connection): the next tap only reads
  /// `me` again (the router leaves the setup once it says complete), it never saves a second time. Only while the
  /// answers are the ones saved: «السابق» or any changed answer saves again (review I-3)
  bool _savedAwaitingMe = false;

  /// The answers as they were saved when [_savedAwaitingMe] was set
  String? _savedAnswers;

  /// Shown when the save went through but the app couldn't move on
  static const savedButStuckMessage = 'تم الحفظ، لكن تعذّر المتابعة. يُرجى المحاولة مرة أخرى.';

  /// Shown when the save went through and `me` was read, but the server still counts the profile incomplete (a rule
  /// the app doesn't know yet): the next tap saves again
  static const savedIncompleteMessage = 'تم الحفظ، لكن الملف لم يكتمل بعد. يُرجى مراجعة الإجابات ثم المحاولة مرة أخرى.';

  /// Everything the setup sends, to tell whether an answer changed since the save
  String _answers() => [
        _payload().toString(),
        _guardian.name.text,
        _guardian.phone.text,
        _guardian.address.text,
        _guardian.relationship,
        _guardian.consent,
      ].join('|');

  void _clearSavedAwaitingMe() {
    _savedAwaitingMe = false;
    _savedAnswers = null;
  }

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
    for (final c in _text.values) {
      c.dispose();
    }
    _jobCustom.dispose();
    _guardian.dispose();
    super.dispose();
  }

  // ---- the answers ----

  SetupCtx get _ctx => SetupCtx(
        female: _female,
        religionAsked: _lists.option('religion').isNotEmpty,
        sectAsked: _lists.option('sect').isNotEmpty,
        areas: _lists.areas,
      );

  bool get _christian => isChristian(_v['religion']);

  /// The job as it would be saved: the «أخرى» text when that chip stands, «أخرى» itself while the text is empty
  String? get _job {
    final j = asString(_v['job']);
    if (!jobIsOther(j, _lists.option('job'))) return j;
    final custom = _jobCustom.text.trim();
    return custom.isEmpty ? profileJobOther : custom;
  }

  /// Step 6 as stored values
  Map<String, Object?> get _prefValues => {
        'prefReligion': _prefReligion,
        'prefAgeMin': _prefs.ageMin,
        'prefAgeMax': _prefs.ageMax,
        'prefCity': _prefs.cities,
        'prefEducation': ProfileOptions.education.where(_prefs.education.contains).toList(),
        'prefMaritalStatus': _prefs.maritalStatus,
        'prefHijab': _prefs.hijab,
        'prefBeard': _prefs.beard,
        'prefReligiosity': _prefs.religiosity,
        'prefSect': _lists.option('prefSect').where(_prefs.sect.contains).toList(),
        'prefSmokingStatus': _prefs.smoking,
        'prefChildrenAcceptance': _prefs.children,
      };

  /// Every answer as stored values (numbers parsed, null when empty or not a number)
  Map<String, Object?> get _values {
    final out = <String, Object?>{..._v};
    for (final e in _text.entries) {
      final t = e.value.text.trim();
      out[e.key] = profileNumberLimits.containsKey(e.key) ? int.tryParse(toLatinDigits(t)) : t;
    }
    out['job'] = _job;
    out.addAll(_prefValues);
    return out;
  }

  /// A question whose choices the server didn't send can't be answered: it isn't asked (older servers)
  bool _answerable(String key) => switch (key) {
        'nationality' => _lists.nationalities(female: _female).isNotEmpty || asString(_v['nationality']) != null,
        'city' => _lists.cities.isNotEmpty,
        'incomeRange' => _lists.incomeRanges.isNotEmpty,
        'monthlyExpenses' => _lists.expenseRanges.isNotEmpty,
        'religion' || 'religiosity' || 'sect' || 'education' || 'maritalStatus' || 'job' || 'skinColor' ||
        'smokingStatus' || 'cookingAbility' || 'lifestyle' || 'housingType' =>
          _lists.option(key).isNotEmpty,
        _ => true,
      };

  /// The step's questions shown now; the children count once a marital status is chosen (as the website)
  List<String> _shownKeys(SetupStep s, Map<String, Object?> values) => [
        for (final k in s.fieldKeys)
          if (setupShown(k, values, _ctx) && _answerable(k) && (k != 'childrenCount' || values['maritalStatus'] != null))
            k,
      ];

  /// [missingOnStep], limited to the questions this server lets the member answer
  List<String> _missing(SetupStep s, Map<String, Object?> values) {
    final shown = _shownKeys(s, values).toSet();
    return [for (final k in missingOnStep(s, values, _ctx)) if (shown.contains(k) || k.startsWith('pref')) k];
  }

  /// The first step with a required answer missing (the website's `firstIncompleteStep`); the last when none
  int _firstIncomplete(Map<String, Object?> values) {
    final i = _steps.indexWhere((s) => _missing(s, values).isNotEmpty);
    return i == -1 ? _steps.length - 1 : i;
  }

  String _label(String key) => key == 'tribe' ? _lists.tribeLabel : (profileFieldLabels[key] ?? key);

  String _requiredMessage(String key) => '${_label(key)} ${_femLabels.contains(key) ? 'مطلوبة' : 'مطلوب'}';

  /// A wrong answer (not a missing one): the birth date's age, a number out of range
  String? _issue(String key, Map<String, Object?> values) {
    if (key == 'dateOfBirth') return dateOfBirthError(DateTime.tryParse(asString(values['dateOfBirth']) ?? ''));
    final range = profileNumberLimits[key];
    if (range == null) return null;
    final raw = _text[key]!.text.trim();
    if (raw.isEmpty) return null;
    final n = int.tryParse(toLatinDigits(raw));
    if (n == null || n < range.$1 || n > range.$2) return '${_label(key)} يجب أن يكون بين ${range.$1} و ${range.$2}';
    return null;
  }

  /// One question's stored keys and values
  Map<String, Object?> _entries(String key, Map<String, Object?> values) => switch (key) {
        // A city without areas clears the stored area (the website's `handleCityChange`)
        'city' => {'city': values['city'], 'area': setupShown('area', values, _ctx) ? values['area'] : null},
        'hijab' => {'hijab': values['hijab'], 'niqab': values['niqab']},
        'job' => {'job': values['job'] == profileJobOther ? null : values['job']},
        _ => {key: values[key]},
      };

  /// The answers of step [only] (a draft), or of every step plus the «شروط أساسية» (the final save). Empty answers
  /// are left out (the server keeps what it has), except a list or text the member emptied: sent empty so the server
  /// clears it too. No religion keys without the server's religion list; nothing Muslim-only for a Christian.
  Map<String, Object?> _payload({int? only}) {
    final values = _values;
    final out = <String, Object?>{};
    void put(String key, Object? raw) {
      final v = raw is String ? raw.trim() : raw;
      if (!isEmptyStored(v)) {
        out[key] = v;
      } else if (!isEmptyStored(_stored[key]) &&
          (v is List || profileShortTexts.contains(key) || profileLongTexts.contains(key) || _clearableTexts.contains(key))) {
        // Numbers are never sent empty: the server takes only a number (an emptied one stays as stored)
        out[key] = v is List ? <String>[] : '';
      }
    }

    for (final (i, s) in _steps.indexed) {
      if ((only != null && i != only) || s.id == SetupStepId.musts) continue;
      for (final key in _shownKeys(s, values)) {
        _entries(key, values).forEach(put);
      }
      if (s.fieldKeys.contains('maritalStatus') && values['maritalStatus'] == ProfileOptions.single) {
        out['childrenCount'] = 0;
      }
    }
    if (only == null && _steps.any((s) => s.id == SetupStepId.musts)) {
      out['dealbreakers'] = _prefs.copyWith(dealbreakers: _ticked).activeDealbreakers(female: _female, christian: _christian);
    }
    if (!_ctx.religionAsked) {
      out
        ..remove('religion')
        ..remove('prefReligion');
    }
    return withoutMuslimOnly(values['religion'], out);
  }

  /// Fill from what the server holds (a draft from the website or an earlier run) and open on the first step with
  /// something missing
  void _prefill(MyProfile p, Me? me) {
    _prefilled = true;
    final stored = <String, Object?>{...?p.profile};
    _stored = stored;
    for (final s in _steps) {
      for (final k in s.fieldKeys) {
        if (k.startsWith('pref') || _textKeys.contains(k)) continue;
        _v[k] = k == 'dateOfBirth' ? dayOf(stored[k]) : stored[k];
      }
    }
    _v['area'] = stored['area'];
    _v['niqab'] = stored['niqab'];
    for (final k in _textKeys) {
      final v = stored[k];
      // A single member's stored 0 children isn't shown as typed
      final hidden = k == 'childrenCount' && stored['maritalStatus'] == ProfileOptions.single;
      _text[k]!.text = v == null || hidden ? '' : '$v';
    }
    final job = asString(_v['job']);
    if (job != profileJobOther && jobIsOther(job, _lists.option('job'))) _jobCustom.text = job!;
    final prefs = PartnerPrefs.fromJson(<String, dynamic>{...stored});
    // Only her beard / his hijab preference is kept (as «تفضيلات الشريك»)
    _prefs = prefs.copyWith(clearHijab: _female, clearBeard: !_female);
    _ticked = {...prefs.dealbreakers};
    _prefReligion = asString(stored['prefReligion']);
    _v['nationality'] ??= _female ? me?.country.nationalityFemale : me?.country.nationalityMale;
    if (_lists.option('prefReligion').isNotEmpty) _prefReligion ??= prefReligionSame;
    _step = _firstIncomplete(_values);
  }

  bool _guardianStep(Counts? counts) => counts != null && !counts.flags.introRequests;

  Map<String, String?> _validate(int step) {
    final e = <String, String?>{};
    if (step >= _steps.length) {
      final country = ref.read(authControllerProvider).me?.country;
      e.addAll(validateGuardian(_guardian));
      if (country != null) {
        final pe = validatePhone(_guardian.phone.text, country);
        if (pe != null) e['parentPhone'] = pe;
      }
    } else {
      final s = _steps[step];
      final values = _values;
      if (s.id == SetupStepId.looking) {
        e['age'] = prefAgeError(_prefs.ageMin, _prefs.ageMax);
      } else if (s.id != SetupStepId.musts) {
        final missing = _missing(s, values).toSet();
        for (final k in _shownKeys(s, values)) {
          e[k] = _issue(k, values) ?? (missing.contains(k) ? _requiredMessage(k) : null);
        }
      }
    }
    e.removeWhere((_, v) => v == null);
    return e;
  }

  Future<void> _next(int total, bool guardianStep) async {
    // An answer changed since the save: save again, the change must reach the server
    if (_savedAwaitingMe && _answers() != _savedAnswers) _clearSavedAwaitingMe();
    if (_savedAwaitingMe) return _readMeAgain();
    final errors = _validate(_step);
    setState(() {
      _errors = errors;
      _checked = errors.isNotEmpty;
      _error = null;
    });
    if (errors.isNotEmpty) {
      _showFirstError(errors.keys.first);
      return;
    }
    // The final save checks every earlier step too (the website's `finish()`): a stored answer an earlier step
    // refuses (a website draft, say) opens that step with its errors instead of being sent
    if (_step == total - 1) {
      for (var i = 0; i < _step; i++) {
        final earlier = _validate(i);
        if (earlier.isEmpty) continue;
        setState(() {
          _clearSavedAwaitingMe();
          _step = i;
          _errors = earlier;
          _checked = true;
        });
        _showFirstError(earlier.keys.first);
        return;
      }
    }
    ref.read(analyticsProvider).setupStep(_step + 1);
    if (_step < total - 1) {
      _saveDraft(_step);
      setState(() {
        _step++;
        _checked = false;
        _errors = {};
      });
      return;
    }
    await _submit(guardianStep);
  }

  /// Brings the first question with an error into view (after the errors are drawn)
  void _showFirstError(String key) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final target = _anchors[key]?.currentContext;
      if (target != null && target.mounted) {
        Scrollable.ensureVisible(target, alignment: 0.2, duration: const Duration(milliseconds: 250));
      }
    });
  }

  /// The answers of a finished step, saved as a draft like the website does (`PATCH /api/profile/draft`): closing the
  /// app mid-setup loses nothing. Best effort: the final save sends everything again.
  void _saveDraft(int step) {
    if (step >= _steps.length) return;
    final body = _payload(only: step);
    if (body.isEmpty) return;
    ref.read(apiClientProvider).patch('/api/profile/draft', body: body).catchError((Object e) {
      debugPrint('[setup] draft not saved: $e');
      return <String, dynamic>{};
    });
  }

  /// Where earlier app versions remembered the step on this phone (no longer read: the setup opens on the first step
  /// with something missing); removed once the setup is done
  String? get _stepKey {
    final id = ref.read(authControllerProvider).me?.id;
    return id == null ? null : 'setup_step_$id';
  }

  Future<void> _submit(bool guardianStep) async {
    if (_saving) return;
    setState(() => _saving = true);
    final repo = ref.read(profileRepositoryProvider);
    // Used after the requests: still valid if the screen closed meanwhile (Crashlytics: ref after dispose)
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      if (guardianStep) {
        final country = ref.read(authControllerProvider).me!.country;
        await repo.saveGuardian(
          name: _guardian.name.text,
          phone: _guardian.phoneToSend(country),
          relationship: _guardian.relationship!,
          address: _guardian.address.text,
          shareConsent: _guardian.consent,
        );
      }
      await repo.save(Map<String, dynamic>.from(_payload()));
      final key = _stepKey;
      if (key != null) await container.read(sharedPreferencesProvider).remove(key);
      container.read(analyticsProvider).setupCompleted();
      container.invalidate(countsProvider);
      // The profile loaded at the start of the setup is stale now. The home card keeps the provider
      // alive, so without this «تعديل ملفي» showed the saved fields as empty until a restart.
      container.invalidate(myProfileProvider);
      // The router leaves the setup once `/api/mobile/me` says the profile is complete
      final read = await container.read(authControllerProvider.notifier).refreshMe();
      if (mounted && container.read(authControllerProvider).me?.profileComplete != true) {
        setState(() {
          if (read) {
            // `me` was read and still says incomplete: a plain error, and the next tap saves again
            _clearSavedAwaitingMe();
            _error = savedIncompleteMessage;
          } else {
            // Saved, but `me` couldn't be read (the spinner just stopped before): say so, and only re-read it next
            // time
            _savedAwaitingMe = true;
            _savedAnswers = _answers();
            _error = savedButStuckMessage;
          }
        });
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.code == 'GUARDIAN_REQUIRED' && !guardianStep) {
        // The guardian became required meanwhile: reload the switches so the guardian step appears after this one
        ref.invalidate(countsProvider);
        setState(() => _error = '${e.message}. ${forViewer(_female, 'أضفه', 'أضيفيه')} في الخطوة التالية.');
      } else {
        setState(() => _error = e.message);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _readMeAgain() async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final container = ProviderScope.containerOf(context, listen: false);
    final read = await container.read(authControllerProvider.notifier).refreshMe();
    if (!mounted) return;
    final done = container.read(authControllerProvider).me?.profileComplete == true;
    setState(() {
      _saving = false;
      if (done) return;
      if (read) {
        // Read, and the server still says incomplete: the next tap saves again
        _clearSavedAwaitingMe();
        _error = savedIncompleteMessage;
      } else {
        _error = savedButStuckMessage;
      }
    });
  }

  void _back() {
    if (_step == 0) return;
    setState(() {
      // Going back to correct an answer: the next «التالي» on the last step saves again
      _clearSavedAwaitingMe();
      _error = null;
      _step--;
      _checked = false;
      _errors = {};
    });
  }

  Future<void> _pickDob() async {
    final now = DateTime.now();
    final last = DateTime(now.year - 18, now.month, now.day);
    // The oldest date `dateOfBirthError` accepts (80 today): the day after 81 years ago
    final first = DateTime(now.year - 81, now.month, now.day + 1);
    var initial = DateTime.tryParse(asString(_v['dateOfBirth']) ?? '') ?? DateTime(now.year - 25, 1, 1);
    // A draft date out of range (the website allows other dates) must not break the picker
    if (initial.isBefore(first)) initial = first;
    if (initial.isAfter(last)) initial = last;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: first,
      lastDate: last,
      initialDatePickerMode: DatePickerMode.year,
      helpText: 'تاريخ الميلاد',
    );
    if (picked != null && mounted) {
      setState(() => _v['dateOfBirth'] =
          '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}');
    }
  }

  /// The sub-line under each step's title (the website's `stepSub`)
  String _stepSub(SetupStepId id) => switch (id) {
        SetupStepId.you => forViewer(_female, 'بياناتك الأساسية كما تظهر لمن يُقترح عليك.', 'بياناتكِ الأساسية كما تظهر لمن يُقترح عليكِ.'),
        SetupStepId.faith => forViewer(_female, 'تساعدنا على اقتراح من يناسبك.', 'تساعدنا على اقتراح من يناسبكِ.'),
        SetupStepId.work => forViewer(_female, 'دراستك وعملك.', 'دراستكِ وعملكِ.'),
        SetupStepId.family => forViewer(_female, 'عائلتك وسكنك.', 'عائلتكِ وسكنكِ.'),
        SetupStepId.about =>
          forViewer(_female, 'بكلماتك. كلها اختيارية، ويمكنك إكمالها لاحقاً.', 'بكلماتكِ. كلها اختيارية، ويمكنكِ إكمالها لاحقاً.'),
        SetupStepId.looking => 'العمر مطلوب، وباقي التفضيلات اختياري.',
        SetupStepId.musts => forViewer(_female, 'اختر ما لا تقبل غيره. يمكنك تغييره لاحقاً من «تفضيلات الشريك».',
            'اختاري ما لا تقبلين غيره. يمكنكِ تغييره لاحقاً من «تفضيلات الشريك».'),
      };

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(authControllerProvider).me;
    final counts = ref.watch(countsProvider);
    final profile = ref.watch(myProfileProvider);
    // Cities and nationalities of the member's country come from the API (`lists`)
    final details = ref.watch(countryDetailsProvider(me?.country.code ?? 'JO'));
    // The skeleton only on the first load: a refresh (back in the app, a push) keeps the form, its focus and scroll
    if ((counts.isLoading && !counts.hasValue) ||
        (profile.isLoading && !profile.hasValue) ||
        (details.isLoading && !details.hasValue)) {
      return const Scaffold(body: SkeletonList(count: 5, itemHeight: 56));
    }
    if (counts.hasError && !counts.hasValue) {
      return Scaffold(body: ErrorView(error: counts.error!, onRetry: () => ref.invalidate(countsProvider)));
    }
    // The saved answers (a draft from the website or an earlier run) failed to load: never an empty form that would
    // overwrite them on save
    if (!_prefilled && profile.hasError && !profile.hasValue) {
      return Scaffold(
        appBar: AppBar(title: const Text('إكمال ملفك'), actions: const [LogoutButton(compact: true, confirm: true)]),
        body: ErrorView(error: profile.error!, onRetry: () => ref.invalidate(myProfileProvider)),
      );
    }
    if ((details.hasError && !details.hasValue) || (details.valueOrNull?.lists.isEmpty ?? true)) {
      return Scaffold(
        appBar: AppBar(title: const Text('إكمال ملفك')),
        body: ErrorView(
          error: details.error ?? ApiException(kind: ApiErrorKind.server, message: 'تعذّر تحميل قائمة المدن. يُرجى المحاولة مرة أخرى.'),
          onRetry: () => ref.invalidate(countryDetailsProvider(me?.country.code ?? 'JO')),
        ),
      );
    }
    final server = details.requireValue.lists;
    _lists = CountryLists(
      cities: server.cities,
      areas: server.areas,
      nationalitiesMale: server.nationalitiesMale,
      nationalitiesFemale: server.nationalitiesFemale,
      incomeRanges: server.incomeRanges,
      expenseRanges: server.expenseRanges,
      tribeLabel: server.tribeLabel,
      options: {
        for (final e in _fallbackOptions.entries) e.key: server.option(e.key).isEmpty ? e.value : server.option(e.key),
        for (final e in server.options.entries)
          if (!_fallbackOptions.containsKey(e.key)) e.key: e.value,
      },
    );
    _female = me?.isFemale ?? false;
    _steps = setupSteps(dealbreakers: counts.valueOrNull?.flags.mutualSuggestions ?? false);
    final guardianStep = _guardianStep(counts.valueOrNull);
    final total = _steps.length + (guardianStep ? 1 : 0);
    final p = profile.valueOrNull;
    if (p != null && !_prefilled) _prefill(p, me);
    if (_step > total - 1) _step = total - 1;
    if (_checked) _errors = _validate(_step);
    final onGuardian = _step >= _steps.length;
    final current = onGuardian ? null : _steps[_step];
    final theme = Theme.of(context);

    // Android back: the previous step (not out of the app with the answers lost)
    return PopScope(
      canPop: _step == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('إكمال ملفك'),
          leading: _step > 0
              ? IconButton(tooltip: 'السابق', icon: const Icon(Icons.arrow_back_rounded), onPressed: _back)
              : null,
          actions: [
            // Where a back button usually sits: one mis-tap must not end the session
            const LogoutButton(compact: true, confirm: true),
          ],
        ),
        body: SafeArea(
          // Every question of the step is built (the first error can always be brought into view); each step starts
          // at the top
          child: SingleChildScrollView(
            key: ValueKey('setup-step-$_step'),
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
            // No ✓ on the chips: it widened the picked chip, the row re-wrapped and the next tap landed in a gap; the
            // pick shows by its colour and navy edge
            child: ChipTheme(
              data: ChipTheme.of(context).copyWith(showCheckmark: false),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
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
                  Text(current == null ? 'وليّ الأمر' : setupStepTitle(current, female: _female),
                      style: theme.textTheme.headlineSmall),
                  const SizedBox(height: 6),
                  Text(
                    current == null
                        ? 'نطلبها لترتيب التعارف العائلي. لا تظهر لأي عضو إلا بموافقتك بعد تعارف مقبول.'
                        : _stepSub(current.id),
                    style: theme.textTheme.bodyMedium?.copyWith(color: AppColors.muted),
                  ),
                  const SizedBox(height: 20),
                  const _InviteRetryBanner(),
                  ..._stepFields(current),
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
          ),
        ),
      ),
    );
  }

  GlobalKey _anchor(String key) => _anchors.putIfAbsent(key, GlobalKey.new);

  List<Widget> _stepFields(SetupStep? step) {
    if (step == null) {
      return [
        GuardianFieldsView(
          fields: _guardian,
          errors: _errors,
          onFieldChanged: (key) => setState(() => _errors.remove(key)),
        ),
      ];
    }
    switch (step.id) {
      case SetupStepId.looking:
        return PartnerPrefsFields(
          value: _prefs,
          onChanged: (v) => setState(() => _prefs = v),
          cities: _lists.cities,
          female: _female,
          christian: _christian,
          sectOptions: _lists.option('prefSect'),
          religionOptions: _lists.option('prefReligion'),
          prefReligion: _prefReligion,
          onPrefReligion: (v) => setState(() {
            if (v != null) _prefReligion = v;
          }),
          ageError: _errors['age'],
        ).fields();
      case SetupStepId.musts:
        return [
          DealbreakerToggles(
            value: _prefs,
            selected: _ticked,
            onChanged: (v) => setState(() => _ticked = v),
            female: _female,
            christian: _christian,
          ),
        ];
      default:
        final values = _values;
        return [
          for (final k in _shownKeys(step, values))
            KeyedSubtree(
              key: _anchor(k),
              child: k == 'dateOfBirth'
                  ? _dobField()
                  : ProfileFieldControl(
                      fieldKey: k,
                      values: _v,
                      // One answer may set two keys (her «الحجاب»: hijab + niqab); each lands here, the draft is saved
                      // only when the step is finished
                      onChanged: (key, value) => setState(() => _v[key] = value),
                      lists: _lists,
                      female: _female,
                      controller: k == 'job' ? _jobCustom : _text[k],
                      error: _errors[k],
                      clearable: !setupRequired(k, values, _ctx),
                      // Once checked, the errors follow the answers: typing clears the field's error at once
                      onTextChanged: (_) => setState(() {}),
                    ),
            ),
        ];
    }
  }

  /// The birth date (its own picker: an old draft date outside the usual range still opens it)
  Widget _dobField() {
    final dob = DateTime.tryParse(asString(_v['dateOfBirth']) ?? '');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 16, bottom: 8),
          child: Text(profileFieldLabels['dateOfBirth']!, style: AppText.body.copyWith(fontWeight: FontWeight.w700)),
        ),
        InkWell(
          key: const Key('field-dateOfBirth'),
          borderRadius: BorderRadius.circular(14),
          onTap: _pickDob,
          child: InputDecorator(
            decoration: InputDecoration(
              errorText: _errors['dateOfBirth'],
              suffixIcon: const Icon(Icons.calendar_month_outlined),
            ),
            child: Text(dob == null ? 'اختيار التاريخ' : formatDate(dob),
                style: TextStyle(color: dob == null ? AppColors.muted : AppColors.ink)),
          ),
        ),
      ],
    );
  }
}

/// The invitation code from sign-up wasn't applied: why, and another try (the server takes one until the profile is
/// complete), like the website's «لم يُطبَّق رمز الدعوة»
class _InviteRetryBanner extends ConsumerWidget {
  const _InviteRetryBanner();

  Future<void> _retry(BuildContext context, WidgetRef ref) async {
    final code = await showDialog<String>(context: context, builder: (_) => const _InviteCodeDialog());
    final clean = cleanReferralCode(code ?? '');
    if (code == null) return;
    if (clean.length != 8) {
      if (context.mounted) showSnack(context, 'رمز الدعوة يتكون من 8 أحرف وأرقام');
      return;
    }
    if (!context.mounted) return;
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      await ref.read(apiClientProvider).post('/api/referral/apply', body: {'code': clean});
      container.read(inviteWarningProvider.notifier).set(null);
      if (context.mounted) showSnack(context, 'تم تطبيق رمز الدعوة');
    } catch (e) {
      // The banner may be gone by now (setup finished): never `ref` after an await
      container.read(inviteWarningProvider.notifier).set(ApiException.messageOf(e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final warning = ref.watch(inviteWarningProvider);
    if (warning == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: InfoBanner(
        key: const Key('invite-warning'),
        text: 'لم يُطبَّق رمز الدعوة: $warning',
        tone: BannerTone.warning,
        icon: Icons.card_giftcard_rounded,
        action: Wrap(
          spacing: 8,
          children: [
            TextButton(onPressed: () => _retry(context, ref), child: const Text('إدخال رمز آخر')),
            TextButton(
              onPressed: () => ref.read(inviteWarningProvider.notifier).set(null),
              child: const Text('متابعة بدونه'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Asks for the code; owns its field (disposed with the dialog, after its closing animation)
class _InviteCodeDialog extends StatefulWidget {
  const _InviteCodeDialog();

  @override
  State<_InviteCodeDialog> createState() => _InviteCodeDialogState();
}

class _InviteCodeDialogState extends State<_InviteCodeDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('رمز الدعوة'),
      content: TextField(
        key: const Key('invite-retry-code'),
        controller: _controller,
        autofocus: true,
        textCapitalization: TextCapitalization.characters,
        decoration: const InputDecoration(hintText: '8 أحرف وأرقام'),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('إلغاء')),
        FilledButton(onPressed: () => Navigator.of(context).pop(_controller.text), child: const Text('تطبيق')),
      ],
    );
  }
}
