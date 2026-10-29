import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/localization/digits.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/json.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../home/counts.dart';
import 'interest_sheet.dart';
import 'suggestion_card.dart';
import 'suggestion_models.dart';
import 'suggestions_repository.dart';

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

  @override
  void didUpdateWidget(covariant SuggestionsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialTab != widget.initialTab) _tabs.animateTo(widget.initialTab.index);
  }

  @override
  void dispose() {
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
        bottom: TabBar(
          controller: _tabs,
          tabs: [
            for (final t in FeedTab.values)
              Tab(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Flexible(child: Text(t.label, overflow: TextOverflow.ellipsis)),
                    if ((badge(t) ?? 0) > 0) ...[const SizedBox(width: 6), CountBadge(count: badge(t)!)],
                  ],
                ),
              ),
          ],
        ),
      ),
      body: meta.when(
        loading: () => const SkeletonList(count: 2, itemHeight: 260),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(suggestionsMetaProvider)),
        data: (m) => TabBarView(
          controller: _tabs,
          children: [for (final t in FeedTab.values) FeedList(key: PageStorageKey(t), tab: t, meta: m)],
        ),
      ),
    );
  }
}

/// One paginated tab of the feed.
class FeedList extends ConsumerStatefulWidget {
  const FeedList({super.key, required this.tab, required this.meta});
  final FeedTab tab;
  final SuggestionsMeta meta;

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

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ref.read(suggestionsRepositoryProvider).feed(widget.tab);
      if (!mounted) return;
      setState(() {
        _items
          ..clear()
          ..addAll(res.items);
        _page = res.page;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadMore() async {
    final page = _page;
    if (page == null || !page.hasMore || _loadingMore) return;
    setState(() => _loadingMore = true);
    try {
      final res = await ref.read(suggestionsRepositoryProvider).feed(widget.tab, page: page.page + 1);
      if (!mounted) return;
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
    ref.invalidate(countsProvider);
    await _load();
  }

  void _afterAnswer(FeedItem item, DecisionResult res, {required bool interested}) {
    setState(() => _items.removeWhere((e) => e.id == item.id));
    if (res.creditsLeft != null) ref.read(authControllerProvider.notifier).updateCredits(res.creditsLeft!);
    ref.read(authControllerProvider.notifier).refreshMe();
    ref.invalidate(countsProvider);
    if (!mounted) return;
    if (res.match) {
      _showMatch(item, res.matchId);
    } else {
      showSnack(
        context,
        interested
            ? (res.message ?? 'تم إرسال اهتمامك. نُعلمك عند التوافق.')
            : (item.kind == FeedKind.legacyInterest ? 'تم الاعتذار بلطف' : 'تم. لن يظهر هذا الاقتراح مجدداً.'),
      );
    }
  }

  void _showMatch(FeedItem item, String? matchId) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.celebration_rounded, color: AppColors.gold, size: 40),
        title: const Text('توافق متبادل!', textAlign: TextAlign.center),
        content: Text(
          'أبديتما الاهتمام معاً أنت و${item.candidate.firstName}. يمكنك الآن متابعة الخطوة التالية من صفحة التوافقات.',
          textAlign: TextAlign.center,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('لاحقاً')),
          FilledButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              context.go(matchId != null ? '/matches/$matchId' : '/matches');
            },
            child: const Text('عرض التوافق'),
          ),
        ],
      ),
    );
  }

  void _handleError(FeedItem item, Object e) {
    if (!mounted) return;
    if (e is ApiException) {
      if (e.kind == ApiErrorKind.noCredits) {
        showSnack(context, e.message, action: SnackBarAction(label: 'شحن', onPressed: () => context.push('/credits')));
        return;
      }
      if (e.kind == ApiErrorKind.notFound) {
        // Closed meanwhile (expired, the other side declined, already answered)
        setState(() => _items.removeWhere((x) => x.id == item.id));
      }
    }
    showSnack(context, ApiException.messageOf(e));
  }

  Future<void> _interested(FeedItem item) async {
    if (_busy.contains(item.id)) return;
    final repo = ref.read(suggestionsRepositoryProvider);
    if (item.kind == FeedKind.mutual) {
      final counts = ref.read(countsProvider).valueOrNull;
      final me = ref.read(authControllerProvider).me;
      setState(() => _busy.add(item.id));
      try {
        final res = await InterestSheet.show(
          context,
          InterestSheet(
            firstName: item.candidate.firstName,
            chatAvailable: (counts?.flags.chat ?? false) && (me?.country.chatEnabled ?? true),
            creditOnInterest: counts?.flags.creditOnInterest ?? false,
            credits: me?.credits,
            guardianConsented: counts?.guardianConsented ?? false,
            onSubmit: (pref, consent) =>
                repo.answer(item, interested: true, introPreference: pref, guardianConsent: consent),
          ),
        );
        if (res != null) _afterAnswer(item, res, interested: true);
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
      body: 'لن يظهر ${item.candidate.firstName} في اقتراحاتك مجدداً. لا يُبلَّغ الطرف الآخر بقرارك.',
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

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final me = ref.watch(authControllerProvider).me;
    if (_loading && _items.isEmpty) return const SkeletonList(count: 2, itemHeight: 260);
    if (_error != null && _items.isEmpty) return ErrorView(error: _error!, onRetry: _load);
    return RefreshIndicator(
      onRefresh: _refresh,
      child: _items.isEmpty
          ? ListView(children: [SizedBox(height: 420, child: _empty(context))])
          : NotificationListener<ScrollNotification>(
              onNotification: (n) {
                if (n.metrics.pixels > n.metrics.maxScrollExtent - 400) _loadMore();
                return false;
              },
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                itemCount: _items.length + 1,
                separatorBuilder: (_, _) => const SizedBox(height: 14),
                itemBuilder: (context, i) {
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
                    onInterested: () => _interested(item),
                    onDecline: () => _decline(item),
                  );
                },
              ),
            ),
    );
  }

  Widget _empty(BuildContext context) {
    switch (widget.tab) {
      case FeedTab.interested:
        return const MessageView(
          icon: Icons.favorite_border_rounded,
          title: 'لا أحد هنا بعد',
          body: 'نُعلمك عندما يبدي أحدهم اهتمامه بك.',
        );
      case FeedTab.waiting:
        return const MessageView(
          icon: Icons.hourglass_empty_rounded,
          title: 'لا توجد اقتراحات بانتظار الرد',
          body: 'عندما تختار «مهتم» يظهر الاقتراح هنا حتى يرد الطرف الآخر.',
        );
      case FeedTab.newTab:
        final m = widget.meta;
        if (m.emptyReason == 'weekly_cap' && m.nextSuggestionsAt != null) {
          return MessageView(
            icon: Icons.event_available_rounded,
            title: 'اقتراحاتك القادمة يوم ${formatDate(m.nextSuggestionsAt!, withYear: false)}',
            body: 'نختار لك اقتراحات جديدة كل أسبوع بعناية.',
          );
        }
        if (m.emptyReason == 'no_candidates') {
          return MessageView(
            icon: Icons.search_off_rounded,
            title: 'لا يوجد حالياً من يناسب ما تبحث عنه',
            body: 'نضيف اقتراحات جديدة عند انضمام أعضاء يناسبونك. يمكنك مراجعة تفضيلاتك في ملفك.',
            actionLabel: 'ملفي الشخصي',
            onAction: () => context.push('/profile'),
          );
        }
        return const MessageView(
          icon: Icons.inbox_outlined,
          title: 'لا توجد اقتراحات جديدة الآن',
          body: 'راجع تبويب «مهتمون بك» و«بانتظار الرد»، أو اسحب للتحديث.',
        );
    }
  }
}
