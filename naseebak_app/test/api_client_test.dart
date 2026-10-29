import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/network/api_exception.dart';
import 'package:naseebak_app/core/storage/token_store.dart';

import 'helpers/fake_api.dart';

void main() {
  group('ApiClient', () {
    test('returns the JSON body and sends the Bearer token', () async {
      final adapter = FakeAdapter()..on('GET', '/api/mobile/me', const FakeResponse(200, {'user': {'id': 'u1'}}));
      final api = fakeClient(adapter, store: MemoryTokenStore('nsb_abc'));
      final j = await api.get('/api/mobile/me');
      expect(j['user'], {'id': 'u1'});
      expect(adapter.requests.single.headers['Authorization'], 'Bearer nsb_abc');
    });

    test('public calls carry no token', () async {
      final adapter = FakeAdapter()..on('GET', '/api/countries', const FakeResponse(200, {'countries': []}));
      final api = fakeClient(adapter, store: MemoryTokenStore('nsb_abc'));
      await api.get('/api/countries', auth: false);
      expect(adapter.requests.single.headers.containsKey('Authorization'), isFalse);
    });

    test('maps {error, code} to a typed exception', () async {
      final adapter = FakeAdapter()
        ..on('POST', '/api/suggestions/s1/decide',
            const FakeResponse(402, {'error': 'رصيدك غير كافٍ. اشحن رصيدك للمتابعة.', 'code': 'NO_CREDITS'}));
      final api = fakeClient(adapter);
      await expectLater(
        api.post('/api/suggestions/s1/decide', body: {'interested': true}),
        throwsA(isA<ApiException>()
            .having((e) => e.kind, 'kind', ApiErrorKind.noCredits)
            .having((e) => e.code, 'code', 'NO_CREDITS')
            .having((e) => e.statusCode, 'status', 402)
            .having((e) => e.message, 'message', 'رصيدك غير كافٍ. اشحن رصيدك للمتابعة.')),
      );
    });

    test('status codes map to kinds', () {
      expect(ApiException.kindFor(403, 'DEACTIVATED'), ApiErrorKind.deactivated);
      expect(ApiException.kindFor(403, null), ApiErrorKind.forbidden);
      expect(ApiException.kindFor(412, 'GUARDIAN_REQUIRED'), ApiErrorKind.conflict);
      expect(ApiException.kindFor(422, 'FILTERED'), ApiErrorKind.invalid);
      expect(ApiException.kindFor(429, 'RATE_LIMITED'), ApiErrorKind.rateLimited);
      expect(ApiException.kindFor(503, null), ApiErrorKind.maintenance);
      expect(ApiException.kindFor(502, null), ApiErrorKind.server);
      expect(ApiException.kindFor(410, 'EXPIRED'), ApiErrorKind.notFound);
    });

    test('401 on an authenticated call signs out; 401 without a token does not', () async {
      var calls = 0;
      final adapter = FakeAdapter()
        ..on('GET', '/api/me/counts', const FakeResponse(401, {'error': 'غير مصرح'}))
        ..on('POST', '/api/mobile/auth/token', const FakeResponse(401, {'error': 'رمز خاطئ', 'code': 'INVALID_CODE'}));
      final signedIn = fakeClient(adapter, store: MemoryTokenStore('t'), onUnauthorized: () => calls++);
      await expectLater(signedIn.get('/api/me/counts'), throwsA(isA<ApiException>()));
      expect(calls, 1);

      final anonymous = fakeClient(adapter, onUnauthorized: () => calls++);
      await expectLater(
        anonymous.post('/api/mobile/auth/token', auth: false),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'INVALID_CODE')),
      );
      expect(calls, 1);
    });

    test('a network failure becomes ApiErrorKind.network with an Arabic message', () async {
      final adapter = FakeAdapter()..on('GET', '/api/chats', const FakeResponse.network());
      final api = fakeClient(adapter);
      await expectLater(
        api.get('/api/chats'),
        throwsA(isA<ApiException>()
            .having((e) => e.kind, 'kind', ApiErrorKind.network)
            .having((e) => e.message, 'message', ApiException.networkMessage)),
      );
    });

    test('a non-JSON error page falls back to a generic message', () async {
      final adapter = FakeAdapter()..on('GET', '/api/x', const FakeResponse(500, '<html>oops</html>'));
      final api = fakeClient(adapter);
      await expectLater(
        api.get('/api/x'),
        throwsA(isA<ApiException>()
            .having((e) => e.kind, 'kind', ApiErrorKind.server)
            .having((e) => e.message, 'message', ApiException.genericMessage)),
      );
    });
  });
}
