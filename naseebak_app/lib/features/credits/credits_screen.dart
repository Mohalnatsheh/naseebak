import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/analytics/analytics.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/config/env.dart';
import '../../core/localization/digits.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/json.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../home/counts.dart';
import '../pro/pro_repository.dart';
import '../pro/pro_section.dart';
import 'credits_repository.dart';

/// Balance, packages and checkout. Credits are added by the server only after the payment is confirmed.
///
/// A checkout opens in the browser; the screen keeps its payment id while it lives and checks it when the app comes
/// back to the foreground, until it is COMPLETED / FAILED or [pollWindow] passes. The waiting dialog can be closed
/// («إخفاء» or back) — the check goes on and a snack reports the result. Still PENDING a moment after the member
/// returns ([cancelGrace]) → «إلغاء الدفع» (`POST /api/payments/cancel`; the server credits it if it was paid).
class CreditsScreen extends ConsumerStatefulWidget {
  const CreditsScreen({
    super.key,
    this.showMockButton,
    this.openCheckout,
    this.pollInterval = const Duration(milliseconds: 2500),
    this.pollWindow = const Duration(minutes: 10),
    this.cancelGrace = const Duration(seconds: 8),
  });

  /// Defaults to debug builds only
  final bool? showMockButton;

  /// Opens the Stripe page; defaults to the external browser (tests pass a fake)
  final Future<bool> Function(Uri url)? openCheckout;

  final Duration pollInterval;
  final Duration pollWindow;

  /// How long after returning to the app a still PENDING payment waits before «إلغاء الدفع» is offered
  final Duration cancelGrace;

  @override
  ConsumerState<CreditsScreen> createState() => _CreditsScreenState();
}

class _CreditsScreenState extends ConsumerState<CreditsScreen> with WidgetsBindingObserver {
  String? _buying;

  /// The checkout opened from this screen whose result isn't known yet
  String? _pendingId;
  bool _polling = false;

  /// Bumped to stop the running poll
  int _pollRun = 0;
  Timer? _graceTimer;

  /// The «بانتظار تأكيد الدفع» dialog is open; setting [_dialogDone] closes it (it closes itself, even before its
  /// first frame)
  bool _dialogOpen = false;
  final _dialogDone = ValueNotifier(false);

  /// Set when the screen closes the dialog itself (result or timeout), so no «نتابع…» snack follows
  bool _closingDialog = false;
  final _offerCancel = ValueNotifier(false);
  final _cancelling = ValueNotifier(false);

  bool get _mockAllowed => widget.showMockButton ?? Env.showMockPayments;

