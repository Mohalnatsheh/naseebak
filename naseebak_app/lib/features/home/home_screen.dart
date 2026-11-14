import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/localization/arabic_count.dart';
import '../../core/push/push_permission.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../discovery/suggestion_models.dart';
import '../discovery/suggestions_repository.dart';
import '../notifications/notifications_screen.dart';
import '../pro/pro_badge.dart';
import '../profile/profile_repository.dart';
import 'counts.dart';
import 'gendered_copy.dart';
import 'poll_card.dart';
import '../chat/chat_models.dart';
import 'widgets/home_block_header.dart';
import 'widgets/home_chats_block.dart';
import 'widgets/home_interested_card.dart';
import 'widgets/home_load_error_row.dart';
import 'widgets/home_suggestion_card.dart';
import 'widgets/home_tiles.dart';
import 'widgets/home_tips.dart';
import 'widgets/next_step_card.dart';

/// «صباح الخير» from 04:00 to noon in Amman, «مساء الخير» otherwise, whatever the phone's clock or zone says (Jordan
/// and Saudi Arabia are UTC+3 all year; the website's home uses the same rule).
String greetingWord(DateTime instant) {
  final h = (instant.toUtc().hour + 3) % 24;
  return h >= 4 && h < 12 ? 'صباح الخير' : 'مساء الخير';
}

/// The new suggestions, read without the top-up the suggestions screen runs: «اقتراحات اليوم» (spec 2026-11-14). Also
/// runs the counts re-read below. Reloads with the counts.
final homeSuggestionsProvider = FutureProvider<List<FeedItem>>((ref) async {
  final counts = await _homeCounts(ref);
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
  return page.items;
});

/// The counts a home block needs (and reloads with). A refresh that failed (weak network) keeps the last known
/// counts, as the page itself does: the people blocks never fail with the counts' error, so their retry works once
/// the network is back (sweep I1).
Future<Counts> _homeCounts(Ref ref) async {
  try {
    return await ref.watch(countsProvider.future);
  } catch (_) {
    final known = ref.read(countsProvider).valueOrNull;
    if (known != null) return known;
    rethrow;
  }
}

class _Once {
  bool done = false;
}

final _homeCountsResync = Provider<_Once>((ref) {
  ref.watch(currentMemberIdProvider);
  return _Once();
});

/// The space under each home block
const _gap = SizedBox(height: AppSpace.xl);

/// «مهتمون بك» on home: the first people of the «interested» tab (shared suggestions only). Reloads with the counts,
/// so an answer given on the suggestions tab (which refreshes them) shows here too.
final homeInterestedProvider = FutureProvider<List<FeedItem>>((ref) async {
  final counts = await _homeCounts(ref);
  if (!counts.flags.mutualSuggestions) return const [];
  final page = await ref.watch(suggestionsRepositoryProvider).feed(FeedTab.interested);
  return page.items.take(homeInterestedCardsShown).toList();
});

/// «طلب تعارف» counted the Arabic way (the website's `requestsWaiting`)
String requestsWaiting(int n) =>
    arabicCount(n, one: 'طلب تعارف', two: 'طلبا تعارف', few: 'طلبات تعارف', many: 'طلباً للتعارف');

