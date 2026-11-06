import 'package:flutter/material.dart';

import '../../core/localization/digits.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../../shared/widgets/person_details_view.dart';
import 'suggestion_models.dart';

/// A suggestion card: first name, age, compatibility, reason, details. Never a photo.
class SuggestionCard extends StatelessWidget {
  const SuggestionCard({
    super.key,
    required this.item,
    required this.tab,
    required this.candidateFemale,
    required this.onInterested,
    required this.onDecline,
    this.busy = false,
    this.tribeLabel = 'العائلة',
    this.interestDisabled = false,
    this.creditNote,
    this.onBlock,
    this.onReport,
  });

  final FeedItem item;
  final FeedTab tab;

  /// Gender of the person shown (opposite of the viewer)
  final bool candidateFemale;
  final VoidCallback onInterested;
  final VoidCallback onDecline;

  /// An answer is in flight: both buttons are disabled
  final bool busy;
  final String tribeLabel;

  /// 0 credits with credit on interest: «مهتم» waits for a recharge, «لا» stays free
  final bool interestDisabled;

  /// A line above the answers («مهتم» يستخدم رصيداً واحداً)
  final String? creditNote;

  /// «حظر» / «إبلاغ وحظر» in the card's menu (no menu when both are null)
  final VoidCallback? onBlock;
  final VoidCallback? onReport;

  @override
  Widget build(BuildContext context) {
    final c = item.candidate;
    final theme = Theme.of(context);
    final actionable = item.actionableIn(tab);
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(color: AppColors.navy.withValues(alpha: 0.07), shape: BoxShape.circle),
                  alignment: Alignment.center,
                  child: Text(
                    c.firstName.isEmpty ? '؟' : c.firstName.characters.first,
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: AppColors.navy),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        c.age != null ? '${c.firstName}، ${c.age} سنة' : c.firstName,
                        style: theme.textTheme.titleMedium,
                      ),
                      if (c.city != null)
                        Text(c.city!, style: const TextStyle(color: AppColors.muted, fontSize: 14)),
                      if (item.activity != null && !item.declined) ...[
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            Container(
                              width: 7,
                              height: 7,
                              decoration: const BoxDecoration(color: Color(0xFF10B981), shape: BoxShape.circle),
                            ),
                            const SizedBox(width: 5),
                            Text(item.activity!, style: const TextStyle(color: Color(0xFF047857), fontSize: 12)),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
                if (item.compatibilityScore > 0) ScoreRing(score: item.compatibilityScore, size: 52),
                if (onBlock != null || onReport != null)
                  PopupMenuButton<String>(
                    key: Key('card-menu-${item.id}'),
                    tooltip: 'خيارات إضافية: ${c.firstName}',
                    onSelected: (v) => v == 'block' ? onBlock?.call() : onReport?.call(),
                    itemBuilder: (_) => [
                      if (onReport != null) const PopupMenuItem(value: 'report', child: Text('إبلاغ وحظر')),
                      if (onBlock != null) const PopupMenuItem(value: 'block', child: Text('حظر')),
                    ],
                  ),
              ],
            ),
            if (_status() != null) ...[
              const SizedBox(height: 12),
              Align(alignment: AlignmentDirectional.centerStart, child: _status()!),
            ],
            if (item.reason.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.gold.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.auto_awesome_outlined, size: 18, color: AppColors.gold),
                    const SizedBox(width: 8),
                    Expanded(child: Text(item.reason, style: const TextStyle(fontSize: 14, height: 1.55))),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 10),
            PersonDetailsView(person: c, female: candidateFemale, tribeLabel: tribeLabel),
            const SizedBox(height: 6),
            const Row(
              children: [
                Icon(Icons.lock_outline_rounded, size: 15, color: AppColors.muted),
                SizedBox(width: 6),
                Expanded(
                  child: Text('الصور تظهر بعد التوافق المتبادل فقط',
                      style: TextStyle(color: AppColors.muted, fontSize: 12.5)),
                ),
              ],
            ),
            if (actionable) ...[
              const SizedBox(height: 14),
              if (creditNote != null) ...[
                Text(creditNote!, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                const SizedBox(height: 8),
              ],
              Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: FilledButton.icon(
                      key: Key('interested-${item.id}'),
                      onPressed: busy || interestDisabled ? null : onInterested,
                      icon: busy
                          ? const SizedBox(
                              width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Icon(Icons.favorite_rounded, size: 20),
                      label: Text(item.kind == FeedKind.legacyInterest ? 'قبول' : 'مهتم'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: OutlinedButton(
                      key: Key('decline-${item.id}'),
                      onPressed: busy ? null : onDecline,
                      child: Text(item.kind == FeedKind.legacyInterest ? 'اعتذار' : 'لا'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget? _status() {
    if (item.declined) {
      return const Pill(text: 'لم يحصل توافق', color: AppColors.muted, icon: Icons.do_not_disturb_on_outlined);
    }
    if (item.likedYou) {
      return Pill(
        text: candidateFemale ? 'أبدت اهتمامها بك' : 'أبدى اهتمامه بك',
        color: AppColors.success,
        icon: Icons.favorite_border_rounded,
      );
    }
    if (tab == FeedTab.waiting || item.kind == FeedKind.legacySent) {
      final until = item.expiresAt;
      return Pill(
        text: until != null ? 'بانتظار الطرف الآخر · حتى ${formatDate(until, withYear: false)}' : 'بانتظار الطرف الآخر',
        color: AppColors.warning,
        icon: Icons.hourglass_top_rounded,
      );
    }
    if (item.expiresAt != null) {
      return Pill(
        text: 'متاح حتى ${formatDate(item.expiresAt!, withYear: false)}',
        color: AppColors.navy,
        icon: Icons.schedule_rounded,
      );
    }
    return null;
  }
}
