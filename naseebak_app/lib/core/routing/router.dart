import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/shell.dart';
import '../../features/auth/otp_screen.dart';
import '../../features/auth/paused_screen.dart';
import '../../features/auth/auth_repository.dart' show OtpContext;
import '../../features/auth/pending_auth.dart';
import '../../features/auth/phone_screen.dart';
import '../../features/auth/register_screen.dart';
import '../../features/auth/suspended_screen.dart';
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
import '../../features/notifications/mark_page_read.dart';
import '../../features/notifications/notifications_screen.dart';
import '../../features/onboarding/setup_screen.dart';
import '../../features/pro/pro_screen.dart';
import '../../features/profile/guardian_form.dart';
import '../../features/profile/photos_screen.dart';
import '../../features/profile/profile_edit_screen.dart';
import '../../features/profile/preferences_screen.dart';
import '../../features/profile/profile_screen.dart';
import '../../features/profile/quiz_screen.dart';
import '../../features/referral/referral_screen.dart';
import '../../features/settings/settings_screen.dart';
import '../../features/support/support_screen.dart';
import 'website_links.dart';
import '../../features/welcome/intro_screen.dart';
import '../../features/welcome/splash_screen.dart';
import '../../features/welcome/welcome_state.dart';
import '../analytics/analytics.dart';
import '../auth/auth_controller.dart';

/// Where the member must be, given the session and the picked country (null = stay).
///
/// Order: splash played → (suspended account: its own page) → (first launch: intro pages) → country picked →
/// session known → signed in → not paused → short setup done.
String? guardRedirect({
  required String location,
  required String? countryCode,
  required AuthState auth,
  bool splashDone = true,
  bool introSeen = true,
}) {
  if (!splashDone) return location == '/splash' ? null : '/splash';
  if (auth.status == AuthStatus.suspended) return location == '/suspended' ? null : '/suspended';
  final onCountry = location == '/country';
  final onAuth = location.startsWith('/auth/');
  final signedIn = auth.isSignedIn;

  if (!signedIn && countryCode == null) {
    if (!introSeen) return location == '/intro' ? null : '/intro';
    return onCountry ? null : '/country';
  }

  switch (auth.status) {
    case AuthStatus.unknown:
    case AuthStatus.restoreFailed:
    case AuthStatus.suspended:
      return location == '/splash' ? null : '/splash';
    case AuthStatus.signedOut:
      if (onAuth || onCountry) return null;
      return '/auth/phone';
    case AuthStatus.signedIn:
      final me = auth.me!;
      // Paused: only the paused page, and «عضوية Pro» to see or stop the renewal
      if (me.deactivated) return location == '/paused' || location == '/pro' ? null : '/paused';
      if (!me.profileComplete) {
        return location == '/onboarding' || location == '/profile/guardian' ? null : '/onboarding';
      }
      const entry = ['/splash', '/intro', '/country', '/paused', '/suspended', '/onboarding'];
      if (onAuth || entry.contains(location)) return '/home';
      return null;
  }
}

/// `/credits?section=pro` (old links and pre-release builds' «Pro» tag) → the Pro screen, which now has its own route
String? creditsRedirect(Uri uri) => uri.queryParameters['section'] == 'pro' ? '/pro' : null;

/// A screen of the signed-in app (not the splash, intro, sign-in or setup pages)
bool _inApp(String path) =>
    !const ['/splash', '/intro', '/country', '/paused', '/suspended', '/onboarding'].contains(path) &&
    !path.startsWith('/auth/');

/// Sees a naseebak.com link the platform opens while the app runs before the router does; [handle] returns true when
/// it opened it itself.
class WebsiteLinkObserver with WidgetsBindingObserver {
  WebsiteLinkObserver(this.handle);
  final bool Function(Uri uri) handle;

  @override
  Future<bool> didPushRouteInformation(RouteInformation routeInformation) async => handle(routeInformation.uri);
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
    ref.listen(splashDoneProvider, (_, _) => notifyListeners());
    ref.listen(introSeenProvider, (_, _) => notifyListeners());
  }
}

final rootNavigatorKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh(ref);
  ref.onDispose(refresh.dispose);

  // A naseebak.com link waiting for the home screen: one that opened the app before it could show it (splash,
  // sign-in), or a detail screen (a chat, a match), which is pushed over home so «رجوع» returns there. One slot: a
  // newer link replaces one still waiting, and a link is opened once (taken out of the slot before it opens).
  String? pendingLink;
  late final GoRouter router;
  void openPending() {
    final route = pendingLink;
    pendingLink = null;
    if (route == null) return;
    openAppRoute(router, route);
  }
  String? guard(String path) => guardRedirect(
        location: path,
        countryCode: ref.read(selectedCountryCodeProvider),
        auth: ref.read(authControllerProvider),
        splashDone: ref.read(splashDoneProvider),
        introSeen: ref.read(introSeenProvider),
      );

  // A link while the app is open and ready (signed in, past setup): opened like a notice tap, over the screen the
  // member is on, and the screen already on top (e.g. «عضوية Pro» when Stripe returns to it) is never opened twice.
  // Registered before the router's own listener, so it sees the link first; anything else (signed out, a referral
  // link) goes on to the router's redirect below.
  // Not ready yet (splash, sign-in, setup): it waits in the slot and opens on home.
  final links = WebsiteLinkObserver((uri) {
    final link = WebsiteLink.parse(uri);
    final route = link?.route;
    if (link == null || route == null || link.invitationCode != null) return false;
    String current;
    try {
      current = router.state.uri.path;
    } catch (_) {
      // No screen yet
      current = '/splash';
    }
    if (guard('/home') != null || guard(current) != null || !_inApp(current)) {
      pendingLink = route;
      return true;
    }
    pendingLink = null;
    openAppRoute(router, route);
    return true;
  });
  WidgetsBinding.instance.addObserver(links);
  ref.onDispose(() => WidgetsBinding.instance.removeObserver(links));
  // A link that came while the app was still starting
  final early = EarlyLinks.instance.take();
  final earlyLink = early == null ? null : WebsiteLink.parse(early);
  if (earlyLink != null) {
    final code = earlyLink.invitationCode;
    if (code != null) {
      // A friend's invitation: kept for sign-up, which opens on «حساب جديد» (as the redirect does)
      ref.read(sharedPreferencesProvider).setString(pendingInvitationKey, code);
      Future.microtask(() => ref.read(authModeProvider.notifier).set(OtpContext.register));
    } else if (earlyLink.route != null) {
      pendingLink = earlyLink.route;
    }
  }

  router = GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/splash',
    refreshListenable: refresh,
    redirect: (context, state) {
      final link = WebsiteLink.parse(state.uri);
      if (link != null) {
        if (link.invitationCode != null) {
          ref.read(sharedPreferencesProvider).setString(pendingInvitationKey, link.invitationCode!);
          // A friend's invitation: the phone screen opens on «حساب جديد» (not during the redirect itself)
          Future.microtask(() => ref.read(authModeProvider.notifier).set(OtpContext.register));
        }
        final route = link.route;
        if (route == null) return guard('/auth/phone') ?? '/auth/phone';
        pendingLink = route;
        return guard('/home') ?? '/home';
      }
      final blocked = guard(state.uri.path);
      if (blocked != null) return blocked;
      if (pendingLink != null && state.uri.path == '/home') Future.microtask(openPending);
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/intro', builder: (_, _) => const IntroScreen()),
      GoRoute(path: '/country', builder: (_, _) => const CountryPickerScreen()),
      GoRoute(path: '/auth/phone', builder: (_, _) => const PhoneScreen()),
      GoRoute(path: '/auth/otp', builder: (_, _) => const OtpScreen()),
      GoRoute(path: '/auth/register', builder: (_, _) => const RegisterScreen()),
      GoRoute(path: '/paused', builder: (_, _) => const PausedScreen()),
      GoRoute(path: '/suspended', builder: (_, _) => const SuspendedScreen()),
      GoRoute(path: '/onboarding', builder: (_, _) => const SetupScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => AppShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/home', builder: (_, _) => const HomeScreen())]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/suggestions',
              // MarkPageRead: opening a screen clears the notifications that lead to it (like the website)
              builder: (_, state) => MarkPageRead(
                path: '/dashboard/suggestions',
                tab: '/suggestions',
                child: SuggestionsScreen(initialTab: FeedTabX.parse(state.uri.queryParameters['tab'])),
              ),
            ),
          ]),
          StatefulShellBranch(routes: [GoRoute(
              path: '/matches',
              builder: (_, _) => const MarkPageRead(path: '/dashboard/matches', tab: '/matches', child: MatchesScreen()),
            )]),
          StatefulShellBranch(routes: [GoRoute(
              path: '/chats',
              builder: (_, _) => const MarkPageRead(path: '/dashboard/chats', exact: true, tab: '/chats', child: ChatsScreen()),
            )]),
          StatefulShellBranch(routes: [GoRoute(path: '/account', builder: (_, _) => const AccountScreen())]),
        ],
      ),
      GoRoute(
        path: '/matches/:id',
        parentNavigatorKey: rootNavigatorKey,
        builder: (_, state) => MarkPageRead(
          path: '/dashboard/matches',
          child: MatchDetailScreen(
            matchId: state.pathParameters['id']!,
            initial: state.extra is MatchSummary ? state.extra as MatchSummary : null,
          ),
        ),
      ),
      GoRoute(
        path: '/chats/:id',
        parentNavigatorKey: rootNavigatorKey,
        builder: (_, state) => MarkPageRead(
          path: '/dashboard/chats/${state.pathParameters['id']!}',
          child: ChatRoomScreen(chatId: state.pathParameters['id']!),
        ),
      ),
      GoRoute(path: '/notifications', builder: (_, _) => const NotificationsScreen()),
      GoRoute(
        path: '/credits',
        // `?section=pro` (a «Pro» tag in a 1.1.0 pre-release chat, old links) now lives on its own screen
        redirect: (_, state) => creditsRedirect(state.uri),
        builder: (_, _) => const MarkPageRead(path: '/dashboard/payments', child: CreditsScreen()),
      ),
      GoRoute(
        path: '/pro',
        // A test or review account (payments hidden) never sees Pro, not even its name: home instead
        redirect: (_, _) => ref.read(appPaymentsProvider) ? null : '/home',
        builder: (_, _) => const MarkPageRead(path: '/dashboard/pro', child: ProScreen()),
      ),
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
  trackScreens(router, ref.read(analyticsProvider));
  return router;
});
