import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/analytics/analytics.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/localization/digits.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/json.dart';
import '../../core/review/store_review.dart';
import '../../core/push/push_permission.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/brand_kit.dart';
import '../../shared/widgets/common.dart';
import '../home/counts.dart';
import '../home/gendered_copy.dart';
import '../matches/safety_actions.dart';
import '../profile/preferences_screen.dart';
import 'interest_sheet.dart';
import 'preferences_bar.dart';
import 'suggestion_card.dart';
import 'suggestion_models.dart';
import 'suggestions_repository.dart';
import '../notifications/notifications_screen.dart';

/// «اقتراحاتي»: new / interested in me / waiting, from `GET /api/suggestions/feed`.
class SuggestionsScreen extends ConsumerStatefulWidget {
  const SuggestionsScreen({super.key, this.initialTab = FeedTab.newTab});
  final FeedTab initialTab;

  @override
  ConsumerState<SuggestionsScreen> createState() => _SuggestionsScreenState();
}

class _SuggestionsScreenState extends ConsumerState<SuggestionsScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs =
      TabController(length: FeedTab.values.length, vsync: this, initialIndex: widget.initialTab.index);

  /// Bumped after each top-up: every tab reloads its cards (keeping the ones shown meanwhile)
  int _reload = 0;
  Future<void>? _toppingUp;
  GoRouter? _router;
  bool _visible = true;

  /// `GET /api/suggestions` only tops up when called (`/feed` never creates cards), so it runs again on
  /// pull-to-refresh, when this tab is shown again, when a notification/link opens it, after a decision and
  /// after the preferences change; then every tab reloads. Calls made while one runs share it.
  Future<void> _topUp() => _toppingUp ??= _runTopUp().whenComplete(() => _toppingUp = null);

  Future<void> _runTopUp() async {
    ref.invalidate(suggestionsMetaProvider);
    ref.invalidate(countsProvider);
    try {
      final meta = await ref.read(suggestionsMetaProvider.future);
      // The balance can change elsewhere (a refund, the website, admin): the cards' «مهتم» lock follows it
      final credits = meta.credits;
      if (credits != null && mounted) ref.read(authControllerProvider.notifier).updateCredits(credits);
    } catch (_) {
      // Shown by the screen (ErrorView with a retry)
    }
    if (mounted) setState(() => _reload++);
  }

  Future<void> _editPreferences() async {
    await context.push('/profile/preferences');
    if (!mounted) return;
    ref.invalidate(partnerPrefsProvider);
    await _topUp();
  }

  @override
  void initState() {
    super.initState();
    feedTabRequest.addListener(_onTabAsked);
  }

  /// A link asked for a tab while this screen is alive: shown even when the address did not change (the member had
  /// swiped away from the tab the address names)
  void _onTabAsked() {
    final tab = feedTabRequest.tab;
    if (tab != null && mounted && _tabs.index != tab.index) _tabs.animateTo(tab.index);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final router = GoRouter.maybeOf(context);
    if (router == _router) return;
    _router?.routerDelegate.removeListener(_onRoute);
    _router = router?..routerDelegate.addListener(_onRoute);
  }

  /// Back on this tab (switched to, or a screen on top closed): top up again
  void _onRoute() {
    final visible = _router?.state.uri.path == '/suggestions';
    if (visible && !_visible) Future.microtask(_topUp);
    _visible = visible;
  }

  @override
  void didUpdateWidget(covariant SuggestionsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Opened from a notification or a link (?tab=…): show that tab with fresh cards
    if (oldWidget.initialTab != widget.initialTab) {
      _tabs.animateTo(widget.initialTab.index);
      // Not during this build: the top-up invalidates providers this screen watches
      Future.microtask(_topUp);
    }
  }

  @override
  void dispose() {
    feedTabRequest.removeListener(_onTabAsked);
    _router?.routerDelegate.removeListener(_onRoute);
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final meta = ref.watch(suggestionsMetaProvider);
    final counts = ref.watch(countsProvider).valueOrNull;
    int? badge(FeedTab t) => switch (t) {
          FeedTab.newTab => counts?.newSuggestions,
          FeedTab.interested => counts?.likedYou,
          FeedTab.waiting => null,
        };
    return Scaffold(
      appBar: AppBar(
        title: const Text('الاقتراحات'),
        actions: [
          IconButton(
            key: const Key('edit-prefs'),
            tooltip: 'تفضيلاتي وشروطي الأساسية',
            icon: const Icon(Icons.tune_rounded),
            onPressed: _editPreferences,
          ),
        ],
        bottom: TabBar(
          controller: _tabs,
          // Tighter than the default 16: «مهتمون بك» with its count fits a 375 pt phone
          labelPadding: const EdgeInsets.symmetric(horizontal: 6),
          tabs: [
            for (final t in FeedTab.values)
              Tab(
                // Never cut to «مهتمون …»: a little smaller instead where it can't fit (small phone, large text)
                child: FittedBox(
                  key: Key('feed-tab-${t.name}'),
                  fit: BoxFit.scaleDown,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(t.label, maxLines: 1),
                      if ((badge(t) ?? 0) > 0) ...[const SizedBox(width: 4), CountBadge(count: badge(t)!)],
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
      body: meta.when(
        loading: () => const CardSkeletonList(),
        error: (e, _) => ErrorView(error: e, onRetry: _topUp),
        data: (m) => TabBarView(
          controller: _tabs,
          children: [
            for (final t in FeedTab.values)
              FeedList(
                key: PageStorageKey('$t'),
                tab: t,
                meta: m,
                reload: _reload,
                onTopUp: _topUp,
                onShowTab: (t) => _tabs.animateTo(t.index),
                onEditPreferences: _editPreferences,
              ),
          ],
        ),
      ),
    );
  }
}

/// One paginated tab of the feed.
class FeedList extends ConsumerStatefulWidget {
  const FeedList({
    super.key,
    required this.tab,
    required this.meta,
    this.reload = 0,
    this.onTopUp,
    this.onShowTab,
    this.onEditPreferences,
  });
  final FeedTab tab;
  final SuggestionsMeta meta;

  /// Changes after each top-up: the tab reloads
  final int reload;

  /// Tops up (`GET /api/suggestions`) and reloads every tab; without it the tab only reloads itself
  final Future<void> Function()? onTopUp;
  final ValueChanged<FeedTab>? onShowTab;

  /// Shown as the bar at the top of «جديدة» (and the "no one fits" empty state)
  final VoidCallback? onEditPreferences;

  @override
  ConsumerState<FeedList> createState() => _FeedListState();
}

class _FeedListState extends ConsumerState<FeedList> with AutomaticKeepAliveClientMixin {
  final List<FeedItem> _items = [];
  PageInfo? _page;
  Object? _error;
  bool _loading = true;
  bool _loadingMore = false;
  final Set<String> _busy = {};

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant FeedList oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.reload != widget.reload) {
      // After a top-up (a decision, a return to the tab): the pages already loaded are read again, so the member
      // keeps their place. Only pull-to-refresh starts over from the first page.
      _load(keepPages: !_fromTop);
      _fromTop = false;
    }
  }

  /// Bumped by every reload: an answer for an older list (a slower reload, a «عرض المزيد») is dropped
  int _generation = 0;

  /// The next reload starts from page 1 (pull-to-refresh)
  bool _fromTop = false;

  bool get _viewerFemale => ref.read(authControllerProvider).me?.isFemale ?? false;
  String _g(String m, String f) => forViewer(_viewerFemale, m, f);
  String _p(String m, String f) => forPartner(_viewerFemale, m, f);

  /// 0 credits under credit on interest: «مهتم» is disabled, «لا» stays free (website outOfCredits)
  bool _outOfCredits(Counts? counts, int? credits) =>
      (counts?.flags.creditOnInterest ?? false) && credits != null && credits <= 0;

  /// A reply to someone who already said «مهتم» (free_interest_reply): no credit, so never locked at 0
  bool _freeReply(Counts? counts, FeedItem item) =>
      (counts?.flags.freeInterestReply ?? false) && item.kind == FeedKind.mutual && item.likedYou;

  static const _freeReplyNote = 'الرد بـ«مهتم» مجاني';

  /// [keepPages]: read every page already loaded again (in order) instead of only the first
  Future<void> _load({bool keepPages = false}) async {
    final generation = ++_generation;
    final pages = keepPages ? (_page?.page ?? 1) : 1;
    final repo = ref.read(suggestionsRepositoryProvider);
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = <FeedItem>[];
      final seen = <String>{};
      PageInfo? last;
      for (var p = 1; p <= pages; p++) {
        final res = await repo.feed(widget.tab, page: p);
        if (!mounted || generation != _generation) return;
        items.addAll(res.items.where((e) => seen.add(e.id)));
        last = res.page;
        if (!res.page.hasMore) break;
      }
      setState(() {
        _items
          ..clear()
          ..addAll(items);
        _page = last;
      });
    } catch (e) {
      if (!mounted || generation != _generation) return;
      setState(() => _error = e);
      // Cards already on screen stay, but never silently: the refresh failed
      if (_items.isNotEmpty) showSnack(context, ApiException.messageOf(e));
    } finally {
      if (mounted && generation == _generation) setState(() => _loading = false);
    }
  }

  Future<void> _loadMore() async {
    final page = _page;
    if (page == null || !page.hasMore || _loadingMore) return;
    final generation = _generation;
    setState(() => _loadingMore = true);
    try {
      final res = await ref.read(suggestionsRepositoryProvider).feed(widget.tab, page: page.page + 1);
      // The list was reloaded meanwhile: this page belongs to the older one
      if (!mounted || generation != _generation) return;
      final known = _items.map((e) => e.id).toSet();
      setState(() {
        _items.addAll(res.items.where((e) => !known.contains(e.id)));
        _page = res.page;
      });
    } catch (e) {
      if (mounted) showSnack(context, ApiException.messageOf(e));
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  Future<void> _refresh() async {
    final topUp = widget.onTopUp;
    if (topUp != null) {
      _fromTop = true;
      return topUp();
    }
    ref.invalidate(countsProvider);
    await _load();
  }

  /// A card left (answered, blocked, gone): a slot is free, so the server may add new cards
  void _removeAndTopUp(FeedItem item) {
    setState(() => _items.removeWhere((e) => e.id == item.id));
    final topUp = widget.onTopUp;
    if (topUp != null) {
      topUp();
    } else {
      ref.invalidate(countsProvider);
    }
  }

  void _afterAnswer(FeedItem item, DecisionResult res, {required bool interested}) {
    // The screen went away while the answer was on its way (signed out, paused): nothing here to update
    if (!mounted) return;
    if (res.creditsLeft != null) ref.read(authControllerProvider.notifier).updateCredits(res.creditsLeft!);
    ref.read(authControllerProvider.notifier).refreshMe();
    final analytics = ref.read(analyticsProvider);
    interested
        ? analytics.interestSent(introPreference: res.myPreference, likedYou: item.likedYou)
        : analytics.suggestionDeclined();
    if (res.match) analytics.matchCreated(res.intro ?? 'NONE');
    _removeAndTopUp(item);
    if (res.match) {
      _showMatch(item, res);
    } else {
      showSnack(
        context,
        interested
            ? (res.message ?? 'تم إرسال اهتمامك. نُعلمك عند التوافق.')
            : (item.kind == FeedKind.legacyInterest ? 'تم الاعتذار بلطف' : 'تم. لن يظهر هذا الاقتراح مجدداً.'),
      );
    }
  }

  void _showMatch(FeedItem item, DecisionResult res) {
    final copy = matchDialogCopy(res, item.candidate.firstName, viewerFemale: _viewerFemale);
    // A happy moment: once the dialog closes, the store's rating sheet (once per install)
    final review = ref.read(storeReviewProvider);
    // The match moment (S1): the gold seal draws itself around both initials, with a haptic
    unawaited(HapticFeedback.heavyImpact());
    final me = ref.read(authControllerProvider).me?.firstName ?? '';
    String first(String n) => n.trim().isEmpty ? '' : n.trim().characters.first;
    final initials = [first(me), first(item.candidate.firstName)].where((e) => e.isNotEmpty).join(' · ');
    showDialog<void>(
      context: context,
      barrierLabel: 'إغلاق',
      builder: (ctx) => AlertDialog(
        icon: MatchSeal(initials: initials.isEmpty ? '✓' : initials, size: 104),
        title: Text('توافق متبادل!', textAlign: TextAlign.center, style: AppText.title.copyWith(color: AppColors.navy)),
        content: Text(copy.body, textAlign: TextAlign.center),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('لاحقاً')),
          FilledButton(
            key: const Key('match-dialog-open'),
            onPressed: () {
              Navigator.of(ctx).pop();
              // Over the suggestions (back returns here), not instead of them
              openAppRoute(GoRouter.of(context), copy.route);
            },
            child: Text(copy.action),
          ),
        ],
      ),
    ).then((_) {
      // A chat opened: asked when that chat is left after a reply (chat room), never over it now
      if (res.intro != 'CHAT') review.afterFirstMatch();
    });
  }


  void _handleError(FeedItem item, Object e) {
    if (!mounted) return;
    if (e is ApiException) {
      if (e.kind == ApiErrorKind.noCredits) {
        ref.read(authControllerProvider.notifier).updateCredits(0);
        showSnack(
          context,
          e.message,
          action: ref.read(appPaymentsProvider)
              ? SnackBarAction(label: 'شحن', onPressed: () => context.push('/credits'))
              : null,
        );
        return;
      }
      if (e.kind == ApiErrorKind.notFound) {
        // Closed meanwhile (expired, the other side declined, already answered)
        _removeAndTopUp(item);
      }
    }
    showSnack(context, ApiException.messageOf(e));
  }

  Future<void> _interested(FeedItem item) async {
    if (_busy.contains(item.id)) return;
    final repo = ref.read(suggestionsRepositoryProvider);
    var counts = ref.read(countsProvider).valueOrNull;
    // The switches aren't known (the counts failed or are still loading): read them first. Guessing showed the
    // sheet with «تعارف عائلي» as the only, already chosen, way
    if (item.kind == FeedKind.mutual && counts == null) {
      setState(() => _busy.add(item.id));
      try {
        if (ref.read(countsProvider).hasError) ref.invalidate(countsProvider);
        counts = await ref.read(countsProvider.future);
      } catch (e) {
        if (mounted) showSnack(context, ApiException.messageOf(e));
        return;
      } finally {
        if (mounted) setState(() => _busy.remove(item.id));
      }
      if (!mounted) return;
    }
    // Chat / family is only asked (and charged) under credit on interest; otherwise the server ignores the choice
    // and «مهتم» goes straight through, like the website
    if (item.kind == FeedKind.mutual && (counts?.flags.creditOnInterest ?? false)) {
      final me = ref.read(authControllerProvider).me;
      setState(() => _busy.add(item.id));
      try {
        final res = await InterestSheet.show(
          context,
          InterestSheet(
            firstName: item.candidate.firstName,
            chatAvailable: (counts?.flags.chat ?? false) && (me?.country.chatEnabled ?? true),
            creditOnInterest: counts?.flags.creditOnInterest ?? false,
            free: _freeReply(counts, item),
            likedYou: item.likedYou,
            credits: me?.credits,
            canRecharge: ref.read(appPaymentsProvider),
            guardianConsented: counts?.guardianConsented ?? false,
            viewerFemale: me?.isFemale ?? false,
            onNoCredits: () => ref.read(authControllerProvider.notifier).updateCredits(0),
            onSubmit: (pref, consent) =>
                repo.answer(item, interested: true, introPreference: pref, guardianConsent: consent),
          ),
        );
        if (res is DecisionResult) {
          _afterAnswer(item, res, interested: true);
        } else if (res is ApiException) {
          _handleError(item, res);
        }
      } on ApiException catch (e) {
        _handleError(item, e);
      } finally {
        if (mounted) setState(() => _busy.remove(item.id));
      }
      return;
    }
    setState(() => _busy.add(item.id));
    try {
      final res = await repo.answer(item, interested: true);
      _afterAnswer(item, res, interested: true);
    } catch (e) {
      _handleError(item, e);
    } finally {
      if (mounted) setState(() => _busy.remove(item.id));
    }
  }

  Future<void> _decline(FeedItem item) async {
    if (_busy.contains(item.id)) return;
    final ok = await confirmDialog(
      context,
      title: 'تأكيد «لا»',
      body: 'لن ${_p('يظهر', 'تظهر')} ${item.candidate.firstName} في اقتراحاتك مجدداً. لا يُبلَّغ الطرف الآخر بقرارك.',
      confirmLabel: 'نعم، لا يناسبني',
    );
    if (!ok || !mounted) return;
    setState(() => _busy.add(item.id));
    try {
      final res = await ref.read(suggestionsRepositoryProvider).answer(item, interested: false);
      _afterAnswer(item, res, interested: false);
    } catch (e) {
      _handleError(item, e);
    } finally {
      if (mounted) setState(() => _busy.remove(item.id));
    }
  }

  /// «حظر» / «إبلاغ وحظر» from the card's menu (the server allows both for someone I was suggested)
  Future<void> _safety(FeedItem item, {required bool report}) async {
    final c = item.candidate;
    final action = report ? reportAndBlock : confirmAndBlock;
    final done = await action(context, ref, userId: c.id, name: c.firstName, viewerFemale: _viewerFemale);
    if (done && mounted) _removeAndTopUp(item);
  }

  /// «مهتمون بك» at 0 credits with free_interest_reply on: the reply needs no credit
  Widget _freeReplyBanner() => BannerLine(
        key: const Key('free-reply'),
        icon: Icons.favorite_outline,
        text: '${_g('شخص مهتم بك ينتظر ردّك.', 'شخص مهتم بكِ ينتظر ردّكِ.')} الرد بـ«مهتم» مجاني حتى برصيد صفر.',
      );

  /// 0 credits: everything stays visible and «لا» is free; only «مهتم» waits for a recharge
  Widget _zeroBalance(BuildContext context) {
    final canRecharge = ref.watch(appPaymentsProvider);
    return BannerLine(
      key: const Key('zero-balance'),
      warning: true,
      icon: Icons.account_balance_wallet_outlined,
      text: 'رصيدك صفر: «لا» مجاني، و«مهتم» ${canRecharge ? 'يحتاج شحن الرصيد.' : 'يحتاج رصيداً.'}',
      actionKey: const Key('recharge'),
      actionLabel: canRecharge ? _g('اشحن', 'اشحني') : null,
      onAction: canRecharge ? () => context.push('/credits') : null,
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final me = ref.watch(authControllerProvider).me;
    final counts = ref.watch(countsProvider).valueOrNull;
    if (_loading && _items.isEmpty) return const CardSkeletonList();
    if (_error != null && _items.isEmpty) return ErrorView(error: _error!, onRetry: _load);
    final onEdit = widget.onEditPreferences;
    final outOfCredits = _outOfCredits(counts, me?.credits);
    final creditNote =
        (counts?.flags.creditOnInterest ?? false) && !outOfCredits ? '«مهتم» يستخدم رصيداً واحداً' : null;
    final bar = widget.tab == FeedTab.newTab && onEdit != null ? PreferencesBar(onEdit: onEdit) : null;
    // «مهتمون بك» with the free reply on: every card here can be answered, so no recharge banner
    final freeTab = widget.tab == FeedTab.interested && (counts?.flags.freeInterestReply ?? false);
    final banner = widget.tab != FeedTab.waiting && outOfCredits && _items.isNotEmpty
        ? (freeTab ? _freeReplyBanner() : _zeroBalance(context))
        : null;
    // One banner slot (design P1-5): the credit line when it applies, else the notifications nudge on «جديدة»;
    // the preferences bar is part of the page, under it
    final slot = banner ??
        (widget.tab == FeedTab.newTab && _items.isNotEmpty ? const PushOffCard(dismissible: true) : null);
    final headers = [?slot, ?bar];
    final head = headers.length;
    return RefreshIndicator(
      onRefresh: _refresh,
      child: _items.isEmpty
          ? ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              children: [?bar, SizedBox(height: 420, child: _empty(context))],
            )
          : NotificationListener<ScrollNotification>(
              onNotification: (n) {
                if (n.metrics.pixels > n.metrics.maxScrollExtent - 400) _loadMore();
                return false;
              },
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                itemCount: head + _items.length + 1,
                separatorBuilder: (_, _) => const SizedBox(height: 14),
                itemBuilder: (context, index) {
                  if (index < head) return headers[index];
                  final i = index - head;
                  if (i == _items.length) {
                    if (_loadingMore) {
                      return const Padding(
                        padding: EdgeInsets.all(16),
                        child: Center(child: CircularProgressIndicator()),
                      );
                    }
                    if (_page?.hasMore ?? false) {
                      return TextButton(onPressed: _loadMore, child: const Text('عرض المزيد'));
                    }
                    return const SizedBox.shrink();
                  }
                  final item = _items[i];
                  return SuggestionCard(
                    item: item,
                    tab: widget.tab,
                    candidateFemale: !(me?.isFemale ?? false),
                    tribeLabel: me?.country.tribeWord ?? 'العائلة',
                    busy: _busy.contains(item.id),
                    interestDisabled: outOfCredits && !_freeReply(counts, item),
                    creditNote: _freeReply(counts, item) ? _freeReplyNote : creditNote,
                    onInterested: () => _interested(item),
                    onDecline: () => _decline(item),
                    onBlock: () => _safety(item, report: false),
                    onReport: () => _safety(item, report: true),
                  );
                },
              ),
            ),
    );
  }

  /// Empty tabs, worded like the website (mutual-suggestions-view.tsx)
  Widget _empty(BuildContext context) {
    final counts = ref.watch(countsProvider).valueOrNull;
    final newCount = counts?.newSuggestions ?? 0;
    final showNew = widget.onShowTab != null && newCount > 0
        ? (label: '${_g('اكتشف الجديد', 'اكتشفي الجديد')} ($newCount)', go: () => widget.onShowTab!(FeedTab.newTab))
        : null;
    switch (widget.tab) {
      case FeedTab.interested:
        return MessageView(
          art: LineArtKind.envelope,
          icon: Icons.favorite_border_rounded,
          title: 'لا توجد اهتمامات جديدة حالياً',
          body: _g('استمر في استكشاف التوافقات، فقد تتعرّف إلى شخص يناسبك. من يبدي اهتمامه بك يظهر هنا.',
              'استمري في استكشاف التوافقات، فقد تتعرّفين إلى شخص يناسبكِ. من يبدي اهتمامه بكِ يظهر هنا.'),
          actionLabel: showNew?.label,
          onAction: showNew?.go,
        );
      case FeedTab.waiting:
        return MessageView(
          art: LineArtKind.envelope,
          icon: Icons.hourglass_empty_rounded,
          title: _g('لم ترسل أي اهتمام بعد', 'لم ترسلي أي اهتمام بعد'),
          body: '${_g('ابدأ', 'ابدئي')} باكتشاف التوافقات الجديدة. عندما ${_g('تختار', 'تختارين')} «مهتم» على اقتراح، '
              'يظهر هنا حتى يقرّر الطرف الآخر أو تنتهي مدته.',
          actionLabel: showNew?.label,
          onAction: showNew?.go,
        );
      case FeedTab.newTab:
        final m = widget.meta;
        final creditOnInterest = counts?.flags.creditOnInterest ?? false;
        if (m.emptyReason == 'no_candidates') {
          return MessageView(
            icon: Icons.search_off_rounded,
            title: 'لا يوجد حالياً من يطابق شروطك',
            body: 'لم نجد حالياً أحداً تنطبق عليه شروطك الأساسية وتفضيلاتك. مراجعتها قد توسّع فرصك، ونبحث لك من جديد '
                'تلقائياً كلما انضم أشخاص جدد.',
            actionLabel: 'تعديل تفضيلاتي',
            onAction: widget.onEditPreferences ?? () => context.push('/profile/preferences'),
          );
        }
        if (m.emptyReason == 'weekly_cap' && m.nextSuggestionsAt != null) {
          return MessageView(
            icon: Icons.event_available_rounded,
            title: 'اقتراحاتك القادمة يوم ${formatDate(m.nextSuggestionsAt!, withYear: false)}',
            body: 'تصلك حتى 3 اقتراحات مجانية كل 7 أيام، وسنرسل لك إشعاراً فور وصولها.',
          );
        }
        if (m.emptyReason == 'pending') {
          // My open cards are full: the ones waiting for my answer sit in «مهتمون بك», else they wait for the
          // other side («بانتظار الرد»)
          final forMe = (counts?.likedYou ?? 0) > 0;
          return MessageView(
            key: const Key('empty-pending'),
            art: LineArtKind.dallah,
            icon: Icons.hourglass_top_rounded,
            title: forMe ? 'لديك اقتراحات بانتظار قرارك' : 'اقتراحاتك المفتوحة بانتظار الطرف الآخر',
            body: forMe
                ? 'عندما ${_g('تقرّر', 'تقرّرين')} في اقتراحاتك الحالية أو تنتهي مدتها، تصلك اقتراحات جديدة وسنرسل لك '
                    'إشعاراً فور وصولها.'
                : 'تصلك اقتراحات جديدة عندما يردّ الطرف الآخر على اقتراحاتك المفتوحة أو تنتهي مدتها، وسنرسل لك إشعاراً '
                    'فور وصولها.',
            actionLabel: widget.onShowTab == null ? null : (forMe ? 'عرض المهتمين بك' : 'عرض ما ينتظر الرد'),
            onAction: widget.onShowTab == null
                ? null
                : () => widget.onShowTab!(forMe ? FeedTab.interested : FeedTab.waiting),
          );
        }
        return MessageView(
          art: LineArtKind.dallah,
          icon: Icons.inbox_outlined,
          title: 'نبحث لك عن اقتراحات مناسبة',
          body: creditOnInterest
              ? 'تصلك اقتراحات مجانية جديدة كلما توفّر من يناسبك، وسنرسل لك إشعاراً فور وصولها. إكمال ملفك واختبار '
                  'الشخصية يجعلها أدق.'
              : 'تصلك حتى 3 اقتراحات مجانية كل أسبوع، وسنرسل لك إشعاراً فور وصولها. إكمال ملفك واختبار الشخصية يجعلها '
                  'أدق.',
        );
    }
  }
}

