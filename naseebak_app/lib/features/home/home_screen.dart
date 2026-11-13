import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/localization/arabic_count.dart';
import '../../core/push/push_permission.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/brand_kit.dart';
import '../../shared/widgets/common.dart';
import '../discovery/suggestion_models.dart';
import '../discovery/suggestions_repository.dart';
import '../notifications/notifications_screen.dart';
import '../pro/pro_badge.dart';
import '../profile/profile_repository.dart';
import 'counts.dart';
import 'gendered_copy.dart';
import 'poll_card.dart';
import 'profile_strength_card.dart' show strengthSubtitle;

/// «صباح الخير» from 04:00 to noon in Amman, «مساء الخير» otherwise, whatever the phone's clock or zone says (Jordan
/// and Saudi Arabia are UTC+3 all year; the website's home uses the same rule).
String greetingWord(DateTime instant) {
  final h = (instant.toUtc().hour + 3) % 24;
  return h >= 4 && h < 12 ? 'صباح الخير' : 'مساء الخير';
}

/// The new suggestions, read without the top-up the suggestions screen runs. Home no longer shows them (spec
/// 2026-11-13: «اقتراحات جديدة» in «اليوم» replaced the strip), but still reads them so the counts re-read below keeps
/// running. Reloads with the counts.
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
  return page.items;
});

class _Once {
  bool done = false;
}

final _homeCountsResync = Provider<_Once>((ref) {
  ref.watch(currentMemberIdProvider);
  return _Once();
});

/// The space under each home block
const _gap = SizedBox(height: AppSpace.xl);

/// How many people «مهتمون بك» shows on home
const homeInterestedShown = 3;

/// «مهتمون بك» on home: the first people of the «interested» tab (shared suggestions only). Reloads with the counts,
/// so an answer given on the suggestions tab (which refreshes them) shows here too.
final homeInterestedProvider = FutureProvider<List<FeedItem>>((ref) async {
  final counts = await ref.watch(countsProvider.future);
  if (!counts.flags.mutualSuggestions) return const [];
  final page = await ref.watch(suggestionsRepositoryProvider).feed(FeedTab.interested);
  return page.items.take(homeInterestedShown).toList();
});

/// «طلب تعارف» counted the Arabic way (the website's `requestsWaiting`)
String requestsWaiting(int n) =>
    arabicCount(n, one: 'طلب تعارف', two: 'طلبا تعارف', few: 'طلبات تعارف', many: 'طلباً للتعارف');

/// Member home (spec 2026-11-13 "Home (both)", the website's `HomeV2`): one calm column, what needs me now first.
/// Light header → the banner slot → «بانتظار ردّك» → «مهتمون بك» → «اليوم» → «المزيد». A block with nothing in it is
/// not shown; a failed load says so with a retry. Read-only: the answers live on the suggestions tab.
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
    // Not shown any more; read for the counts re-read after setup (QA A-L01, spec call 7)
    ref.watch(homeSuggestionsProvider);

    final sections = <Widget>[];
    if (c != null) {
      final waiting = _waitingRows(context, c, g);
      if (waiting.isNotEmpty) {
        sections.add(
          _Section(key: const Key('home-waiting'), title: g('بانتظار ردّك', 'بانتظار ردّكِ'), child: _Group(waiting)),
        );
        sections.add(_gap);
      }
      sections.add(_InterestedSection(female: female, freeReply: c.flags.freeInterestReply));
      final today = _todayRows(context, c);
      if (today.isNotEmpty) {
        sections.addAll([_Section(key: const Key('home-today'), title: 'اليوم', child: _Group(today)), _gap]);
      }
      sections.add(_MoreSection(counts: c, female: female, pollsOn: me?.country.pollsEnabled ?? true));
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
          onTap: () => context.go('/matches'),
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

  /// «اقتراحات جديدة» with the count (shared suggestions), «المحادثات» with the unread chats (chat on)
  List<Widget> _todayRows(BuildContext context, Counts c) {
    final fresh = c.flags.mutualSuggestions ? c.newSuggestions : null;
    final chatOn = c.flags.chat || c.hasChats;
    return [
      if (fresh != null)
        _Row(
          key: const Key('home-today-new'),
          icon: Icons.auto_awesome_rounded,
          title: 'اقتراحات جديدة',
          trailing: Text(
            '$fresh',
            style: AppText.label.copyWith(color: AppColors.ink, fontFeatures: AppText.tabular),
          ),
          onTap: () => openAppRoute(GoRouter.of(context), '/suggestions?tab=new'),
        ),
      if (chatOn)
        _Row(
          key: const Key('home-today-chats'),
          icon: Icons.chat_bubble_outline_rounded,
          title: 'المحادثات',
          trailing: c.unreadChats > 0 ? _CountChip(c.unreadChats, label: 'محادثات غير مقروءة') : null,
          onTap: () => openAppRoute(GoRouter.of(context), '/chats'),
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

/// A heading over a block, with an optional action at the end
class _Section extends StatelessWidget {
  const _Section({super.key, required this.title, required this.child, this.action, this.small = false});
  final String title;
  final Widget child;
  final Widget? action;

  /// «المزيد»: a small grey heading
  final bool small;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsetsDirectional.only(start: AppSpace.xs, bottom: AppSpace.sm),
          child: Row(
            children: [
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    title,
                    style: small
                        ? AppText.label.copyWith(color: AppColors.muted)
                        : AppText.headline.copyWith(color: AppColors.ink),
                  ),
                ),
              ),
              ?action,
            ],
          ),
        ),
        child,
      ],
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
    this.trailing,
    this.urgent = false,
    this.minHeight = 52,
  });
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback onTap;

  /// Act now (a family request): the icon in red
  final bool urgent;
  final double minHeight;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: ConstrainedBox(
        constraints: BoxConstraints(minHeight: minHeight),
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
              if (trailing != null) ...[const SizedBox(width: AppSpace.sm), trailing!],
              const SizedBox(width: AppSpace.xs),
              const Icon(Icons.chevron_right, size: 20, color: AppColors.muted),
            ],
          ),
        ),
      ),
    );
  }
}

