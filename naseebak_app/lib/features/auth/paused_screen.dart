import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/localization/digits.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../pro/pro_repository.dart';

/// Whole days until [date], never negative (the website's reactivate panel `daysLeft`).
int daysUntil(DateTime date, {DateTime? now}) {
  final ms = date.difference(now ?? DateTime.now()).inMilliseconds;
  return ms <= 0 ? 0 : (ms / Duration.millisecondsPerDay).ceil();
}

/// «بعد يوم واحد» / «بعد يومين» / «بعد 5 أيام» / «بعد 29 يوماً»
String daysLeftLabel(int days) => days == 1
    ? 'بعد يوم واحد'
    : days == 2
        ? 'بعد يومين'
        : 'بعد $days ${days <= 10 ? 'أيام' : 'يوماً'}';

/// Pro on the paused page: pausing stops the renewal (the server sets it to end with the period, no refund), and
/// reactivating doesn't resume it (the member resumes on «عضوية Pro»). Null = nothing to say (not Pro).
String? pausedProText(MyProState pro, {required bool female}) {
  if (!pro.isPro) return null;
  final end = pro.renewsAt;
  if (pro.cancelAtPeriodEnd) {
    return 'اشتراك Pro لا يتجدد بعد الآن${end == null ? '' : '، ويبقى فعّالاً حتى ${formatDate(end)}'}. '
        '${female ? 'يمكنكِ' : 'يمكنك'} متابعته من «عضوية Pro» بعد إعادة التفعيل.';
  }
  return 'اشتراك Pro ما زال يتجدد${end == null ? '' : ' في ${formatDate(end)}'}. '
      '${female ? 'يمكنكِ' : 'يمكنك'} إيقاف التجديد من «اشتراكي».';
}

/// A paused account (`deactivated: true`) can only reactivate or sign out (and reach «عضوية Pro» to see or stop the
/// renewal). With a deletion request it shows the
/// date the account will be deleted (reactivating cancels the request), like the website's reactivate page.
class PausedScreen extends ConsumerStatefulWidget {
  const PausedScreen({super.key});

  @override
  ConsumerState<PausedScreen> createState() => _PausedScreenState();
}

class _PausedScreenState extends ConsumerState<PausedScreen> {
  bool _busy = false;
  String? _error;

  Future<void> _reactivate() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).reactivate();
      await ref.read(authControllerProvider.notifier).refreshMe();
      ref.invalidate(proStateProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(authControllerProvider).me;
    final theme = Theme.of(context);
    final female = me?.isFemale ?? false;
    final deletion = me?.deletionScheduledFor;
    final days = deletion == null ? 0 : daysUntil(deletion);
    // Where payments show (never a test or review account): the Pro renewal, and the way to «اشتراكي»
    final payments = ref.watch(appPaymentsProvider);
    final pro = payments ? ref.watch(proStateProvider).valueOrNull : null;
    final proText = pro == null ? null : pausedProText(pro, female: female);
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const Align(alignment: AlignmentDirectional.centerStart, child: BrandLogo(height: 38)),
            const SizedBox(height: 40),
            Container(
              width: 76,
              height: 76,
              decoration: BoxDecoration(
                color: deletion != null ? AppColors.dangerBg : AppColors.warningBg,
                shape: BoxShape.circle,
              ),
              child: deletion != null
                  ? const Icon(Icons.delete_outline_rounded, color: AppColors.danger, size: 40)
                  : const Icon(Icons.pause_circle_outline_rounded, color: AppColors.warning, size: 40),
            ),
            const SizedBox(height: 20),
            Text(
              deletion != null
                  ? (female ? 'طلبتِ حذف حسابكِ' : 'طلبتَ حذف حسابك')
                  : (female ? 'حسابكِ موقوف مؤقتاً' : 'حسابك موقوف مؤقتاً'),
              style: theme.textTheme.headlineSmall,
            ),
            const SizedBox(height: 10),
            if (deletion != null) ...[
              InfoBanner(
                key: const Key('deletion-date'),
                tone: BannerTone.danger,
                icon: Icons.event_busy_rounded,
                text: 'سيُحذف ${female ? 'حسابكِ' : 'حسابك'} نهائياً بتاريخ ${formatDate(deletion)}'
                    '${days > 0 ? ' (${daysLeftLabel(days)})' : ''}.',
              ),
              const SizedBox(height: 12),
              Text(
                female
                    ? 'حتى ذلك الموعد يمكنكِ إلغاء الطلب واستعادة حسابكِ ببياناتكِ وتوافقاتكِ، '
                        'أما المحادثات وطلبات التعارف التي انتهت عند تعطيل الحساب فلا تعود. '
                        'بعد الحذف لا يمكن استعادة أي بيانات.'
                    : 'حتى ذلك الموعد يمكنك إلغاء الطلب واستعادة حسابك ببياناتك وتوافقاتك، '
                        'أما المحادثات وطلبات التعارف التي انتهت عند تعطيل الحساب فلا تعود. '
                        'بعد الحذف لا يمكن استعادة أي بيانات.',
                style: theme.textTheme.bodyMedium?.copyWith(color: AppColors.muted),
              ),
            ] else
              Text(
                '${me?.firstName.isNotEmpty == true ? '${me!.firstName}، ' : ''}'
                '${female ? 'أوقفتِ حسابكِ، فلا يظهر ملفكِ لأحد ولا تصلكِ اقتراحات جديدة.'
                    : 'أوقفت حسابك، فلا يظهر ملفك لأحد ولا تصلك اقتراحات جديدة.'}',
                style: theme.textTheme.bodyLarge?.copyWith(color: AppColors.muted),
              ),
            if (proText != null) ...[
              const SizedBox(height: 16),
              InfoBanner(key: const Key('paused-pro'), icon: Icons.workspace_premium_rounded, text: proText),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton(
                  key: const Key('paused-pro-open'),
                  onPressed: () => context.push('/pro'),
                  child: const Text('اشتراكي في Pro'),
                ),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 16),
              InfoBanner(text: _error!, tone: BannerTone.danger),
            ],
            const SizedBox(height: 28),
            LoadingButton(
              label: deletion != null ? 'إلغاء الحذف وإعادة التفعيل' : 'إعادة تفعيل حسابي',
              loading: _busy,
              onPressed: _reactivate,
            ),
            const SizedBox(height: 12),
            LoadingButton(
              label: 'تسجيل الخروج',
              outlined: true,
              onPressed: _busy ? null : () => ref.read(authControllerProvider.notifier).logout(),
            ),
          ],
        ),
      ),
    );
  }
}
