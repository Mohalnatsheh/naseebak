/// Fixed option values of the profile (same in every country; they must match the backend exactly, see
/// src/lib/profile-options.ts and src/lib/matching/score.ts). Cities, districts and nationalities are per
/// country and come from `GET /api/countries/{code}` → `lists`.
class ProfileOptions {
  ProfileOptions._();

  static const education = ['ثانوية عامة', 'دبلوم', 'بكالوريوس', 'ماجستير', 'دكتوراه'];
  static const maritalStatus = ['أعزب/عزباء', 'مطلق/مطلقة', 'أرمل/أرملة'];
  static const single = 'أعزب/عزباء';
  static const religiosity = ['ملتزم جداً', 'ملتزم', 'متوسط', 'غير ملتزم'];

  static const relationships = {
    'father': 'الأب',
    'mother': 'الأم',
    'brother': 'الأخ',
    'guardian': 'وليّ أمر آخر',
  };
}
