import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/home/counts.dart';
import 'package:naseebak_app/features/home/gendered_copy.dart';
import 'package:naseebak_app/features/home/home_screen.dart';

void main() {
  const matches = Counts(flags: CycleFlags(), actionableMatches: 1);

  test('the next step speaks to a woman in the feminine', () {
    expect(nextStepFor(matches, viewerFemale: true).body, startsWith('اختاري طريقة التعارف'));
    expect(nextStepFor(matches).body, startsWith('اختر طريقة التعارف'));
    expect(nextStepFor(null, viewerFemale: true).body, contains('ما تبحثين عنه'));
    expect(nextStepFor(null, viewerFemale: true).action, 'تصفحي الاقتراحات');
    expect(nextStepFor(null).action, 'تصفح الاقتراحات');
  });

  test('viewer vs partner forms', () {
    expect(forViewer(true, 'اشحن', 'اشحني'), 'اشحني');
    expect(forPartner(true, 'يطلب', 'تطلب'), 'يطلب');
    expect(forPartner(false, 'يطلب', 'تطلب'), 'تطلب');
    expect(rechargeToContinue(true), 'اشحني رصيدك للمتابعة');
  });
}
