import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/localization/arabic_count.dart';
import '../../core/push/push_permission.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../../shared/widgets/person_details_view.dart';
import '../discovery/suggestion_models.dart';
import '../discovery/suggestions_repository.dart';
import 'counts.dart';
import 'gendered_copy.dart';
import 'poll_card.dart';
import 'profile_strength_card.dart';
import '../notifications/notifications_screen.dart';
import '../pro/pro_badge.dart';

/// One suggested next step, from the counts.
class NextStep {
  const NextStep(this.title, this.body, this.action, this.route, this.icon);
  final String title;
  final String body;
  final String action;
  final String route;
  final IconData icon;
}

NextStep nextStepFor(Counts? c, {bool viewerFemale = false}) {
  String g(String m, String f) => forViewer(viewerFemale, m, f);
  if (c != null && c.pendingIntros > 0) {
    return NextStep(
      'طلب تعارف بانتظار ردك',
      'لديك ${c.pendingIntros == 1 ? 'طلب' : '${c.pendingIntros} طلبات'} على توافقاتك.',
      'عرض الطلب',
      c.pendingIntroMatchId != null ? '/matches/${c.pendingIntroMatchId}' : '/matches',
      Icons.family_restroom_rounded,
    );
  }
  if (c != null && (c.likedYou ?? 0) > 0) {
    return const NextStep('أبدى أحدهم اهتمامه بك', 'إذا أبديت اهتمامك أيضاً يتم التوافق فوراً.', 'عرض الاهتمامات',
        '/suggestions?tab=interested', Icons.favorite_rounded);
  }
  if (c != null && c.unreadChats > 0) {
    // Counts chats with something unread, not messages (QA A2-L3: «لديك 1 رسائل»)
    final chats = arabicCount(c.unreadChats, one: 'محادثة واحدة', two: 'محادثتين', few: 'محادثات', many: 'محادثة');
    return NextStep('رسائل جديدة', 'لديك رسائل جديدة في $chats.', 'فتح المحادثات', '/chats',
        Icons.chat_bubble_rounded);
  }
  if (c != null && c.actionableMatches > 0) {
    return NextStep('خطوتك التالية مع توافقك', '${g('اختر', 'اختاري')} طريقة التعارف: عائلياً أو بمحادثة قصيرة.',
        'عرض التوافقات', '/matches', Icons.handshake_rounded);
  }
  return NextStep(
    'اقتراحاتك بانتظارك',
    'اقتراحات مختارة بعناية تناسب ما ${g('تبحث', 'تبحثين')} عنه. القرار لك، بستر واحترام.',
    g('تصفح الاقتراحات', 'تصفحي الاقتراحات'),
    '/suggestions',
    Icons.auto_awesome_rounded,
  );
}

/// «صباح الخير» before noon, «مساء الخير» after
String greetingFor(DateTime now, String? name) {
  final hello = now.hour >= 4 && now.hour < 12 ? 'صباح الخير' : 'مساء الخير';
  return name == null || name.isEmpty ? hello : '$hello، $name';
}

/// The first new suggestions, shown on home (without the top-up the suggestions screen runs). Reloads with the counts,
/// so a decision taken on the suggestions tab (which refreshes them) is reflected here too.
final homeSuggestionsProvider = FutureProvider<List<FeedItem>>((ref) async {
  final counts = await ref.watch(countsProvider.future);
  final page = await ref.watch(suggestionsRepositoryProvider).feed(FeedTab.newTab);
  // Right after setup the counts are read before the feed creates the first cards: «اقتراحات جديدة 0» and no tab
  // badge over a list of cards (QA A-L01). Then the counts are read again, once per member.
  if (page.items.isNotEmpty && (counts.newSuggestions ?? 0) == 0) {
    final once = ref.read(_homeCountsResync);
    if (!once.done) {
      once.done = true;
      Future.microtask(() => ref.invalidate(countsProvider));
    }
  }
  return page.items.take(8).toList();
});

class _Once {
  bool done = false;
}

