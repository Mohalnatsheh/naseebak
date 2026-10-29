import '../../core/network/api_client.dart';
import '../../core/network/json.dart';
import '../../core/storage/country_store.dart';
import 'country.dart';

/// Countries come from the public API; only the picked code is stored on the device.
class CountryRepository {
  CountryRepository(this._api, this._store);

  final ApiClient _api;
  final CountryStore _store;

  Future<CountryList> fetchAll() async {
    final j = await _api.get('/api/countries', auth: false);
    final list = asMapList(j['countries']).map(Country.fromJson).where((c) => c.code.isNotEmpty).toList();
    return CountryList(countries: list, defaultCode: asStringOr(j['defaultCountry'], 'JO'));
  }

  Future<CountryDetails> fetchDetails(String code) async {
    final j = await _api.get('/api/countries/${code.toUpperCase()}', auth: false);
    return CountryDetails.fromJson(j);
  }

  String? savedCode() => _store.read();

  Future<void> save(String code) => _store.write(code);

  Future<void> clear() => _store.clear();
}
