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
    try {
      final current = await ref.read(appVersionProvider.future);
      final config = await ref.read(apiClientProvider).get('/api/mobile/config', auth: false);
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
        UpdateLevel.required => _RequiredUpdate(status: status, onUpdate: () => openStoreLink(status.storeUrl)),
        // An optional update is a card over the tabs only (`OptionalUpdateCard` in the tab shell): floating here,
        // above every screen, it covered the chat, the sign-in and the setup pages
        UpdateLevel.optional || UpdateLevel.none => widget.child,
      },
    );
  }
}

class _RequiredUpdate extends StatelessWidget {
  const _RequiredUpdate({required this.status, required this.onUpdate});
  final UpdateStatus status;
  final VoidCallback onUpdate;

  @override
  Widget build(BuildContext context) {
    return Material(
      key: const Key('update-required'),
      color: AppColors.navyDeep,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
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
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  key: const Key('update-now'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.gold,
                    foregroundColor: Colors.white,
                    minimumSize: const Size.fromHeight(54),
                  ),
                  onPressed: status.storeUrl.isEmpty ? null : onUpdate,
                  icon: const Icon(Icons.download_rounded),
                  label: Text('تحديث الآن', style: AppText.body.copyWith(fontWeight: FontWeight.w700)),
                ),
              ),
              if (status.storeUrl.isEmpty) ...[
                const SizedBox(height: 12),
                const Text('يمكنك تحديث «نصيبك» من متجر التطبيقات.',
                    textAlign: TextAlign.center, style: TextStyle(color: Colors.white70)),
              ],
            ],
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
