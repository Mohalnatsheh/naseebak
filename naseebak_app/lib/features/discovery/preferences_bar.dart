import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../home/counts.dart';
import '../home/gendered_copy.dart';
import '../profile/preferences_screen.dart';

/// Short names of the «شرط أساسي» keys (the web's DEALBREAKER_KEYS)
const dealbreakerNames = {
  'age': 'العمر',
  'city': 'المدينة',
  'education': 'التعليم',
  'maritalStatus': 'الحالة الاجتماعية',
  'religiosity': 'التدين',
  'smokingStatus': 'التدخين',
  'hijab': 'الحجاب',
  'beard': 'اللحية',
  'children': 'الأبناء',
};

/// Top of «جديدة»: what I'm looking for (age + «شروطي الأساسية») and a one-tap way to change it, like the web's
/// filter bar. [onEdit] opens the preferences screen; the feed refreshes after it.
class PreferencesBar extends ConsumerWidget {
  const PreferencesBar({super.key, required this.onEdit});
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(partnerPrefsProvider).valueOrNull;
    final female = ref.watch(authControllerProvider).me?.isFemale ?? false;
    final withDealbreakers = ref.watch(countsProvider).valueOrNull?.flags.mutualSuggestions ?? false;
    final age = prefs?.ageMin != null && prefs?.ageMax != null ? 'العمر ${prefs!.ageMin}–${prefs.ageMax}' : null;
    final active = withDealbreakers
        ? [for (final e in dealbreakerNames.entries) if (prefs?.dealbreakers.contains(e.key) ?? false) e.value]
        : const <String>[];

    return Material(
      color: AppColors.gold.withValues(alpha: 0.10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: AppColors.gold.withValues(alpha: 0.35)),
      ),
      child: InkWell(
        key: const Key('prefs-bar'),
        borderRadius: BorderRadius.circular(16),
        onTap: onEdit,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Icon(Icons.tune_rounded, color: AppColors.gold, size: 22),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          withDealbreakers ? 'تفضيلاتي وشروطي الأساسية' : 'تفضيلاتي',
                          style: AppText.body.copyWith(fontWeight: FontWeight.w700),
                        ),
                        Text(
                          prefs == null
                              ? 'الاقتراحات تُختار حسب ما ${forViewer(female, 'تبحث', 'تبحثين')} عنه'
                              : [?age, active.isEmpty ? 'لا شروط أساسية' : '${active.length} شروط أساسية'].join(' · '),
                          style: AppText.labelRegular.copyWith(color: Theme.of(context).hintColor),
                        ),
                      ],
                    ),
                  ),
                  TextButton.icon(
                    onPressed: onEdit,
                    icon: const Icon(Icons.edit_rounded, size: 18),
                    label: const Text('تعديل'),
                  ),
                ],
              ),
              if (active.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final name in active)
                      Chip(
                        avatar: const Icon(Icons.lock_rounded, size: 14),
                        label: Text(name),
                        visualDensity: VisualDensity.compact,
                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