/// A navy count (badges by meaning: navy = a count)
class _CountChip extends StatelessWidget {
  const _CountChip(this.n, {required this.label});
  final int n;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$n $label',
      excludeSemantics: true,
      child: Container(
        constraints: const BoxConstraints(minWidth: 24),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: BadgeTone.count.background,
          borderRadius: BorderRadius.circular(AppRadius.full),
        ),
        child: Text(
          n > 99 ? '99+' : '$n',
          textAlign: TextAlign.center,
          style: AppText.caption.copyWith(color: BadgeTone.count.foreground, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}

/// A failed block: one line with a retry (never a fake empty state)
class _LoadErrorRow extends StatelessWidget {
  const _LoadErrorRow({super.key, required this.text, required this.onRetry});
  final String text;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        side: const BorderSide(color: AppColors.line),
      ),
      // Wraps at large text: the retry drops under the line instead of squeezing it (QA A-M05)
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg, vertical: AppSpace.sm),
        child: Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          alignment: WrapAlignment.spaceBetween,
          spacing: AppSpace.sm,
          children: [
            Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.wifi_off_rounded, color: AppColors.muted),
              const SizedBox(width: AppSpace.md),
              Flexible(child: Text(text, style: AppText.labelRegular.copyWith(color: AppColors.ink))),
            ]),
            TextButton(onPressed: onRetry, child: const Text('إعادة المحاولة')),
          ],
        ),
      ),
    );
  }
}

