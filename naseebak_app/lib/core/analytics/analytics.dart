import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../push/push_service.dart';

/// Funnel analytics (Firebase / Google Analytics property of the `naseebak-app` project): where members drop off
/// between sign-up and a family introduction. Never names, phones or messages — only steps, choices and the member id.
/// Collected from release builds only (debug runs talk to a local server); `--dart-define=ANALYTICS_DEBUG=true` turns it
/// on for a debug build (with `adb shell setprop debug.firebase.analytics.app com.naseebak.naseebak_app` → DebugView).
/// Off when Firebase isn't set up (tests): every call is then a no-op.
class AppAnalytics {
  AppAnalytics(this._enabled);
  final bool _enabled;

  static const debugOverride = bool.fromEnvironment('ANALYTICS_DEBUG');
  static bool get collect => !kDebugMode || debugOverride;

  FirebaseAnalytics? get _fa => _enabled ? FirebaseAnalytics.instance : null;

  Future<void> _safe(Future<void> Function(FirebaseAnalytics fa) run) async {
    final fa = _fa;
    if (fa == null) return;
    try {
      await run(fa);
    } catch (e) {
      debugPrint('[analytics] $e');
    }
  }

  Future<void> log(String name, [Map<String, Object>? params]) => _safe((fa) => fa.logEvent(name: name, parameters: params));

  /// The member (opaque id) and the two facts every report splits by
  Future<void> setMember({String? id, String? gender, String? country}) => _safe((fa) async {
        await fa.setUserId(id: id);
        await fa.setUserProperty(name: 'gender', value: gender);
        await fa.setUserProperty(name: 'country', value: country);
      });

  /// A screen by its route pattern (`/chats/:id`, never the id itself)
  Future<void> screen(String route) => _safe((fa) => fa.logScreenView(screenName: route, screenClass: route));

  // The funnel, in order

  Future<void> otpRequested(String mode) => log('otp_requested', {'mode': mode});
  Future<void> otpVerified(String mode) => log('otp_verified', {'mode': mode});
  Future<void> signedUp({required bool withInvite}) =>
      _safe((fa) => fa.logSignUp(signUpMethod: 'phone', parameters: {'with_invite': withInvite ? 1 : 0}));
  Future<void> loggedIn() => _safe((fa) => fa.logLogin(loginMethod: 'phone'));
  Future<void> inviteCode({required bool applied}) => log(applied ? 'invite_code_applied' : 'invite_code_failed');
  Future<void> setupStep(int step) => log('setup_step_completed', {'step': step});
  Future<void> setupCompleted() => log('setup_completed');
  Future<void> interestSent({String? introPreference, required bool likedYou}) =>
      log('interest_sent', {'intro_preference': introPreference ?? 'none', 'liked_you': likedYou ? 1 : 0});
  Future<void> suggestionDeclined() => log('suggestion_declined');
  Future<void> matchCreated(String intro) => log('match_created', {'intro': intro});
  Future<void> introRequestSent(String type) => log(type == 'FAMILY' ? 'family_request_sent' : 'chat_request_sent');
  Future<void> introRequestAnswered({required String type, required bool accepted}) =>
      log('intro_request_answered', {'type': type, 'accepted': accepted ? 1 : 0});
  Future<void> chatStarted() => log('chat_started');
  Future<void> checkoutStarted(String packageId) => log('begin_checkout', {'package': packageId});
}

final analyticsProvider = Provider<AppAnalytics>((ref) => AppAnalytics(ref.watch(firebaseReadyProvider)));

/// Screen views from the router: the matched route pattern, logged when it changes
void trackScreens(GoRouter router, AppAnalytics analytics) {
  String? last;
  void report() {
    final route = router.state.fullPath;
    if (route == null || route.isEmpty || route == last) return;
    last = route;
    analytics.screen(route);
  }

  router.routerDelegate.addListener(report);
}
