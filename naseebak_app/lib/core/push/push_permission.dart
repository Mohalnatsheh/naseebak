import 'dart:io' show Platform;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/home/gendered_copy.dart';
import '../auth/auth_controller.dart';
import '../theme/app_theme.dart';
import 'push_service.dart';

/// Whether this device shows our pushes: the system permission (Android 13+ / iOS prompt, or switched off later in the
/// phone's settings). Null = unknown (no Firebase, tests): nothing is shown.
final pushAllowedProvider = FutureProvider<bool?>((ref) async {
  if (!ref.watch(firebaseReadyProvider)) return null;
  try {
    final s = await FirebaseMessaging.instance.getNotificationSettings();
    return switch (s.authorizationStatus) {
      AuthorizationStatus.authorized || AuthorizationStatus.provisional => true,
      _ => false,
    };
  } catch (_) {
    return null;
  }
});

/// «لاحقاً» on the home card: hidden until the app is opened again (the notifications screens always show it)
final pushCardHiddenProvider = StateProvider<bool>((ref) => false);

const _system = MethodChannel('naseebak/system');

/// The app's notification page in the phone's settings (MainActivity / AppDelegate)
Future<void> openNotificationSettings() async {
  try {
    await _system.invokeMethod<void>('openNotificationSettings');
  } catch (e) {
    debugPrint('[push] opening settings failed: $e');
  }
}

/// Asks once more where the system still can (first time, Android's second chance); otherwise explains how to turn
/// them on in the phone's settings.
Future<void> enablePushNotifications(BuildContext context, WidgetRef ref) async {
  var allowed = false;
  try {
    final s = await FirebaseMessaging.instance.requestPermission();
    allowed = s.authorizationStatus == AuthorizationStatus.authorized ||
        s.authorizationStatus == AuthorizationStatus.provisional;
  } catch (_) {}
  ref.invalidate(pushAllowedProvider);
  if (allowed) {
    ref.read(pushServiceProvider).start();
    return;
  }
  if (!context.mounted) return;
  final female = ref.read(authControllerProvider).me?.isFemale ?? false;
  await showModalBottomSheet<void>(
    context: context,
    // Above the tab bar (home is inside the tab shell)
    useRootNavigator: true,
    showDragHandle: true,
    builder: (_) => PushStepsSheet(female: female),
  );
}

/// How to switch notifications on in the phone's settings, with a button that opens the right page
class PushStepsSheet extends StatelessWidget {
  const PushStepsSheet({super.key, required this.female, this.ios});
  final bool female;

  /// Defaults to the running platform (set in tests)
  final bool? ios;

  @override
  Widget build(BuildContext context) {
    String g(String m, String f) => forViewer(female, m, f);
    final onIos = ios ?? Platform.isIOS;
    final steps = [
      '${g('اضغط', 'اضغطي')} «فتح الإعدادات» في الأسفل.',
      onIos ? '${g('اختر', 'اختاري')} «الإشعارات».' : '${g('اختر', 'اختاري')} «الإشعارات» إن لم تظهر مباشرة.',
      onIos
          ? '${g('فعّل', 'فعّلي')} «السماح بالإشعارات».'
          : '${g('فعّل', 'فعّلي')} «جميع إشعارات نصيبك» (أو «السماح بالإشعارات»).',
      '${g('ارجع', 'ارجعي')} إلى نصيبك، وتصلك الإشعارات من الآن.',
    ];
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('تفعيل الإشعارات', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text(
              'الإشعارات مغلقة لنصيبك في إعدادات ${onIos ? 'الآيفون' : 'الهاتف'}. ${g('فعّلها', 'فعّليها')} '
              '${g('لتعرف', 'لتعرفي')} فوراً بالتوافقات الجديدة والرسائل وطلبات التعارف:',
              style: const TextStyle(color: AppColors.muted, height: 1.6),
            ),
            const SizedBox(height: 14),
            for (var i = 0; i < steps.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CircleAvatar(
                      radius: 13,
                      backgroundColor: AppColors.gold.withValues(alpha: 0.15),
                      child: Text('${i + 1}',
                          style: const TextStyle(color: AppColors.gold, fontWeight: FontWeight.w800, fontSize: 13)),
                    ),
                    const SizedBox(width: 10),
                    Expanded(child: Text(steps[i], style: const TextStyle(height: 1.6))),
                  ],
                ),
              ),
            const SizedBox(height: 8),
            FilledButton.icon(
              key: const Key('open-push-settings'),
              onPressed: () {
                Navigator.of(context).pop();
                openNotificationSettings();
              },
              icon: const Icon(Icons.settings_outlined),
              label: const Text('فتح الإعدادات'),
            ),
          ],
        ),
      ),
    );
  }
}

/// «الإشعارات مغلقة» card: shown while the device blocks our pushes, checked again when the app comes back (from the
/// phone's settings). [dismissible] adds «لاحقاً» (home), hidden until the next launch.
class PushOffCard extends ConsumerStatefulWidget {
  const PushOffCard({super.key, this.dismissible = false, this.padding = EdgeInsets.zero});
  final bool dismissible;
  final EdgeInsetsGeometry padding;

  @override
  ConsumerState<PushOffCard> createState() => _PushOffCardState();
}

class _PushOffCardState extends ConsumerState<PushOffCard> with WidgetsBindingObserver {
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
    if (state == AppLifecycleState.resumed) ref.invalidate(pushAllowedProvider);
  }

  @override
  Widget build(BuildContext context) {
    final allowed = ref.watch(pushAllowedProvider).valueOrNull;
    final hidden = widget.dismissible && ref.watch(pushCardHiddenProvider);
    if (allowed != false || hidden) return const SizedBox.shrink();
    final female = ref.watch(authControllerProvider).me?.isFemale ?? false;
    String g(String m, String f) => forViewer(female, m, f);
    return Padding(
      padding: widget.padding,
      child: Container(
        key: const Key('push-off-card'),
        padding: const EdgeInsets.fromLTRB(14, 14, 8, 10),
        decoration: BoxDecoration(
          color: AppColors.warningBg,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.warning.withValues(alpha: 0.35)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.notifications_off_outlined, color: AppColors.warning),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('الإشعارات غير مفعّلة',
                          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.warning)),
                      const SizedBox(height: 4),
                      Text(
                        '${g('قد تفوتك', 'قد تفوتكِ')} التوافقات الجديدة والرسائل وطلبات التعارف. '
                        '${g('فعّلها', 'فعّليها')} ${g('لتصلك', 'لتصلكِ')} أولاً بأول.',
                        style: const TextStyle(height: 1.55, fontSize: 13.5),
                      ),
                    ],
                  ),
                ),
                if (widget.dismissible)
                  IconButton(
                    tooltip: 'لاحقاً',
                    visualDensity: VisualDensity.compact,
                    onPressed: () => ref.read(pushCardHiddenProvider.notifier).state = true,
                    icon: const Icon(Icons.close_rounded, size: 20, color: AppColors.muted),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: FilledButton.icon(
                key: const Key('enable-push'),
                style: FilledButton.styleFrom(minimumSize: const Size(0, 42)),
                onPressed: () => enablePushNotifications(context, ref),
                icon: const Icon(Icons.notifications_active_outlined, size: 20),
                label: Text(g('فعّل الإشعارات', 'فعّلي الإشعارات')),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
