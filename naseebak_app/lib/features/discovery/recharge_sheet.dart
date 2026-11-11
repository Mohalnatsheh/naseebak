import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../home/gendered_copy.dart';

/// 0 credits with the «مهتم» paywall on (`interestPaywall` of `/api/me/counts`): a tap on «مهتم» opens this short
/// «انتهى رصيدك» step instead of a greyed button. It only says why and offers the way to buy; the caller opens the
/// credits screen when it returns true.
class RechargeSheet extends StatelessWidget {
  const RechargeSheet({super.key, required this.viewerFemale});

  final bool viewerFemale;

  /// The same line as the website's «انتهى رصيدك» step
  static const line = 'يُستخدم رصيد واحد عند اختيار «مهتم»، والتوافق والطلبات والمحادثة مجانية.';

  /// True when the member chose to recharge
  static Future<bool> show(BuildContext context, {required bool viewerFemale}) async {
    final res = await showModalBottomSheet<bool>(
      context: context,
      // Over the tab bar, like the «مهتم» sheet
      useRootNavigator: true,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => RechargeSheet(viewerFemale: viewerFemale),
    );
    return res ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      key: const Key('recharge-sheet'),
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.account_balance_wallet_outlined, color: AppColors.goldText, size: 32),
            const SizedBox(height: 12),
            Text(forViewer(viewerFemale, 'انتهى رصيدك', 'انتهى رصيدكِ'),
                style: theme.textTheme.titleLarge, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(line,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(color: AppColors.muted, height: 1.5)),
            const SizedBox(height: 20),
            FilledButton(
              key: const Key('recharge-sheet-buy'),
              onPressed: () => Navigator.of(context).pop(true),
              child: Text(forViewer(viewerFemale, 'اشحن رصيدك', 'اشحني رصيدك')),
            ),
            const SizedBox(height: 4),
            TextButton(
              key: const Key('recharge-sheet-cancel'),
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('إلغاء'),
            ),
          ],
        ),
      ),
    );
  }
}
