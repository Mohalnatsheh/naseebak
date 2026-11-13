import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/network/api_exception.dart';
import '../../core/push/push_permission.dart';
import '../../core/network/json.dart';
import '../../core/localization/digits.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/brand_kit.dart';
import '../../shared/widgets/common.dart';
import '../../shared/widgets/grouped_section.dart';
import '../home/counts.dart';
import '../pro/pro_badge.dart';
import '../pro/pro_repository.dart';
import '../profile/profile_repository.dart';
import '../pro/pro_section.dart' show proPlanLabels;

/// The pause dialog's Pro line (a renewing subscription)
String pauseProLine(DateTime? end) =>
    'اشتراك Pro لن يتجدد بعد الإيقاف${end == null ? '' : '، ويبقى فعّالاً حتى ${formatDate(end)}'}، دون استرداد.';

/// «إيقاف الحساب مؤقتاً»: confirm, pause, keep the Pro note (shared by «الإعدادات»)
Future<void> pauseAccount(BuildContext context, WidgetRef ref, MyProState? pro) async {
  // A Pro renewal stops with the pause (the server ends it with the period, no refund)
  final renewing = pro != null && pro.isPro && !pro.cancelAtPeriodEnd;
  final ok = await confirmDialog(
    context,
    title: 'إيقاف الحساب مؤقتاً',
    body: 'لن يظهر ملفك لأحد ولن تصلك اقتراحات، وتُنهى المحادثات المفتوحة. يمكنك إعادة التفعيل في أي وقت.'
        '${renewing ? '\n\n${pauseProLine(pro.renewsAt)}' : ''}',
    confirmLabel: 'إيقاف',
  );
  if (!ok || !context.mounted) return;
  // Taken before the request: once `me` says paused the router replaces this screen, and the Pro state must
  // still reload (QA A-M01 / A2-H1: the paused page said «ما زال يتجدد» from the stale value)
  final container = ProviderScope.containerOf(context, listen: false);
  final memberId = ref.read(authControllerProvider).me?.id;
  try {
    final j = await container.read(apiClientProvider).post('/api/profile/deactivate', body: {'action': 'pause'});
    if (memberId != null && pro != null && pro.isPro && pauseStoppedRenewal(j, wasRenewing: renewing)) {
      await container.read(proPauseNoteProvider).mark(memberId, periodEnd: pro.renewsAt);
    }
    container
      ..invalidate(proStateProvider)
      ..invalidate(countsProvider);
    await container.read(authControllerProvider.notifier).refreshMe();
  } catch (e) {
    if (context.mounted) showSnack(context, ApiException.messageOf(e));
  }
}

/// «حذف الحساب»: the dialog, then the request (shared by «الإعدادات»)
Future<void> deleteAccount(BuildContext context, WidgetRef ref, MyProState? pro) async {
  final renewing = pro != null && pro.isPro && !pro.cancelAtPeriodEnd;
  // null = cancelled; '' = no reason given (optional, like the website)
  final reason = await showDialog<String>(
    context: context,
    builder: (_) => DeleteAccountDialog(proRenewing: renewing, proRenewsAt: pro?.renewsAt),
  );
  if (reason == null || !context.mounted) return;
  final container = ProviderScope.containerOf(context, listen: false);
  final memberId = ref.read(authControllerProvider).me?.id;
  try {
    final j = await container
        .read(apiClientProvider)
        .post('/api/profile/delete', body: {if (reason.isNotEmpty) 'reason': reason});
    if (context.mounted) showSnack(context, asStringOr(j['message'], 'تم استلام طلب الحذف'));
    if (memberId != null && renewing && pauseStoppedRenewal(j, wasRenewing: renewing)) {
      await container.read(proPauseNoteProvider).mark(memberId, periodEnd: pro.renewsAt);
    }
    container.invalidate(proStateProvider);
    // The account is paused at once: the router shows the paused page with the deletion date
    await container.read(authControllerProvider.notifier).refreshMe();
  } catch (e) {
    if (context.mounted) showSnack(context, ApiException.messageOf(e));
  }
}

