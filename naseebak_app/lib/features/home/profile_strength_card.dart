import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_theme.dart';
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

/// «قوة ملفك» on home while the profile is under 100%: the unfinished sections, each opening its screen.
class ProfileStrengthCard extends ConsumerWidget {
  const ProfileStrengthCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = ref.watch(myProfileProvider).valueOrNull;
    if (p == null || p.completeness >= 100) return const SizedBox.shrink();
    final open = p.sections.where((s) => s.percentage < 100).take(3).toList();
    return Card(
      key: const Key('profile-strength'),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              Expanded(
                child: Text('قوة ملفك', style: AppText.body.copyWith(fontWeight: FontWeight.w800)),
              ),
              Text('${p.completeness}%', style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.goldText)),
            ]),
            const SizedBox(height: 8),
            LinearProgressIndicator(
              value: p.completeness / 100,
              minHeight: 8,
              borderRadius: BorderRadius.circular(4),
              color: AppColors.gold,
              backgroundColor: AppColors.line,
            ),
            const SizedBox(height: 6),
            Text('الملف الأكمل يعطي اقتراحات أدق ونسبة توافق أوضح.', style: AppText.labelRegular.copyWith(color: AppColors.muted)),
            for (final s in open)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(s.label, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: strengthSubtitle(s) == null
                    ? null
                    : Text(strengthSubtitle(s)!, maxLines: 1, overflow: TextOverflow.ellipsis),
                trailing: const Icon(Icons.chevron_right, color: AppColors.muted),
                onTap: () async {
                  await context.push(s.route);
                  ref.invalidate(myProfileProvider);
                },
              ),
          ],
        ),
      ),
    );
  }
}
