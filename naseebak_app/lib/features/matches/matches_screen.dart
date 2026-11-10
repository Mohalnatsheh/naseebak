import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/localization/digits.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/json.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/brand_kit.dart';
import '../../shared/widgets/common.dart';
import '../../shared/widgets/person_details_view.dart';
import '../home/gendered_copy.dart';
import '../pro/pro_badge.dart';
import 'match_models.dart';
import 'matches_repository.dart';
import 'safety_actions.dart';

/// «توافقاتي»: mutual matches, newest first.
class MatchesScreen extends ConsumerStatefulWidget {
  const MatchesScreen({super.key});

  @override
  ConsumerState<MatchesScreen> createState() => _MatchesScreenState();
}

class _MatchesScreenState extends ConsumerState<MatchesScreen> {
  final List<MatchSummary> _items = [];
  PageInfo? _page;
  Object? _error;
  bool _loading = true;
  bool _loadingMore = false;

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
      final res = await ref.read(matchesRepositoryProvider).list();
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

  Future<void> _more() async {
    final p = _page;
    if (p == null || !p.hasMore || _loadingMore) return;
    setState(() => _loadingMore = true);
    try {
      final res = await ref.read(matchesRepositoryProvider).list(page: p.page + 1);
      if (!mounted) return;
      setState(() {
        _items.addAll(res.items);
        _page = res.page;
      });
    } catch (e) {
      if (mounted) showSnack(context, ApiException.messageOf(e));
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  Future<void> _unblock(MatchSummary m) async {
    if (m.blockId == null) return;
    if (await confirmAndUnblock(context, ref, blockId: m.blockId!, name: m.partner.firstName) && mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    // A match changed elsewhere (detail screen opened from a notification, an outcome, a block): reload
    ref.listen(matchesListVersionProvider, (_, _) => _load());
    return Scaffold(
      appBar: AppBar(title: const Text('التوافقات')),
      body: Builder(builder: (context) {
        if (_loading && _items.isEmpty) return const SkeletonList(count: 3, itemHeight: 96);
        if (_error != null && _items.isEmpty) return ErrorView(error: _error!, onRetry: _load);
        return RefreshIndicator(
          onRefresh: _load,
          child: _items.isEmpty
              ? ListView(children: [
                  SizedBox(
                    height: 440,
                    child: MessageView(
                      icon: Icons.handshake_outlined,
                      title: 'لا توجد توافقات بعد',
                      body: 'عندما يبدي الطرفان الاهتمام يظهر التوافق هنا، وتنكشف الصور والتفاصيل.',
                      actionLabel: forViewer(ref.watch(authControllerProvider).me?.isFemale ?? false,
                          'تصفح الاقتراحات', 'تصفحي الاقتراحات'),
                      onAction: () => context.go('/suggestions'),
                    ),
                  ),
                ])
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: _items.length + 1,
                  separatorBuilder: (_, _) => const SizedBox(height: 12),
                  itemBuilder: (context, i) {
                    if (i == _items.length) {
                      if (_page?.hasMore ?? false) {
                        return _loadingMore
                            ? const Center(child: CircularProgressIndicator())
                            : TextButton(onPressed: _more, child: const Text('عرض المزيد'));
                      }
                      return const SizedBox.shrink();
                    }
                    final m = _items[i];
                    return _MatchTile(
                      match: m,
                      viewerFemale: ref.watch(authControllerProvider).me?.isFemale ?? false,
                      onTap: () async {
                        await context.push('/matches/${m.id}', extra: m);
                        if (mounted) _load();
                      },
                      onUnblock: m.closed == 'blocked' && m.blockId != null ? () => _unblock(m) : null,
                    );
                  },
                ),
        );
      }),
    );
  }
}

/// The tile's line for a match's next step (the server's `nextStep`): what waits, and on whom. An older server sends
/// none: «توافق متبادل».
({String text, Color color, IconData icon}) matchNextStepLine(String? step, {required String name, required bool viewerFemale}) {
  String p(String m, String f) => forPartner(viewerFemale, m, f);
  String g(String m, String f) => forViewer(viewerFemale, m, f);
  return switch (step) {
    'reply_family' => (text: '$name ${p('يطلب', 'تطلب')} تعارفاً عائلياً · ${g('ردّك', 'ردّكِ')} مطلوب', color: AppColors.danger, icon: Icons.family_restroom_rounded),
    'reply_chat' => (text: '$name ${p('يطلب', 'تطلب')} محادثة · ${g('ردّك', 'ردّكِ')} مطلوب', color: AppColors.danger, icon: Icons.chat_bubble_outline_rounded),
    'waiting_family' => (text: 'طلب التعارف العائلي بانتظار الرد', color: AppColors.warning, icon: Icons.hourglass_top_rounded),
    'waiting_chat' => (text: 'طلب المحادثة بانتظار الرد', color: AppColors.warning, icon: Icons.hourglass_top_rounded),
    'chat_open' => (text: 'المحادثة مفتوحة', color: AppColors.success, icon: Icons.forum_outlined),
    'family_accepted' => (text: 'تعارف عائلي جارٍ', color: AppColors.success, icon: Icons.family_restroom_rounded),
    'choose' => (text: g('اختر طريقة التعارف', 'اختاري طريقة التعارف'), color: AppColors.navy, icon: Icons.touch_app_outlined),
    _ => (text: 'توافق متبادل', color: AppColors.success, icon: Icons.favorite_rounded),
  };
}

Widget _nextStepPill(MatchSummary m, bool viewerFemale) {
  final line = matchNextStepLine(m.nextStep, name: m.partner.firstName, viewerFemale: viewerFemale);
  return Pill(key: Key('next-step-${m.id}'), text: line.text, color: line.color, icon: line.icon);
}

class _MatchTile extends StatelessWidget {
  const _MatchTile({required this.match, required this.onTap, this.onUnblock, this.viewerFemale = false});
  final bool viewerFemale;
  final MatchSummary match;
  final VoidCallback onTap;

  /// «إلغاء الحظر» on a match I blocked
  final VoidCallback? onUnblock;

  @override
  Widget build(BuildContext context) {
    final p = match.partner;
    final closed = match.closedLabel;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.card),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              // One avatar (P2-5): a gold ring while the match is on, grey once it's closed
              MemberAvatar(name: p.firstName, size: 52, matched: closed == null, dimmed: closed != null, pro: p.isPro),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    NameWithBadge(
                      isPro: p.isPro,
                      child: Text(p.age != null ? '${p.firstName}، ${p.age} سنة' : p.firstName,
                          style: Theme.of(context).textTheme.titleMedium),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [p.city, if (match.createdAt != null) 'منذ ${formatDate(match.createdAt!, withYear: false)}']
                          .whereType<String>()
                          .join(' · '),
                      style: AppText.labelRegular.copyWith(color: AppColors.muted),
                    ),
                    const SizedBox(height: 6),
                    if (onUnblock != null)
                      Row(
                        children: [
                          Pill(text: closed ?? 'محظور', color: AppColors.muted),
                          const SizedBox(width: 6),
                          TextButton(
                            key: Key('unblock-${match.id}'),
                            onPressed: onUnblock,
                            child: const Text('إلغاء الحظر'),
                          ),
                        ],
                      )
                    else if (closed != null)
                      Pill(text: closed, color: AppColors.muted)
                    else if (match.visitStatus != null)
                      Pill(text: visitStatusLabel(match.visitStatus!), color: AppColors.success, icon: Icons.family_restroom_rounded)
                    else
                      // The seal (S1) and this match's own next step (the server's `nextStep`)
                      Row(
                        children: [
                          const SealMark(size: 18),
                          const SizedBox(width: 6),
                          Flexible(child: _nextStepPill(match, viewerFemale)),
                        ],
                      ),
                  ],
                ),
              ),
              if (match.compatibilityScore > 0) ScoreRing(score: match.compatibilityScore, size: 46),
              const SizedBox(width: 4),
              const Icon(Icons.chevron_right, color: AppColors.muted),
            ],
          ),
        ),
      ),
    );
  }
}
