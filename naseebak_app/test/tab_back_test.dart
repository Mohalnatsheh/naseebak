// QA A2-M1: on Android 14 (predictive back) a tab's own navigator reported "nothing to pop", so back left the app
// from any tab instead of going home first.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/app/shell.dart';

Widget _tree(bool handlesBack, List<bool> seen) => NotificationListener<NavigationNotification>(
      onNotification: (n) {
        seen.add(n.canHandlePop);
        return true;
      },
      child: Directionality(
        textDirection: TextDirection.rtl,
        child: TabBackScope(
          handlesBack: handlesBack,
          // A tab's navigator with one page: it says it can't pop
          child: Navigator(onGenerateRoute: (_) => MaterialPageRoute<void>(builder: (_) => const SizedBox())),
        ),
      ),
    );

void main() {
  testWidgets('on another tab the app keeps handling back; on home the system may', (tester) async {
    final seen = <bool>[];
    await tester.pumpWidget(_tree(true, seen));
    await tester.pumpAndSettle();
    expect(seen, isNotEmpty);
    expect(seen.last, isTrue);

    // Home (a fresh tree, so the navigator reports again): its own report passes through as it is
    seen.clear();
    await tester.pumpWidget(KeyedSubtree(key: UniqueKey(), child: _tree(false, seen)));
    await tester.pumpAndSettle();
    expect(seen, isNotEmpty);
    expect(seen.every((v) => v == false), isTrue);
  });
}