  CreditsRepository get _repo => ref.read(creditsRepositoryProvider);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Balance and the app payments switch may have changed since `me` was read
    ref.read(authControllerProvider.notifier).refreshMe();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pollRun++;
    _graceTimer?.cancel();
    _offerCancel.dispose();
    _dialogDone.dispose();
    _cancelling.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    if (_pendingId == null) return;
    // Back from the checkout page: keep checking (a new window if the last one ran out), offer cancel if still pending
    _poll();
    _graceTimer?.cancel();
    _graceTimer = Timer(widget.cancelGrace, () {
      if (mounted && _pendingId != null) _offerCancel.value = true;
    });
  }

  Future<void> _buy(CreditPackage pkg) async {
    if (_buying != null) return;
    setState(() => _buying = pkg.id);
    String? paymentId;
    try {
      final start = await _repo.checkout(pkg.id);
      if (!mounted) return;
      ref.read(analyticsProvider).checkoutStarted(pkg.id);
      if (start.mock) {
        if (!_mockAllowed) {
          showSnack(context, 'الدفع غير متاح في هذه النسخة.');
          return;
        }
        final paid = await _mockDialog(pkg);
        if (paid == null || !mounted) return;
        await _repo.completeMock(start.paymentId, paid: paid);
      } else if (start.checkoutUrl != null && Uri.tryParse(start.checkoutUrl!)?.scheme == 'https') {
        // Tracked before the browser opens: the return to the app (resumed) may come before launch answers
        _track(start.paymentId);
        final open = widget.openCheckout ?? (u) => launchUrl(u, mode: LaunchMode.externalApplication);
        final ok = await open(Uri.parse(start.checkoutUrl!)).catchError((_) => false);
        if (!ok) {
          _untrack();
          _repo.cancel(start.paymentId).ignore();
          if (mounted) showSnack(context, 'تعذّر فتح صفحة الدفع');
          return;
        }
      } else {
        if (mounted) showSnack(context, ApiException.genericMessage);
        return;
      }
      paymentId = start.paymentId;
    } on ApiException catch (e) {
      // Payments switched off in the app since `me` was read: re-read it so the packages disappear
      if (e.code == 'APP_PURCHASES_DISABLED') ref.read(authControllerProvider.notifier).refreshMe();
      if (mounted) showSnack(context, e.message);
    } finally {
      if (mounted) setState(() => _buying = null);
    }
    if (paymentId == null || !mounted) return;
    _track(paymentId);
    _poll();
    _showWaitDialog();
  }

  /// Starts following [paymentId] (replacing an earlier one)
  void _track(String paymentId) {
    if (_pendingId == paymentId) return;
    _stopPolling();
    _graceTimer?.cancel();
    setState(() {
      _pendingId = paymentId;
      _offerCancel.value = false;
    });
  }

  void _untrack() {
    _stopPolling();
    _graceTimer?.cancel();
    if (mounted) {
      setState(() {
        _pendingId = null;
        _offerCancel.value = false;
      });
    }
  }

  void _stopPolling() {
    _pollRun++;
    _polling = false;
  }

  /// Polls the pending payment unless a poll is already running
  void _poll() {
    final id = _pendingId;
    if (id == null || _polling) return;
    _polling = true;
    final run = ++_pollRun;
    waitForPayment(
      _repo,
      id,
      interval: widget.pollInterval,
      timeout: widget.pollWindow,
      cancelled: () => run != _pollRun || !mounted,
    ).then((s) {
      if (run != _pollRun || !mounted) return;
      _polling = false;
      if (s != null) {
        _finish(s);
        return;
      }
      // Window over: the id is kept, the next return to the app checks again; the server credits it when it lands
      _closeWaitDialog();
      showSnack(context, 'لم يصلنا تأكيد الدفع بعد. سيُضاف رصيدك تلقائياً عند التأكيد.');
      ref.read(authControllerProvider.notifier).refreshMe();
      ref.invalidate(paymentHistoryProvider);
    });
  }

  /// The payment left PENDING (also after the dialog was closed): new balance, history and badges, and a snack.
  void _finish(PaymentStatus s, {bool cancelled = false}) {
    _untrack();
    _closeWaitDialog();
    ref.read(authControllerProvider.notifier).updateCredits(s.credits);
    ref.invalidate(paymentHistoryProvider);
    ref.invalidate(countsProvider);
    _showResult(s, cancelled: cancelled);
  }

  void _showResult(PaymentStatus s, {bool cancelled = false}) {
    switch (s.status) {
      case 'COMPLETED':
        showSnack(context, 'تم الدفع بنجاح. رصيدك الآن ${s.credits}.');
      case 'FAILED':
        showSnack(context, cancelled ? 'تم إلغاء الدفع، ولم يُخصم شيء.' : 'لم تكتمل عملية الدفع، ولم يُخصم شيء.');
      default:
        showSnack(context, 'حالة الدفع: ${s.status}');
    }
  }

  /// «إلغاء الدفع»: the server closes the Stripe page (or credits it if it was paid meanwhile), then the row is read
  Future<void> _cancel() async {
    final id = _pendingId;
    if (id == null || _cancelling.value) return;
    _cancelling.value = true;
    // The cancel decides the outcome; polling resumes if the page stays open
    _stopPolling();
    try {
      await _repo.cancel(id);
      final s = await _repo.status(id);
      if (!mounted || _pendingId != id) return;
      if (s.status == 'PENDING') {
        // Stripe couldn't close the page yet: keep checking
        showSnack(context, 'تعذّر إلغاء الدفع الآن، سنتابع حالته.');
        _poll();
      } else {
        _finish(s, cancelled: true);
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      showSnack(context, e.message);
      _poll();
    } finally {
      if (mounted) _cancelling.value = false;
    }
  }

  void _showWaitDialog() {
    if (_dialogOpen || _pendingId == null) return;
    setState(() => _dialogOpen = true);
    _dialogDone.value = false;
    _closingDialog = false;
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _PaymentWaitDialog(
        done: _dialogDone,
        offerCancel: _offerCancel,
        cancelling: _cancelling,
        onCancel: _cancel,
      ),
    ).then((_) {
      if (!mounted) return;
      final byMember = !_closingDialog;
      _closingDialog = false;
      setState(() => _dialogOpen = false);
      if (_pendingId == null || !byMember) return;
      // Closed with «إخفاء» or back: the check goes on behind it
      showSnack(context, 'نتابع تأكيد الدفع، وسنُعلمك هنا عند وصوله.');
    });
  }

  void _closeWaitDialog() {
    if (!_dialogOpen || _dialogDone.value) return;
    _closingDialog = true;
    _dialogDone.value = true;
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
    final payments = ref.watch(appPaymentsProvider);
    // Payments hidden in the app: balance and history only (no packages, no pointer to buying elsewhere)
    final plans = payments ? ref.watch(plansProvider) : null;
    final me = ref.watch(authControllerProvider).me;
    // Pro lives on its own screen (`/pro`); here only a link card, and only where payments show
    final pro = payments ? ref.watch(proStateProvider).valueOrNull : null;
    return Scaffold(
      appBar: AppBar(
        title: const Text('الرصيد'),
        actions: [
          // Payment history only where buying is shown (hidden for test accounts / the app payments switch)
          if (payments) TextButton(onPressed: () => context.push('/credits/history'), child: const Text('السجل')),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(plansProvider);
          if (payments) ref.invalidate(proStateProvider);
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
            Text(creditRuleLine(ref.watch(countsProvider).valueOrNull?.flags), style: const TextStyle(color: AppColors.muted, fontSize: 13.5)),
            if (_pendingId != null && !_dialogOpen) ...[
              const SizedBox(height: 12),
              _PendingPaymentCard(offerCancel: _offerCancel, cancelling: _cancelling, onCancel: _cancel),
            ],
            if (pro != null && showPlans(pro, payments)) ...[
              const SizedBox(height: 16),
              ProLinkCard(isPro: pro.isPro),
            ],
            if (plans != null) ...[
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

/// «إلغاء الدفع», shown once [offerCancel] is set (the member came back and the payment is still pending)
class _CancelPaymentButton extends StatelessWidget {
  const _CancelPaymentButton({required this.offerCancel, required this.cancelling, required this.onCancel});
  final ValueListenable<bool> offerCancel;
  final ValueListenable<bool> cancelling;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: offerCancel,
      builder: (_, offer, _) => !offer
          ? const SizedBox.shrink()
          : ValueListenableBuilder<bool>(
              valueListenable: cancelling,
              builder: (_, busy, _) => TextButton(
                key: const Key('cancel-payment'),
                onPressed: busy ? null : onCancel,
                style: TextButton.styleFrom(foregroundColor: AppColors.danger),
                child: Text(busy ? 'جارٍ الإلغاء…' : 'إلغاء الدفع'),
              ),
            ),
    );
  }
}

/// Waits for the payment; the screen closes it with the result ([done]). «إخفاء» / back only close it (the check
/// goes on).
class _PaymentWaitDialog extends StatefulWidget {
  const _PaymentWaitDialog({
    required this.done,
    required this.offerCancel,
    required this.cancelling,
    required this.onCancel,
  });
  final ValueListenable<bool> done;
  final ValueListenable<bool> offerCancel;
  final ValueListenable<bool> cancelling;
  final VoidCallback onCancel;

  @override
  State<_PaymentWaitDialog> createState() => _PaymentWaitDialogState();
}

class _PaymentWaitDialogState extends State<_PaymentWaitDialog> {
  bool _closed = false;

  @override
  void initState() {
    super.initState();
    widget.done.addListener(_closeIfDone);
    // The result may have come before this dialog was built
    WidgetsBinding.instance.addPostFrameCallback((_) => _closeIfDone());
  }

  @override
  void dispose() {
    widget.done.removeListener(_closeIfDone);
    super.dispose();
  }

  void _closeIfDone() {
    if (!widget.done.value || _closed || !mounted) return;
    final route = ModalRoute.of(context);
    if (route == null || !route.isActive) return;
    _closed = true;
    // Something may have been pushed over it: remove the dialog itself, never the route on top
    route.isCurrent ? Navigator.of(context).pop() : Navigator.of(context).removeRoute(route);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      key: const Key('payment-wait'),
      content: const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(height: 8),
          CircularProgressIndicator(),
          SizedBox(height: 18),
          Text('بانتظار تأكيد الدفع…', textAlign: TextAlign.center),
          SizedBox(height: 4),
          Text('يمكنك إكمال الدفع في الصفحة المفتوحة ثم العودة إلى التطبيق.',
              textAlign: TextAlign.center, style: TextStyle(color: AppColors.muted, fontSize: 13)),
        ],
      ),
      actions: [
        _CancelPaymentButton(offerCancel: widget.offerCancel, cancelling: widget.cancelling, onCancel: widget.onCancel),
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('إخفاء')),
      ],
    );
  }
}