/// Member home (spec 2026-11-14 "richer app home", on 2026-11-13's light home): header → the banner slot → the navy
/// «خطوتك التالية» → «بانتظار ردّك» → «اقتراحات اليوم» → «مهتمون بك» → «المحادثات» → («نصائح لك» for a quiet member)
/// → «حسابي» → «سؤال الأسبوع». A block with nothing in it is not shown; a failed load says so with a retry.
/// Read-only: the answers live on the suggestions tab.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(countsProvider);
    ref.invalidate(unreadNotificationsProvider);
    ref.invalidate(currentPollProvider);
    ref.invalidate(myProfileProvider);
    await ref.read(authControllerProvider.notifier).refreshMe();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(authControllerProvider).me;
    final female = me?.isFemale ?? false;
    String g(String m, String f) => forViewer(female, m, f);
    final counts = ref.watch(countsProvider);
    final c = counts.valueOrNull;
    // Watched even when hidden: it runs the counts re-read after setup (QA A-L01)
    final suggestions = ref.watch(homeSuggestionsProvider);
    // Known only once loaded: a profile still loading or failed is never taken as complete
    final profile = ref.watch(myProfileProvider).valueOrNull;

    final sections = <Widget>[];
    if (c != null) {
      sections.addAll([NextStepCard(counts: c, female: female, profile: profile), _gap]);
      final waiting = _waitingRows(context, c, g);
      if (waiting.isNotEmpty) {
        sections.addAll([
          Column(
            key: const Key('home-waiting'),
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              HomeBlockHeader(title: g('بانتظار ردّك', 'بانتظار ردّكِ')),
              _Group(waiting),
            ],
          ),
          _gap,
        ]);
      }
      final mutual = c.flags.mutualSuggestions;
      final interested = ref.watch(homeInterestedProvider);
      if (mutual) {
        sections.add(
          HomeSuggestionsCarousel(
            items: suggestions,
            onRetry: () => ref
              ..invalidate(countsProvider)
              ..invalidate(homeSuggestionsProvider),
          ),
        );
        sections.add(
          HomeInterestedCards(
            items: interested,
            onRetry: () => ref
              ..invalidate(countsProvider)
              ..invalidate(homeInterestedProvider),
            female: female,
            freeReply: c.flags.freeInterestReply,
          ),
        );
      }
      final chatOn = c.flags.chat || c.hasChats;
      final chats = chatOn ? ref.watch(chatListProvider) : null;
      sections.add(HomeChatsBlock(show: chatOn));
      // Quiet: every people block known empty (not loading, not failed), so the page offers tips instead
      bool none<T>(AsyncValue<List<T>> a) => a.hasValue && !a.hasError && !a.isLoading && a.value!.isEmpty;
      final quiet =
          waiting.isEmpty && (!mutual || (none(suggestions) && none(interested))) && (chats == null || none(chats));
      if (quiet) sections.add(HomeTips(female: female, profile: profile));
      sections.add(HomeTiles(counts: c, female: female, profile: profile));
      sections.add(_PollBlock(pollsOn: me?.country.pollsEnabled ?? true));
    } else if (counts.isLoading) {
      sections.addAll(const [
        SkeletonBox(height: 120, radius: AppRadius.md),
        _gap,
        SkeletonBox(height: 160, radius: AppRadius.md),
      ]);
    }

    return Scaffold(
      // Light page under a light status bar: dark clock and icons
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.dark.copyWith(statusBarColor: Colors.transparent),
        child: SafeArea(
          bottom: false,
          child: RefreshIndicator(
            onRefresh: () => _refresh(ref),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(AppSpace.lg, AppSpace.sm, AppSpace.lg, AppSpace.xxl),
              children: [
                _Header(firstName: me?.firstName, isPro: c?.isPro ?? false, credits: c?.credits ?? me?.credits),
                const SizedBox(height: AppSpace.lg),
                const PushAskGate(),
                // One banner slot (design P1-5): only the most urgent line shows
                _BannerSlot(counts: c, female: female),
                if (counts.hasError && c == null) ...[
                  InfoBanner(
                    text: 'تعذّر تحميل آخر المستجدات.',
                    tone: BannerTone.danger,
                    action: TextButton(
                      onPressed: () => ref.invalidate(countsProvider),
                      child: const Text('إعادة المحاولة'),
                    ),
                  ),
                  const SizedBox(height: AppSpace.md),
                ],
                // Each block brings its own space below, so a hidden one leaves no gap
                ...sections,
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// What today's three status chips pointed to that waits on me: family requests, matches with a step to take
  List<Widget> _waitingRows(BuildContext context, Counts c, String Function(String, String) g) {
    final yours = g('ك', 'كِ');
    return [
      if (c.pendingIntros > 0)
        _Row(
          key: const Key('home-waiting-requests'),
          icon: Icons.inbox_rounded,
          urgent: true,
          title: '${c.pendingIntros == 1 ? 'طلب تعارف' : requestsWaiting(c.pendingIntros)} بانتظار ردّ$yours',
          // The waiting request's match, like the website (the match list when the server names none)
          onTap: () => openAppRoute(
            GoRouter.of(context),
            c.pendingIntroMatchId != null ? '/matches/${c.pendingIntroMatchId}' : '/matches',
          ),
        ),
      if (c.actionableMatches > 0)
        _Row(
          key: const Key('home-waiting-matches'),
          icon: Icons.handshake_rounded,
          title:
              '${arabicCount(c.actionableMatches, one: 'توافق ينتظر', two: 'توافقان ينتظران', few: 'توافقات تنتظر', many: 'توافقاً ينتظر')}$yours',
          subtitle: g('يمكنك طلب تعارف عائلي أو محادثة.', 'يمكنكِ طلب تعارف عائلي أو محادثة.'),
          onTap: () => context.go('/matches'),
        ),
    ];
  }
}

/// Greeting and first name, then the balance pill and the bell (no navy block)
class _Header extends ConsumerWidget {
  const _Header({required this.firstName, required this.isPro, required this.credits});
  final String? firstName;
  final bool isPro;
  final int? credits;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadNotificationsProvider).valueOrNull ?? 0;
    final hello = greetingWord(DateTime.now());
    final name = firstName == null || firstName!.isEmpty ? null : firstName!;
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (name != null) Text(hello, style: AppText.label.copyWith(color: AppColors.muted)),
              NameWithBadge(
                isPro: isPro,
                child: Text(
                  name ?? hello,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.title.copyWith(color: AppColors.ink),
                ),
              ),
            ],
          ),
        ),
        if (credits != null) _CreditsPill(credits: credits!),
        // The count sits on the bell's corner and never grows over it (QA A2-L3)
        IconButton(
          key: const Key('open-notifications'),
          tooltip: unread > 0 ? 'الإشعارات، $unread غير مقروءة' : 'الإشعارات',
          onPressed: () async {
            final container = ProviderScope.containerOf(context, listen: false);
            await context.push('/notifications');
            container.invalidate(unreadNotificationsProvider);
          },
          icon: MediaQuery.withNoTextScaling(
            child: Badge(
              key: const Key('bell-badge'),
              isLabelVisible: unread > 0,
              backgroundColor: BadgeTone.count.background,
              textColor: BadgeTone.count.foreground,
              label: Text(unread > 99 ? '99+' : '$unread'),
              child: const Icon(Icons.notifications_none_rounded, color: AppColors.ink),
            ),
          ),
        ),
      ],
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
      excludeSemantics: true,
      child: InkWell(
        key: const Key('credits-pill'),
        borderRadius: BorderRadius.circular(AppRadius.full),
        onTap: () => context.push('/credits'),
        // The pill keeps its size; the area that takes the tap is at least 44 high
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
          child: Center(
            widthFactor: 1,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.md, vertical: AppSpace.xs),
              decoration: BoxDecoration(color: AppColors.goldSoft, borderRadius: BorderRadius.circular(AppRadius.full)),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('رصيدك', style: AppText.caption.copyWith(color: AppColors.goldText)),
                  const SizedBox(width: AppSpace.xs),
                  Text(
                    '$credits',
                    style: AppText.label.copyWith(color: AppColors.goldText, fontWeight: FontWeight.w800),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// One white grouped list: radius 12, hairlines between the rows
class _Group extends StatelessWidget {
  const _Group(this.rows);
  final List<Widget> rows;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        side: const BorderSide(color: AppColors.line, width: 0.5),
      ),
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0)
              const Divider(
                height: 0.5,
                thickness: 0.5,
                indent: AppSpace.lg,
                endIndent: AppSpace.lg,
                color: AppColors.line,
              ),
            rows[i],
          ],
        ],
      ),
    );
  }
}

