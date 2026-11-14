import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../../shared/widgets/grouped_section.dart';
import '../auth/logout_button.dart';
import '../country_selection/country_providers.dart';
import '../pro/pro_repository.dart';
import 'settings_screen.dart';

/// «الإعدادات»: notifications, blocks, guardian, profile edit, legal links and the account actions (pause, delete,
/// sign out). Moved off «حسابي» with the same handlers.
class SettingsListScreen extends ConsumerStatefulWidget {
  const SettingsListScreen({super.key});

  @override
  ConsumerState<SettingsListScreen> createState() => _SettingsListScreenState();
}

class _SettingsListScreenState extends ConsumerState<SettingsListScreen> {
  /// Pausing or asking to delete is on the way: the page shows it and its account actions wait
  bool _busy = false;

  void _setBusy(bool busy) {
    if (mounted) setState(() => _busy = busy);
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(authControllerProvider).me;
    final details = me == null ? null : ref.watch(countryDetailsProvider(me.country.code)).valueOrNull;
    // The Pro state only where payments show (never a test or review account); it decides the pause/delete Pro line
    final pro = ref.watch(appPaymentsProvider) ? ref.watch(proStateProvider).valueOrNull : null;
    return Scaffold(
      appBar: AppBar(
        title: const Text('الإعدادات'),
        bottom: _busy
            ? const PreferredSize(
                preferredSize: Size.fromHeight(3),
                child: LinearProgressIndicator(key: Key('settings-busy'), minHeight: 3),
              )
            : null,
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpace.lg),
        children: [
          GroupedSection(rows: [
            GroupedRow(
                icon: Icons.notifications_none_rounded,
                title: 'إعدادات الإشعارات',
                onTap: () => context.push('/settings/notifications')),
            GroupedRow(icon: Icons.block_rounded, title: 'المحظورون', onTap: () => context.push('/settings/blocks')),
            GroupedRow(
                icon: Icons.family_restroom_rounded,
                title: 'بيانات وليّ الأمر',
                onTap: () => context.push('/profile/guardian')),
            GroupedRow(
              icon: Icons.edit_note_rounded,
              title: 'تعديل ملفي',
              subtitle: Text('كل بياناتك في مكان واحد', style: AppText.caption.copyWith(color: AppColors.muted)),
              onTap: () => context.push('/profile/edit'),
            ),
          ]),
          const SizedBox(height: AppSpace.xl),
          GroupedSection(rows: [
            GroupedRow(
                icon: Icons.description_outlined,
                title: 'الشروط والأحكام',
                onTap: () => openExternal(context, details?.links.terms)),
            GroupedRow(
                icon: Icons.privacy_tip_outlined,
                title: 'سياسة الخصوصية',
                onTap: () => openExternal(context, details?.links.privacy)),
            GroupedRow(
                icon: Icons.help_outline_rounded,
                title: 'الأسئلة الشائعة',
                onTap: () => openExternal(context, details?.links.faq)),
          ]),
          const SizedBox(height: AppSpace.xl),
          GroupedSection(rows: [
            GroupedRow(
                icon: Icons.pause_circle_outline_rounded,
                title: 'إيقاف الحساب مؤقتاً',
                color: AppColors.warning,
                onTap: _busy ? null : () => pauseAccount(context, ref, pro, busy: _setBusy)),
            GroupedRow(
                icon: Icons.delete_outline_rounded,
                title: 'حذف الحساب',
                color: AppColors.danger,
                onTap: _busy ? null : () => deleteAccount(context, ref, pro, busy: _setBusy)),
          ]),
          const SizedBox(height: AppSpace.xl),
          LogoutButton(key: const Key('logout'), confirm: true, icon: Icons.logout_rounded, enabled: !_busy),
        ],
      ),
    );
  }
}
