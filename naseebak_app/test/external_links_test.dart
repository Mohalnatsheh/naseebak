import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/shared/widgets/common.dart';

void main() {
  test('server links open only as web pages, emails or calls', () {
    expect(isSafeExternalLink('https://naseebak.com/privacy'), isTrue);
    expect(isSafeExternalLink('mailto:info@naseebak.com'), isTrue);
    expect(isSafeExternalLink('tel:+962790000000'), isTrue);
    expect(isSafeExternalLink('http://naseebak.com'), isFalse);
    expect(isSafeExternalLink('intent://scan/#Intent;scheme=zxing;end'), isFalse);
    expect(isSafeExternalLink('sms:+962790000000?body=x'), isFalse);
    expect(isSafeExternalLink('javascript:alert(1)'), isFalse);
    expect(isSafeExternalLink('https:///no-host'), isFalse);
  });

  test('store links may also use the stores own schemes', () {
    expect(isSafeExternalLink('itms-apps://apps.apple.com/app/id1', extraSchemes: {'itms-apps', 'market'}), isTrue);
    expect(isSafeExternalLink('market://details?id=com.naseebak.naseebak_app', extraSchemes: {'itms-apps', 'market'}), isTrue);
    expect(isSafeExternalLink('market://details?id=x'), isFalse);
  });
}
