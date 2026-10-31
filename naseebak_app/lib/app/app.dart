import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/auth/auth_controller.dart';
import '../core/push/push_service.dart';
import '../core/routing/router.dart';
import '../core/update/app_update.dart';
import '../core/theme/app_theme.dart';
import 'maintenance_gate.dart';

/// Arabic-first, right-to-left.
class NaseebakApp extends ConsumerWidget {
  const NaseebakApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    // Push follows the session: register once signed in (also a restored session), stop on sign-out
    ref.listen(authControllerProvider.select((a) => a.isSignedIn), (_, signedIn) {
      final push = ref.read(pushServiceProvider);
      signedIn ? push.start() : push.reset();
    });
    return MaterialApp.router(
      title: 'نصيبك',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      routerConfig: router,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (context, child) => MediaQuery(
        // Keep the layout readable with very large system fonts
        data: MediaQuery.of(context).copyWith(
          textScaler: MediaQuery.textScalerOf(context).clamp(maxScaleFactor: 1.3),
        ),
        // A required update replaces every screen; an optional one shows a card (Admin → Mobile app versions);
        // maintenance mode (Admin → Settings) replaces every screen while it is on
        child: UpdateGate(
          child: MaintenanceGate(child: ResumeRefresh(child: child ?? const SizedBox.shrink())),
        ),
      ),
    );
  }
}

/// Back in the foreground: re-read `/api/mobile/me` (at most once a minute), so a pause, a deletion request or a
/// suspension made elsewhere (website, admin) shows at once.
class ResumeRefresh extends ConsumerStatefulWidget {
  const ResumeRefresh({super.key, required this.child});
  final Widget child;

  @override
  ConsumerState<ResumeRefresh> createState() => _ResumeRefreshState();
}

class _ResumeRefreshState extends ConsumerState<ResumeRefresh> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) ref.read(authControllerProvider.notifier).refreshOnResume();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