/// On the screen while a payment is still being checked and its dialog was closed
class _PendingPaymentCard extends StatelessWidget {
  const _PendingPaymentCard({required this.offerCancel, required this.cancelling, required this.onCancel});
  final ValueListenable<bool> offerCancel;
  final ValueListenable<bool> cancelling;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return Card(
      key: const Key('payment-pending'),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
        child: Row(
          children: [
            const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
            const SizedBox(width: 12),
            const Expanded(child: Text('بانتظار تأكيد الدفع، سيُضاف رصيدك عند التأكيد.')),
            _CancelPaymentButton(offerCancel: offerCancel, cancelling: cancelling, onCancel: onCancel),
          ],
        ),
      ),
    );
  }
}

/// «سجل المدفوعات», 10 a page like the website: «عرض المزيد» loads older ones, pull-to-refresh starts again.
class PaymentHistoryScreen extends ConsumerStatefulWidget {
  const PaymentHistoryScreen({super.key});

  @override
  ConsumerState<PaymentHistoryScreen> createState() => _PaymentHistoryScreenState();
}

class _PaymentHistoryScreenState extends ConsumerState<PaymentHistoryScreen> {
  /// Pages after the first (the first is [paymentHistoryProvider], reloaded after a payment)
  final List<PaymentRecord> _older = [];
  PageInfo? _page;
  bool _loadingMore = false;

