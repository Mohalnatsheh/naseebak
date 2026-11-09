import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/matches/match_models.dart';

void main() {
  test('a guardian number reads like the website: +dial and grouped', () {
    expect(formatGuardianPhone('962791234567'), '+962 79 123 4567');
    expect(formatGuardianPhone('+966501234567'), '+966 50 123 4567');
  });

  test('a local number takes the member country dial code', () {
    expect(formatGuardianPhone('0791234567'), '+962 79 123 4567');
    expect(formatGuardianPhone('0501234567', dialCode: '966'), '+966 50 123 4567');
  });

  test('an unusual length is shown whole, with a plus', () {
    expect(formatGuardianPhone('96279123'), '+96279123');
  });
}
