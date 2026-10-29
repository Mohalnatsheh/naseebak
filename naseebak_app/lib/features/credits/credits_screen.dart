import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/config/env.dart';
import '../../core/localization/digits.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../home/counts.dart';
import 'credits_repository.dart';

/// Balance, packages and checkout. Credits are added by the server only after the payment is confirmed.
class CreditsScreen extends ConsumerStatefulWidget {
  const CreditsScreen({super.key, this.showMockButton});

  /// Defaults to debug builds only
  final bool? showMockButton;

  @override
  ConsumerState<CreditsScreen> createState() => _CreditsScreenState();
}

class _CreditsScreenState extends ConsumerState<CreditsScreen> {
  String? _buying;

  bool get _mockAllowed => widget.showMockButton ?? Env.showMockPayments;

  Future<void> _buy(CreditPackage pkg) async {
    if (_buying != null) return;
    setState(() => _buying = pkg.id);
    final repo = ref.read(creditsRepositoryProvider);
    try {
      final start = await repo.checkout(pkg.id);
      if (!mounted) return;
      if (start.mock) {
        if (!_mockAllowed) {
          showSnack(context, 'الدفع غير متاح في هذه النسخة.');
          return;
        }
        final paid = await _mockDialog(pkg);
        if (paid == null || !mounted) return;
        await repo.completeMock(start.paymentId, paid: paid);
      } else if (start.checkoutUrl != null) {
        final ok = await launchUrl(Uri.parse(start.checkoutUrl!), mode: LaunchMode.externalApplication)
            .catchError((_) => false);
        if (!ok) {
          if (mounted) showSnack(context, 'تعذّر فتح صفحة الدفع');
          return;
        }
      } else {
        if (mounted) showSnack(context, ApiException.genericMessage);
        return;
      }
      if (!mounted) return;
      final result = await showDialog<PaymentStatus?>(
        context: context,
        barrierDismissible: false,
        builder: (_) => _PaymentWaitDialog(repo: repo, paymentId: start.paymentId),
      );
      if (!mounted) return;
      _showResult(result);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message);
    } finally {
      if (mounted) setState(() => _buying = null);
    }
  }

  void _showResult(PaymentStatus? s) {
    final auth = ref.read(authControllerProvider.notifier);
    ref.invalidate(paymentHistoryProvider);
    ref.invalidate(countsProvider);
    if (s == null) {
      showSnack(context, 'لم يصلنا تأكيد الدفع بعد. سيُضاف رصيدك تلقائياً عند التأكيد.');
      auth.refreshMe();
      return;
    }
    auth.updateCredits(s.credits);
    switch (s.status) {
      case 'COMPLETED':
        showSnack(context, 'تم الدفع بنجاح. رصيدك الآن ${s.credits}.');
      case 'FAILED':
        showSnack(context, 'لم تكتمل عملية الدفع، ولم يُخصم شيء.');
      default:
        showSnack(context, 'حالة الدفع: ${s.status}');
    }
  }

  Future<bool?> _mockDialog(CreditPackage pkg) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('دفع تجريبي'),
        content: Text(
          'نسخة تطوير: لا يوجد دفع حقيقي. اختر نتيجة الدفع لباقة «${pkg.name}».',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('إلغاء الدفع')),
          FilledButton(
            key: const Key('mock-pay'),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('دفع تجريبي ناجح'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final plans = ref.watch(plansProvider);
    final me = ref.watch(authControllerProvider).me;
    return Scaffold(
      appBar: AppBar(
        title: const Text('الرصيد'),
        actions: [
          TextButton(onPressed: () => context.push('/credits/history'), child: const Text('السجل')),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(plansProvider);
          await ref.read(authControllerProvider.notifier).refreshMe();
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: AppColors.navy, borderRadius: BorderRadius.circular(20)),
              child: Row(
                children: [
                  const Icon(Icons.account_balance_wallet_outlined, color: AppColors.goldLight, size: 32),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('رصيدك الحالي', style: TextStyle(color: Colors.white70, fontSize: 14)),
                        Text(
                          '${me?.credits ?? 0}',
                          key: const Key('balance'),
                          style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w800),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'يُستخدم الرصيد عند إبداء الاهتمام أو طلب التعارف بحسب نظام المنصة. لا يُخصم أي رصيد على «لا».',
              style: TextStyle(color: AppColors.muted, fontSize: 13.5),
            ),
            const SizedBox(height: 16),
            const SectionTitle('الباقات'),
            plans.when(
              loading: () => const Column(children: [
                SkeletonBox(height: 84),
                SizedBox(height: 10),
                SkeletonBox(height: 84),
              ]),
              error: (e, _) => SizedBox(
                height: 260,
                child: ErrorView(error: e, onRetry: () => ref.invalidate(plansProvider)),
              ),
              data: (p) => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (!p.purchasesEnabled) ...[
                    const InfoBanner(
                      key: Key('purchases-disabled'),
                      text: 'شراء الرصيد غير متاح في دولتك حالياً. سنُعلمك عند توفره.',
                      tone: BannerTone.warning,
                    ),
                    const SizedBox(height: 12),
                  ],
                  if (p.packages.isEmpty)
                    const InfoBanner(text: 'لا توجد باقات متاحة حالياً.')
                  else
                    for (final pkg in p.packages) ...[
                      _PackageTile(
                        pkg: pkg,
                        enabled: p.purchasesEnabled,
                        busy: _buying == pkg.id,
                        onBuy: _buying == null ? () => _buy(pkg) : null,
                      ),
                      const SizedBox(height: 10),
                    ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Keeps a Latin amount like "4.23$" in its own order inside Arabic text.
String ltrIsolate(String v) => '${String.fromCharCode(0x2066)}$v${String.fromCharCode(0x2069)}';

class _PackageTile extends StatelessWidget {
  const _PackageTile({required this.pkg, required this.enabled, required this.busy, required this.onBuy});
  final CreditPackage pkg;
  final bool enabled;
  final bool busy;
  final VoidCallback? onBuy;

  @override
  Widget build(BuildContext context) {
    final price = '${formatAmount(pkg.price)} ${pkg.currencySymbol}';
    return Card(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: pkg.popular ? AppColors.gold : AppColors.line, width: pkg.popular ? 1.6 : 1),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(child: Text(pkg.name, style: Theme.of(context).textTheme.titleMedium)),
                      if (pkg.popular) ...[const SizedBox(width: 8), const Pill(text: 'الأكثر طلباً', color: AppColors.gold)],
                    ],
                  ),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(price, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: AppColors.navy)),
                      if (pkg.wasPrice != null && pkg.wasPrice! > pkg.price)
                        Text(
                          '${formatAmount(pkg.wasPrice!)} ${pkg.currencySymbol}',
                          style: const TextStyle(color: AppColors.muted, decoration: TextDecoration.lineThrough),
                        ),
                    ],
                  ),
                  if (pkg.chargeLabel != null && !pkg.chargeLabel!.contains(pkg.currencySymbol))
                    Text('يُحصَّل ${ltrIsolate(pkg.chargeLabel!)}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                ],
              ),
            ),
            const SizedBox(width: 10),
            SizedBox(
              width: 104,
              child: enabled
                  ? FilledButton(
                      key: Key('buy-${pkg.id}'),
                      onPressed: busy ? null : onBuy,
                      child: busy
                          ? const SizedBox(
                              width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('شراء'),
                    )
                  : const OutlinedButton(onPressed: null, child: Text('غير متاح')),
            ),
          ],
        ),
      ),
    );
  }
}