final _homeCountsResync = Provider<_Once>((ref) {
  ref.watch(currentMemberIdProvider);
  return _Once();
});

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(countsProvider);
    ref.invalidate(unreadNotificationsProvider);
    ref.invalidate(currentPollProvider);
    await ref.read(authControllerProvider.notifier).refreshMe();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(authControllerProvider).me;
    final female = me?.isFemale ?? false;
    final counts = ref.watch(countsProvider);
    final unread = ref.watch(unreadNotificationsProvider).valueOrNull ?? 0;
    final c = counts.valueOrNull;
    final step = nextStepFor(c, viewerFemale: female);
    final credits = c?.credits ?? me?.credits;
    String count(int? n) => counts.isLoading && c == null ? '…' : '${n ?? 0}';
    return Scaffold(
      // Status bar: dark icons over the page, light ones over the navy header while it is under them
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.dark,
        child: RefreshIndicator(
        onRefresh: () => _refresh(ref),
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            AnnotatedRegion<SystemUiOverlayStyle>(
              value: SystemUiOverlayStyle.light,
              child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [AppColors.navyDeep, AppColors.navy],
                ),
                borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
              ),
              padding: EdgeInsets.fromLTRB(20, MediaQuery.paddingOf(context).top + 12, 12, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const BrandLogo(height: 30, onDark: true),
                      const Spacer(),
                      if (credits != null) _CreditsPill(credits: credits),
                      // The count sits on the bell's corner and never grows over it (QA A2-L3)
                      IconButton(
                        key: const Key('open-notifications'),
                        tooltip: unread > 0 ? 'الإشعارات، $unread غير مقروءة' : 'الإشعارات',
                        onPressed: () async {
                          await context.push('/notifications');
                          ref.invalidate(unreadNotificationsProvider);
                        },
                        icon: MediaQuery.withNoTextScaling(
                          child: Badge(
                            key: const Key('bell-badge'),
                            isLabelVisible: unread > 0,
                            backgroundColor: AppColors.gold,
                            textColor: AppColors.navyDeep,
                            label: Text(unread > 99 ? '99+' : '$unread'),
                            child: const Icon(Icons.notifications_none_rounded, color: Colors.white),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  NameWithBadge(
                    isPro: c?.isPro ?? false,
                    onDark: true,
                    child: Text(
                      greetingFor(DateTime.now(), me?.firstName),
                      style: AppText.title.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: AppColors.gold.withValues(alpha: 0.4)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(step.icon, color: AppColors.goldLight),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(step.title,
                                  style: AppText.body.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(step.body, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), height: 1.6)),
                        const SizedBox(height: 12),
                        FilledButton(
                          key: const Key('next-step'),
                          style: FilledButton.styleFrom(backgroundColor: AppColors.gold, minimumSize: const Size(160, 48)),
                          onPressed: () => openAppRoute(GoRouter.of(context), step.route),
                          child: Text(step.action),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            )),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const PushAskGate(),
                  // One banner slot (design P1-5): only the most urgent line shows
                  _BannerSlot(counts: c, female: female),
                  if (counts.hasError && c == null) ...[
                    InfoBanner(
                      text: 'تعذّر تحميل آخر المستجدات.',
                      tone: BannerTone.danger,
                      action: TextButton(onPressed: () => ref.invalidate(countsProvider), child: const Text('إعادة المحاولة')),
                    ),
                    const SizedBox(height: 12),
                  ],
                  IntrinsicHeight(child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(
                        child: _StatusChip(
                          key: const Key('status-new'),
                          icon: Icons.auto_awesome_rounded,
                          value: count(c?.newSuggestions),
                          label: 'اقتراحات جديدة',
                          onTap: () => context.go('/suggestions?tab=new'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _StatusChip(
                          key: const Key('status-liked'),
                          icon: Icons.favorite_rounded,
                          value: count(c?.likedYou),
                          label: 'مهتمون بك',
                          highlight: (c?.likedYou ?? 0) > 0,
                          onTap: () => context.go('/suggestions?tab=interested'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _StatusChip(
                          key: const Key('status-matches'),
                          icon: Icons.handshake_rounded,
                          value: count(c == null ? null : c.actionableMatches + c.pendingIntros),
                          label: 'توافقات تنتظرك',
                          highlight: (c?.pendingIntros ?? 0) > 0,
                          onTap: () => context.go('/matches'),
                        ),
                      ),
                    ],
                  )),
                  const SizedBox(height: 20),
                  SectionTitle(
                    'اقتراحات اليوم',
                    trailing: TextButton(
                      key: const Key('all-suggestions'),
                      onPressed: () => context.go('/suggestions?tab=new'),
                      child: const Text('عرض الكل'),
                    ),
                  ),
                  _SuggestionsStrip(female: female),
                  const SizedBox(height: 16),
                  const ProfileStrengthCard(),
                  if (me?.country.pollsEnabled ?? true) ...[
                    const SizedBox(height: 16),
                    const PollCard(),
                  ],
                ],
              ),
            ),
          ],
        ),
      )),
    );
  }
}

