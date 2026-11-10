import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/localization/digits.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/json.dart';
import '../../core/push/push_permission.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../home/counts.dart';

class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.isRead,
    this.url,
    this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: asStringOr(j['id']),
        type: asStringOr(j['type'], 'SYSTEM'),
        title: asStringOr(j['title']),
        body: asStringOr(j['body']),
        isRead: asBool(j['isRead']) ?? false,
        url: asString(asMap(j['metadata'])['url']),
        createdAt: asDate(j['createdAt']),
      );

  final String id;
  final String type;
  final String title;
  final String body;
  final bool isRead;
  final String? url;
  final DateTime? createdAt;

  AppNotification read() =>
      AppNotification(id: id, type: type, title: title, body: body, isRead: true, url: url, createdAt: createdAt);
}

/// Maps a notification (its web `metadata.url`, else its type) to an app screen.
String appRouteFor(AppNotification n) => appRouteForLink(url: n.url, type: n.type);

/// Whether the app shows payments to the signed-in member (`appPayments`); the router provider wires it to the session
bool Function() linkPaymentsShown = () => true;

/// The app's tab roots: switched to with `go` (pushing one over the tab shell duplicates its page key)
const appTabRoots = ['/home', '/suggestions', '/matches', '/chats', '/account'];

/// Opens a notification's screen (in-app list and push taps): a tab is switched to, anything else is pushed, and
/// the screen already on top (e.g. the chat being read) is left as it is.
void openAppRoute(GoRouter router, String route) {
  // Pro for a test or review account (payments hidden) is home: switched to as the tab it is, so «الرئيسية» is the
  // selected tab and not the one the link arrived on (QA A-L06; pushing `/pro` and redirecting kept «حسابي» selected)
  if (Uri.parse(route).path == '/pro' && !linkPaymentsShown()) route = '/home';
  if (router.state.uri.toString() == route) return;
  appTabRoots.contains(Uri.parse(route).path) ? router.go(route) : router.push(route);
}

/// Same mapping for a website path and an optional notification type (in-app list and push taps).
String appRouteForLink({String? url, String? type}) {
  if (url != null && url.isNotEmpty) {
    final uri = Uri.tryParse(url);
    if (uri != null) {
      final path = uri.path;
      final match = uri.queryParameters['match'];
      if (path.startsWith('/dashboard/chats/')) return '/chats/${path.substring('/dashboard/chats/'.length)}';
      if (path.startsWith('/dashboard/matches')) return match != null ? '/matches/$match' : '/matches';
      if (path.startsWith('/dashboard/suggestions')) {
        final tab = uri.queryParameters['tab'];
        // The website's «توافق متبادل» tab (matchesHref) is the app's matches tab
        if (tab == 'matches') return match != null ? '/matches/$match' : '/matches';
        return tab != null ? '/suggestions?tab=$tab' : '/suggestions';
      }
      if (path.startsWith('/dashboard/chats')) return '/chats';
      // Exact: `/dashboard/profile` starts with `/dashboard/pro` too
      if (path == '/dashboard/pro' || path.startsWith('/dashboard/pro/')) return '/pro';
      if (path.startsWith('/dashboard/payments')) {
        return uri.queryParameters['section'] == 'pro' ? '/pro' : '/credits';
      }
      if (path.startsWith('/dashboard/profile/edit')) return '/profile/edit';
      if (path.startsWith('/dashboard/profile')) return '/profile';
      if (path.startsWith('/dashboard/support')) return '/support';
      if (path.startsWith('/dashboard/notifications')) return '/notifications';
      if (path.startsWith('/dashboard/referral')) return '/referral';
      if (path.startsWith('/dashboard/photos')) return '/profile/photos';
      if (path.startsWith('/dashboard/personality-quiz')) return '/profile/quiz';
    }
  }
  return switch (type) {
    'SUGGESTION' || 'INTEREST' => '/suggestions',
    'MATCH' || 'VISIT_UPDATE' || 'INTRO_REQUEST' => '/matches',
    'CHAT' => '/chats',
    'PAYMENT' => '/credits',
    'SUPPORT' => '/support',
    _ => '/home',
  };
}

class NotificationsRepository {
  NotificationsRepository(this._api);
  final ApiClient _api;

  Future<({List<AppNotification> items, PageInfo page})> list({int page = 1}) async {
    final j = await _api.get('/api/notifications', query: {'page': page});
    return (items: asMapList(j['notifications']).map(AppNotification.fromJson).toList(), page: PageInfo.fromJson(j));
  }

