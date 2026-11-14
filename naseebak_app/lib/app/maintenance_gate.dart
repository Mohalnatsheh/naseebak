import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/json.dart';
import '../core/theme/app_theme.dart';
import '../core/update/app_update.dart' show mobileConfigLoaderProvider;

/// Maintenance mode (Admin → Settings → Maintenance Mode), from `maintenance` of public `GET /api/mobile/config`.
class MaintenanceState {
  const MaintenanceState({this.enabled = false, this.message = ''});

  factory MaintenanceState.fromConfig(Map<String, dynamic> config) {
    final m = asMap(config['maintenance']);
    return MaintenanceState(enabled: asBool(m['enabled']) ?? false, message: asStringOr(m['message']).trim());
  }

  final bool enabled;

  /// The admin's message ('' = the default text)
  final String message;

  static const defaultMessage = 'نعمل على تحسين نصيبك، وسنعود قريباً. شكراً لصبرك.';
}

/// Checked on start, on every resume and after any 503 `MAINTENANCE`. A failed check (offline, an older server
/// without the field) keeps the last known state, so it never blocks the app by itself.
class MaintenanceCheck extends Notifier<MaintenanceState> {
  Future<void>? _running;

  @override
  MaintenanceState build() {
    Future.microtask(check);
    return const MaintenanceState();
  }

  Future<void> check() => _running ??= _check().whenComplete(() => _running = null);

  Future<void> _check() async {
    try {
      // Shared with the update gate's check made at the same moment (start, resume)
      final config = await ref.read(mobileConfigLoaderProvider).load();
      if (config.containsKey('maintenance')) state = MaintenanceState.fromConfig(config);
    } catch (_) {
      // Keep the last known state
    }
  }
}

final maintenanceProvider = NotifierProvider<MaintenanceCheck, MaintenanceState>(MaintenanceCheck.new);

/// Wraps the whole app (MaterialApp.builder): while maintenance is on, a full-screen page replaces every screen.
class MaintenanceGate extends ConsumerStatefulWidget {
  const MaintenanceGate({super.key, required this.child});
  final Widget child;

  @override
  ConsumerState<MaintenanceGate> createState() => _MaintenanceGateState();
}

class _MaintenanceGateState extends ConsumerState<MaintenanceGate> with WidgetsBindingObserver {
  bool _checking = false;

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
    if (state == AppLifecycleState.resumed) ref.read(maintenanceProvider.notifier).check();
  }

  Future<void> _retry() async {
    setState(() => _checking = true);
    await ref.read(maintenanceProvider.notifier).check();
    if (mounted) setState(() => _checking = false);
  }

  @override
  Widget build(BuildContext context) {
    final m = ref.watch(maintenanceProvider);
    // Nothing of the app is built under the page: hidden screens would keep polling, marking chats read and taking
    // focus and back (review I-1)
    if (!m.enabled) return widget.child;
    return _page(m);
  }

  Widget _page(MaintenanceState m) {
    // Above the Navigator: give the page its own direction and material
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Material(
        key: const Key('maintenance'),
        color: AppColors.navyDeep,
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(28),
              child: Column(
                children: [
                  const Icon(Icons.construction_rounded, size: 72, color: AppColors.gold),
                  const SizedBox(height: 24),
                  Text(
                    'نصيبك تحت الصيانة',
                    textAlign: TextAlign.center,
                    style: AppText.title.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    m.message.isEmpty ? MaintenanceState.defaultMessage : m.message,
                    key: const Key('maintenance-message'),
                    textAlign: TextAlign.center,
                    style: AppText.body.copyWith(color: Colors.white70, height: 1.6),
                  ),
                  const SizedBox(height: 32),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      key: const Key('maintenance-retry'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Colors.white54),
                        minimumSize: const Size.fromHeight(52),
                      ),
                      onPressed: _checking ? null : _retry,
                      icon: const Icon(Icons.refresh_rounded),
                      label: Text(_checking ? 'جارٍ التحقق…' : 'إعادة المحاولة'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