/// Balance in the header (opens «الرصيد»)
class _CreditsPill extends StatelessWidget {
  const _CreditsPill({required this.credits});
  final int credits;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'رصيدك $credits',
      child: InkWell(
        key: const Key('credits-pill'),
        borderRadius: BorderRadius.circular(20),
        onTap: () => context.push('/credits'),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.goldLight.withValues(alpha: 0.6)),
            color: Colors.white.withValues(alpha: 0.06),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.account_balance_wallet_outlined, size: 18, color: AppColors.goldLight),
              const SizedBox(width: 6),
              Text('$credits', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({
    super.key,
    required this.icon,
    required this.value,
    required this.label,
    required this.onTap,
    this.highlight = false,
  });
  final IconData icon;
  final String value;
  final String label;
  final VoidCallback onTap;

  /// Something waits for the member here (gold border)
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: highlight ? AppColors.gold : AppColors.line, width: highlight ? 1.5 : 1),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
          child: Column(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(color: AppColors.gold.withValues(alpha: 0.13), shape: BoxShape.circle),
                child: Icon(icon, color: AppColors.gold, size: 20),
              ),
              const SizedBox(height: 8),
              Text(value, style: AppText.title.copyWith(fontWeight: FontWeight.w800, color: AppColors.navy)),
              // Two lines at large text: «توافقات تنتظرك» is never cut to «توافقات تنتظ…» (QA A-L14)
              Text(label,
                  maxLines: 2,
                  textAlign: TextAlign.center,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.caption.copyWith(color: AppColors.muted)),
            ],
          ),
        ),
      ),
    );
  }
}

/// «اقتراحات اليوم»: a sideways row of the first new suggestions (name, age, city, compatibility; never a photo)
class _SuggestionsStrip extends ConsumerWidget {
  const _SuggestionsStrip({required this.female});
  final bool female;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(homeSuggestionsProvider);
    const height = 188.0;
    return items.when(
      loading: () => SizedBox(
        height: height,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: 3,
          separatorBuilder: (_, _) => const SizedBox(width: 10),
          itemBuilder: (_, _) => Container(
            width: 150,
            decoration: BoxDecoration(color: AppColors.line.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(18)),
          ),
        ),
      ),
      // Never an empty space under the heading: a short line with a retry
      error: (_, _) => Card(
        margin: EdgeInsets.zero,
        child: ListTile(
          key: const Key('home-suggestions-error'),
          minVerticalPadding: 14,
          leading: const Icon(Icons.wifi_off_rounded, color: AppColors.muted),
          title: const Text('تعذّر تحميل الاقتراحات'),
          trailing: TextButton(
            onPressed: () => ref.invalidate(homeSuggestionsProvider),
            child: const Text('إعادة المحاولة'),
          ),
        ),
      ),
      data: (list) => list.isEmpty
          ? Card(
              margin: EdgeInsets.zero,
              child: ListTile(
                key: const Key('no-home-suggestions'),
                minVerticalPadding: 14,
                leading: const Icon(Icons.hourglass_empty_rounded, color: AppColors.gold),
                title: const Text('لا اقتراحات جديدة الآن', style: TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(forViewer(female, 'نبحث لك باستمرار، ويمكنك توسيع تفضيلاتك.',
                    'نبحث لكِ باستمرار، ويمكنكِ توسيع تفضيلاتكِ.')),
                trailing: const Icon(Icons.chevron_right, color: AppColors.muted),
                onTap: () => context.push('/profile/preferences'),
              ),
            )
          : SizedBox(
              height: height,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: list.length,
                separatorBuilder: (_, _) => const SizedBox(width: 10),
                itemBuilder: (context, i) => _SuggestionPreview(item: list[i]),
              ),
            ),
    );
  }
}

