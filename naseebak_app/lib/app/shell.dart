import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

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
    return Scaffold(
      body: shell,
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
    );
  }
}