  /// `PATCH /api/notifications/{id}/read`
  Future<void> markRead(String id) async => _api.patch('/api/notifications/$id/read');

  /// `PUT /api/notifications/read-all`
  Future<void> markAllRead() async => _api.put('/api/notifications/read-all');

  /// `DELETE /api/notifications/{id}/read` (one notice, like the website's bin icon)
  Future<void> delete(String id) async => _api.delete('/api/notifications/$id/read');

  /// `DELETE /api/notifications` (all of them, «حذف الكل»)
  Future<void> deleteAll() async => _api.delete('/api/notifications');
}

/// Appends a further page to the list. The server pages by offset on `createdAt`, and a chat notice's `createdAt` is
/// bumped when a new message comes in, so a page can repeat rows already shown (or a newer copy of one): a row
/// already in the list is updated in place, never added twice.
List<AppNotification> mergeNotificationPage(List<AppNotification> current, List<AppNotification> page) {
  final merged = [...current];
  final at = {for (var i = 0; i < merged.length; i++) merged[i].id: i};
  for (final n in page) {
    final i = at[n.id];
    if (i != null) {
      merged[i] = n;
    } else {
      at[n.id] = merged.length;
      merged.add(n);
    }
  }
  return merged;
}

final notificationsRepositoryProvider =
    Provider<NotificationsRepository>((ref) => NotificationsRepository(ref.watch(apiClientProvider)));

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  final List<AppNotification> _items = [];
  PageInfo? _page;
  bool _loading = true;
  bool _loadingMore = false;
  Object? _error;

  /// Bumped by every reload from page 1, so a «عرض المزيد» answer for the older list is dropped
  int _generation = 0;

  NotificationsRepository get _repo => ref.read(notificationsRepositoryProvider);

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// First page (also pull-to-refresh): replaces the list, so rows that moved since are shown where they are now
  Future<void> _load() async {
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await _repo.list();
      if (!mounted || generation != _generation) return;
      setState(() {
        _items
          ..clear()
          ..addAll(res.items);
        _page = res.page;
        _loadingMore = false;
      });
    } catch (e) {
      if (mounted && generation == _generation) setState(() => _error = e);
    } finally {
      if (mounted && generation == _generation) setState(() => _loading = false);
    }
  }

  Future<void> _more() async {
    final p = _page;
    if (p == null || !p.hasMore || _loadingMore) return;
    final generation = _generation;
    setState(() => _loadingMore = true);
    try {
      final res = await _repo.list(page: p.page + 1);
      if (mounted && generation == _generation) {
        setState(() {
          final merged = mergeNotificationPage(_items, res.items);
          _items
            ..clear()
            ..addAll(merged);
          _page = res.page;
        });
      }
    } catch (e) {
      if (mounted && generation == _generation) showSnack(context, ApiException.messageOf(e));
    } finally {
      if (mounted && generation == _generation) setState(() => _loadingMore = false);
    }
  }

  Future<void> _open(int i) async {
    final n = _items[i];
    if (!n.isRead) {
      setState(() => _items[i] = n.read());
      _repo.markRead(n.id).then((_) => ref.invalidate(unreadNotificationsProvider)).catchError((_) {});
    }
    openAppRoute(GoRouter.of(context), appRouteFor(n));
  }

  Future<void> _readAll() async {
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      await _repo.markAllRead();
      container.invalidate(unreadNotificationsProvider);
      if (mounted) setState(() => _items.setAll(0, _items.map((e) => e.read()).toList()));
    } catch (e) {
      if (mounted) showSnack(context, ApiException.messageOf(e));
    }
  }

  /// Swiped away: gone at once, back in place if the server refuses
  Future<void> _delete(AppNotification n) async {
    final i = _items.indexWhere((e) => e.id == n.id);
    if (i < 0) return;
    setState(() => _items.removeAt(i));
    try {
      await _repo.delete(n.id);
      if (!n.isRead) ref.invalidate(unreadNotificationsProvider);
    } on ApiException catch (e) {
      // Already gone (deleted on the website): nothing to put back
      if (e.statusCode == 404) return;
      _restore(i, n);
    } catch (_) {
      _restore(i, n);
    }
  }

  void _restore(int i, AppNotification n) {
    if (!mounted) return;
    setState(() => _items.insert(i.clamp(0, _items.length), n));
    showSnack(context, 'تعذّر حذف الإشعار، يُرجى المحاولة مرة أخرى');
  }

  Future<void> _deleteAll() async {
    final ok = await confirmDialog(
      context,
      title: 'حذف جميع الإشعارات',
      body: 'ستُحذف كل الإشعارات من هذه الصفحة. لا يمكن التراجع عن ذلك.',
      confirmLabel: 'حذف الكل',
      destructive: true,
    );
    if (!ok || !mounted) return;
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      await _repo.deleteAll();
      container.invalidate(unreadNotificationsProvider);
      if (!mounted) return;
      _generation++;
      setState(() {
        _items.clear();
        _page = null;
        _loadingMore = false;
      });
    } catch (e) {
      if (mounted) showSnack(context, ApiException.messageOf(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasUnread = _items.any((n) => !n.isRead);
    return Scaffold(
      appBar: AppBar(
        title: const Text('الإشعارات'),
        actions: [
          if (hasUnread) TextButton(onPressed: _readAll, child: const Text('قراءة الكل')),
          PopupMenuButton<String>(
            key: const Key('notifications-menu'),
            onSelected: (v) => v == 'delete' ? _deleteAll() : context.push('/settings/notifications'),
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'settings', child: Text('إعدادات الإشعارات')),
              if (_items.isNotEmpty) const PopupMenuItem(value: 'delete', child: Text('حذف الكل')),
            ],
          ),
        ],
      ),
      body: Builder(builder: (context) {
        if (_loading && _items.isEmpty) return const SkeletonList(count: 5, itemHeight: 70);
        if (_error != null && _items.isEmpty) return ErrorView(error: _error!, onRetry: _load);
        return RefreshIndicator(
          onRefresh: _load,
          child: _items.isEmpty
              ? ListView(children: const [
                  PushOffCard(padding: EdgeInsets.fromLTRB(16, 12, 16, 0)),
                  SizedBox(
                    height: 420,
                    child: MessageView(icon: Icons.notifications_none_rounded, title: 'لا توجد إشعارات'),
                  ),
                ])
              : ListView.separated(
                  itemCount: _items.length + 2,
                  separatorBuilder: (_, i) => i == 0 ? const SizedBox.shrink() : const Divider(),
                  itemBuilder: (context, row) {
                    if (row == 0) return const PushOffCard(padding: EdgeInsets.fromLTRB(16, 12, 16, 8));
                    final i = row - 1;
                    if (i == _items.length) {
                      if (!(_page?.hasMore ?? false)) return const SizedBox(height: 24);
                      return _loadingMore
                          ? const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()))
                          : TextButton(onPressed: _more, child: const Text('عرض المزيد'));
                    }
                    final n = _items[i];
                    final tile = ListTile(
                      tileColor: n.isRead ? null : AppColors.gold.withValues(alpha: 0.06),
                      minVerticalPadding: 12,
                      leading: Icon(_icon(n.type), color: n.isRead ? AppColors.muted : AppColors.navy),
                      title: Text(n.title, style: TextStyle(fontWeight: n.isRead ? FontWeight.w600 : FontWeight.w800)),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(n.body),
                          if (n.createdAt != null)
                            Text(formatRelative(n.createdAt!), style: AppText.caption.copyWith(color: AppColors.muted)),
                        ],
                      ),
                      onTap: () => _open(i),
                    );
                    // Swipe either way to delete (the website's bin icon)
                    return Dismissible(
                      key: ValueKey('notification-${n.id}'),
                      background: const _DeleteBackground(alignment: AlignmentDirectional.centerStart),
                      secondaryBackground: const _DeleteBackground(alignment: AlignmentDirectional.centerEnd),
                      onDismissed: (_) => _delete(n),
                      child: tile,
                    );
                  },
                ),
        );
      }),
    );
  }

  static IconData _icon(String type) => switch (type) {
        'SUGGESTION' => Icons.auto_awesome_outlined,
        'INTEREST' => Icons.favorite_border_rounded,
        'MATCH' => Icons.handshake_outlined,
        'VISIT_UPDATE' || 'INTRO_REQUEST' => Icons.family_restroom_rounded,
        'CHAT' => Icons.chat_bubble_outline_rounded,
        'PAYMENT' => Icons.account_balance_wallet_outlined,
        'SUPPORT' => Icons.support_agent_rounded,
        _ => Icons.notifications_none_rounded,
      };
}

class _DeleteBackground extends StatelessWidget {
  const _DeleteBackground({required this.alignment});
  final AlignmentGeometry alignment;

  @override
  Widget build(BuildContext context) => Container(
        color: AppColors.dangerBg,
        alignment: alignment,
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: const Icon(Icons.delete_outline_rounded, color: AppColors.danger),
      );
}
