import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/localization/digits.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/brand_kit.dart';
import '../../shared/widgets/common.dart';
import '../home/counts.dart';
import '../home/gendered_copy.dart';
import 'pro_repository.dart';

/// Plan order on the selector (weekly first = on the right in RTL), like the website's `PRO_PLAN_IDS`
const proPlanIds = ['weekly', 'monthly', 'yearly'];
const proPlanLabels = {'weekly': 'أسبوعي', 'monthly': 'شهري', 'yearly': 'سنوي'};
const _perPeriod = {'weekly': 'في الأسبوع', 'monthly': 'في الشهر', 'yearly': 'في السنة'};

/// Weekly and monthly grant on each renewal; yearly grants a monthly amount every month
const _creditsEvery = {'weekly': 'كل أسبوع', 'monthly': 'كل شهر', 'yearly': 'كل شهر'};

/// What every Pro plan gives (plans card and «اشتراكي»)
const proFeatureLabels = ['إرسال الصور في المحادثة', 'الرسائل الصوتية في المحادثة', 'شارة Pro على بطاقتك', 'أولوية في الاقتراحات'];

String _currencySymbol(String code) => switch (code.toUpperCase()) {
  'JOD' => 'د.أ',
  'SAR' => 'ر.س',
  _ => code,
};

/// Keeps a Latin amount like "5.64$" in its own order inside Arabic text.
String _ltr(String v) => '${String.fromCharCode(0x2066)}$v${String.fromCharCode(0x2069)}';

/// «رصيد واحد» / «رصيدان» / «8 أرصدة» / «12 رصيداً» (the website's `arabicCount`)
String creditsCount(int n) {
  if (n == 1) return 'رصيد واحد';
  if (n == 2) return 'رصيدان';
  final mod100 = n % 100;
  if (mod100 >= 3 && mod100 <= 10) return '$n أرصدة';
  return '$n رصيداً';
}

/// «8 أرصدة مجاناً كل شهر»
String proCreditsLine(ProOffer o) => '${creditsCount(o.credits)} مجاناً ${_creditsEvery[o.id] ?? 'كل شهر'}';

/// «اشتراكي» once the renewal is off: why (the member cancelled, or pausing the account stopped it) and, while still
/// paused, that resuming waits for reactivation (QA A-M01)
String myProEndingText({required bool stoppedByPause, required bool paused, bool female = false}) {
  final can = female ? 'يمكنكِ' : 'يمكنك';
  final why = stoppedByPause
      ? 'توقّف التجديد عند إيقاف ${female ? 'حسابكِ' : 'حسابك'}'
      : (female ? 'ألغيتِ التجديد' : 'ألغيتَ التجديد');
  final next = paused
      ? '$can متابعة الاشتراك بعد إعادة تفعيل ${female ? 'حسابكِ' : 'حسابك'}.'
      : '$can متابعة الاشتراك قبل ذلك.';
  return '$why، وتبقى مزايا Pro حتى هذا التاريخ. $next';
}

/// A Pro member's one line («حسابي», the Pro screen and the credits card)
const proActiveText = 'مزايا Pro فعّالة في حسابك.';

/// Under the plans: renewal, and the free credits only when a plan has some
String proFootnote(List<ProOffer> offers) {
  const renew = 'يتجدد الاشتراك تلقائياً، ويمكنك إلغاء التجديد في أي وقت.';
  return offers.any((o) => o.credits > 0) ? '$renew الرصيد المجاني يُضاف إلى رصيدك ولا تنتهي صلاحيته.' : renew;
}

/// One line on what Pro gives; the free credits only when a plan has some
String proPitch(List<ProOffer> offers) {
  final credits = offers.any((o) => o.credits > 0) ? '، ويصلك رصيد مجاني مع الاشتراك' : '';
  return 'مع Pro يمكنك إرسال الصور والرسائل الصوتية في المحادثة، ولك أولوية في الاقتراحات$credits.';
}

/// The Pro screen's content: «اشتراكي» for a Pro member, otherwise the plans card.
/// The caller shows it only when [showPlans] is true.
class ProSection extends StatelessWidget {
  const ProSection({
    super.key,
    required this.state,
    required this.female,
    required this.subscribing,
    required this.onSubscribe,
  });

  final MyProState state;
  final bool female;
  final bool subscribing;
  final void Function(ProOffer offer) onSubscribe;

