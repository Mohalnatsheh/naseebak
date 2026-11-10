import 'package:flutter/widgets.dart';

import '../../features/notifications/notifications_screen.dart' show appRouteForLink;
import '../../features/pro/pro_repository.dart' show ProReturn;

/// A naseebak.com link opened in the app (Android App Links / iOS Universal Links): the member pages
/// (`/dashboard/...`, mapped like a notification's link) and the referral link (`/register?invitationCode=`).
class WebsiteLink {
  const WebsiteLink({this.route, this.invitationCode});

  /// App screen to open (null: just sign-up with the invitation code filled in)
  final String? route;
  final String? invitationCode;

  /// null when [uri] isn't a website page the app handles
  static WebsiteLink? parse(Uri uri) {
    final path = uri.path;
    if (path == '/dashboard' || path.startsWith('/dashboard/')) {
      return WebsiteLink(route: appRouteForLink(url: uri.replace(scheme: '', host: '').toString()));
    }
    if (path == '/register') {
      final code = uri.queryParameters['invitationCode']?.trim();
      return WebsiteLink(invitationCode: code == null || code.isEmpty ? null : code);
    }
    return null;
  }
}

/// Stripe's return link from a Pro checkout: `/dashboard/pro?pro=success` (paid) or `?pro=cancel` (backed out). Null
/// for any other link.
ProReturn? proReturnOf(Uri uri) {
  if (uri.path != '/dashboard/pro') return null;
  return switch (uri.queryParameters['pro']) {
    'success' => ProReturn.success,
    'cancel' => ProReturn.cancel,
    _ => null,
  };
}

/// Where a referral link's invitation code waits for the sign-up screen (shared preferences)
const pendingInvitationKey = 'pending_invitation_code';

/// A naseebak.com link the platform delivers while `main()` is still starting, before the router exists. On Android a
/// link sent to a killed app whose task is kept recreates the activity (its own old link is dropped, `MainActivity`)
/// and then delivers the new one through onNewIntent, early: without this it was lost. The router takes it once.
class EarlyLinks with WidgetsBindingObserver {
  EarlyLinks._();
  static final instance = EarlyLinks._();

  Uri? _uri;
  bool _listening = false;

  /// From `main()`, right after the binding exists
  void start() {
    if (_listening) return;
    _listening = true;
    WidgetsBinding.instance.addObserver(this);
  }

  /// The router is ready: the link waiting (if any), and no more catching
  Uri? take() {
    if (_listening) {
      WidgetsBinding.instance.removeObserver(this);
      _listening = false;
    }
    final uri = _uri;
    _uri = null;
    return uri;
  }

  @override
  Future<bool> didPushRouteInformation(RouteInformation routeInformation) async {
    if (WebsiteLink.parse(routeInformation.uri) == null) return false;
    _uri = routeInformation.uri;
    return true;
  }
}
