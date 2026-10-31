import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/features/discovery/suggestion_models.dart';
import 'package:naseebak_app/features/discovery/suggestions_screen.dart';

void main() {
  test('both chose chat: the chat is open, the button opens it (no request to send)', () {
    const res = DecisionResult(match: true, matchId: 'm1', intro: 'CHAT', conversationId: 'c1', myPreference: 'CHAT');
    final copy = matchDialogCopy(res, 'خالد', viewerFemale: true);
    expect(copy.action, 'فتح المحادثة');
    expect(copy.route, '/chats/c1');
    expect(copy.body, contains('أنتِ وخالد'));
    expect(copy.body, contains('مفتوحة الآن ويمكنكِ'));
  });

  test('I chose chat, he chose family: ask me to share my guardian, open the match', () {
    const res = DecisionResult(match: true, matchId: 'm1', intro: 'FAMILY', myPreference: 'CHAT');
    final copy = matchDialogCopy(res, 'خالد', viewerFemale: true);
    expect(copy.body, contains('فضّل خالد التعارف العائلي'));
    expect(copy.body, contains('شاركي بيانات وليّ أمرك'));
    expect(copy.route, '/matches/m1');
  });

  test('no outcome (older flows, older server): the match page with its request buttons', () {
    const res = DecisionResult(match: true, matchId: 'm1');
    final copy = matchDialogCopy(res, 'سارة', viewerFemale: false);
    expect(copy.action, 'عرض التوافق');
    expect(copy.route, '/matches/m1');
    expect(copy.body, contains('أنت وسارة'));
  });
}
