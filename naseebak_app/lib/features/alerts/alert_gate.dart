import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/network/json.dart';
import '../../core/routing/popup_tracker.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../notifications/notifications_screen.dart';

/// The admin's popup alert (`GET /api/alerts/current?platform=app`, server src/lib/alerts.ts).
class AppAlert {
  const AppAlert({required this.id, required this.title, required this.body, this.imageUrl, this.buttonLabel, this.buttonUrl});

  factory AppAlert.fromJson(Map<String, dynamic> j) => AppAlert(
        id: asStringOr(j['id']),
        title: asStringOr(j['title']),
        body: asStringOr(j['body']),
        imageUrl: asString(j['imageUrl']),
        buttonLabel: asString(j['buttonLabel']),
        buttonUrl: asString(j['buttonUrl']),
      );

  final String id;
  final String title;
  final String body;
  final String? imageUrl;
  final String? buttonLabel;
  final String? buttonUrl;

  bool get hasButton => (buttonLabel ?? '').isNotEmpty && (buttonUrl ?? '').isNotEmpty;
}

/// Shows the waiting popup alert on home only (owner, 2026-11-14): when home opens, when the member comes back to the
/// home tab or to home from a page pushed over it, and when the app comes back to the front. Never over another tab,
/// a pushed page, sign-in or setup. Closing it or tapping its button tells the server, so it never shows again (on
/// the website either); then the next one, if any.
class AlertGate extends ConsumerStatefulWidget {
  const AlertGate({super.key, required this.child, this.active = true});
  final Widget child;

  /// True while the home tab is the selected tab (the tab shell passes it)
  final bool active;

  @override
  ConsumerState<AlertGate> createState() => _AlertGateState();
}

class _AlertGateState extends ConsumerState<AlertGate> with WidgetsBindingObserver {
  bool _showing = false;
  bool _checking = false;

  /// Whether the tabs' route is the top one (kept current through the route's scope dependency)
  bool _routeIsCurrent = true;

  /// Home is what the member sees: the home tab, nothing pushed over the tabs, the app in front
  bool _onHome() {
    if (!widget.active || !mounted) return false;
    final life = WidgetsBinding.instance.lifecycleState;
    if (life != null && life != AppLifecycleState.resumed) return false;
    return _routeIsCurrent;
  }

  void _checkSoon() => WidgetsBinding.instance.addPostFrameCallback((_) => _check());

  @override
  void didUpdateWidget(covariant AlertGate oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!oldWidget.active && widget.active) _checkSoon();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Read here so this state depends on it: closing a page pushed over the tabs makes the route current again and
    // calls this again, and home may be visible now
    _routeIsCurrent = ModalRoute.isCurrentOf(context) ?? true;
    _checkSoon();
  }

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
    if (state == AppLifecycleState.resumed) _check();
  }

  Future<void> _check() async {
    if (_showing || _checking || !_onHome()) return;
    _checking = true;
    try {
      await _checkNow();
    } finally {
      _checking = false;
    }
  }

  Future<void> _checkNow() async {
    // Counted as a popup from the question to the server until it closes: the notifications reminder waits meanwhile,
    // so the two never stack (review I-2)
    final popups = ref.read(popupShowingProvider.notifier);
    final openLink = await popups.track(() => _askAndShow());
    if (openLink == null || !mounted) return;
    final (alert, link) = openLink;
    if (link && alert.hasButton) {
      final url = alert.buttonUrl!;
      // A site page the app has no screen for (`/faq`, `/blog/…`): the website, not a dead tap on home (sweep M4)
      final page = websitePageForLink(url);
      if (page != null) {
        await openExternal(context, page);
      } else if (url.startsWith('/')) {
        openAppRoute(GoRouter.of(context), appRouteForLink(url: url));
      } else {
        await openExternal(context, url);
      }
      return;
    }
    _checkSoon();
  }

  /// The waiting alert, shown and closed on the server; null when none was shown
  Future<(AppAlert, bool)?> _askAndShow() async {
    // Taken now: the dismiss below still goes out if the tabs are gone by then
    final api = ref.read(apiClientProvider);
    AppAlert? alert;
    try {
      final j = await api.get('/api/alerts/current', query: {'platform': 'app'});
      final a = asMapOrNull(j['alert']);
      alert = a == null ? null : AppAlert.fromJson(a);
    } catch (_) {
      return null; // Next time the app comes back
    }
    // Left home while asking: shown next time home is visible (not dismissed)
    if (alert == null || !mounted || _showing || !_onHome()) return null;
    _showing = true;
    final openLink = await showDialog<bool>(
      context: context,
      useRootNavigator: true,
      builder: (_) => AlertDialogView(alert: alert!),
    );
    _showing = false;
    // Closed by tapping outside / back counts as closed: the member saw it
    try {
      await api.post('/api/alerts/${alert.id}/dismiss');
    } catch (_) {
      // Shown again next time: better than lost
    }
    return (alert, openLink == true);
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// The popup itself: optional image, title, text, optional button, «لاحقاً» / «حسناً». Pops true for the button.
class AlertDialogView extends StatelessWidget {
  const AlertDialogView({super.key, required this.alert});
  final AppAlert alert;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      key: const Key('app-alert'),
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      clipBehavior: Clip.antiAlias,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (alert.imageUrl != null)
              Image.network(
                alert.imageUrl!,
                height: 180,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => const SizedBox.shrink(),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 22, 22, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (alert.imageUrl == null)
                    const Padding(
                      padding: EdgeInsets.only(bottom: 10),
                      child: Icon(Icons.campaign_rounded, color: AppColors.gold, size: 40),
                    ),
                  Text(alert.title,
                      textAlign: TextAlign.center, style: AppText.headline.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 10),
                  Text(alert.body,
                      textAlign: TextAlign.center, style: const TextStyle(height: 1.6, color: AppColors.muted)),
                  const SizedBox(height: 18),
                  if (alert.hasButton)
                    FilledButton(
                      key: const Key('app-alert-action'),
                      onPressed: () => Navigator.of(context).pop(true),
                      child: Text(alert.buttonLabel!),
                    ),
                  TextButton(
                    key: const Key('app-alert-close'),
                    onPressed: () => Navigator.of(context).pop(false),
                    child: Text(alert.hasButton ? 'لاحقاً' : 'حسناً'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