/// One grouped-list row: icon, title (and a line under it), an optional value, the chevron
class _Row extends StatelessWidget {
  const _Row({
    super.key,
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.urgent = false,
  });
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  /// Act now (a family request): the icon in red
  final bool urgent;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 52),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg, vertical: AppSpace.sm),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: urgent ? AppColors.dangerBg : AppColors.navy.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(AppRadius.md),
                ),
                child: Icon(icon, size: 18, color: urgent ? AppColors.danger : AppColors.navy),
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: AppText.label.copyWith(color: AppColors.ink)),
                    if (subtitle != null)
                      Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.caption.copyWith(color: AppColors.muted),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpace.xs),
              const Icon(Icons.chevron_right, size: 20, color: AppColors.muted),
            ],
          ),
        ),
      ),
    );
  }
}

/// «سؤال الأسبوع» inline: the poll card (its own title, no block heading), only with an active question in a country with polls; a failed load says so
class _PollBlock extends ConsumerWidget {
  const _PollBlock({required this.pollsOn});
  final bool pollsOn;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!pollsOn) return const SizedBox.shrink();
    final async = ref.watch(currentPollProvider);
    if (async.hasError && !async.isLoading) {
      return HomeLoadErrorRow(
        key: const Key('home-poll-error'),
        text: 'تعذّر تحميل سؤال الأسبوع.',
        onRetry: () => ref.invalidate(currentPollProvider),
      );
    }
    final poll = async.valueOrNull;
    if (poll == null || poll.status != 'ACTIVE') return const SizedBox.shrink();
    // The card's own title names it: no second heading over it
    return const PollCard(key: Key('home-poll'));
  }
}

/// What the home's one banner slot shows, most urgent first (design P1-5): 0 credits while someone's «مهتم» waits
/// (and a reply costs a credit), else notifications off. A family request waiting is the «بانتظار ردّك» row already.
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
        final payments = ref.watch(rechargeShownProvider);
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: BannerLine(
            key: const Key('home-banner-credits'),
            icon: Icons.favorite_rounded,
            text: forViewer(female, 'رصيدك صفر وهناك من ينتظر ردك.', 'رصيدكِ صفر وهناك من ينتظر ردكِ.'),
            actionLabel: payments ? forViewer(female, 'اشحن', 'اشحني') : null,
            onAction: payments ? () => context.push('/credits') : null,
          ),
        );
      case HomeBanner.pushOff:
        return const PushOffCard(dismissible: true, padding: EdgeInsets.only(bottom: 12));
    }
  }
}
