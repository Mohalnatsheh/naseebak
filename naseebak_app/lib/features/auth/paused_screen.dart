import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';

/// A paused account (`deactivated: true`) can only reactivate or sign out.
class PausedScreen extends ConsumerStatefulWidget {
  const PausedScreen({super.key});

  @override
  ConsumerState<PausedScreen> createState() => _PausedScreenState();
}

class _PausedScreenState extends ConsumerState<PausedScreen> {
  bool _busy = false;
  String? _error;

  Future<void> _reactivate() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).reactivate();
      await ref.read(authControllerProvider.notifier).refreshMe();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(authControllerProvider).me;
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const Align(alignment: AlignmentDirectional.centerStart, child: BrandLogo(height: 38)),
            const SizedBox(height: 40),
            Container(
              width: 76,
              height: 76,
              decoration: BoxDecoration(color: AppColors.warningBg, shape: BoxShape.circle),
              child: const Icon(Icons.pause_circle_outline_rounded, color: AppColors.warning, size: 40),
            ),
            const SizedBox(height: 20),
            Text('حسابك موقوف مؤقتاً', style: theme.textTheme.headlineSmall),
            const SizedBox(height: 10),
            Text(
              '${me?.firstName.isNotEmpty == true ? '${me!.firstName}، ' : ''}'
              'أوقفت حسابك، فلا يظهر ملفك لأحد ولا تصلك اقتراحات جديدة. '
              'إذا طلبت حذف الحساب، فإعادة التفعيل تلغي طلب الحذف.',
              style: theme.textTheme.bodyLarge?.copyWith(color: AppColors.muted),
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              InfoBanner(text: _error!, tone: BannerTone.danger),
            ],
            const SizedBox(height: 28),
            LoadingButton(label: 'إعادة تفعيل حسابي', loading: _busy, onPressed: _reactivate),
            const SizedBox(height: 12),
            LoadingButton(
              label: 'تسجيل الخروج',
              outlined: true,
              onPressed: _busy ? null : () => ref.read(authControllerProvider.notifier).logout(),
            ),
          ],
        ),
      ),
    );
  }
}

/// Launch screen while the saved session is checked (or when that check could not reach the server).
class SplashScreen extends ConsumerWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final failed = auth.status == AuthStatus.restoreFailed;
    return Scaffold(
      backgroundColor: AppColors.navy,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const BrandLogo(height: 64, onDark: true),
                const SizedBox(height: 32),
                if (!failed)
                  const SizedBox(
                    width: 26,
                    height: 26,
                    child: CircularProgressIndicator(color: AppColors.goldLight, strokeWidth: 2.5),
                  )
                else ...[
                  Text(
                    auth.error ?? ApiException.networkMessage,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white, fontSize: 15, height: 1.6),
                  ),
                  const SizedBox(height: 20),
                  FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: AppColors.gold),
                    onPressed: () => ref.read(authControllerProvider.notifier).restore(),
                    child: const Text('إعادة المحاولة'),
                  ),
                  TextButton(
                    onPressed: () => ref.read(authControllerProvider.notifier).logout(),
                    child: const Text('تسجيل الخروج', style: TextStyle(color: Colors.white70)),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
