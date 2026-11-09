import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/credits/credits_repository.dart';
import 'package:naseebak_app/features/profile/profile_edit_screen.dart';

void main() {
  test('«ربة منزل» is offered to women only; a man who already has it still sees it', () {
    const all = ['مهندس/ة', 'ربة منزل', 'أعمال حرة'];
    expect(jobOptionsFor(all, female: false), ['مهندس/ة', 'أعمال حرة']);
    expect(jobOptionsFor(all, female: true), all);
    expect(jobOptionsFor(all, female: false, current: 'ربة منزل'), all);
  });

  test('paid amounts read like the rest of the app', () {
    expect(currencyLabel('JOD'), 'د.أ');
    expect(currencyLabel('sar'), 'ر.س');
    expect(currencyLabel('USD'), r'$');
    expect(currencyLabel('EUR'), 'EUR');
  });
}
