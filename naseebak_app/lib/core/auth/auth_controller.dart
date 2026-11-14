import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../features/auth/me.dart';
import '../../features/chat/chat_cache.dart';
import '../../features/chat/chat_drafts.dart';
import '../../features/chat/last_chat.dart';
import '../../features/chat/voice_played_store.dart';
import '../network/api_exception.dart';
import '../push/push_service.dart';
import '../storage/picker_files.dart';

enum AuthStatus {
  /// Restoring the saved session
  unknown,
  signedOut,
  signedIn,

  /// A token is saved but the server could not be reached: offer a retry (never sign out for that)
  restoreFailed,

  /// The team suspended the account (`/api/mobile/me` → 403 `SUSPENDED`): only sign-out or support
  suspended,
}

class AuthState {
  const AuthState(this.status, {this.me, this.error});

  const AuthState.unknown() : this(AuthStatus.unknown);
  const AuthState.signedOut() : this(AuthStatus.signedOut);

  final AuthStatus status;
  final Me? me;
  final String? error;

  bool get isSignedIn => status == AuthStatus.signedIn && me != null;
}

/// `/api/mobile/me` refused the account as suspended (also an older server's 403 without a code: with paused
/// accounts let through, that route has no other 403).
bool isSuspendedAnswer(ApiException e) =>
    e.kind == ApiErrorKind.suspended || (e.kind == ApiErrorKind.forbidden && e.statusCode == 403);

/// Why the sign-in page shows up on its own (the token expired or was revoked): said once there
const sessionEndedMessage = 'انتهت الجلسة. يُرجى تسجيل الدخول من جديد.';

/// The one-shot reason for the sign-in page (null = nothing to say); the phone screen clears it once used
class SessionNotice extends Notifier<String?> {
  @override
  String? build() => null;

  void set(String? message) => state = message;
}

final sessionNoticeProvider = NotifierProvider<SessionNotice, String?>(SessionNotice.new);

/// The member's session: token in secure storage, the `/api/mobile/me` summary in memory.
class AuthController extends Notifier<AuthState> {
  /// Back in the foreground: `me` is re-read at most this often (pause / suspension from elsewhere)
  static const resumeRefreshGap = Duration(seconds: 60);

  /// After a failed restore there is no session to revoke from here: the server's sign-out is tried, but never
  /// waited on longer than this (it took up to 30 s offline with the button looking dead)
  @visibleForTesting
  static Duration offlineLogoutWait = const Duration(seconds: 5);

  DateTime? _lastMeRead;
  Future<void>? _refreshing;
  Future<void>? _restoring;
  Future<void>? _loggingOut;
  Future<void>? _signingOut;

  @override
  AuthState build() {
    Future.microtask(restore);
    return const AuthState.unknown();
  }

  /// Reads the saved session. A retry shows the wait again (status unknown: the splash's dots), and taps made
  /// meanwhile share the one on the way.
  Future<void> restore() => _restoring ??= _restore().whenComplete(() => _restoring = null);

  Future<void> _restore() async {
    if (state.status == AuthStatus.restoreFailed) state = const AuthState.unknown();
    final store = ref.read(tokenStoreProvider);
    final token = await store.read();
    if (token == null || token.isEmpty) {
      state = const AuthState.signedOut();
      return;
    }
    try {
      final me = await ref.read(authRepositoryProvider).me();
      _lastMeRead = DateTime.now();
      await _rememberCountry(me);
      state = AuthState(AuthStatus.signedIn, me: me);
    } on ApiException catch (e) {
      if (e.kind == ApiErrorKind.unauthorized) {
        await store.clear();
        ref.read(sessionNoticeProvider.notifier).set(sessionEndedMessage);
        state = const AuthState.signedOut();
      } else if (isSuspendedAnswer(e)) {
        // Not a connection problem: retrying would never help
        state = AuthState(AuthStatus.suspended, error: e.message);
      } else {
        state = AuthState(AuthStatus.restoreFailed, error: e.message);
      }
    } catch (_) {
      state = const AuthState(AuthStatus.restoreFailed, error: ApiException.genericMessage);
    }
  }

  /// After `/api/auth/verify-otp` (and `/api/auth/register` for new members): exchange the code for a token.
  Future<Me> signInWithCode({required String phone, required String code}) async {
    final res = await ref.read(authRepositoryProvider).issueToken(phone: phone, code: code, device: 'naseebak-app');
    await ref.read(tokenStoreProvider).write(res.token);
    ref.read(sessionNoticeProvider.notifier).set(null);
    await _rememberCountry(res.me);
    _lastMeRead = DateTime.now();
    state = AuthState(AuthStatus.signedIn, me: res.me);
    return res.me;
  }

  /// Re-reads `/api/mobile/me` (credits, profile completion, paused / suspended state). Calls made while one is on
  /// the way share it (a burst of 403 `DEACTIVATED` answers reads `me` once).
  Future<void> refreshMe() {
    if (state.status != AuthStatus.signedIn && state.status != AuthStatus.suspended) return Future.value();
    return _refreshing ??= _readMe().whenComplete(() => _refreshing = null);
  }