/// «حسابي»: profile, credits, Pro, invite and support; everything else moved to «الإعدادات» (`SettingsListScreen`).
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(authControllerProvider).me;
    // «عضوية Pro» only where payments show (never a test or review account, even a Pro one) and Pro can be bought or
    // is held; `/api/pro` isn't even read otherwise
    final payments = ref.watch(appPaymentsProvider);
    final proAsync = payments ? ref.watch(proStateProvider) : null;
    final pro = proAsync?.valueOrNull;
    // While `/api/pro` loads, the last answer on this device draws the row in the first frame, so the list doesn't
    // jump when it arrives (smoke QA). Still only where payments show: a test account never gets it.
    final remembered = payments && pro == null && proAsync!.isLoading && me != null
        ? ref.read(proMenuMemoryProvider).read(me.id)
        : null;
    final showPro = pro != null
        ? showPlans(pro, payments)
        : payments && remembered != null && (remembered.canBuy || remembered.isPro);
    final proActive = pro?.isPro ?? remembered?.isPro ?? false;
    final profile = ref.watch(myProfileProvider).valueOrNull;
    final isPro = proActive || (ref.watch(countsProvider).valueOrNull?.isPro ?? false);
    final planLabel = proActive ? proPlanLabels[pro?.plan] : null;
    final name = me == null ? '' : '${me.firstName} ${me.lastName}'.trim();
    final age = _ageOf(profile?.field('dateOfBirth'));
    final headline = age == null ? name : '$name، $age';
    final completeness = profile?.completeness;
    return Scaffold(
      appBar: AppBar(title: const Text('حسابي')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpace.lg),
        children: [
          Material(
            key: const Key('account-profile-card'),
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(AppRadius.md),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: () => context.push('/profile'),
              child: Padding(
                padding: const EdgeInsets.all(AppSpace.lg),
                child: Row(
                  children: [
                    // Always the member's own initial: a photo is never fetched here
                    MemberAvatar(name: me?.firstName ?? '', size: 56),
                    const SizedBox(width: AppSpace.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          NameWithBadge(
                            isPro: isPro,
                            child: Text(headline, style: AppText.headline.copyWith(color: AppColors.ink)),
                          ),
                          Text(
                            completeness == null ? 'الملف الشخصي' : 'الملف الشخصي · مكتمل $completeness%',
                            style: AppText.labelRegular.copyWith(color: AppColors.muted),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_left_rounded, color: AppColors.muted),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpace.xl),
          GroupedSection(rows: [
            GroupedRow(
              icon: Icons.account_balance_wallet_outlined,
              title: 'الرصيد',
              value: me == null ? null : '${me.credits}',
              onTap: () => context.push('/credits'),
            ),
            if (showPro)
              GroupedRow(
                rowKey: const Key('menu-pro'),
                icon: Icons.workspace_premium_rounded,
                title: 'عضوية Pro',
                value: planLabel,
                onTap: () => context.push('/pro'),
              ),
          ]),
          const SizedBox(height: AppSpace.xl),
          GroupedSection(rows: [
            GroupedRow(icon: Icons.tune_rounded, title: 'ما أبحث عنه', onTap: () => context.push('/profile/preferences')),
            GroupedRow(
              icon: Icons.photo_library_outlined,
              title: 'صوري',
              value: 'مخفية حتى التوافق',
              onTap: () => context.push('/profile/photos'),
            ),
            GroupedRow(icon: Icons.card_giftcard_rounded, title: 'ادعُ صديقاً', onTap: () => context.push('/referral')),
          ]),
          const SizedBox(height: AppSpace.xl),
          GroupedSection(rows: [
            GroupedRow(icon: Icons.settings_outlined, title: 'الإعدادات', onTap: () => context.push('/settings')),
            GroupedRow(icon: Icons.support_agent_rounded, title: 'المساعدة والدعم', onTap: () => context.push('/support')),
          ]),
          const SizedBox(height: AppSpace.md),
          Center(child: Text('تغيير الدولة متاح قبل تسجيل الدخول فقط.', style: AppText.caption.copyWith(color: AppColors.muted))),
        ],
      ),
    );
  }
}

/// Whole years since [dob] (an ISO string from `/api/profile`); null when unknown or out of range
int? _ageOf(Object? dob) {
  final d = dob is String ? DateTime.tryParse(dob) : null;
  if (d == null) return null;
  final now = DateTime.now();
  var age = now.year - d.year;
  if (now.month < d.month || (now.month == d.month && now.day < d.day)) age--;
  return age >= 18 && age < 100 ? age : null;
}

/// «حذف الحساب»: what happens, and an optional reason (`POST /api/profile/delete` `{ reason }`, like the website).
/// Pops the trimmed reason ('' for none), or null when cancelled.
/// The delete dialog's Pro line (QA A-L05): a deletion request pauses the account, which stops the renewal
String deleteProLine(DateTime? end) =>
    'يتوقف تجديد اشتراك Pro${end == null ? '' : '، ويبقى فعّالاً حتى ${formatDate(end)}'}، دون استرداد.';

class DeleteAccountDialog extends StatefulWidget {
  const DeleteAccountDialog({super.key, this.proRenewing = false, this.proRenewsAt});

  /// A renewing Pro subscription: the dialog says the renewal stops
  final bool proRenewing;
  final DateTime? proRenewsAt;

  @override
  State<DeleteAccountDialog> createState() => _DeleteAccountDialogState();
}

class _DeleteAccountDialogState extends State<DeleteAccountDialog> {
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('حذف الحساب', style: Theme.of(context).textTheme.titleMedium),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('يُوقف حسابك الآن ويُحذف نهائياً بعد 30 يوماً. يمكنك التراجع خلال هذه المدة بإعادة التفعيل.'),
            if (widget.proRenewing) ...[
              const SizedBox(height: 10),
              InfoBanner(
                key: const Key('delete-pro'),
                icon: Icons.workspace_premium_rounded,
                text: deleteProLine(widget.proRenewsAt),
              ),
            ],
            const SizedBox(height: 16),
            TextField(
              key: const Key('delete-reason'),
              controller: _reason,
              maxLength: 500,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'سبب الحذف (اختياري)',
                hintText: 'ساعدنا في تحسين المنصة...',
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('إلغاء')),
        FilledButton(
          key: const Key('delete-confirm'),
          style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
          onPressed: () => Navigator.of(context).pop(_reason.text.trim()),
          child: const Text('طلب الحذف'),
        ),
      ],
    );
  }
}

