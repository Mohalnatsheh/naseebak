import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/discovery/candidate_profile_screen.dart';
import 'package:naseebak_app/features/discovery/suggestion_card.dart';
import 'package:naseebak_app/features/discovery/suggestion_models.dart';
import 'package:naseebak_app/features/home/widgets/home_interested_card.dart';
import 'package:naseebak_app/features/home/widgets/home_suggestion_card.dart';
import 'package:naseebak_app/shared/person.dart';
import 'package:naseebak_app/shared/widgets/brand_kit.dart';

/// A 1×1 WebP, the only kind the server sends
const preview = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';

/// A valid image of another kind: refused like the website (only WebP previews)
const pngPreview =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/// The blurred preview before a match (spec 2026-11-14): a tiny pre-blurred copy under a blur, lock kept, no initial.
void main() {
  Widget host(Widget child) => MaterialApp(home: Directionality(textDirection: TextDirection.rtl, child: Center(child: child)));

  group('MemberAvatar preview', () {
    testWidgets('locked + a valid preview: the image under a blur, the lock kept, no initial', (tester) async {
      await tester.pumpWidget(host(const MemberAvatar(name: 'هدى', size: 72, locked: true, preview: preview)));
      final img = find.byKey(const Key('member-avatar-preview'));
      expect(img, findsOneWidget);
      expect(tester.widget<Image>(img).image, isA<MemoryImage>());
      expect(find.ancestor(of: img, matching: find.byType(ImageFiltered)), findsOneWidget);
      expect(find.byIcon(Icons.lock_rounded), findsOneWidget);
      expect(find.text('ه'), findsNothing);
    });

    testWidgets('an invalid data URI: the veil with the initial, no crash', (tester) async {
      for (final bad in [pngPreview, 'data:image/jpeg;base64,/9j/4AAQ', 'not a data uri', 'data:image/webp;base64,@@@###', 'data:text/html;base64,PGI+', 'https://x/y.jpg', '']) {
        await tester.pumpWidget(host(MemberAvatar(name: 'هدى', size: 72, locked: true, preview: bad)));
        expect(find.byKey(const Key('member-avatar-preview')), findsNothing, reason: bad);
        expect(find.text('ه'), findsOneWidget, reason: bad);
        expect(tester.takeException(), isNull);
      }
    });

    testWidgets('no preview: the veil with the initial as before', (tester) async {
      await tester.pumpWidget(host(const MemberAvatar(name: 'هدى', size: 72, locked: true)));
      expect(find.byKey(const Key('member-avatar-preview')), findsNothing);
      expect(find.text('ه'), findsOneWidget);
    });

    testWidgets('never shown when not locked (a match): the preview is ignored', (tester) async {
      await tester.pumpWidget(host(const MemberAvatar(name: 'هدى', size: 72, matched: true, preview: preview)));
      expect(find.byKey(const Key('member-avatar-preview')), findsNothing);
      expect(find.text('ه'), findsOneWidget);
    });

    test('photoPreviewImage: the same provider for the same string (no re-decode per build)', () {
      expect(photoPreviewImage(preview), isNotNull);
      expect(identical(photoPreviewImage(preview), photoPreviewImage(preview)), isTrue);
      expect(photoPreviewImage(null), isNull);
      expect(photoPreviewImage('data:image/webp;base64,${'A' * 20000}'), isNull, reason: 'far over the 1 KB cap');
    });
  });

  group('parsers', () {
    Map<String, dynamic> card({Map<String, dynamic> extra = const {}, Map<String, dynamic> candidate = const {}}) => {
          'kind': 'mutual',
          'id': 's1',
          'compatibilityScore': 80,
          'reason': 'x',
          'candidate': {'id': 'u1', 'firstName': 'هدى', ...candidate},
          ...extra,
        };

    test('absent → null', () {
      expect(FeedItem.fromJson(card()).candidate.photoPreview, isNull);
      expect(PersonDetails.fromJson({'id': 'u', 'firstName': 'x'}).photoPreview, isNull);
    });

    test('on the candidate', () {
      expect(FeedItem.fromJson(card(candidate: {'photoPreview': preview})).candidate.photoPreview, preview);
    });

    test('only read from the candidate (the server never puts it on the card)', () {
      expect(FeedItem.fromJson(card(extra: {'photoPreview': preview})).candidate.photoPreview, isNull);
    });

    test('null stays null', () {
      expect(FeedItem.fromJson(card(extra: {'photoPreview': null}, candidate: {'photoPreview': null})).candidate.photoPreview,
          isNull);
    });
  });

  group('«مهتمون بك» home tile', () {
    FeedItem item(String? p) => FeedItem.fromJson({
          'kind': 'mutual',
          'id': 'i1',
          'compatibilityScore': 80,
          'reason': 'x',
          'likedYou': true,
          'candidate': {'id': 'u1', 'firstName': 'هدى', 'photoPreview': p},
        });

    testWidgets('with a preview: the blurred image and «ضبابية»', (tester) async {
      await tester.pumpWidget(host(SizedBox(width: 120, child: HomeInterestedCard(item: item(preview), onOpen: () {}))));
      final img = find.byKey(const Key('home-interested-preview'));
      expect(img, findsOneWidget);
      expect(find.ancestor(of: img, matching: find.byType(ImageFiltered)), findsOneWidget);
      expect(find.text('ضبابية'), findsOneWidget);
      expect(find.text('مخفية'), findsNothing);
    });

    testWidgets('without: the drawn wash and «مخفية», no image', (tester) async {
      await tester.pumpWidget(host(SizedBox(width: 120, child: HomeInterestedCard(item: item(null), onOpen: () {}))));
      expect(find.byType(Image), findsNothing);
      expect(find.text('مخفية'), findsOneWidget);
    });
  });

  group('every locked avatar passes the preview', () {
    FeedItem item() => FeedItem.fromJson({
          'kind': 'mutual',
          'id': 's1',
          'compatibilityScore': 80,
          'reason': 'x',
          'candidate': {'id': 'u1', 'firstName': 'هدى', 'age': 27, 'photoPreview': preview},
        });

    testWidgets('suggestion card', (tester) async {
      await tester.pumpWidget(host(SingleChildScrollView(
        child: SuggestionCard(
            item: item(), tab: FeedTab.newTab, candidateFemale: true, onInterested: () {}, onDecline: () {}, onOpen: () {}),
      )));
      expect(find.byKey(const Key('member-avatar-preview')), findsOneWidget);
    });

    testWidgets('home suggestion card', (tester) async {
      await tester.pumpWidget(host(SizedBox(
        width: homeSuggestionCardWidth,
        child: HomeSuggestionCard(item: item(), candidateFemale: true, onOpen: () {}),
      )));
      expect(find.byKey(const Key('member-avatar-preview')), findsOneWidget);
    });

    testWidgets('full profile, with the «بوضوح» line', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: CandidateProfileScreen(
          item: item(),
          tab: FeedTab.newTab,
          candidateFemale: true,
          tribeLabel: 'العشيرة',
          answerNote: const SizedBox.shrink(),
          interestEnabled: true,
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('member-avatar-preview')), findsOneWidget);
      expect(find.text('الصور تظهر بوضوح بعد التوافق المتبادل فقط'), findsOneWidget);
    });
  });
}
