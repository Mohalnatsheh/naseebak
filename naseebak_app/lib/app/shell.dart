import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/theme/app_theme.dart';
import '../core/update/app_update.dart';
import '../features/alerts/alert_gate.dart';
import '../features/home/counts.dart';

/// A tab's name for screen readers, with what waits there after it
/// The «الاقتراحات» tab badge, one rule with the website's nav (review X4b minor 5): someone already said «مهتم» (good
/// news, gold) wins; else how many new cards wait (navy)
(int, BadgeTone) suggestionsBadgeOf({required int likedYou, required int newSuggestions}) =>
    likedYou > 0 ? (likedYou, BadgeTone.good) : (newSuggestions, BadgeTone.count);

String tabTooltip(String label, int count) => count > 0 ? '$label، ${count > 99 ? 'أكثر من 99' : count} جديدة' : label;

/// Bottom navigation: home, suggestions, matches, chats, account.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = ref.watch(countsProvider).valueOrNull;
    // The number is read after the tab's name («الاقتراحات، 10 جديدة», QA A2-L9), not before it
    Widget icon(IconData i, int count, {BadgeTone tone = BadgeTone.count}) => count > 0
        ? Badge(
            backgroundColor: tone.background,
            textColor: tone.foreground,
            label: ExcludeSemantics(child: Text(count > 99 ? '99+' : '$count')),
            child: Icon(i),
          )
        : Icon(i);
    final (suggestionsBadge, suggestionsTone) =
        suggestionsBadgeOf(likedYou: c?.likedYou ?? 0, newSuggestions: c?.newSuggestions ?? 0);
    final matchesBadge = c?.pendingIntros ?? 0;
    // Back on another tab goes to «الرئيسية» first (Android); only home's back leaves the app
    return PopScope(
      canPop: shell.currentIndex == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) shell.goBranch(0);
      },
      child: Scaffold(
      // The admin's popup alert, over whichever tab is open
      body: Stack(
        children: [
          TabBackScope(handlesBack: shell.currentIndex != 0, child: AlertGate(child: shell)),
          // An optional update: one card just above the tab bar, on the tabs only
          const PositionedDirectional(start: 12, end: 12, bottom: 12, child: OptionalUpdateCard()),
        ],
      ),
      // The tab bar keeps one line: its text grows only a little with the system size, and a narrow phone shows
      // the selected tab's label only (QA A2-M5: «الاقتراحات» wrapped at 320 dp)
      bottomNavigationBar: MediaQuery.withClampedTextScaling(
        maxScaleFactor: 1.15,
        child: NavigationBar(
        labelBehavior: MediaQuery.sizeOf(context).width < 360
            ? NavigationDestinationLabelBehavior.onlyShowSelected
            : NavigationDestinationLabelBehavior.alwaysShow,
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) {
          shell.goBranch(i, initialLocation: i == shell.currentIndex);
          if (i == 0 || i == 3) ref.invalidate(countsProvider);
        },
        destinations: [
          const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'الرئيسية'),
          NavigationDestination(icon: icon(Icons.auto_awesome_outlined, suggestionsBadge, tone: suggestionsTone), label: 'الاقتراحات', tooltip: tabTooltip('الاقتراحات', suggestionsBadge)),
          NavigationDestination(icon: icon(Icons.handshake_outlined, matchesBadge, tone: BadgeTone.act), label: 'التوافقات', tooltip: tabTooltip('التوافقات', matchesBadge)),
          NavigationDestination(icon: icon(Icons.forum_outlined, c?.unreadChats ?? 0), label: 'المحادثات', tooltip: tabTooltip('المحادثات', c?.unreadChats ?? 0)),
          const NavigationDestination(icon: Icon(Icons.person_outline_rounded), selectedIcon: Icon(Icons.person_rounded), label: 'حسابي'),
        ],
      ),
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
