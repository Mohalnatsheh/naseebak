import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:naseebak_app/app/providers.dart';
import 'package:naseebak_app/core/network/api_client.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/core/theme/app_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A canned answer: status + JSON body, or a network failure.
class FakeResponse {
  const FakeResponse(this.status, [this.body = const <String, dynamic>{}]) : network = false;
  const FakeResponse.network()
      : status = 0,
        body = null,
        network = true;

  final int status;
  final Object? body;
  final bool network;
}

typedef FakeHandler = FakeResponse Function(RequestOptions request);

/// Dio adapter answering from a `"METHOD /path"` table — tests never touch the network.
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter([Map<String, FakeHandler>? handlers]) : handlers = handlers ?? {};

  final Map<String, FakeHandler> handlers;
  final List<RequestOptions> requests = [];

  void on(String method, String path, FakeResponse response) => handlers['$method $path'] = (_) => response;

  /// Requests that wait until the test lets them go (e.g. to leave a screen mid-request)
  final Map<String, Future<void>> holds = {};
  void hold(String method, String path, Future<void> until) => holds['$method $path'] = until;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests.add(options);
    await holds['${options.method} ${options.path}'];
    final handler = handlers['${options.method} ${options.path}'];
    final res = handler?.call(options) ?? const FakeResponse(404, {'error': 'غير موجود'});
    if (res.network) {
      throw DioException.connectionError(requestOptions: options, reason: 'offline');
    }
    final text = res.body is String ? res.body as String : jsonEncode(res.body);
    return ResponseBody.fromString(
      text,
      res.status,
      headers: {
        Headers.contentTypeHeader: [res.body is String ? 'text/html' : Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}

  /// Requests made to a path (in order).
  List<RequestOptions> to(String method, String path) =>
      requests.where((r) => r.method == method && r.path == path).toList();
}

ApiClient fakeClient(FakeAdapter adapter, {TokenStore? store, void Function()? onUnauthorized}) => ApiClient(
      baseUrl: 'http://test.local',
      tokenStore: store ?? MemoryTokenStore(),
      adapter: adapter,
      onUnauthorized: onUnauthorized,
    );

const joJson = {
  'code': 'JO',
  'name': {'ar': 'الأردن', 'en': 'Jordan'},
  'inName': 'في الأردن',
  'flag': {'emoji': '🇯🇴', 'id': 'jo'},
  'dialCode': '+962',
  'phone': {'placeholder': '7XXXXXXXX', 'example': '0791234567', 'nationalPattern': r'^7[789]\d{7}$'},
  'currency': {'code': 'JOD', 'symbol': 'د.أ'},
  'isDefault': true,
  'active': true,
  'registrationOpen': true,
  'purchasesEnabled': true,
  'features': {'polls': true},
  'words': {'phone': 'هاتف', 'tribe': 'العشيرة', 'nationalityMale': 'أردني', 'nationalityFemale': 'أردنية'},
};

const saJson = {
  'code': 'SA',
  'name': {'ar': 'السعودية', 'en': 'Saudi Arabia'},
  'inName': 'في السعودية',
  'flag': {'emoji': '🇸🇦', 'id': 'sa'},
  'dialCode': '+966',
  'phone': {'placeholder': '5XXXXXXXX', 'example': '0512345678', 'nationalPattern': r'^5\d{8}$'},
  'currency': {'code': 'SAR', 'symbol': 'ر.س'},
  'isDefault': false,
  'active': true,
  'registrationOpen': true,
  'purchasesEnabled': false,
  'features': {'polls': true},
  'words': {'phone': 'جوال', 'tribe': 'القبيلة', 'nationalityMale': 'سعودي', 'nationalityFemale': 'سعودية'},
};

Map<String, dynamic> meJson({String country = 'JO', bool complete = true, bool deactivated = false, int credits = 10}) => {
      'id': 'u1',
      'firstName': 'سارة',
      'lastName': 'أحمد',
      'gender': 'FEMALE',
      'phone': '962796922292',
      'country': country == 'JO' ? joJson : saJson,
      'credits': credits,
      'status': 'VERIFIED',
      'deactivated': deactivated,
      'profile': {'exists': true, 'complete': complete},
      'createdAt': '2026-10-29T14:30:30.834Z',
    };

/// Provider overrides wiring the fake adapter and in-memory storage.
Future<List<Override>> testOverrides(FakeAdapter adapter, {TokenStore? store, Map<String, Object> prefs = const {}}) async {
  SharedPreferences.setMockInitialValues(prefs);
  final sp = await SharedPreferences.getInstance();
  final tokens = store ?? MemoryTokenStore();
  return [
    sharedPreferencesProvider.overrideWithValue(sp),
    tokenStoreProvider.overrideWithValue(tokens),
    httpAdapterProvider.overrideWithValue(adapter),
    apiBaseUrlProvider.overrideWithValue('http://test.local'),
  ];
}

/// Arabic RTL material app around a widget under test.
Widget rtlApp(Widget child) => MaterialApp(
      theme: AppTheme.light(),
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: child,
    );