/// The notification kinds a member can get under these switches, like the website's notifications page: interest and
/// family-visit notices belong to the legacy cycle, intro requests and chat messages to the new one (chat messages
/// only with chat on).
List<(String, String)> visibleNotificationPrefs(CycleFlags flags) {
  const legacy = {'interests', 'visitUpdates'};
  const newCycle = {'introRequests', 'chatMessages'};
  return [
    for (final k in notificationPrefKeys)
      if (flags.introRequests
          ? !legacy.contains(k.$1) && (k.$1 != 'chatMessages' || flags.chat)
          : !newCycle.contains(k.$1))
        k,
  ];
}

const notificationPrefKeys = [
  ('suggestions', 'الاقتراحات الجديدة'),
  ('interests', 'الاهتمام بملفي'),
  ('matches', 'التوافقات'),
  ('introRequests', 'طلبات التعارف وحالة المحادثات'),
  ('chatMessages', 'رسائل المحادثات'),
  ('visitUpdates', 'تحديثات الزيارات العائلية'),
  ('payments', 'المدفوعات والرصيد'),
  ('support', 'الدعم'),
];

/// `GET/PATCH /api/notifications/preferences`
class NotificationPrefsScreen extends ConsumerStatefulWidget {
  const NotificationPrefsScreen({super.key});

  @override
  ConsumerState<NotificationPrefsScreen> createState() => _NotificationPrefsScreenState();
}

class _NotificationPrefsScreenState extends ConsumerState<NotificationPrefsScreen> {
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
      // Left before the answer came (Crashlytics: setState after dispose)
      if (!mounted) return;
      final p = asMap(j['preferences']);
      setState(() => _prefs = {for (final k in notificationPrefKeys) k.$1: asBool(p[k.$1]) ?? true});
    } catch (e) {
      if (mounted) setState(() => _error = e);
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
    final counts = ref.watch(countsProvider);
    // Without the switches (counts failed) every kind is shown rather than none
    final keys =
        counts.hasError ? notificationPrefKeys : visibleNotificationPrefs(counts.valueOrNull?.flags ?? const CycleFlags());
    return Scaffold(
      appBar: AppBar(title: const Text('إعدادات الإشعارات')),
      body: _error != null
          ? ErrorView(error: _error!, onRetry: _load)
          : _prefs == null || (counts.isLoading && !counts.hasValue)
              ? const SkeletonList(count: 6, itemHeight: 52)
              : ListView(
                  children: [
                    const PushOffCard(padding: EdgeInsets.fromLTRB(16, 16, 16, 0)),
                    const Padding(
                      padding: EdgeInsets.all(16),
                      child: Text('يمكنك اختيار الإشعارات التي تصلك. تبقى الإشعارات داخل التطبيق ظاهرة دائماً.',
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
      if (mounted) setState(() => _blocks = asMapList(j['blocks']));
    } catch (e) {
      if (mounted) setState(() => _error = e);
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
                  ? const MessageView(art: LineArtKind.door, icon: Icons.block_rounded, title: 'لا يوجد أحد في قائمة الحظر')
                  // Cards with the initial and the date (design review P2)
                  : ListView.separated(
                      padding: const EdgeInsets.all(AppSpace.lg),
                      itemCount: _blocks!.length,
                      separatorBuilder: (_, _) => const SizedBox(height: AppSpace.sm),
                      itemBuilder: (_, i) {
                        final b = _blocks![i];
                        final name = asStringOr(asMap(b['blocked'])['firstName'], 'عضو');
                        final at = asDate(b['createdAt']);
                        return Card(
                          child: ListTile(
                            minVerticalPadding: 12,
                            leading: MemberAvatar(name: name, size: 44, dimmed: true),
                            title: Text(name, style: AppText.body.copyWith(fontWeight: FontWeight.w700)),
                            subtitle: at == null ? null : Text('حُظر في ${formatDate(at)}'),
                            trailing: TextButton(
                              onPressed: _busy != null ? null : () => _unblock(b),
                              child: const Text('إلغاء الحظر'),
                            ),
                          ),
                        );
                      },
                    ),
    );
  }
}
