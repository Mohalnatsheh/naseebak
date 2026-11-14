import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import 'logout_button.dart';
import '../country_selection/country_providers.dart';

/// A suspended account (`/api/mobile/me` → 403 `SUSPENDED`): nothing works for it, so instead of a retry loop the
/// member sees why, can reach support and sign out.
class SuspendedScreen extends ConsumerStatefulWidget {
  const SuspendedScreen({super.key});

  @override
  ConsumerState<SuspendedScreen> createState() => _SuspendedScreenState();
}

class _SuspendedScreenState extends ConsumerState<SuspendedScreen> {
  bool _checking = false;

  Future<void> _checkAgain() async {
    setState(() => _checking = true);
    try {
      await ref.read(authControllerProvider.notifier).refreshMe();
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final code = ref.watch(selectedCountryCodeProvider) ?? 'JO';
    final details = ref.watch(countryDetailsProvider(code)).valueOrNull;
    final email = details?.supportEmail;
    return Scaffold(
      body: SafeArea(
        child: ListView(
          key: const Key('suspended'),
          padding: const EdgeInsets.all(24),
          children: [
            const Align(alignment: AlignmentDirectional.centerStart, child: BrandLogo(height: 38)),
            const SizedBox(height: 40),
            Container(
              width: 76,
              height: 76,
              decoration: const BoxDecoration(color: AppColors.dangerBg, shape: BoxShape.circle),
              child: const Icon(Icons.block_rounded, color: AppColors.danger, size: 40),
            ),
            const SizedBox(height: 20),
            Text('حسابك موقوف', style: theme.textTheme.headlineSmall),
            const SizedBox(height: 10),
            Text(
              'أوقف فريق نصيبك هذا الحساب، فلا يمكن استخدامه حالياً. '
              'إذا كان لديك استفسار عن ذلك يمكنك التواصل مع فريق الدعم.',
              style: theme.textTheme.bodyLarge?.copyWith(color: AppColors.muted),
            ),
            const SizedBox(height: 28),
            LoadingButton(
              key: const Key('suspended-support'),
              label: 'التواصل مع الدعم',
              icon: Icons.support_agent_rounded,
              onPressed: () => openExternal(
                context,
                email != null && email.isNotEmpty ? 'mailto:$email' : details?.links.contact,
              ),
            ),
            const SizedBox(height: 12),
            LoadingButton(
              label: 'إعادة التحقق',
              outlined: true,
              loading: _checking,
              onPressed: _checkAgain,
            ),
            const SizedBox(height: 12),
            LogoutButton(key: const Key('suspended-logout'), enabled: !_checking),
          ],
        ),
      ),
    );
  }
}
