import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_repository.dart';

/// The sign-in in progress (between the phone, code and sign-up screens). Kept in memory only.
class PendingAuth {
  const PendingAuth({
    required this.phone,
    required this.countryCode,
    required this.mode,
    this.userExists,
    this.code,
  });

  /// Local format, e.g. "0791234567"
  final String phone;
  final String countryCode;
  final OtpContext mode;

  /// Login context only: whether the number is already a member
  final bool? userExists;

  /// The verified code (set after `/api/auth/verify-otp`), needed by sign-up and the token call
  final String? code;

  PendingAuth withCode(String? code) =>
      PendingAuth(phone: phone, countryCode: countryCode, mode: mode, userExists: userExists, code: code);

  /// This code was already accepted by `/api/auth/verify-otp` for this number. The server only matches codes not yet
  /// verified, so verifying again would fail (and use up a try): go straight to the token / sign-up step instead.
  bool alreadyVerified(String code) => this.code != null && this.code == code;
}

class PendingAuthNotifier extends Notifier<PendingAuth?> {
  @override
  PendingAuth? build() => null;

  void set(PendingAuth? value) => state = value;
}

final pendingAuthProvider = NotifierProvider<PendingAuthNotifier, PendingAuth?>(PendingAuthNotifier.new);

/// Which tab the phone screen opens on (login by default).
class AuthModeNotifier extends Notifier<OtpContext> {
  @override
  OtpContext build() => OtpContext.login;

  void set(OtpContext mode) => state = mode;
}

final authModeProvider = NotifierProvider<AuthModeNotifier, OtpContext>(AuthModeNotifier.new);

/// The invitation code entered at sign-up wasn't applied (the server's reason): the setup screen says so and offers
/// another try, like the website's «لم يُطبَّق رمز الدعوة» (a code can be applied until the profile is complete)
class InviteWarningNotifier extends Notifier<String?> {
  @override
  String? build() => null;

  void set(String? message) => state = message;
}

final inviteWarningProvider = NotifierProvider<InviteWarningNotifier, String?>(InviteWarningNotifier.new);
