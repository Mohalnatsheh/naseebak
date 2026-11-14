import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/providers.dart';
import '../../shared/widgets/common.dart' show isSafeExternalLink;
import '../network/api_client.dart';
import '../network/json.dart';
import '../theme/app_theme.dart';

/// Compares "1.2.3" versions (a "+build" suffix is ignored); missing parts count as 0.
int compareVersions(String a, String b) {
  List<int> parts(String v) => v.split('+').first.split('.').map((p) => int.tryParse(p.trim()) ?? 0).toList();
  final x = parts(a);
  final y = parts(b);
  for (var i = 0; i < 3; i++) {
    final d = (i < x.length ? x[i] : 0) - (i < y.length ? y[i] : 0);
    if (d != 0) return d.sign;
  }
  return 0;
}

enum UpdateLevel { none, optional, required }

class UpdateStatus {
  const UpdateStatus(this.level, {this.storeUrl = '', this.latestVersion = ''});
  const UpdateStatus.none() : this(UpdateLevel.none);

  final UpdateLevel level;
  final String storeUrl;
  final String latestVersion;

  /// What `GET /api/mobile/config` says about [current] on [platform] ("android" | "ios")
  factory UpdateStatus.from(Json config, String platform, String current) {
    final c = asMap(config[platform]);
    final min = asStringOr(c['minVersion']);
    final latest = asStringOr(c['latestVersion']);
    final store = asStringOr(c['storeUrl']);
    if (min.isNotEmpty && compareVersions(current, min) < 0) {
      return UpdateStatus(UpdateLevel.required, storeUrl: store, latestVersion: latest.isEmpty ? min : latest);
    }
    if (latest.isNotEmpty && compareVersions(current, latest) < 0) {
      return UpdateStatus(UpdateLevel.optional, storeUrl: store, latestVersion: latest);
    }
    return const UpdateStatus.none();
  }
}

/// The installed version (overridden in tests)
final appVersionProvider = FutureProvider<String>((ref) async => (await PackageInfo.fromPlatform()).version);

/// "android" | "ios" (overridden in tests)
final appPlatformProvider = Provider<String>((ref) => Platform.isIOS ? 'ios' : 'android');

/// `GET /api/mobile/config` for the update and maintenance gates: calls made while one is on the way share it, so a
/// start or a resume reads it once (each gate used to read it on its own)
class MobileConfigLoader {
  MobileConfigLoader(this._ref);
  final Ref _ref;
  Future<Json>? _running;

  Future<Json> load() =>
      _running ??= _ref.read(apiClientProvider).get('/api/mobile/config', auth: false).whenComplete(() => _running = null);
}

final mobileConfigLoaderProvider = Provider<MobileConfigLoader>(MobileConfigLoader.new);

/// This platform's store link from `GET /api/mobile/config` ('' when unset or unreachable): «تقييم التطبيق»
final storeUrlProvider = FutureProvider<String>((ref) async {
  try {
    final config = await ref.read(mobileConfigLoaderProvider).load();
    return asStringOr(asMap(config[ref.read(appPlatformProvider)])['storeUrl']);
  } catch (_) {
    return '';
  }
});

/// The update gate (Admin → Settings → Mobile app versions on the server): checked on start and on every resume.
/// A failed check (offline, server error) never blocks the app.
class UpdateCheck extends Notifier<UpdateStatus> {
  static const _dismissedKey = 'update_dismissed_version';

  @override
  UpdateStatus build() {
    Future.microtask(check);
    return const UpdateStatus.none();
  }

  Future<void> check() async {
    // Asked before the version is read: the maintenance gate's check, made in the same moment, shares the request
    final configF = ref.read(mobileConfigLoaderProvider).load();
    // Never an unhandled error when the version read fails first
    configF.ignore();
    try {
      final current = await ref.read(appVersionProvider.future);
      final config = await configF;
      final status = UpdateStatus.from(config, ref.read(appPlatformProvider), current);
      // «لاحقاً» on an optional update hides it until a newer one is announced
      final dismissed = ref.read(sharedPreferencesProvider).getString(_dismissedKey);
      state = status.level == UpdateLevel.optional && dismissed == status.latestVersion ? const UpdateStatus.none() : status;
    } catch (_) {
      // Keep the last known state
    }
  }

  Future<void> dismiss() async {
    if (state.level != UpdateLevel.optional) return;
    await ref.read(sharedPreferencesProvider).setString(_dismissedKey, state.latestVersion);
    state = const UpdateStatus.none();
  }
}

final updateCheckProvider = NotifierProvider<UpdateCheck, UpdateStatus>(UpdateCheck.new);

/// The store page of the app (https, or the stores' own schemes)
Future<void> openStoreLink(String url) async {
  if (url.isEmpty || !isSafeExternalLink(url, extraSchemes: const {'itms-apps', 'market'})) return;
  await launchUrl(Uri.parse(url.trim()), mode: LaunchMode.externalApplication).catchError((_) => false);
}

/// Wraps the whole app (MaterialApp.builder): a required update replaces every screen. An optional one is the tab
/// shell's [OptionalUpdateCard].
class UpdateGate extends ConsumerStatefulWidget {
  const UpdateGate({super.key, required this.child});
  final Widget child;

