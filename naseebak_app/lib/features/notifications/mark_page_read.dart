import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../home/counts.dart';

/// Opening a screen marks the notifications that lead to it as read, like the website
/// (`POST /api/notifications/read-for-page`, same mapping as a notification's link), so the bell matches what the
/// member has already seen. [path] is the website page of this screen; [exact] = only notices for exactly that page
/// (the chats list, not each chat). A tab screen stays alive between visits: give its [tab] route so every return to
/// the tab marks again.
class MarkPageRead extends ConsumerStatefulWidget {
  const MarkPageRead({super.key, required this.path, this.exact = false, this.tab, required this.child});

  final String path;
  final bool exact;
  final String? tab;
  final Widget child;

  @override
  ConsumerState<MarkPageRead> createState() => _MarkPageReadState();
}

class _MarkPageReadState extends ConsumerState<MarkPageRead> {
  GoRouter? _router;
  bool _visible = true;

  @override
  void initState() {
    super.initState();
    _mark();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (widget.tab == null) return;
    final router = GoRouter.maybeOf(context);
    if (router == _router) return;
    _router?.routerDelegate.removeListener(_onRoute);
    _router = router?..routerDelegate.addListener(_onRoute);
  }

  @override
  void dispose() {
    _router?.routerDelegate.removeListener(_onRoute);
    super.dispose();
  }

  /// Back on this tab (switched to, or a screen on top closed): mark again
  void _onRoute() {
    final visible = _router?.state.uri.path == widget.tab;
    if (visible && !_visible) _mark();
    _visible = visible;
  }

  @override
  void didUpdateWidget(covariant MarkPageRead oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.path != widget.path) _mark();
  }

  Future<void> _mark() async {
    try {
      final j = await ref
          .read(apiClientProvider)
          .post('/api/notifications/read-for-page', body: {'path': widget.path, if (widget.exact) 'exact': true});
      if (mounted && (j['marked'] is num) && (j['marked'] as num) > 0) ref.invalidate(unreadNotificationsProvider);
    } catch (_) {
      // Best effort: the bell catches up on the next refresh
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
