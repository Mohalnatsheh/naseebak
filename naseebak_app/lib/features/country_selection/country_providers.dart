import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/auth/auth_controller.dart';
import 'country.dart';

final countriesProvider = FutureProvider<CountryList>((ref) {
  return ref.watch(countryRepositoryProvider).fetchAll();
});

final countryDetailsProvider = FutureProvider.family<CountryDetails, String>((ref, code) {
  return ref.watch(countryRepositoryProvider).fetchDetails(code);
});

/// The country picked on the device (before sign-in), resolved against the API list.
final pickedCountryProvider = FutureProvider<Country?>((ref) async {
  final code = ref.watch(selectedCountryCodeProvider);
  if (code == null) return null;
  final list = await ref.watch(countriesProvider.future);
  return list.byCode(code);
});

/// The member's own country once signed in (fixed by their number), else the picked one.
final activeCountryCodeProvider = Provider<String?>((ref) {
  final me = ref.watch(authControllerProvider).me;
  if (me != null && me.country.code.isNotEmpty) return me.country.code;
  return ref.watch(selectedCountryCodeProvider);
});
