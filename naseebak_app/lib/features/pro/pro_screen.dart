import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/analytics/analytics.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/network/api_exception.dart';
import '../../shared/widgets/common.dart';
import '../home/counts.dart';
import 'pro_repository.dart';
import 'pro_section.dart';

/// «عضوية Pro» (`/pro`, the website's `/dashboard/pro`): the plans card, or «اشتراكي» for a Pro member, with its
/// checkout. Shown only where [showPlans] is true; a test or review account (app payments off), or a member who can't
/// buy, sees «غير متاحة» and nothing to buy.
///
/// A checkout opens in the phone's browser (https only). Back in the app, `/api/pro` and the counts are re-read every
/// [pollInterval] for up to [pollWindow]: Pro on → a success snack, otherwise a neutral line (the webhook may land a
/// bit later).
class ProScreen extends ConsumerStatefulWidget {
  const ProScreen({
    super.key,
    this.openCheckout,
    this.pollInterval = const Duration(seconds: 2),
    this.pollWindow = const Duration(seconds: 10),
  });

  /// Opens the Stripe page; defaults to the external browser (tests pass a fake)
  final Future<bool> Function(Uri url)? openCheckout;

  final Duration pollInterval;
  final Duration pollWindow;

  @override
  ConsumerState<ProScreen> createState() => _ProScreenState();
}

/// What a member who may not see Pro gets on `/pro` (an old link, a notice): no plan, no price, no button
const proUnavailableText = 'عضوية Pro غير متاحة حالياً.';

class _ProScreenState extends ConsumerState<ProScreen> with WidgetsBindingObserver {
  /// A checkout is being started, and a checkout page was opened from this screen (polled on return)
  bool _subscribing = false;
  bool _checkoutOpened = false;
  int _pollRun = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // The app payments switch may have changed since `me` was read
    ref.read(authControllerProvider.notifier).refreshMe();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pollRun++;
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _checkoutOpened) _poll();
  }

  /// «اشترك الآن»: a Pro checkout opened in the browser (https only); the return to the app is polled ([_poll])
  Future<void> _subscribe(ProOffer offer) async {
    if (_subscribing) return;
    setState(() => _subscribing = true);
    try {
      final url = await ref.read(proRepositoryProvider).checkout(offer.id);
      if (!mounted) return;
      ref.read(analyticsProvider).checkoutStarted('pro_${offer.id}');
      // Set before the browser opens: the return to the app (resumed) may come before launch answers
      _checkoutOpened = true;
      final open = widget.openCheckout ?? (u) => launchUrl(u, mode: LaunchMode.externalApplication);
      final ok = await open(url).catchError((_) => false);
      if (!ok) {
        _checkoutOpened = false;
        if (mounted) showSnack(context, 'تعذّر فتح صفحة الدفع');
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.code == 'APP_PURCHASES_DISABLED') ref.read(authControllerProvider.notifier).refreshMe();
      if (e.code == 'ALREADY_PRO' || e.code == 'APP_PURCHASES_DISABLED') ref.invalidate(proStateProvider);
      showSnack(context, e.message);
    } catch (_) {
      // A non-https or missing url (FormatException) or anything unexpected
      if (mounted) showSnack(context, ApiException.genericMessage);
    } finally {
      if (mounted) setState(() => _subscribing = false);
    }
  }

  /// Back from the checkout: one check now and one per interval until the window is used up (ticks, not wall time)
  Future<void> _poll() async {
    final run = ++_pollRun;
    final checks = 1 + widget.pollWindow.inMilliseconds ~/ widget.pollInterval.inMilliseconds.clamp(1, 1 << 30);
    for (var i = 0; i < checks; i++) {
      if (i > 0) await Future<void>.delayed(widget.pollInterval);
      if (run != _pollRun || !mounted) return;
      ref.invalidate(countsProvider);
      ref.invalidate(proStateProvider);
      var isPro = false;
      try {
        isPro = (await ref.read(proStateProvider.future)).isPro;
      } catch (_) {
        // A failed check is not an answer: try again on the next tick
      }
      if (run != _pollRun || !mounted) return;
      if (isPro) {
        _checkoutOpened = false;
        _pollRun++;
        ref.read(authControllerProvider.notifier).refreshMe();
        showSnack(context, 'تم تفعيل عضوية Pro في حسابك.');
        return;
      }
    }
    if (run != _pollRun || !mounted) return;
    _checkoutOpened = false;
    showSnack(context, 'سيتم تفعيل العضوية خلال لحظات');
  }

  Widget _unavailable() => const MessageView(
        key: Key('pro-unavailable'),
        icon: Icons.info_outline_rounded,
        title: proUnavailableText,
      );

  @override
  Widget build(BuildContext context) {
    final payments = ref.watch(appPaymentsProvider);
    final me = ref.watch(authControllerProvider).me;
    // No request at all where payments are hidden (test and review accounts)
    final pro = payments ? ref.watch(proStateProvider) : null;
    return Scaffold(
      appBar: AppBar(title: const Text('عضوية Pro')),
      body: pro == null
          ? _unavailable()
          : pro.when(
              // A failed re-check (e.g. while polling after a checkout) keeps the last good state on screen
              skipError: true,
              loading: () => const Center(child: CircularProgressIndicator()),
              // A 404 is a server without Pro
              error: (e, _) => e is ApiException && e.statusCode == 404
                  ? _unavailable()
                  : ErrorView(error: e, onRetry: () => ref.invalidate(proStateProvider)),
              data: (s) => !showPlans(s, payments)
                  ? _unavailable()
                  : RefreshIndicator(
                      onRefresh: () async {
                        ref.invalidate(proStateProvider);
                        await ref.read(authControllerProvider.notifier).refreshMe();
                      },
                      child: ListView(
                        padding: const EdgeInsets.all(16),
                        children: [
                          ProSection(
                            state: s,
                            female: me?.isFemale ?? false,
                            subscribing: _subscribing,
                            onSubscribe: _subscribe,
                          ),
                        ],
                      ),
                    ),
            ),
    );
  }
}
