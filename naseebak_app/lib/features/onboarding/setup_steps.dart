import '../../shared/religion.dart';
import 'profile_options.dart';

/// The full sign-up setup's step map and required rule. Pure (no widgets, no db). Mirrors the website's
/// `src/lib/setup-steps.ts`: required = the fixed list below plus every own (non-`pref*`) choice / yes-no / picker
/// field that is shown; `pref*` fields are optional except the age range. `false` and 0 are answers; a job left on
/// «أخرى» with no text is not.
enum SetupStepId { you, faith, work, family, about, looking, musts }

class SetupStep {
  final SetupStepId id;

  /// The title for a man; see [setupStepTitle].
  final String title;
  final List<String> fieldKeys;
  const SetupStep(this.id, this.title, this.fieldKeys);
}

/// What decides which questions are shown: gender, the lists the server sent, the city → areas map.
class SetupCtx {
  final bool female;

  /// The server sent the religion list («الديانة»); absent on an old server.
  final bool religionAsked;

  /// The server sent a sect list («المذهب»).
  final bool sectAsked;

  /// City → its areas (a city absent or empty has no area question).
  final Map<String, List<String>> areas;

  const SetupCtx({
    required this.female,
    this.religionAsked = false,
    this.sectAsked = false,
    this.areas = const {},
  });
}

/// Step 6: the partner preferences «تفضيلات الشريك» edits (API names), religion and the age range first.
const setupPrefKeys = <String>[
  'prefReligion',
  'prefAgeMin',
  'prefAgeMax',
  'prefCity',
  'prefEducation',
  'prefMaritalStatus',
  'prefHijab',
  'prefBeard',
  'prefReligiosity',
  'prefSect',
  'prefSmokingStatus',
  'prefChildrenAcceptance',
];

const _steps = <SetupStep>[
  SetupStep(SetupStepId.you, 'عنك',
      ['dateOfBirth', 'nationality', 'city', 'maritalStatus', 'childrenCount', 'height', 'weight', 'skinColor']),
  SetupStep(SetupStepId.faith, 'الدين ونمط الحياة', [
    'religion', 'religiosity', 'sect', 'hijab', 'beard', 'smokingStatus', 'cookingAbility', 'lifestyle',
    'drivingLicense', 'willingToRelocate'
  ]),
  SetupStep(SetupStepId.work, 'التعليم والعمل', ['education', 'fieldOfStudy', 'job', 'incomeRange']),
  SetupStep(SetupStepId.family, 'العائلة',
      ['tribe', 'familyOriginArea', 'numberOfSiblings', 'housingType', 'monthlyExpenses', 'healthConditions']),
  SetupStep(SetupStepId.about, 'عنّي', ['aboutMe', 'partnerExpectations', 'hobbies', 'interests', 'familyValues']),
  SetupStep(SetupStepId.looking, 'من تبحث عنه', setupPrefKeys),
  SetupStep(SetupStepId.musts, 'شروط أساسية', <String>[]),
];

/// 7 steps, or 6 without «شروط أساسية» (where the server has no mutual suggestions).
List<SetupStep> setupSteps({required bool dealbreakers}) =>
    [for (final s in _steps) if (s.id != SetupStepId.musts || dealbreakers) s];

String setupStepTitle(SetupStep step, {required bool female}) =>
    step.id == SetupStepId.looking && female ? 'من تبحثين عنه' : step.title;

const _otherJob = 'أخرى';

const _alwaysRequired = {
  'dateOfBirth', 'nationality', 'city', 'education', 'maritalStatus', 'religion', 'religiosity', 'sect',
  'childrenCount', 'prefAgeMin', 'prefAgeMax',
  // own choice / yes-no / picker fields
  'skinColor', 'smokingStatus', 'cookingAbility', 'lifestyle', 'drivingLicense', 'willingToRelocate', 'job',
  'incomeRange', 'housingType', 'monthlyExpenses', 'hijab', 'beard',
};

bool _empty(Object? v) => v == null || (v is String && v.trim().isEmpty) || (v is Iterable && v.isEmpty);

bool _answered(String key, Object? v) => key == 'job' && v == _otherJob ? false : !_empty(v);

/// Whether the question is asked at all (same rules as the edit screen).
bool setupShown(String key, Map<String, Object?> values, SetupCtx ctx) {
  final christian = isChristian(values['religion']);
  switch (key) {
    case 'religion':
    case 'prefReligion':
      return ctx.religionAsked;
    case 'sect':
    case 'prefSect':
      return ctx.sectAsked && !christian;
    case 'hijab':
    case 'prefBeard':
      return ctx.female && !christian;
    case 'beard':
    case 'prefHijab':
      return !ctx.female && !christian;
    case 'childrenCount':
      return values['maritalStatus'] != ProfileOptions.single;
    case 'area':
      final city = values['city'];
      return city is String && (ctx.areas[city]?.isNotEmpty ?? false);
  }
  return true;
}

/// Required and shown.
bool setupRequired(String key, Map<String, Object?> values, SetupCtx ctx) =>
    _alwaysRequired.contains(key) && setupShown(key, values, ctx);

/// Keys on [step] that are required, shown and unanswered, in the step's order.
List<String> missingOnStep(SetupStep step, Map<String, Object?> values, SetupCtx ctx) => [
      for (final key in step.fieldKeys)
        if (setupRequired(key, values, ctx) && !_answered(key, values[key])) key,
    ];

/// Index of the first step with a missing required field; the last step when none.
int firstIncompleteStep(List<SetupStep> steps, Map<String, Object?> values, SetupCtx ctx) {
  final i = steps.indexWhere((s) => missingOnStep(s, values, ctx).isNotEmpty);
  return i == -1 ? steps.length - 1 : i;
}
