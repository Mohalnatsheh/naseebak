import '../../features/notifications/notifications_screen.dart' show appRouteForLink;

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

/// Where a referral link's invitation code waits for the sign-up screen (shared preferences)
const pendingInvitationKey = 'pending_invitation_code';
