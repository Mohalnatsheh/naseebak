import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/chat/chat_models.dart';
import 'package:naseebak_app/features/discovery/suggestion_models.dart';
import 'package:naseebak_app/features/home/counts.dart';
import 'package:naseebak_app/features/matches/match_models.dart';

void main() {
  final image = {
    'id': 'm1',
    'body': '📷',
    'createdAt': '2026-11-10T10:00:00.000Z',
    'mine': false,
    'kind': 'IMAGE',
    'media': {'url': '/api/chats/c1/media/m1', 'type': 'image/jpeg', 'durationSec': null, 'width': 1600, 'height': 900},
  };

  test('an IMAGE message parses with its media', () {
    final m = ChatMessage.fromJson(image);
    expect(m.kind, MessageKind.image);
    expect(m.media!.width, 1600);
    expect(m.media!.url, '/api/chats/c1/media/m1');
  });

  test('toJson round-trips kind and media, and never writes localPath', () {
    final m = ChatMessage.fromJson({...image, 'kind': 'VOICE', 'media': {'url': '/u', 'type': 'audio/mp4', 'durationSec': 7}});
    final j = m.toJson();
    expect(j['kind'], 'VOICE');
    final back = ChatMessage.fromJson(j);
    expect(back.kind, MessageKind.voice);
    expect(back.media!.durationSec, 7);
    expect(j.containsKey('localPath'), isFalse);
  });

  test('a missing or unknown kind is text', () {
    expect(ChatMessage.fromJson({'id': 'a', 'body': 'x'}).kind, MessageKind.text);
    expect(ChatMessage.fromJson({'id': 'a', 'body': 'x', 'kind': 'VIDEO'}).kind, MessageKind.text);
    expect(ChatMessage.fromJson({'id': 'a', 'body': 'x'}).media, isNull);
  });

  test('sameAs compares kind and media url', () {
    final a = ChatMessage.fromJson(image);
    final b = ChatMessage.fromJson({...image, 'media': {...(image['media'] as Map), 'url': '/other'}});
    expect(a.sameAs(ChatMessage.fromJson(image)), isTrue);
    expect(a.sameAs(b), isFalse);
  });

  test('ChatSummary.partnerIsPro parses, defaults false and round-trips', () {
    final base = {'id': 'c', 'matchId': 'x', 'partner': {'id': 'p', 'firstName': 'عمر'}, 'status': 'ACTIVE'};
    expect(ChatSummary.fromJson(base).partnerIsPro, isFalse);
    final pro = ChatSummary.fromJson({...base, 'partner': {'id': 'p', 'firstName': 'عمر', 'isPro': true}});
    expect(pro.partnerIsPro, isTrue);
    expect(ChatSummary.fromJson(pro.toJson()).partnerIsPro, isTrue);
  });

  test('a feed item without isPro is false, with it true', () {
    final base = {'kind': 'mutual', 'id': 's', 'candidate': {'id': 'p', 'firstName': 'ليلى'}};
    expect(FeedItem.fromJson(base).isPro, isFalse);
    expect(FeedItem.fromJson({...base, 'isPro': true}).isPro, isTrue);
  });

  test('a match partner reads isPro', () {
    final base = {'id': 'm', 'partner': {'id': 'p', 'firstName': 'ليلى'}};
    expect(MatchSummary.fromJson(base).partner.isPro, isFalse);
    expect(MatchSummary.fromJson({'id': 'm', 'partner': {'id': 'p', 'firstName': 'ل', 'isPro': true}}).partner.isPro, isTrue);
  });

  test('Counts reads pro', () {
    expect(Counts.fromJson({'flags': {}}).isPro, isFalse);
    final c = Counts.fromJson({'flags': {}, 'pro': {'isPro': true, 'cancelAtPeriodEnd': true}});
    expect(c.isPro, isTrue);
    expect(c.proCancelAtPeriodEnd, isTrue);
  });
}