class _PaymentWaitDialog extends StatefulWidget {
  const _PaymentWaitDialog({required this.repo, required this.paymentId});
  final CreditsRepository repo;
  final String paymentId;

  @override
  State<_PaymentWaitDialog> createState() => _PaymentWaitDialogState();
}

class _PaymentWaitDialogState extends State<_PaymentWaitDialog> {
  bool _stopped = false;

  @override
  void initState() {
    super.initState();
    waitForPayment(widget.repo, widget.paymentId, cancelled: () => _stopped).then((s) {
      if (mounted && !_stopped) Navigator.of(context).pop(s);
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      content: const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(height: 8),
          CircularProgressIndicator(),
          SizedBox(height: 18),
          Text('بانتظار تأكيد الدفع…', textAlign: TextAlign.center),
          SizedBox(height: 4),
          Text('أكمل الدفع في الصفحة المفتوحة ثم عد إلى التطبيق.',
              textAlign: TextAlign.center, style: TextStyle(color: AppColors.muted, fontSize: 13)),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () {
            _stopped = true;
            Navigator.of(context).pop(null);
          },
          child: const Text('إخفاء'),
        ),
      ],
    );
  }
}

class PaymentHistoryScreen extends ConsumerWidget {
  const PaymentHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(paymentHistoryProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('سجل المدفوعات')),
      body: history.when(
        loading: () => const SkeletonList(count: 4, itemHeight: 64),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(paymentHistoryProvider)),
        data: (h) => h.items.isEmpty
            ? const MessageView(icon: Icons.receipt_long_outlined, title: 'لا توجد مدفوعات بعد')
            : ListView.separated(
                itemCount: h.items.length,
                separatorBuilder: (_, _) => const Divider(),
                itemBuilder: (_, i) {
                  final p = h.items[i];
                  final (label, color) = switch (p.status) {
                    'COMPLETED' => ('مكتمل', AppColors.success),
                    'PENDING' => ('قيد الانتظار', AppColors.warning),
                    'REFUNDED' => ('مسترد', AppColors.navy),
                    _ => ('لم يكتمل', AppColors.danger),
                  };
                  return ListTile(
                    minVerticalPadding: 12,
                    title: Text(p.description?.replaceFirst('[MOCK] ', '') ?? 'شراء رصيد'),
                    subtitle: Text(p.createdAt != null ? formatDate(p.createdAt!) : ''),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('${formatAmount(p.amount)} ${p.currency}', style: const TextStyle(fontWeight: FontWeight.w700)),
                        Pill(text: label, color: color),
                      ],
                    ),
                  );
                },
              ),
      ),
    );
  }
}
