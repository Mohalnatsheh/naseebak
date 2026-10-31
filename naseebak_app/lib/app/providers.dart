import 'package:dio/dio.dart' show HttpClientAdapter;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/auth/auth_controller.dart';
import '../core/config/env.dart';
import '../core/network/api_client.dart';
import '../core/storage/country_store.dart';
import '../core/storage/token_store.dart';
import '../features/auth/auth_repository.dart';
import '../features/country_selection/country_repository.dart';
import 'maintenance_gate.dart';

/// Overridden in `main()` (and in tests) with a loaded instance.
final sharedPreferencesProvider = Provider<SharedPreferences>(
  (ref) => throw UnimplementedError('sharedPreferencesProvider must be overridden'),
);

final tokenStoreProvider = Provider<TokenStore>((ref) => SecureTokenStore());

final apiBaseUrlProvider = Provider<String>((ref) => Env.apiBaseUrl);

/// Tests inject a fake HTTP adapter here (null = real network).
final httpAdapterProvider = Provider<HttpClientAdapter?>((ref) => null);

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    baseUrl: ref.watch(apiBaseUrlProvider),
    tokenStore: ref.watch(tokenStoreProvider),
    adapter: ref.watch(httpAdapterProvider),
    // Read lazily: the session depends on this client, so never during build
    onUnauthorized: () => ref.read(authControllerProvider.notifier).handleUnauthorized(),
    onAccountChanged: () => ref.read(authControllerProvider.notifier).refreshMe(),
    onMaintenance: () => ref.read(maintenanceProvider.notifier).check(),
  );
});

final countryStoreProvider = Provider<CountryStore>(
  (ref) => CountryStore(ref.watch(sharedPreferencesProvider)),
);

final countryRepositoryProvider = Provider<CountryRepository>(
  (ref) => CountryRepository(ref.watch(apiClientProvider), ref.watch(countryStoreProvider)),
);

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.watch(apiClientProvider)),
);