  Future<void> _readMe() async {
    try {
      final me = await ref.read(authRepositoryProvider).me();
      _lastMeRead = DateTime.now();
      if (state.status == AuthStatus.signedOut) return;
      state = AuthState(AuthStatus.signedIn, me: me);
    } on ApiException catch (e) {
      if (e.kind == ApiErrorKind.unauthorized) {
        await _endedByServer();
      } else if (isSuspendedAnswer(e) && state.status != AuthStatus.signedOut) {
        _lastMeRead = DateTime.now();
        state = AuthState(AuthStatus.suspended, error: e.message);
      }
    }
  }

  /// The app came back to the foreground: re-read `me` unless it was read in the last [resumeRefreshGap].
  Future<void> refreshOnResume({DateTime? now}) async {
    // The saved session couldn't be checked (offline at launch): try again now the app is back, no tap needed
    if (state.status == AuthStatus.restoreFailed) return restore();
    final last = _lastMeRead;
    if (last != null && (now ?? DateTime.now()).difference(last) < resumeRefreshGap) return;
    await refreshMe();
  }

  /// Shows a newer balance without a round trip (payment status, decide answers).
  void updateCredits(int credits) {
    final me = state.me;
    if (state.status == AuthStatus.signedIn && me != null && me.credits != credits) {
      state = AuthState(AuthStatus.signedIn, me: me.copyWith(credits: credits));
    }
  }

  /// Signs out (taps made meanwhile share the one on the way).
  Future<void> logout() => _loggingOut ??= _logout().whenComplete(() => _loggingOut = null);

  Future<void> _logout() async {
    // Offline at launch: the server is likely unreachable, so its sign-out is tried briefly only
    final offline = state.status == AuthStatus.restoreFailed;
    // Before the token is revoked: the server must still know who removes the push token
    await ref.read(pushServiceProvider).unregister();
    try {
      final call = ref.read(authRepositoryProvider).logout();
      await (offline ? call.timeout(offlineLogoutWait) : call);
    } catch (_) {
      // Offline: the token is still forgotten on this device
    }
    await _signOutOnce();
  }

  /// A 401 from any authenticated call: the token is gone or revoked. Several at once sign out once.
  void handleUnauthorized() {
    if (state.status == AuthStatus.signedOut) return;
    _endedByServer().catchError((Object _) {});
  }

  /// The server ended the session (not the member's own sign-out): the sign-in page says why
  Future<void> _endedByServer() {
    if (_loggingOut == null && state.status == AuthStatus.signedIn) {
      ref.read(sessionNoticeProvider.notifier).set(sessionEndedMessage);
    }
    return _signOutOnce();
  }

  Future<void> _signOutOnce() => _signingOut ??= _signOutLocally().whenComplete(() => _signingOut = null);

  Future<void> _signOutLocally() async {
    // Photos of the last member's matches never stay in memory for the next sign-in (first: nothing below can skip it)
    try {
      PaintingBinding.instance.imageCache
        ..clear()
        ..clearLiveImages();
    } catch (_) {
      // No painting binding (pure unit tests): no image cache to clear
    }
    // Each step runs even if one before it fails (the first failure is rethrown once all have run)
    Object? failed;
    StackTrace? failedAt;
    Future<void> step(Future<void> Function() run) async {
      try {
        await run();
      } catch (e, st) {
        failed ??= e;
        failedAt ??= st;
      }
    }

    try {
      await step(() => ref.read(tokenStoreProvider).clear());
      // Private conversations never stay on a phone after sign-out (nor drafts, nor the photo picker's copies)
      await step(() => ref.read(chatCacheProvider).clearAll());
      await step(() => ref.read(chatDraftsProvider).clearAll());
      await step(() => ref.read(pickerFilesCleanerProvider)());
      // Which of the partner's voice notes were played (the unplayed dots)
      await step(() => ref.read(voicePlayedStoreProvider).clear());
      // The chat to reopen after the system ended the app is this member's: never the next one's (review A2 minor 5)
      await step(() => ref.read(sharedPreferencesProvider).remove(LastChat.key));
    } finally {
      state = const AuthState.signedOut();
    }
    if (failed != null) Error.throwWithStackTrace(failed!, failedAt!);
  }

  /// The member's country is fixed by their number; keep the picker in step for the next sign-in.
  Future<void> _rememberCountry(Me me) async {
    if (me.country.code.isEmpty) return;
    await ref.read(countryRepositoryProvider).save(me.country.code);
    ref.invalidate(selectedCountryCodeProvider);
  }
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(AuthController.new);

/// Whether this member may buy credits in the app (hides packages and every «شحن» when off)
final appPaymentsProvider = Provider<bool>((ref) => ref.watch(authControllerProvider.select((s) => s.me?.appPayments ?? true)));

/// The country picked on this device (null before the first pick).
class SelectedCountryCode extends Notifier<String?> {
  @override
  String? build() => ref.read(countryRepositoryProvider).savedCode();

  Future<void> select(String code) async {
    await ref.read(countryRepositoryProvider).save(code);
    state = code.toUpperCase();
  }

  Future<void> clear() async {
    await ref.read(countryRepositoryProvider).clear();
    state = null;
  }
}

final selectedCountryCodeProvider = NotifierProvider<SelectedCountryCode, String?>(SelectedCountryCode.new);
