import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/alerts/alert_gate.dart';
import '../features/home/counts.dart';

/// Bottom navigation: home, suggestions, matches, chats, account.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = ref.watch(countsProvider).valueOrNull;
    Widget icon(IconData i, int count) => count > 0
        ? Badge(label: Text(count > 99 ? '99+' : '$count'), child: Icon(i))
        : Icon(i);
    final suggestionsBadge = (c?.newSuggestions ?? 0) + (c?.likedYou ?? 0);
    final matchesBadge = c?.pendingIntros ?? 0;
    // Back on another tab goes to «الرئيسية» first (Android); only home's back leaves the app
    return PopScope(
      canPop: shell.currentIndex == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) shell.goBranch(0);
      },
      child: Scaffold(
      // The admin's popup alert, over whichever tab is open
      body: TabBackScope(handlesBack: shell.currentIndex != 0, child: AlertGate(child: shell)),
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) {
          shell.goBranch(i, initialLocation: i == shell.currentIndex);
          if (i == 0 || i == 3) ref.invalidate(countsProvider);
        },
        destinations: [
          const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'الرئيسية'),
          NavigationDestination(icon: icon(Icons.auto_awesome_outlined, suggestionsBadge), label: 'الاقتراحات'),
          NavigationDestination(icon: icon(Icons.handshake_outlined, matchesBadge), label: 'التوافقات'),
          NavigationDestination(icon: icon(Icons.forum_outlined, c?.unreadChats ?? 0), label: 'المحادثات'),
          const NavigationDestination(icon: Icon(Icons.person_outline_rounded), selectedIcon: Icon(Icons.person_rounded), label: 'حسابي'),
        ],
      ),
    ),
    );
  }
}

/// Keeps Android's predictive back (Android 14, `enableOnBackInvokedCallback`) asking the app while a tab other than
/// home is open (QA A2-M1). Each tab's own navigator reports "nothing to pop" on its first page; that report rises
/// past the shell's [PopScope] to the root and tells the system to handle back itself, which closed the app. While
/// [handlesBack], such a report is replaced by one saying the app handles back, so the [PopScope] goes home.
class TabBackScope extends StatefulWidget {
  const TabBackScope({super.key, required this.handlesBack, required this.child});
  final bool handlesBack;
  final Widget child;

  @override
  State<TabBackScope> createState() => _TabBackScopeState();
}

class _TabBackScopeState extends State<TabBackScope> {
  @override
  void didUpdateWidget(TabBackScope old) {
    super.didUpdateWidget(old);
    if (widget.handlesBack && !old.handlesBack) _claim();
  }

  @override
  void initState() {
    super.initState();
    if (widget.handlesBack) _claim();
  }

  void _claim() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && widget.handlesBack) const NavigationNotification(canHandlePop: true).dispatch(context);
    });
  }

  @override
  Widget build(BuildContext context) => NotificationListener<NavigationNotification>(
        onNotification: (n) {
          if (!widget.handlesBack || n.canHandlePop) return false;
          const NavigationNotification(canHandlePop: true).dispatch(context);
          return true;
        },
        child: widget.child,
      );
}
