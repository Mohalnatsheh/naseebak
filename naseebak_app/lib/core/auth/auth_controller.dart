import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../features/auth/me.dart';
import '../network/api_exception.dart';

enum AuthStatus {
  /// Restoring the saved session
  unknown,
  signedOut,
  signedIn,

  /// A token is saved but the server could not be reached: offer a retry (never sign out for that)
  restoreFailed,
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

/// The member's session: token in secure storage, the `/api/mobile/me` summary in memory.
class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    Future.microtask(restore);
    return const AuthState.unknown();
  }

  Future<void> restore() async {
    final store = ref.read(tokenStoreProvider);
    final token = await store.read();
    if (token == null || token.isEmpty) {
      state = const AuthState.signedOut();
      return;
    }
    try {
      final me = await ref.read(authRepositoryProvider).me();
      await _rememberCountry(me);
      state = AuthState(AuthStatus.signedIn, me: me);
    } on ApiException catch (e) {
      if (e.kind == ApiErrorKind.unauthorized) {
        await store.clear();
        state = const AuthState.signedOut();
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
    await _rememberCountry(res.me);
    state = AuthState(AuthStatus.signedIn, me: res.me);
    return res.me;
  }

  /// Re-reads `/api/mobile/me` (credits, profile completion, paused state).
  Future<void> refreshMe() async {
    if (state.status != AuthStatus.signedIn) return;
    try {
      final me = await ref.read(authRepositoryProvider).me();
      state = AuthState(AuthStatus.signedIn, me: me);
    } on ApiException catch (e) {
      if (e.kind == ApiErrorKind.unauthorized) await _signOutLocally();
    }
  }

  /// Shows a newer balance without a round trip (payment status, decide answers).
  void updateCredits(int credits) {
    final me = state.me;
    if (state.status == AuthStatus.signedIn && me != null) {
      state = AuthState(AuthStatus.signedIn, me: me.copyWith(credits: credits));
    }
  }

  Future<void> logout() async {
    try {
      await ref.read(authRepositoryProvider).logout();
    } catch (_) {
      // Offline: the token is still forgotten on this device
    }
    await _signOutLocally();
  }

  /// A 401 from any authenticated call: the token is gone or revoked.
  void handleUnauthorized() {
    if (state.status == AuthStatus.signedOut) return;
    _signOutLocally();
  }

  Future<void> _signOutLocally() async {
    await ref.read(tokenStoreProvider).clear();
    state = const AuthState.signedOut();
  }

  /// The member's country is fixed by their number; keep the picker in step for the next sign-in.
  Future<void> _rememberCountry(Me me) async {
    if (me.country.code.isEmpty) return;
    await ref.read(countryRepositoryProvider).save(me.country.code);
    ref.invalidate(selectedCountryCodeProvider);
  }
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(AuthController.new);

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