  @override
  Widget build(BuildContext context) {
    final showChooser = !state.isPro && state.offers.isNotEmpty;
    return Column(
      key: const Key('pro-section'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [AppColors.gold, AppColors.gold.withValues(alpha: 0.7)]),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.workspace_premium_rounded, color: Colors.white, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(
              // The title is the screen's own (AppBar «عضوية Pro»)
              child: Text(
                state.isPro ? proActiveText : proPitch(state.offers),
                style: AppText.label.copyWith(color: AppColors.ink, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (state.isPro)
          MyProCard(state: state, female: female)
        else if (showChooser) ...[
          ProPlansCard(
            offers: state.offers,
            canBuy: state.canBuy,
            female: female,
            busy: subscribing,
            onSubscribe: onSubscribe,
          ),
          const SizedBox(height: 8),
          Text(
            proFootnote(state.offers),
            key: const Key('pro-footnote'),
            textAlign: TextAlign.center,
            style: AppText.caption.copyWith(color: AppColors.muted),
          ),
        ],
      ],
    );
  }
}

/// Pro as one compact card: a weekly / monthly / yearly selector (monthly first), the chosen plan's price, its free
/// credits, what Pro gives and one subscribe button (the website's `ProPlanChooser`).
class ProPlansCard extends StatefulWidget {
  const ProPlansCard({
    super.key,
    required this.offers,
    required this.canBuy,
    required this.female,
    required this.busy,
    required this.onSubscribe,
  });

  final List<ProOffer> offers;
  final bool canBuy;
  final bool female;
  final bool busy;
  final void Function(ProOffer offer) onSubscribe;

  @override
  State<ProPlansCard> createState() => _ProPlansCardState();
}

class _ProPlansCardState extends State<ProPlansCard> {
  String? _picked;

  List<ProOffer> get _sorted {
    int rank(ProOffer o) {
      final i = proPlanIds.indexOf(o.id);
      return i < 0 ? proPlanIds.length : i;
    }

    return [...widget.offers]..sort((a, b) => rank(a).compareTo(rank(b)));
  }

  @override
  void didUpdateWidget(ProPlansCard old) {
    super.didUpdateWidget(old);
    // A reload without the plan picked (withdrawn): back to the default pick, not a silent stale choice
    if (_picked != null && !widget.offers.any((o) => o.id == _picked)) _picked = null;
  }

  @override
  Widget build(BuildContext context) {
    final sorted = _sorted;
    if (sorted.isEmpty) return const SizedBox.shrink();
    final offer = sorted.firstWhere(
      (o) => o.id == _picked,
      orElse: () => sorted.firstWhere((o) => o.id == 'monthly', orElse: () => sorted.first),
    );
    final price = '${formatAmount(offer.price)} ${_currencySymbol(offer.currency)}';

    return Card(
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: AppColors.gold.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            height: 6,
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [AppColors.gold, AppColors.gold.withValues(alpha: 0.6)]),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (sorted.length > 1) ...[
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(color: AppColors.offWhite, borderRadius: BorderRadius.circular(12)),
                    child: Row(
                      children: [
                        for (final o in sorted)
                          Expanded(
                            child: _Segment(
                              key: Key('pro-plan-${o.id}'),
                              label: proPlanLabels[o.id] ?? o.id,
                              selected: o.id == offer.id,
                              onTap: () => setState(() => _picked = o.id),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                ],
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Wrap(
                            spacing: 6,
                            crossAxisAlignment: WrapCrossAlignment.end,
                            children: [
                              Text(
                                price,
                                key: const Key('pro-price'),
                                style: AppText.title.copyWith(
                                  fontWeight: FontWeight.w900,
                                  color: AppColors.navy),
                              ),
                              Padding(
                                padding: const EdgeInsets.only(bottom: 4),
                                child: Text(
                                  _perPeriod[offer.id] ?? '',
                                  style: AppText.label.copyWith(
                                    color: AppColors.muted,
                                    fontWeight: FontWeight.w600),
                                ),
                              ),
                            ],
                          ),
                          if (offer.chargeCurrency.toLowerCase() == 'usd')
                            Text(
                              '${forViewer(widget.female, 'تدفع', 'تدفعين')} ${_ltr('${(offer.chargeAmount / 100).toStringAsFixed(2)}\$')} بالدولار',
                              style: AppText.caption.copyWith(
                                color: AppColors.navy,
                                fontWeight: FontWeight.w600),
                            ),
                        ],
                      ),
                    ),
                    // Only next to other plans: on its own, "most chosen" says nothing
                    if (offer.id == 'monthly' && sorted.length > 1)
                      const Pill(text: 'الأكثر طلباً', color: AppColors.gold),
                  ],
                ),
                const SizedBox(height: 12),
                if (offer.credits > 0)
                  _FeatureLine(
                    icon: Icons.auto_awesome_rounded,
                    color: AppColors.gold,
                    text: proCreditsLine(offer),
                    strong: true,
                  ),
                for (final f in proFeatureLabels)
                  _FeatureLine(icon: Icons.check_circle_outline_rounded, color: AppColors.navy, text: f),
                const SizedBox(height: 12),
                SizedBox(
                  height: 48,
                  child: FilledButton(
                    key: const Key('pro-subscribe'),
                    // Navy on a light card: gold fills sit only on navy (design P2-4, DS-18)
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.navy,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
                    ),
                    onPressed: !widget.canBuy || widget.busy ? null : () => widget.onSubscribe(offer),
                    child: widget.busy
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : Text(
                            forViewer(widget.female, 'اشترك الآن', 'اشتركي الآن'),
                            style: AppText.body.copyWith(fontWeight: FontWeight.w800),
                          ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({super.key, required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      selected: selected,
      inMutuallyExclusiveGroup: true,
      button: true,
      child: Material(
        color: selected ? Colors.white : Colors.transparent,
        borderRadius: BorderRadius.circular(9),
        elevation: selected ? 1 : 0,
        child: InkWell(
          borderRadius: BorderRadius.circular(9),
          onTap: onTap,
          child: Container(
            height: 44,
            alignment: Alignment.center,
            decoration: selected
                ? BoxDecoration(
                    borderRadius: BorderRadius.circular(9),
                    border: Border.all(color: AppColors.gold.withValues(alpha: 0.4)),
                  )
                : null,
            child: Text(
              label,
              style: AppText.label.copyWith(
                fontWeight: FontWeight.w700,
                color: selected ? AppColors.navy : AppColors.muted),
            ),
          ),
        ),
      ),
    );
  }
}

class _FeatureLine extends StatelessWidget {
  const _FeatureLine({super.key, required this.icon, required this.color, required this.text, this.strong = false});
  final IconData icon;
  final Color color;
  final String text;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: AppText.label.copyWith(
                color: strong ? AppColors.ink : AppColors.muted,
                fontWeight: strong ? FontWeight.w700 : FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }
}

/// «اشتراكي»: the member's Pro subscription, its renewal or end date, and cancel / resume. Cancelling stops the
/// renewal only and never refunds (refunds are made by an admin).
class MyProCard extends ConsumerStatefulWidget {
  const MyProCard({super.key, required this.state, required this.female});
  final MyProState state;
  final bool female;

  @override
  ConsumerState<MyProCard> createState() => _MyProCardState();
}

class _MyProCardState extends ConsumerState<MyProCard> {
  bool _busy = false;

  String? get _date => widget.state.renewsAt == null ? null : formatDate(widget.state.renewsAt!);

  Future<void> _confirmCancel() async {
    final date = _date;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('إلغاء تجديد Pro'),
        content: Text(
          'سيتوقف التجديد وتبقى العضوية حتى ${date ?? 'نهاية المدة الحالية'}. لا يُسترد مبلغ المدة الحالية.',
          key: const Key('pro-cancel-text'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(forViewer(widget.female, 'تراجع', 'تراجعي')),
          ),
          FilledButton(
            key: const Key('pro-cancel-confirm'),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('إلغاء التجديد'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await _manage(cancel: true);
  }

  Future<void> _manage({required bool cancel}) async {
    if (_busy) return;
    // Taken before the request: the state still reloads if the screen closes meanwhile
    final container = ProviderScope.containerOf(context, listen: false);
    final repo = ref.read(proRepositoryProvider);
    setState(() => _busy = true);
    try {
      cancel ? await repo.cancel() : await repo.resume();
      final memberId = container.read(authControllerProvider).me?.id;
      // Either way the member decided it now: the note about the pause no longer explains anything
      if (memberId != null) await container.read(proPauseNoteProvider).clear(memberId);
      container.invalidate(proStateProvider);
      container.invalidate(countsProvider);
      if (mounted) showSnack(context, cancel ? 'تم إلغاء التجديد.' : 'تمت متابعة الاشتراك.');
    } catch (e) {
      // e.g. a 404: the subscription is already gone or changed elsewhere, so «اشتراكي» reloads
      container.invalidate(proStateProvider);
      if (mounted) showSnack(context, ApiException.messageOf(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.state;
    final date = _date;
    final me = ref.watch(authControllerProvider).me;
    final paused = me?.deactivated ?? false;
    final stoppedByPause = ref.watch(proPauseNoteProvider).stopped(me?.id, pro: s);
    final planOffer = s.offers.where((o) => o.id == s.plan).firstOrNull;
    return Card(
      key: const Key('my-pro'),
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: AppColors.gold.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            height: 6,
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [AppColors.gold, AppColors.gold.withValues(alpha: 0.6)]),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    // A gold seal (design P2) on «اشتراكي»
                    const SealMark(size: 34, icon: Icons.workspace_premium_rounded, label: 'عضوية Pro'),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'اشتراكي',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                      ),
                    ),
                    if (s.plan != null) Pill(text: 'الباقة: ${proPlanLabels[s.plan] ?? s.plan}'),
                  ],
                ),
                // The renewal state is clear at a glance: renewing, or ending on a date
                if (!s.pastDue) ...[
                  const SizedBox(height: 8),
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: Pill(
                      key: const Key('pro-renewal-state'),
                      text: s.cancelAtPeriodEnd ? 'لا يتجدد' : 'يتجدد تلقائياً',
                      color: s.cancelAtPeriodEnd ? AppColors.warning : AppColors.success,
                      icon: s.cancelAtPeriodEnd ? Icons.event_busy_rounded : Icons.autorenew_rounded,
                    ),
                  ),
                ],
                const SizedBox(height: 10),
                if (s.pastDue)
                  const InfoBanner(
                    key: Key('pro-past-due'),
                    text: 'تعذّر تجديد الاشتراك، يمكنك تحديث بطاقتك من الموقع',
                    tone: BannerTone.warning,
                    icon: Icons.warning_amber_rounded,
                  )
                else if (date != null)
                  Row(
                    children: [
                      const Icon(Icons.event_rounded, size: 18, color: AppColors.navy),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          s.cancelAtPeriodEnd ? 'ينتهي في $date' : 'يتجدد في $date',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ),
                if (s.cancelAtPeriodEnd && !s.pastDue) ...[
                  const SizedBox(height: 6),
                  Text(
                    myProEndingText(stoppedByPause: stoppedByPause, paused: paused, female: widget.female),
                    key: const Key('pro-ending-text'),
                    style: AppText.labelRegular.copyWith(color: AppColors.muted),
                  ),
                ],
                const SizedBox(height: 10),
                // The plan's free credits, as on the plans card (QA A-L11)
                if (planOffer != null && planOffer.credits > 0)
                  _FeatureLine(
                    key: const Key('my-pro-credits'),
                    icon: Icons.auto_awesome_rounded,
                    color: AppColors.gold,
                    text: proCreditsLine(planOffer),
                    strong: true,
                  ),
                for (final f in proFeatureLabels)
                  _FeatureLine(icon: Icons.check_circle_outline_rounded, color: AppColors.navy, text: f),
                const SizedBox(height: 12),
                // Paused: resume is refused until reactivation, so no button (the line above says when)
                if (!(paused && s.cancelAtPeriodEnd))
                SizedBox(
                  height: 48,
                  child: s.cancelAtPeriodEnd
                      ? FilledButton(
                          key: const Key('pro-resume'),
                          onPressed: _busy ? null : () => _manage(cancel: false),
                          child: _busy ? const _Spinner() : const Text('متابعة الاشتراك'),
                        )
                      : OutlinedButton(
                          key: const Key('pro-cancel'),
                          onPressed: _busy ? null : _confirmCancel,
                          child: _busy ? const _Spinner(color: AppColors.navy) : const Text('إلغاء التجديد'),
                        ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Spinner extends StatelessWidget {
  const _Spinner({this.color = Colors.white});
  final Color color;

  @override
  Widget build(BuildContext context) =>
      SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: color));
}

/// The small «عضوية Pro» card on the credits screen (like the website's payments page): opens `/pro`.
/// The caller shows it only when [showPlans] is true.
class ProLinkCard extends StatelessWidget {
  const ProLinkCard({super.key, required this.isPro});
  final bool isPro;

  @override
  Widget build(BuildContext context) {
    return Card(
      key: const Key('pro-link'),
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: AppColors.gold.withValues(alpha: 0.5)),
      ),
      child: ListTile(
        minVerticalPadding: 12,
        leading: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [AppColors.gold, AppColors.gold.withValues(alpha: 0.7)]),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Icon(Icons.workspace_premium_rounded, color: Colors.white, size: 22),
        ),
        title: const Text('عضوية Pro', style: TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text(isPro ? proActiveText : 'إرسال الصور والرسائل الصوتية في المحادثة، وأولوية في الاقتراحات'),
        trailing: const Icon(Icons.chevron_right, color: AppColors.muted),
        onTap: () => context.push('/pro'),
      ),
    );
  }
}
