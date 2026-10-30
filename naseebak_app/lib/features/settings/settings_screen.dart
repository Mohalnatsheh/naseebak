import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/json.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../country_selection/country_providers.dart';

/// «حسابي»: profile, credits, notification settings, safety, legal links and account actions.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  Future<void> _pause(BuildContext context, WidgetRef ref) async {
    final ok = await confirmDialog(
      context,
      title: 'إيقاف الحساب مؤقتاً',
      body: 'لن يظهر ملفك لأحد ولن تصلك اقتراحات، وتُنهى المحادثات المفتوحة. يمكنك إعادة التفعيل في أي وقت.',
      confirmLabel: 'إيقاف',
    );
    if (!ok || !context.mounted) return;
    try {
      await ref.read(apiClientProvider).post('/api/profile/deactivate', body: {'action': 'pause'});
      await ref.read(authControllerProvider.notifier).refreshMe();
    } catch (e) {
      if (context.mounted) showSnack(context, ApiException.messageOf(e));
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final ok = await confirmDialog(
      context,
      title: 'حذف الحساب',
      body: 'يُوقف حسابك الآن ويُحذف نهائياً بعد 30 يوماً. يمكنك التراجع خلال هذه المدة بإعادة التفعيل.',
      confirmLabel: 'طلب الحذف',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    try {
      final j = await ref.read(apiClientProvider).post('/api/profile/delete');
      if (context.mounted) showSnack(context, asStringOr(j['message'], 'تم استلام طلب الحذف'));
      await ref.read(authControllerProvider.notifier).refreshMe();
    } catch (e) {
      if (context.mounted) showSnack(context, ApiException.messageOf(e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(authControllerProvider).me;
    final details = me == null ? null : ref.watch(countryDetailsProvider(me.country.code)).valueOrNull;
    Widget tile(IconData icon, String title, VoidCallback onTap, {Color? color, String? subtitle}) => ListTile(
          minVerticalPadding: 12,
          leading: Icon(icon, color: color ?? AppColors.navy),
          title: Text(title, style: TextStyle(color: color, fontWeight: FontWeight.w600)),
          subtitle: subtitle == null ? null : Text(subtitle),
          trailing: const Icon(Icons.chevron_right, color: AppColors.muted),
          onTap: onTap,
        );
    return Scaffold(
      appBar: AppBar(title: const Text('حسابي')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Column(children: [
              tile(Icons.person_outline_rounded, 'ملفي الشخصي', () => context.push('/profile'),
                  subtitle: me == null ? null : '${me.firstName} ${me.lastName}'),
              const Divider(),
              tile(Icons.account_balance_wallet_outlined, 'الرصيد والباقات', () => context.push('/credits'),
                  subtitle: me == null ? null : 'رصيدك: ${me.credits}'),
              const Divider(),
              tile(Icons.edit_note_rounded, 'تعديل ملفي', () => context.push('/profile/edit'), subtitle: 'كل بياناتك في مكان واحد'),
              const Divider(),
              tile(Icons.family_restroom_rounded, 'بيانات وليّ الأمر', () => context.push('/profile/guardian')),
              const Divider(),
              tile(Icons.card_giftcard_rounded, 'دعوة الأصدقاء', () => context.push('/referral')),
            ]),
          ),
          const SizedBox(height: 16),
          Card(
            child: Column(children: [
              tile(Icons.notifications_none_rounded, 'إعدادات الإشعارات', () => context.push('/settings/notifications')),
              const Divider(),
              tile(Icons.block_rounded, 'المحظورون', () => context.push('/settings/blocks')),
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
              const Divider(),
              tile(Icons.support_agent_rounded, 'الدعم الفني', () => context.push('/support')),
            ]),
          ),
          const SizedBox(height: 16),
          Card(
            child: Column(children: [
              tile(Icons.pause_circle_outline_rounded, 'إيقاف الحساب مؤقتاً', () => _pause(context, ref), color: AppColors.warning),
              const Divider(),
              tile(Icons.delete_outline_rounded, 'حذف الحساب', () => _delete(context, ref), color: AppColors.danger),
            ]),
          ),
          const SizedBox(height: 16),
          LoadingButton(
            key: const Key('logout'),
            label: 'تسجيل الخروج',
            icon: Icons.logout_rounded,
            outlined: true,
            onPressed: () async {
              final ok = await confirmDialog(context, title: 'تسجيل الخروج', body: 'هل تريد تسجيل الخروج من هذا الجهاز؟', confirmLabel: 'خروج');
              if (ok) await ref.read(authControllerProvider.notifier).logout();
            },
          ),
          const SizedBox(height: 12),
          const Center(child: Text('تغيير الدولة متاح قبل تسجيل الدخول فقط.', style: TextStyle(color: AppColors.muted, fontSize: 12))),
        ],
      ),
    );
  }
}

/// `GET/PATCH /api/notifications/preferences`
class NotificationPrefsScreen extends ConsumerStatefulWidget {
  const NotificationPrefsScreen({super.key});

  @override
  ConsumerState<NotificationPrefsScreen> createState() => _NotificationPrefsScreenState();
}

class _NotificationPrefsScreenState extends ConsumerState<NotificationPrefsScreen> {
  static const keys = [
    ('suggestions', 'الاقتراحات الجديدة'),
    ('interests', 'الاهتمام بملفي'),
    ('matches', 'التوافقات'),
    ('introRequests', 'طلبات التعارف وحالة المحادثات'),
    ('chatMessages', 'رسائل المحادثات'),
    ('visitUpdates', 'تحديثات الزيارات العائلية'),
    ('payments', 'المدفوعات والرصيد'),
    ('support', 'الدعم'),
  ];
  Map<String, bool>? _prefs;
  Object? _error;
  final Set<String> _saving = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final j = await ref.read(apiClientProvider).get('/api/notifications/preferences');
      final p = asMap(j['preferences']);
      setState(() => _prefs = {for (final k in keys) k.$1: asBool(p[k.$1]) ?? true});
    } catch (e) {
      setState(() => _error = e);
    }
  }

  Future<void> _toggle(String key, bool value) async {
    setState(() {
      _prefs![key] = value;
      _saving.add(key);
    });
    try {
      await ref.read(apiClientProvider).patch('/api/notifications/preferences', body: {key: value});
    } catch (e) {
      if (mounted) {
        setState(() => _prefs![key] = !value);
        showSnack(context, ApiException.messageOf(e));
      }
    } finally {
      if (mounted) setState(() => _saving.remove(key));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('إعدادات الإشعارات')),
      body: _error != null
          ? ErrorView(error: _error!, onRetry: _load)
          : _prefs == null
              ? const SkeletonList(count: 6, itemHeight: 52)
              : ListView(
                  children: [
                    const Padding(
                      padding: EdgeInsets.all(16),
                      child: Text('اختر الإشعارات التي تصلك. تبقى الإشعارات داخل التطبيق ظاهرة دائماً.',
                          style: TextStyle(color: AppColors.muted)),
                    ),
                    for (final k in keys)
                      SwitchListTile(
                        title: Text(k.$2),
                        value: _prefs![k.$1] ?? true,
                        onChanged: _saving.contains(k.$1) ? null : (v) => _toggle(k.$1, v),
                      ),
                  ],
                ),
    );
  }
}

