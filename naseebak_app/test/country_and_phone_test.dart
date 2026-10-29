import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/localization/digits.dart';
import 'package:naseebak_app/core/network/api_exception.dart';
import 'package:naseebak_app/core/storage/country_store.dart';
import 'package:naseebak_app/features/auth/phone_validation.dart';
import 'package:naseebak_app/features/country_selection/country.dart';
import 'package:naseebak_app/features/country_selection/country_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fake_api.dart';

void main() {
  final jo = Country.fromJson(joJson);
  final sa = Country.fromJson(saJson);

  group('CountryRepository', () {
    test('parses the active countries and the default', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final adapter = FakeAdapter()
        ..on('GET', '/api/countries', const FakeResponse(200, {'defaultCountry': 'JO', 'countries': [joJson, saJson]}));
      final repo = CountryRepository(fakeClient(adapter), CountryStore(prefs));
      final list = await repo.fetchAll();
      expect(list.defaultCode, 'JO');
      expect(list.countries.map((c) => c.code), ['JO', 'SA']);
      final s = list.byCode('sa')!;
      expect(s.dialCode, '+966');
      expect(s.purchasesEnabled, isFalse);
      expect(s.phoneWord, 'جوال');
      // `features.chat` was removed from the API: chat availability comes from /api/me/counts
      expect(s.chatEnabled, isTrue);
    });

    test('country details carry the legal links', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final adapter = FakeAdapter()
        ..on('GET', '/api/countries/SA', const FakeResponse(200, {
          'country': {
            ...saJson,
            'links': {'terms': 'https://naseebak.com/sa/terms', 'privacy': 'https://naseebak.com/sa/privacy'},
          },
        }));
      final d = await CountryRepository(fakeClient(adapter), CountryStore(prefs)).fetchDetails('sa');
      expect(d.links.terms, 'https://naseebak.com/sa/terms');
      expect(d.country.code, 'SA');
    });

    test('an inactive country is an ApiException', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final adapter = FakeAdapter()
        ..on('GET', '/api/countries/XX', const FakeResponse(404, {'error': 'غير متاح', 'code': 'COUNTRY_UNKNOWN'}));
      await expectLater(
        CountryRepository(fakeClient(adapter), CountryStore(prefs)).fetchDetails('XX'),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'COUNTRY_UNKNOWN')),
      );
    });

    test('the picked country survives a restart (SharedPreferences)', () async {
      final adapter = FakeAdapter();
      final overrides = await testOverrides(adapter);
      final container = ProviderContainer(overrides: overrides);
      expect(container.read(selectedCountryCodeProvider), isNull);
      await container.read(selectedCountryCodeProvider.notifier).select('sa');
      expect(container.read(selectedCountryCodeProvider), 'SA');
      container.dispose();

      // New container, same preferences → still SA
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('selected_country'), 'SA');
      final again = ProviderContainer(overrides: overrides);
      expect(again.read(selectedCountryCodeProvider), 'SA');
      again.dispose();
    });
  });

  group('phone validation', () {
    test('Jordan: local, international and Arabic-Indic forms', () {
      expect(validatePhone('0796922292', jo), isNull);
      expect(validatePhone('796922292', jo), isNull);
      expect(validatePhone('+962 79 692 2292', jo), isNull);
      expect(validatePhone('00962796922292', jo), isNull);
      expect(validatePhone('٠٧٩٦٩٢٢٢٩٢', jo), isNull);
      expect(localPhone('٠٧٩٦٩٢٢٢٩٢', jo), '0796922292');
      expect(localPhone('+962796922292', jo), '0796922292');
    });

    test('Jordan: wrong prefix or length is refused with the example', () {
      expect(validatePhone('0766922292', jo), contains('0791234567'));
      expect(validatePhone('07969222', jo), isNotNull);
      expect(validatePhone('', jo), 'أدخل رقم هاتفك');
      // A Saudi number in the Jordan field
      expect(validatePhone('0500000771', jo), isNotNull);
    });

    test('Saudi Arabia uses its own pattern and wording', () {
      expect(validatePhone('0500000772', sa), isNull);
      expect(validatePhone('+966500000772', sa), isNull);
      expect(localPhone('966500000772', sa), '0500000772');
      expect(validatePhone('0796922292', sa), contains('جوال'));
    });

    test('codes accept Arabic-Indic digits', () {
      expect(normalizeOtp('١١١١١١'), '111111');
      expect(normalizeOtp('11111'), isNull);
      expect(toLatinDigits('۱۲۳٤٥'), '12345');
    });
  });
}
