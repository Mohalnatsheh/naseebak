import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/onboarding/profile_options.dart';
import 'package:naseebak_app/features/onboarding/setup_steps.dart';

SetupCtx ctx({bool female = true, bool religion = true, bool sect = true, Map<String, List<String>> areas = const {}}) =>
    SetupCtx(female: female, religionAsked: religion, sectAsked: sect, areas: areas);

SetupStep step(SetupStepId id) => setupSteps(dealbreakers: true).firstWhere((s) => s.id == id);

void main() {
  test('step map', () {
    final all = setupSteps(dealbreakers: true);
    expect(all.map((s) => s.id), SetupStepId.values);
    expect(all.map((s) => s.title), ['عنك', 'الدين ونمط الحياة', 'التعليم والعمل', 'العائلة', 'عنّي', 'من تبحث عنه', 'شروط أساسية']);
    final six = setupSteps(dealbreakers: false);
    expect(six.length, 6);
    expect(six.any((s) => s.id == SetupStepId.musts), isFalse);
    expect(step(SetupStepId.you).fieldKeys,
        ['dateOfBirth', 'nationality', 'city', 'maritalStatus', 'childrenCount', 'height', 'weight', 'skinColor']);
    expect(step(SetupStepId.faith).fieldKeys, [
      'religion', 'religiosity', 'sect', 'hijab', 'beard', 'smokingStatus', 'cookingAbility', 'lifestyle',
      'drivingLicense', 'willingToRelocate'
    ]);
    expect(step(SetupStepId.work).fieldKeys, ['education', 'fieldOfStudy', 'job', 'incomeRange']);
    expect(step(SetupStepId.family).fieldKeys,
        ['tribe', 'familyOriginArea', 'numberOfSiblings', 'housingType', 'monthlyExpenses', 'healthConditions']);
    expect(step(SetupStepId.about).fieldKeys, ['aboutMe', 'partnerExpectations', 'hobbies', 'interests', 'familyValues']);
    expect(step(SetupStepId.looking).fieldKeys, setupPrefKeys);
    expect(setupPrefKeys.take(3), ['prefReligion', 'prefAgeMin', 'prefAgeMax']);
  });

  test('titles are gendered on looking', () {
    final s = step(SetupStepId.looking);
    expect(setupStepTitle(s, female: false), 'من تبحث عنه');
    expect(setupStepTitle(s, female: true), 'من تبحثين عنه');
    expect(setupStepTitle(step(SetupStepId.you), female: true), 'عنك');
  });

  test('faith missing', () {
    final f = step(SetupStepId.faith);
    expect(missingOnStep(f, {}, ctx()),
        ['religion', 'religiosity', 'sect', 'hijab', 'smokingStatus', 'cookingAbility', 'lifestyle', 'drivingLicense', 'willingToRelocate']);
    expect(missingOnStep(f, {}, ctx(female: false)),
        ['religion', 'religiosity', 'sect', 'beard', 'smokingStatus', 'cookingAbility', 'lifestyle', 'drivingLicense', 'willingToRelocate']);
    final christian = missingOnStep(f, {'religion': 'مسيحي'}, ctx());
    expect(christian, isNot(contains('sect')));
    expect(christian, isNot(contains('hijab')));
    expect(missingOnStep(f, {'religion': 'مسيحي'}, ctx(female: false)), isNot(contains('beard')));
    final none = missingOnStep(f, {}, ctx(religion: false, sect: false));
    expect(none, isNot(contains('religion')));
    expect(none, isNot(contains('sect')));
    expect(none, contains('religiosity'));
  });

  test('false and 0 are answers', () {
    expect(missingOnStep(step(SetupStepId.faith), {'drivingLicense': false}, ctx()), isNot(contains('drivingLicense')));
    expect(missingOnStep(step(SetupStepId.you), {'maritalStatus': 'مطلق/ة', 'childrenCount': 0}, ctx()),
        isNot(contains('childrenCount')));
  });

  test('children count follows marital status', () {
    final you = step(SetupStepId.you);
    final single = {'maritalStatus': ProfileOptions.single};
    expect(setupShown('childrenCount', single, ctx()), isFalse);
    expect(missingOnStep(you, single, ctx()), isNot(contains('childrenCount')));
    final other = {'maritalStatus': 'مطلق/ة'};
    expect(setupShown('childrenCount', other, ctx()), isTrue);
    expect(missingOnStep(you, other, ctx()), contains('childrenCount'));
  });

  test('job other is missing', () {
    final w = step(SetupStepId.work);
    expect(missingOnStep(w, {'job': 'أخرى'}, ctx()), contains('job'));
    expect(missingOnStep(w, {'job': 'مهندس'}, ctx()), isNot(contains('job')));
  });

  test('optional fields never missing', () {
    final m = [
      ...missingOnStep(step(SetupStepId.you), {}, ctx()),
      ...missingOnStep(step(SetupStepId.family), {}, ctx()),
      ...missingOnStep(step(SetupStepId.about), {}, ctx()),
    ];
    for (final k in ['height', 'weight', 'numberOfSiblings', 'aboutMe', 'tribe']) {
      expect(m, isNot(contains(k)));
    }
    expect(setupRequired('height', {}, ctx()), isFalse);
    expect(setupRequired('dateOfBirth', {}, ctx()), isTrue);
  });

  test('looking requires the age range only', () {
    final l = step(SetupStepId.looking);
    expect(missingOnStep(l, {}, ctx()), ['prefAgeMin', 'prefAgeMax']);
    expect(missingOnStep(l, {'prefAgeMin': 22}, ctx()), ['prefAgeMax']);
    expect(missingOnStep(l, {'prefAgeMin': 22, 'prefAgeMax': 30}, ctx()), isEmpty);
  });

  test('pref shown rules', () {
    expect(setupShown('prefReligion', {}, ctx(religion: false)), isFalse);
    expect(setupShown('prefSect', {}, ctx(sect: false)), isFalse);
    expect(setupShown('prefSect', {'religion': 'مسيحي'}, ctx()), isFalse);
    expect(setupShown('prefHijab', {}, ctx(female: false)), isTrue);
    expect(setupShown('prefHijab', {}, ctx(female: true)), isFalse);
    expect(setupShown('prefBeard', {}, ctx(female: true)), isTrue);
    expect(setupShown('prefBeard', {'religion': 'مسيحي'}, ctx(female: true)), isFalse);
  });

  test('area follows the city', () {
    final c = ctx(areas: {'عمان': ['أ']});
    expect(setupShown('area', {'city': 'عمان'}, c), isTrue);
    expect(setupShown('area', {'city': 'إربد'}, c), isFalse);
  });

  test('firstIncompleteStep', () {
    final steps = setupSteps(dealbreakers: true);
    final c = ctx(religion: false, sect: false);
    expect(firstIncompleteStep(steps, {}, c), 0);
    final done01 = <String, Object?>{
      'dateOfBirth': '1995-01-01', 'nationality': 'أردني', 'city': 'عمان', 'maritalStatus': ProfileOptions.single,
      'skinColor': 'x', 'religiosity': 'x', 'hijab': 'x', 'smokingStatus': 'x', 'cookingAbility': 'x',
      'lifestyle': 'x', 'drivingLicense': false, 'willingToRelocate': true,
    };
    expect(firstIncompleteStep(steps, done01, c), 2);
    final all = <String, Object?>{
      ...done01, 'education': 'x', 'job': 'مهندس', 'incomeRange': 'x', 'housingType': 'x', 'monthlyExpenses': 'x',
      'prefAgeMin': 20, 'prefAgeMax': 30,
    };
    expect(firstIncompleteStep(steps, all, c), steps.length - 1);
  });
}
