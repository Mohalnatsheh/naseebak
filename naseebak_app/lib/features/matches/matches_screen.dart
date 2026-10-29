import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/localization/digits.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/json.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../../shared/widgets/person_details_view.dart';
import 'match_models.dart';
import 'matches_repository.dart';

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

  @override
  Widget build(BuildContext context) {
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
                      actionLabel: 'تصفح الاقتراحات',
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
                      onTap: () async {
                        await context.push('/matches/${m.id}', extra: m);
                        if (mounted) _load();
                      },
                    );
                  },
                ),
        );
      }),
    );
  }
}

class _MatchTile extends StatelessWidget {
  const _MatchTile({required this.match, required this.onTap});
  final MatchSummary match;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = match.partner;
    final closed = match.closedLabel;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 50,
                height: 50,
                decoration: BoxDecoration(
                  color: closed != null ? AppColors.line : AppColors.gold.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text(
                  p.firstName.isEmpty ? '؟' : p.firstName.characters.first,
                  style: TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w700,
                    color: closed != null ? AppColors.muted : AppColors.navy,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(p.age != null ? '${p.firstName}، ${p.age} سنة' : p.firstName,
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 2),
                    Text(
                      [p.city, if (match.createdAt != null) 'منذ ${formatDate(match.createdAt!, withYear: false)}']
                          .whereType<String>()
                          .join(' · '),
                      style: const TextStyle(color: AppColors.muted, fontSize: 13.5),
                    ),
                    const SizedBox(height: 6),
                    if (closed != null)
                      Pill(text: closed, color: AppColors.muted)
                    else if (match.visitStatus != null)
                      Pill(text: visitStatusLabel(match.visitStatus!), color: AppColors.success, icon: Icons.family_restroom_rounded)
                    else
                      const Pill(text: 'توافق متبادل', color: AppColors.success, icon: Icons.favorite_rounded),
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
