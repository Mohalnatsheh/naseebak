import '../profile/profile_repository.dart';

/// The line under a section's name: what is still missing, never the section's own name again (the quiz section's
/// only missing item is «اختبار الشخصية» itself); then what the section adds, where there is something to say.
String? strengthSubtitle(StrengthSection s) {
  final missing = s.missing.where((m) => m.trim() != s.label.trim()).take(3).join('، ');
  if (missing.isNotEmpty) return missing;
  return switch (s.key) {
    'quiz' => 'أسئلة قصيرة تجعل نسبة التوافق أدق',
    'photos' => 'تظهر بعد التوافق المتبادل فقط',
    _ => null,
  };
}