/// `GET /api/blocks`, `DELETE /api/blocks/{id}`
class BlocksScreen extends ConsumerStatefulWidget {
  const BlocksScreen({super.key});

  @override
  ConsumerState<BlocksScreen> createState() => _BlocksScreenState();
}

class _BlocksScreenState extends ConsumerState<BlocksScreen> {
  List<Map<String, dynamic>>? _blocks;
  Object? _error;
  String? _busy;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final j = await ref.read(apiClientProvider).get('/api/blocks');
      setState(() => _blocks = asMapList(j['blocks']));
    } catch (e) {
      setState(() => _error = e);
    }
  }

  Future<void> _unblock(Map<String, dynamic> b) async {
    final name = asStringOr(asMap(b['blocked'])['firstName']);
    final ok = await confirmDialog(context, title: 'إلغاء الحظر', body: 'إلغاء حظر $name؟', confirmLabel: 'إلغاء الحظر');
    if (!ok) return;
    final id = asStringOr(b['id']);
    setState(() => _busy = id);
    try {
      await ref.read(apiClientProvider).delete('/api/blocks/$id');
      if (mounted) setState(() => _blocks!.removeWhere((x) => x['id'] == id));
    } catch (e) {
      if (mounted) showSnack(context, ApiException.messageOf(e));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('المحظورون')),
      body: _error != null
          ? ErrorView(error: _error!, onRetry: _load)
          : _blocks == null
              ? const SkeletonList(count: 3, itemHeight: 56)
              : _blocks!.isEmpty
                  ? const MessageView(icon: Icons.block_rounded, title: 'لم تحظر أحداً')
                  : ListView.separated(
                      itemCount: _blocks!.length,
                      separatorBuilder: (_, _) => const Divider(),
                      itemBuilder: (_, i) {
                        final b = _blocks![i];
                        return ListTile(
                          title: Text(asStringOr(asMap(b['blocked'])['firstName'], 'عضو')),
                          trailing: TextButton(
                            onPressed: _busy != null ? null : () => _unblock(b),
                            child: const Text('إلغاء الحظر'),
                          ),
                        );
                      },
                    ),
    );
  }
}