/// «مهتمون بك»: up to 3 people (locked avatar, «الاسم، العمر», city); every tap opens the «مهتمون بك» tab
class _InterestedSection extends ConsumerWidget {
  const _InterestedSection({required this.female, required this.freeReply});
  final bool female;
  final bool freeReply;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(homeInterestedProvider);
    void open() => openAppRoute(GoRouter.of(context), '/suggestions?tab=interested');
    if (async.hasError && !async.isLoading) {
      return Padding(
        padding: const EdgeInsets.only(bottom: AppSpace.xl),
        child: _LoadErrorRow(
          key: const Key('home-interested-error'),
          text: 'تعذّر تحميل من اهتم بك.',
          onRetry: () => ref.invalidate(homeInterestedProvider),
        ),
      );
    }
    final people = async.valueOrNull ?? const <FeedItem>[];
    if (people.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.xl),
      child: _Section(
        key: const Key('home-interested'),
        title: forViewer(female, 'مهتمون بك', 'مهتمون بكِ'),
        action: TextButton(
          onPressed: open,
          style: TextButton.styleFrom(minimumSize: const Size(44, 44)),
          child: const Text('عرض الكل'),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Material(
              color: AppColors.surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppRadius.md),
                side: const BorderSide(color: AppColors.line, width: 0.5),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpace.sm, vertical: AppSpace.md),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (var i = 0; i < homeInterestedShown; i++)
                      Expanded(
                        child: i < people.length ? _InterestedPerson(item: people[i], onTap: open) : const SizedBox(),
                      ),
                  ],
                ),
              ),
            ),
            if (freeReply)
              Padding(
                padding: const EdgeInsetsDirectional.only(start: AppSpace.xs, top: AppSpace.sm),
                child: Text(
                  forViewer(female, 'ردّك بـ«مهتم» على من اهتم بك مجاني.', 'ردّكِ بـ«مهتم» على من اهتم بكِ مجاني.'),
                  style: AppText.caption.copyWith(color: AppColors.muted),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _InterestedPerson extends StatelessWidget {
  const _InterestedPerson({required this.item, required this.onTap});
  final FeedItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = item.candidate;
    return InkWell(
      key: Key('home-interested-${item.id}'),
      borderRadius: BorderRadius.circular(AppRadius.md),
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 44),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpace.xs, vertical: AppSpace.xs),
          child: Column(
            children: [
              // Never a photo before a mutual «مهتم»: the veil with its lock
              MemberAvatar(name: p.firstName, size: 56, locked: true, pro: item.isPro),
              const SizedBox(height: AppSpace.xs),
              Text(
                p.age != null ? '${p.firstName}، ${p.age}' : p.firstName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: AppText.label.copyWith(color: AppColors.ink),
              ),
              if (p.city != null)
                Text(
                  p.city!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: AppText.caption.copyWith(color: AppColors.muted),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// «المزيد»: the week's question, the profile while unfinished, Pro where it can be bought. 44 px rows.
class _MoreSection extends ConsumerWidget {
  const _MoreSection({required this.counts, required this.female, required this.pollsOn});
  final Counts counts;
  final bool female;
  final bool pollsOn;

  Future<void> _openPoll(BuildContext context) async {
    final container = ProviderScope.containerOf(context, listen: false);
    await showModalBottomSheet<void>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const SafeArea(
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(AppSpace.lg, 0, AppSpace.lg, AppSpace.lg),
          child: PollCard(),
        ),
      ),
    );
    // «جديد» follows a vote given in the sheet
    container.invalidate(currentPollProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pollAsync = pollsOn ? ref.watch(currentPollProvider) : null;
    final poll = pollAsync?.valueOrNull;
    final showPoll = poll != null && poll.status == 'ACTIVE';
    final pollFailed = pollAsync != null && pollAsync.hasError && !pollAsync.isLoading;

    final profile = ref.watch(myProfileProvider).valueOrNull;
    final showProfile = profile != null && profile.completeness < 100;
    final payments = ref.watch(appPaymentsProvider);
    // The Pro page link: the server's rule, never for a test or review account (app payments off), not once Pro
    final showPro = counts.proShowPage && !counts.isPro && payments;

    final rows = <Widget>[
      if (showPoll)
        _Row(
          key: const Key('home-more-poll'),
          icon: Icons.help_outline_rounded,
          title: 'سؤال الأسبوع',
          subtitle: poll.question,
          minHeight: 44,
          trailing: poll.myVote == null
              ? Container(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpace.sm, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.goldSoft,
                    borderRadius: BorderRadius.circular(AppRadius.full),
                  ),
                  child: Text(
                    'جديد',
                    style: AppText.caption.copyWith(color: AppColors.goldText, fontWeight: FontWeight.w700),
                  ),
                )
              : null,
          onTap: () => _openPoll(context),
        ),
      if (showProfile) _profileRow(context, profile),
      if (showPro)
        _Row(
          key: const Key('home-more-pro'),
          icon: Icons.workspace_premium_rounded,
          title: 'عضوية Pro',
          subtitle: counts.flags.chat ? 'صور ورسائل صوتية في المحادثة، وشارة Pro على بطاقتك.' : 'شارة Pro على بطاقتك.',
          minHeight: 44,
          onTap: () => context.push('/pro'),
        ),
    ];
    if (rows.isEmpty && !pollFailed) return const SizedBox.shrink();
    return _Section(
      key: const Key('home-more'),
      title: 'المزيد',
      small: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (rows.isNotEmpty) _Group(rows),
          if (pollFailed) ...[
            if (rows.isNotEmpty) const SizedBox(height: AppSpace.sm),
            _LoadErrorRow(
              key: const Key('home-poll-error'),
              text: 'تعذّر تحميل سؤال الأسبوع.',
              onRetry: () => ref.invalidate(currentPollProvider),
            ),
          ],
        ],
      ),
    );
  }

  /// «ملفك مكتمل N%» with a small bar; opens the first unfinished section, as «قوة ملفك» did
  Widget _profileRow(BuildContext context, MyProfile p) {
    final open = p.sections.where((s) => s.percentage < 100).firstOrNull;
    return _Row(
      key: const Key('home-more-profile'),
      icon: Icons.person_outline_rounded,
      title: '${forViewer(female, 'ملفك', 'ملفكِ')} مكتمل ${p.completeness}%',
      subtitle: open == null ? null : strengthSubtitle(open) ?? open.label,
      minHeight: 44,
      trailing: SizedBox(
        width: 56,
        child: LinearProgressIndicator(
          value: p.completeness / 100,
          minHeight: 6,
          borderRadius: BorderRadius.circular(AppRadius.full),
          color: AppColors.gold,
          backgroundColor: AppColors.line,
        ),
      ),
      onTap: () async {
        final container = ProviderScope.containerOf(context, listen: false);
        await context.push(open?.route ?? '/profile/edit');
        container.invalidate(myProfileProvider);
      },
    );
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
        final payments = ref.watch(appPaymentsProvider);
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
