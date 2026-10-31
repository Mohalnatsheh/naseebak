import 'package:dio/dio.dart';

import '../storage/token_store.dart';
import 'api_exception.dart';

typedef Json = Map<String, dynamic>;

/// Thin wrapper around Dio: base URL, JSON, the Bearer token, and `{ error, code }` → [ApiException].
///
/// A 401 on a request that carried a token calls [onUnauthorized] (the session signs out locally); a 403
/// `DEACTIVATED` / suspended answer calls [onAccountChanged] (the session re-reads `/api/mobile/me`); a 503
/// `MAINTENANCE` calls [onMaintenance].
class ApiClient {
  ApiClient({
    required String baseUrl,
    required this.tokenStore,
    HttpClientAdapter? adapter,
    this.onUnauthorized,
    this.onAccountChanged,
    this.onMaintenance,
  }) : dio = Dio(
          BaseOptions(
            baseUrl: baseUrl,
            connectTimeout: const Duration(seconds: 15),
            receiveTimeout: const Duration(seconds: 30),
            sendTimeout: const Duration(seconds: 30),
            contentType: Headers.jsonContentType,
            responseType: ResponseType.json,
            headers: {'Accept': 'application/json'},
          ),
        ) {
    if (adapter != null) dio.httpClientAdapter = adapter;
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          if (options.extra['auth'] != false) {
            final token = await tokenStore.read();
            if (token != null && token.isNotEmpty) {
              options.headers['Authorization'] = 'Bearer $token';
            }
          }
          handler.next(options);
        },
        onError: (error, handler) {
          final sentToken = error.requestOptions.headers.containsKey('Authorization');
          final status = error.response?.statusCode;
          final body = error.response?.data;
          if (status == 401 && sentToken) {
            onUnauthorized?.call();
          } else if (status == 403 && sentToken && error.requestOptions.path != mePath && accountBlocked(body)) {
            // Paused (or suspended) since the last `me`: re-read it so the router shows the right page
            onAccountChanged?.call();
          } else if (status == 503 && _code(body) == 'MAINTENANCE') {
            onMaintenance?.call();
          }
          handler.next(error);
        },
      ),
    );
  }

  final Dio dio;
  final TokenStore tokenStore;

  /// Called once per 401 answer to an authenticated request.
  void Function()? onUnauthorized;

  /// Called on a 403 that says the account is paused or suspended (never for `/api/mobile/me` itself).
  void Function()? onAccountChanged;

  /// Called on a 503 `MAINTENANCE`.
  void Function()? onMaintenance;

  static const mePath = '/api/mobile/me';

  /// `requireUser()` refusals: 403 `DEACTIVATED`, and a suspension (`SUSPENDED`, or «تم إيقاف حسابك» without a code)
  static bool accountBlocked(Object? body) {
    final code = _code(body);
    if (code == 'DEACTIVATED' || code == 'SUSPENDED') return true;
    return code == null && body is Map && body['error'] == 'تم إيقاف حسابك';
  }

  static String? _code(Object? body) => body is Map && body['code'] is String ? body['code'] as String : null;

  Future<Json> get(String path, {Map<String, dynamic>? query, bool auth = true}) =>
      _send(() => dio.get<dynamic>(path, queryParameters: query, options: _opts(auth)));

  Future<Json> post(String path, {Object? body, bool auth = true}) =>
      _send(() => dio.post<dynamic>(path, data: body ?? const <String, dynamic>{}, options: _opts(auth)));

  Future<Json> put(String path, {Object? body}) =>
      _send(() => dio.put<dynamic>(path, data: body ?? const <String, dynamic>{}, options: _opts(true)));

  Future<Json> patch(String path, {Object? body}) =>
      _send(() => dio.patch<dynamic>(path, data: body ?? const <String, dynamic>{}, options: _opts(true)));

  Future<Json> delete(String path, {Object? body}) =>
      _send(() => dio.delete<dynamic>(path, data: body, options: _opts(true)));

  Options _opts(bool auth) => Options(extra: {'auth': auth});

  Future<Json> _send(Future<Response<dynamic>> Function() call) async {
    try {
      final response = await call();
      final data = response.data;
      if (data is Map) return Map<String, dynamic>.from(data);
      return <String, dynamic>{};
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}