  /// Bumped when the first page reloads, so a «عرض المزيد» answer for the old list is dropped
  int _generation = 0;

  void _reset() {
    _generation++;
    _older.clear();
    _page = null;
    _loadingMore = false;
  }

  Future<void> _more(PageInfo first, List<PaymentRecord> shown) async {
    final p = _page ?? first;
    if (!p.hasMore || _loadingMore) return;
    final generation = _generation;
    setState(() => _loadingMore = true);
    try {
      final res = await ref.read(creditsRepositoryProvider).history(page: p.page + 1);
      if (!mounted || generation != _generation) return;
      final seen = shown.map((e) => e.id).toSet();
      setState(() {
        _older.addAll(res.items.where((e) => seen.add(e.id)));
        _page = res.page;
      });
    } catch (e) {
      if (mounted) showSnack(context, ApiException.messageOf(e));
    } finally {
      if (mounted && generation == _generation) setState(() => _loadingMore = false);
    }
  }

  Future<void> _refresh() async {
    setState(_reset);
    ref.invalidate(paymentHistoryProvider);
    await ref.read(paymentHistoryProvider.future);
  }

  @override
  Widget build(BuildContext context) {
    // The first page reloaded elsewhere (after a payment): the older pages start again too
    ref.listen(paymentHistoryProvider, (prev, next) {
      if (prev?.valueOrNull != null && next.valueOrNull != prev?.valueOrNull) setState(_reset);
    });
    final history = ref.watch(paymentHistoryProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('سجل المدفوعات')),
      body: history.when(
        loading: () => const SkeletonList(count: 4, itemHeight: 64),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(paymentHistoryProvider)),
        data: (h) {
          final items = [...h.items, ..._older];
          final hasMore = (_page ?? h.page).hasMore;
          return RefreshIndicator(
            onRefresh: _refresh,
            child: items.isEmpty
                ? ListView(children: const [
                    SizedBox(
                      height: 420,
                      child: MessageView(icon: Icons.receipt_long_outlined, title: 'لا توجد مدفوعات بعد'),
                    ),
                  ])
                : ListView.separated(
                    itemCount: items.length + 1,
                    separatorBuilder: (_, _) => const Divider(),
                    itemBuilder: (_, i) {
                      if (i == items.length) {
                        if (!hasMore) return const SizedBox(height: 24);
                        return _loadingMore
                            ? const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()))
                            : TextButton(
                                key: const Key('payments-more'),
                                onPressed: () => _more(h.page, items),
                                child: const Text('عرض المزيد'),
                              );
                      }
                      final p = items[i];
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
          );
        },
      ),
    );
  }
}

/// What a credit buys, following the switches like the website's payments page (`creditLine`): never
/// says requests cost credit while «مهتم» is what costs, and adds the free reply while it is on.
String creditRuleLine(CycleFlags? flags) {
  if (flags?.creditOnInterest ?? false) {
    const line = 'يُستخدم رصيد واحد عند اختيار «مهتم»، والتوافق والطلبات والمحادثة مجانية.';
    return flags!.freeInterestReply ? '$line الرد بـ«مهتم» على من أبدى اهتمامه مجاني.' : line;
  }
  return 'يُستخدم الرصيد عند إبداء الاهتمام أو طلب التعارف بحسب نظام المنصة. لا يُخصم أي رصيد على «لا».';
}
