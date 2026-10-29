import 'package:dio/dio.dart';

/// What went wrong, independent of the exact HTTP status.
enum ApiErrorKind {
  /// No answer from the server (offline, timeout, DNS…)
  network,

  /// 400 / 422: the input was refused (the message says why)
  invalid,

  /// 401: not signed in or the token is no longer valid → sign out locally
  unauthorized,

  /// 402 `NO_CREDITS`
  noCredits,

  /// 403 `DEACTIVATED`: the account is paused (only reactivation works)
  deactivated,

  /// 403 (other)
  forbidden,

  /// 404 / 410
  notFound,

  /// 409 / 412: conflict or a precondition (guardian, consent…)
  conflict,

  /// 429
  rateLimited,

  /// 503 maintenance
  maintenance,

  /// 5xx / 502 provider failure
  server,
}

/// A failed API call, mapped from the backend's `{ error, code }` answer.
class ApiException implements Exception {
  ApiException({
    required this.kind,
    required this.message,
    this.statusCode,
    this.code,
    this.data,
  });

  final ApiErrorKind kind;

  /// Arabic message, meant to be shown to the member as is.
  final String message;
  final int? statusCode;

  /// Machine code from the server (`NO_CREDITS`, `GUARDIAN_REQUIRED`, `FILTERED`, …).
  final String? code;

  /// The whole JSON error body (e.g. `retryAfterMinutes`, `fields`).
  final Map<String, dynamic>? data;

  static const String networkMessage = 'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.';
  static const String genericMessage = 'حدث خطأ غير متوقع. حاول مرة أخرى.';

  bool get isNetwork => kind == ApiErrorKind.network;

  static ApiErrorKind kindFor(int status, String? code) {
    if (code == 'DEACTIVATED') return ApiErrorKind.deactivated;
    if (code == 'NO_CREDITS' || status == 402) return ApiErrorKind.noCredits;
    if (code == 'MAINTENANCE') return ApiErrorKind.maintenance;
    switch (status) {
      case 400:
      case 422:
        return ApiErrorKind.invalid;
      case 401:
        return ApiErrorKind.unauthorized;
      case 403:
        return ApiErrorKind.forbidden;
      case 404:
      case 410:
        return ApiErrorKind.notFound;
      case 409:
      case 412:
        return ApiErrorKind.conflict;
      case 429:
        return ApiErrorKind.rateLimited;
      case 503:
        return ApiErrorKind.maintenance;
      default:
        return status >= 500 ? ApiErrorKind.server : ApiErrorKind.invalid;
    }
  }

  /// Turns any Dio failure into an [ApiException].
  factory ApiException.fromDio(DioException e) {
    final response = e.response;
    if (response == null) {
      return ApiException(kind: ApiErrorKind.network, message: networkMessage);
    }
    final status = response.statusCode ?? 500;
    final body = response.data;
    Map<String, dynamic>? map;
    if (body is Map) map = Map<String, dynamic>.from(body);
    final code = map?['code'] is String ? map!['code'] as String : null;
    final error = map?['error'];
    final message = error is String && error.trim().isNotEmpty ? error : _fallbackMessage(status);
    return ApiException(
      kind: kindFor(status, code),
      message: message,
      statusCode: status,
      code: code,
      data: map,
    );
  }

  static String _fallbackMessage(int status) {
    if (status == 401) return 'انتهت الجلسة. سجّل الدخول من جديد.';
    if (status == 404) return 'غير موجود';
    if (status == 429) return 'محاولات كثيرة. حاول مرة أخرى بعد قليل.';
    if (status == 503) return 'الخدمة تحت الصيانة حالياً. حاول لاحقاً.';
    return genericMessage;
  }

  /// Any error → a message for the member.
  static String messageOf(Object error) {
    if (error is ApiException) return error.message;
    return genericMessage;
  }

  @override
  String toString() => 'ApiException($statusCode, $code, $message)';
}