  @override
  ConsumerState<UpdateGate> createState() => _UpdateGateState();
}

class _UpdateGateState extends ConsumerState<UpdateGate> with WidgetsBindingObserver {
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
    // Back from the store (or a long pause): check again
    if (state == AppLifecycleState.resumed) ref.read(updateCheckProvider.notifier).check();
  }

  @override
  Widget build(BuildContext context) {
    final status = ref.watch(updateCheckProvider);
    // Above the Navigator: give the gate its own direction and material
    return Directionality(
      textDirection: TextDirection.rtl,
      child: switch (status.level) {
        // A required update replaces the app: nothing of it is built underneath (hidden screens would keep polling,
        // topping up suggestions and taking focus and back, review I-1)
        UpdateLevel.required => _RequiredUpdate(
            status: status,
            platform: ref.watch(appPlatformProvider),
            onUpdate: () => openStoreLink(status.storeUrl),
            onCheckAgain: () => ref.read(updateCheckProvider.notifier).check(),
          ),
        // An optional update is a card over the tabs only (`OptionalUpdateCard` in the tab shell): floating here,
        // above every screen, it covered the chat, the sign-in and the setup pages
        UpdateLevel.optional || UpdateLevel.none => widget.child,
      },
    );
  }
}

class _RequiredUpdate extends StatefulWidget {
  const _RequiredUpdate({required this.status, required this.platform, required this.onUpdate, required this.onCheckAgain});
  final UpdateStatus status;
  final String platform;
  final VoidCallback onUpdate;
  final Future<void> Function() onCheckAgain;

  @override
  State<_RequiredUpdate> createState() => _RequiredUpdateState();
}

class _RequiredUpdateState extends State<_RequiredUpdate> {
  bool _checking = false;

  Future<void> _checkAgain() async {
    setState(() => _checking = true);
    await widget.onCheckAgain();
    if (mounted) setState(() => _checking = false);
  }

  @override
  Widget build(BuildContext context) {
    final status = widget.status;
    // No store link set yet (Admin → Settings → Mobile app): the update stays required, the page says where to get it
    final noLink = status.storeUrl.isEmpty;
    final store = widget.platform == 'ios' ? 'App Store' : 'Google Play';
    return Material(
      key: const Key('update-required'),
      color: AppColors.navyDeep,
      child: SafeArea(
        // Scrolls with large system text on a small phone
        child: Center(
          child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: Column(
            children: [
              const Icon(Icons.system_update_rounded, size: 72, color: AppColors.gold),
              const SizedBox(height: 24),
              Text(
                'تحديث التطبيق',
                textAlign: TextAlign.center,
                style: AppText.title.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 12),
              Text(
                'يتوفر إصدار جديد من نصيبك فيه تحسينات مهمة، ويلزم تحديثه لمتابعة استخدامه.',
                textAlign: TextAlign.center,
                style: AppText.body.copyWith(color: Colors.white70, height: 1.6),
              ),
              const SizedBox(height: 32),
              if (noLink) ...[
                Text(
                  'يمكنك تحديث «نصيبك» من متجر $store على جهازك، ثم فتح التطبيق من جديد.',
                  key: const Key('update-store-hint'),
                  textAlign: TextAlign.center,
                  style: AppText.body.copyWith(color: Colors.white, fontWeight: FontWeight.w700, height: 1.6),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    key: const Key('update-check-again'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: const BorderSide(color: Colors.white54),
                      minimumSize: const Size.fromHeight(52),
                    ),
                    onPressed: _checking ? null : _checkAgain,
                    icon: const Icon(Icons.refresh_rounded),
                    label: Text(_checking ? 'جارٍ التحقق…' : 'إعادة التحقق'),
                  ),
                ),
              ] else
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    key: const Key('update-now'),
                    // Navy on gold: white on gold was about 2.8:1
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.gold,
                      foregroundColor: AppColors.navyDeep,
                      minimumSize: const Size.fromHeight(54),
                    ),
                    onPressed: widget.onUpdate,
                    icon: const Icon(Icons.download_rounded),
                    label: Text('تحديث الآن', style: AppText.body.copyWith(fontWeight: FontWeight.w700)),
                  ),
                ),
            ],
          ),
          ),
        ),
      ),
    );
  }
}

/// «يتوفر إصدار جديد»: shown by the tab shell just above the tab bar while an optional update waits; nothing
/// otherwise. «لاحقاً» hides it until a newer version is announced.
class OptionalUpdateCard extends ConsumerWidget {
  const OptionalUpdateCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(updateCheckProvider);
    if (status.level != UpdateLevel.optional) return const SizedBox.shrink();
    void onUpdate() => openStoreLink(status.storeUrl);
    void onLater() => ref.read(updateCheckProvider.notifier).dismiss();
    return Material(
      key: const Key('update-optional'),
      elevation: 6,
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
        child: Row(
          children: [
            const Icon(Icons.system_update_rounded, color: AppColors.gold),
            const SizedBox(width: 10),
            const Expanded(
              child: Text('يتوفر إصدار جديد من نصيبك', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.navy)),
            ),
            TextButton(key: const Key('update-later'), onPressed: onLater, child: const Text('لاحقاً')),
            FilledButton(onPressed: onUpdate, child: const Text('تحديث')),
          ],
        ),
      ),
    );
  }
}
