import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/shell.dart';
import '../../features/auth/otp_screen.dart';
import '../../features/auth/paused_screen.dart';
import '../../features/auth/phone_screen.dart';
import '../../features/auth/register_screen.dart';
import '../../features/chat/chat_room_screen.dart';
import '../../features/chat/chats_screen.dart';
import '../../features/country_selection/country_picker_screen.dart';
import '../../features/credits/credits_screen.dart';
import '../../features/discovery/suggestion_models.dart';
import '../../features/discovery/suggestions_screen.dart';
import '../../features/home/home_screen.dart';
import '../../features/matches/match_detail_screen.dart';
import '../../features/matches/match_models.dart';
import '../../features/matches/matches_screen.dart';
import '../../features/notifications/notifications_screen.dart';
import '../../features/onboarding/setup_screen.dart';
import '../../features/profile/guardian_form.dart';
import '../../features/profile/photos_screen.dart';
import '../../features/profile/profile_edit_screen.dart';
import '../../features/profile/preferences_screen.dart';
import '../../features/profile/profile_screen.dart';
import '../../features/profile/quiz_screen.dart';
import '../../features/referral/referral_screen.dart';
import '../../features/settings/settings_screen.dart';
import '../../features/support/support_screen.dart';
import '../auth/auth_controller.dart';

/// Where the member must be, given the session and the picked country (null = stay).
///
/// Order: country picked → session known → signed in → not paused → short setup done.
String? guardRedirect({required String location, required String? countryCode, required AuthState auth}) {
  final onCountry = location == '/country';
  final onAuth = location.startsWith('/auth/');
  final signedIn = auth.isSignedIn;

  if (!signedIn && countryCode == null) return onCountry ? null : '/country';

  switch (auth.status) {
    case AuthStatus.unknown:
    case AuthStatus.restoreFailed:
      return location == '/splash' ? null : '/splash';
    case AuthStatus.signedOut:
      if (onAuth || onCountry) return null;
      return '/auth/phone';
    case AuthStatus.signedIn:
      final me = auth.me!;
      if (me.deactivated) return location == '/paused' ? null : '/paused';
      if (!me.profileComplete) {
        return location == '/onboarding' || location == '/profile/guardian' ? null : '/onboarding';
      }
      const entry = ['/splash', '/country', '/paused', '/onboarding'];
      if (onAuth || entry.contains(location)) return '/home';
      return null;
  }
}

/// Bridges Riverpod state changes to go_router's refresh.
class _RouterRefresh extends ChangeNotifier {
  _RouterRefresh(Ref ref) {
    ref.listen(authControllerProvider, (prev, next) {
      // Only status / gating changes re-route (credits updates don't)
      final before = (prev?.status, prev?.me?.deactivated, prev?.me?.profileComplete, prev?.me?.id);
      final after = (next.status, next.me?.deactivated, next.me?.profileComplete, next.me?.id);
      if (before != after) notifyListeners();
    });
    ref.listen(selectedCountryCodeProvider, (_, _) => notifyListeners());
  }
}

final rootNavigatorKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/splash',
    refreshListenable: refresh,
    redirect: (context, state) => guardRedirect(
      location: state.uri.path,
      countryCode: ref.read(selectedCountryCodeProvider),
      auth: ref.read(authControllerProvider),
    ),
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/country', builder: (_, _) => const CountryPickerScreen()),
      GoRoute(path: '/auth/phone', builder: (_, _) => const PhoneScreen()),
      GoRoute(path: '/auth/otp', builder: (_, _) => const OtpScreen()),
      GoRoute(path: '/auth/register', builder: (_, _) => const RegisterScreen()),
      GoRoute(path: '/paused', builder: (_, _) => const PausedScreen()),
      GoRoute(path: '/onboarding', builder: (_, _) => const SetupScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => AppShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/home', builder: (_, _) => const HomeScreen())]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/suggestions',
              builder: (_, state) =>
                  SuggestionsScreen(initialTab: FeedTabX.parse(state.uri.queryParameters['tab'])),
            ),
          ]),
          StatefulShellBranch(routes: [GoRoute(path: '/matches', builder: (_, _) => const MatchesScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/chats', builder: (_, _) => const ChatsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/account', builder: (_, _) => const AccountScreen())]),
        ],
      ),
      GoRoute(
        path: '/matches/:id',
        parentNavigatorKey: rootNavigatorKey,
        builder: (_, state) => MatchDetailScreen(
          matchId: state.pathParameters['id']!,
          initial: state.extra is MatchSummary ? state.extra as MatchSummary : null,
        ),
      ),
      GoRoute(
        path: '/chats/:id',
        parentNavigatorKey: rootNavigatorKey,
        builder: (_, state) => ChatRoomScreen(chatId: state.pathParameters['id']!),
      ),
      GoRoute(path: '/notifications', builder: (_, _) => const NotificationsScreen()),
      GoRoute(path: '/credits', builder: (_, _) => const CreditsScreen()),
      GoRoute(path: '/credits/history', builder: (_, _) => const PaymentHistoryScreen()),
      GoRoute(path: '/profile', builder: (_, _) => const ProfileScreen()),
      GoRoute(path: '/profile/guardian', builder: (_, _) => const GuardianScreen()),
      GoRoute(path: '/profile/photos', builder: (_, _) => const PhotosScreen()),
      GoRoute(path: '/profile/preferences', builder: (_, _) => const PreferencesScreen()),
      GoRoute(path: '/profile/quiz', builder: (_, _) => const QuizScreen()),
      GoRoute(path: '/profile/edit', builder: (_, _) => const ProfileEditScreen()),
      GoRoute(path: '/support', builder: (_, _) => const SupportScreen()),
      GoRoute(path: '/referral', builder: (_, _) => const ReferralScreen()),
      GoRoute(path: '/settings/notifications', builder: (_, _) => const NotificationPrefsScreen()),
      GoRoute(path: '/settings/blocks', builder: (_, _) => const BlocksScreen()),
    ],
    errorBuilder: (context, state) => Scaffold(
      appBar: AppBar(),
      body: Center(
        child: TextButton(onPressed: () => context.go('/home'), child: const Text('الصفحة غير موجودة · الرئيسية')),
      ),
    ),
  );
});
