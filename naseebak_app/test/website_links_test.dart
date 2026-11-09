import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:naseebak_app/core/routing/website_links.dart';

void main() {
  group('naseebak.com links → app screens', () {
    test('member pages map like notification links', () {
      expect(WebsiteLink.parse(Uri.parse('https://naseebak.com/dashboard/chats/c1'))!.route, '/chats/c1');
      expect(WebsiteLink.parse(Uri.parse('https://naseebak.com/dashboard/matches?match=m1'))!.route, '/matches/m1');
      expect(WebsiteLink.parse(Uri.parse('/dashboard/suggestions?tab=interested'))!.route, '/suggestions?tab=interested');
      expect(WebsiteLink.parse(Uri.parse('https://naseebak.com/dashboard'))!.route, '/home');
      expect(WebsiteLink.parse(Uri.parse('https://naseebak.com/dashboard/pro'))!.route, '/pro');
      expect(WebsiteLink.parse(Uri.parse('https://naseebak.com/dashboard/payments'))!.route, '/credits');
    });

    test('a referral link keeps its invitation code; other pages stay on the website', () {
      final r = WebsiteLink.parse(Uri.parse('https://naseebak.com/register?invitationCode=AB12CD34'))!;
      expect(r.route, isNull);
      expect(r.invitationCode, 'AB12CD34');
      expect(WebsiteLink.parse(Uri.parse('https://naseebak.com/blog/x')), isNull);
      expect(WebsiteLink.parse(Uri.parse('/chats/c1')), isNull);
    });
  });

  testWidgets('go_router runs the redirect for a website path no route matches', (tester) async {
    final router = GoRouter(
      initialLocation: '/home',
      redirect: (_, state) => WebsiteLink.parse(state.uri)?.route,
      routes: [
        GoRoute(path: '/home', builder: (_, _) => const Text('home')),
        GoRoute(path: '/chats/:id', builder: (_, s) => Text('chat ${s.pathParameters['id']}')),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    router.go('/dashboard/chats/c9');
    await tester.pumpAndSettle();
    expect(find.text('chat c9'), findsOneWidget);
  });
}
