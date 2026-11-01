import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:in_app_review/in_app_review.dart';
import 'package:naseebak_app/core/analytics/analytics.dart';
import 'package:naseebak_app/core/privacy/screen_privacy.dart';
import 'package:naseebak_app/core/review/store_review.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fake_api.dart';

class FakeReview implements InAppReview {
  FakeReview({this.available = true});
  final bool available;
  int requests = 0;

  @override
  Future<bool> isAvailable() async => available;

  @override
  Future<void> requestReview() async => requests++;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('the rating sheet is asked once per install, after the first match only', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final fake = FakeReview();
    final review = StoreReview(prefs, AppAnalytics(false), review: fake);
    await review.afterFirstMatch(delay: Duration.zero);
    await review.afterFirstMatch(delay: Duration.zero);
    expect(fake.requests, 1);
    expect(prefs.getBool(StoreReview.askedKey), isTrue);
  });

  test('no store on the device: nothing asked, and it may be asked later', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final fake = FakeReview(available: false);
    await StoreReview(prefs, AppAnalytics(false), review: fake).afterFirstMatch(delay: Duration.zero);
    expect(fake.requests, 0);
    expect(prefs.getBool(StoreReview.askedKey), isNull);
  });

  testWidgets('a private area turns protection on while open (counted) and hides itself during a recording',
      (tester) async {
    final calls = <Object?>[];
    const channel = MethodChannel('naseebak/system');
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
      if (call.method == 'setSecure') calls.add(call.arguments);
      return false;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, null));

    Widget page(int areas) => rtlApp(Scaffold(
          body: Column(children: [for (var i = 0; i < areas; i++) const SecureArea(child: Text('خاص'))]),
        ));
    await tester.pumpWidget(page(2));
    await tester.pump();
    expect(calls, [true], reason: 'one switch-on for two areas');

    await tester.pumpWidget(page(1));
    await tester.pump();
    expect(calls, [true], reason: 'still one area open');

    ScreenPrivacy.captured.value = true;
    await tester.pump();
    expect(find.byKey(const Key('privacy-cover')), findsOneWidget);
    ScreenPrivacy.captured.value = false;
    await tester.pump();
    expect(find.byKey(const Key('privacy-cover')), findsNothing);

    await tester.pumpWidget(page(0));
    await tester.pump();
    expect(calls, [true, false]);
  });
}
