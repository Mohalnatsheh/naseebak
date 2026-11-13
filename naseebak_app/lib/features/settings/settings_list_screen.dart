import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../auth/logout_button.dart';
import '../country_selection/country_providers.dart';
import '../pro/pro_repository.dart';
import 'settings_screen.dart';

/// «الإعدادات»: notifications, blocks, guardian, profile edit, legal links and the account actions (pause, delete,
/// sign out). Moved off «حسابي» with the same handlers.
class SettingsListScreen extends ConsumerWidget {
  const SettingsListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(authControllerProvider).me;
    final details = me == null ? null : ref.watch(countryDetailsProvider(me.country.code)).valueOrNull;
    // The Pro state only where payments show (never a test or review account); it decides the pause/delete Pro line
    final pro = ref.watch(appPaymentsProvider) ? ref.watch(proStateProvider).valueOrNull : null;
    Widget tile(IconData icon, String title, VoidCallback onTap, {Color? color, String? subtitle}) => ListTile(
          minVerticalPadding: 12,
          leading: Icon(icon, color: color ?? AppColors.navy),
          title: Text(title, style: TextStyle(color: color, fontWeight: FontWeight.w600)),
          subtitle: subtitle == null ? null : Text(subtitle),
          trailing: const Icon(Icons.chevron_right, color: AppColors.muted),
          onTap: onTap,
        );
    return Scaffold(
      appBar: AppBar(title: const Text('الإعدادات')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Column(children: [
              tile(Icons.notifications_none_rounded, 'إعدادات الإشعارات', () => context.push('/settings/notifications')),
              const Divider(),
              tile(Icons.block_rounded, 'المحظورون', () => context.push('/settings/blocks')),
              const Divider(),
              tile(Icons.family_restroom_rounded, 'بيانات وليّ الأمر', () => context.push('/profile/guardian')),
              const Divider(),
              tile(Icons.edit_note_rounded, 'تعديل ملفي', () => context.push('/profile/edit'),
                  subtitle: 'كل بياناتك في مكان واحد'),
            ]),
          ),
          const SizedBox(height: 16),
          Card(
            child: Column(children: [
              tile(Icons.description_outlined, 'الشروط والأحكام', () => openExternal(context, details?.links.terms)),
              const Divider(),
              tile(Icons.privacy_tip_outlined, 'سياسة الخصوصية', () => openExternal(context, details?.links.privacy)),
              const Divider(),
              tile(Icons.help_outline_rounded, 'الأسئلة الشائعة', () => openExternal(context, details?.links.faq)),
            ]),
          ),
          const SizedBox(height: 16),
          Card(
            child: Column(children: [
              tile(Icons.pause_circle_outline_rounded, 'إيقاف الحساب مؤقتاً', () => pauseAccount(context, ref, pro),
                  color: AppColors.warning),
              const Divider(),
              tile(Icons.delete_outline_rounded, 'حذف الحساب', () => deleteAccount(context, ref, pro),
                  color: AppColors.danger),
            ]),
          ),
          const SizedBox(height: 16),
          const LogoutButton(key: Key('logout'), confirm: true, icon: Icons.logout_rounded),
        ],
      ),
    );
  }
}
