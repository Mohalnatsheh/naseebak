import '../../core/network/api_client.dart';
import '../../core/network/json.dart';
import 'me.dart';

enum OtpContext { login, register }

/// Sign-up / sign-in endpoints (see docs/api-mobile.md).
class AuthRepository {
  AuthRepository(this._api);
  final ApiClient _api;

  /// `POST /api/auth/send-otp`. Returns `userExists` for the login context (null for sign-up, which never
  /// tells whether a number is registered).
  Future<bool?> sendOtp({required String phone, required OtpContext context, required String country}) async {
    final j = await _api.post(
      '/api/auth/send-otp',
      auth: false,
      body: {'phone': phone, 'context': context.name, 'country': country},
    );
    return asBool(j['userExists']);
  }

  /// `POST /api/auth/verify-otp`
  Future<void> verifyOtp({required String phone, required String code}) async {
    await _api.post('/api/auth/verify-otp', auth: false, body: {'phone': phone, 'code': code});
  }

  /// `POST /api/auth/register` (new members). Throws 409 `PHONE_EXISTS` for a registered number.
  Future<void> register({
    required String firstName,
    required String lastName,
    required String phone,
    required String gender,
    required String otp,
    required String country,
  }) async {
    await _api.post('/api/auth/register', auth: false, body: {
      'firstName': firstName,
      'lastName': lastName,
      'phone': phone,
      'gender': gender,
      'otp': otp,
      'termsAccepted': true,
      'country': country,
    });
  }

  /// `POST /api/mobile/auth/token` → the Bearer token and the member.
  Future<({String token, Me me})> issueToken({required String phone, required String code, String? device}) async {
    final j = await _api.post(
      '/api/mobile/auth/token',
      auth: false,
      body: {'phone': phone, 'code': code, 'device': ?device},
    );
    return (token: asStringOr(j['token']), me: Me.fromJson(asMap(j['user'])));
  }

  Future<Me> me() async {
    final j = await _api.get('/api/mobile/me');
    return Me.fromJson(asMap(j['user']));
  }

  Future<void> logout() async {
    await _api.post('/api/mobile/auth/logout');
  }

  /// `POST /api/profile/reactivate` (paused accounts).
  Future<void> reactivate() async {
    await _api.post('/api/profile/reactivate');
  }
}