class _SuggestionPreview extends ConsumerWidget {
  const _SuggestionPreview({required this.item});
  final FeedItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = item.candidate;
    // The verified mark is hidden while intro requests are on (newer members never look second-class), and while
    // the switches aren't known yet
    final introRequests = ref.watch(countsProvider.select((c) => c.valueOrNull?.flags.introRequests));
    final showVerified = p.isVerified && introRequests == false;
    return SizedBox(
      width: 150,
      child: Card(
        margin: EdgeInsets.zero,
        child: InkWell(
          key: Key('home-suggestion-${item.id}'),
          borderRadius: BorderRadius.circular(18),
          onTap: () => context.go('/suggestions?tab=new'),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    item.compatibilityScore > 0
                        ? ScoreRing(score: item.compatibilityScore, size: 64)
                        : Container(
                            width: 64,
                            height: 64,
                            alignment: Alignment.center,
                            decoration:
                                BoxDecoration(color: AppColors.gold.withValues(alpha: 0.15), shape: BoxShape.circle),
                            child: Text(p.firstName.isEmpty ? '؟' : p.firstName.characters.first,
                                style: AppText.title.copyWith(fontWeight: FontWeight.w700, color: AppColors.navy)),
                          ),
                    if (showVerified)
                      const PositionedDirectional(
                        key: Key('home-verified'),
                        bottom: -2,
                        end: -2,
                        child: Icon(Icons.verified_rounded, size: 20, color: AppColors.success),
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  p.age != null ? '${p.firstName}، ${p.age}' : p.firstName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.body.copyWith(fontWeight: FontWeight.w800),
                ),
                if (p.city != null)
                  Text(p.city!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.caption.copyWith(color: AppColors.muted)),
                const Spacer(),
                if (item.likedYou)
                  const Pill(text: 'مهتم بك', color: AppColors.success, icon: Icons.favorite_rounded)
                else
                  Text('عرض الملف', style: AppText.caption.copyWith(color: AppColors.navy.withValues(alpha: 0.8))),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// What the home's one banner slot shows, most urgent first (design P1-5): 0 credits while someone's «مهتم» waits
/// (and a reply costs a credit), else notifications off. A family request waiting is the hero's next step already.
enum HomeBanner { noCreditsWithInterest, pushOff }

HomeBanner homeBannerFor(Counts? c) {
  final waiting = (c?.likedYou ?? 0) > 0;
  final broke = c?.credits == 0 && (c?.flags.creditOnInterest ?? false) && !(c?.flags.freeInterestReply ?? false);
  return waiting && broke ? HomeBanner.noCreditsWithInterest : HomeBanner.pushOff;
}

class _BannerSlot extends ConsumerWidget {
  const _BannerSlot({required this.counts, required this.female});
  final Counts? counts;
  final bool female;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    switch (homeBannerFor(counts)) {
      case HomeBanner.noCreditsWithInterest:
        final payments = ref.watch(appPaymentsProvider);
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Container(
            key: const Key('home-banner-credits'),
            constraints: const BoxConstraints(minHeight: 56),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(color: AppColors.line),
            ),
            child: Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(color: AppColors.navy, borderRadius: BorderRadius.circular(10)),
                  child: const Icon(Icons.favorite_rounded, size: 18, color: Colors.white),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    forViewer(female, 'رصيدك صفر وهناك من ينتظر ردك.', 'رصيدكِ صفر وهناك من ينتظر ردكِ.'),
                    style: AppText.label.copyWith(color: AppColors.ink),
                  ),
                ),
                if (payments)
                  FilledButton(
                    style: FilledButton.styleFrom(minimumSize: const Size(0, 44), padding: const EdgeInsets.symmetric(horizontal: 14)),
                    onPressed: () => context.push('/credits'),
                    child: Text(forViewer(female, 'اشحن', 'اشحني')),
                  ),
              ],
            ),
          ),
        );
      case HomeBanner.pushOff:
        return const PushOffCard(dismissible: true, padding: EdgeInsets.only(bottom: 12));
    }
  }
}