/// The «توافق متبادل!» dialog after my «مهتم»: what happened, and the one button. Both chose «محادثة» → the chat is
/// already open (no request to send); I chose «محادثة» but they chose family → share my guardian's contact; otherwise
/// the match page (family under way, or the request buttons on older flows).
({String body, String action, String route}) matchDialogCopy(DecisionResult res, String name, {required bool viewerFemale}) {
  String g(String m, String f) => forViewer(viewerFemale, m, f);
  final matchRoute = res.matchId != null ? '/matches/${res.matchId}' : '/matches';
  final together = 'أبديتما الاهتمام معاً ${g('أنت', 'أنتِ')} و$name.';
  if (res.intro == 'CHAT' && res.conversationId != null) {
    return (
      body: '$together اخترتما المحادثة، فهي مفتوحة الآن ${g('ويمكنك', 'ويمكنكِ')} البدء مباشرة.',
      action: 'فتح المحادثة',
      route: '/chats/${res.conversationId}',
    );
  }
  if (res.intro == 'FAMILY') {
    return (
      body: res.myPreference == 'CHAT'
          ? '$together ${forPartner(viewerFemale, 'فضّل', 'فضّلت')} $name التعارف العائلي. '
              '${g('شارك', 'شاركي')} بيانات وليّ أمرك من صفحة التوافق لتتبادل العائلتان بيانات التواصل.'
          : '$together اتجهتما للتعارف العائلي، والتفاصيل في صفحة التوافق.',
      action: 'عرض التوافق',
      route: matchRoute,
    );
  }
  return (
    body: '$together ${g('يمكنك', 'يمكنكِ')} الآن متابعة الخطوة التالية من صفحة التوافقات.',
    action: 'عرض التوافق',
    route: matchRoute,
  );
}
