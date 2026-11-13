import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_theme.dart';
import '../../shared/widgets/brand_kit.dart';
import '../../shared/widgets/person_details_view.dart';
import '../pro/pro_badge.dart';
import 'suggestion_models.dart';

/// The answer a member gave from the full profile; the caller runs its own «مهتم» / «لا» handler.
enum ProfileAnswer { interested, declined }

/// The whole profile of a suggested person, one scroll, answers pinned at the bottom. Never a photo.
/// Open with `Navigator.of(context).push<ProfileAnswer>(MaterialPageRoute(...))`; it pops the answer.
class CandidateProfileScreen extends StatelessWidget {
  const CandidateProfileScreen({
    super.key,
    required this.item,
    required this.tab,
    required this.candidateFemale,
    required this.tribeLabel,
    required this.answerNote,
    required this.interestEnabled,
    this.interestLabel = 'مهتم',
    this.declineLabel = 'لا',
    this.onReport,
    this.onBlock,
  });

  final FeedItem item;
  final FeedTab tab;
  final bool candidateFemale;
  final String tribeLabel;

  /// The same credit / free-reply / waiting line the card shows above the answers
  final Widget answerNote;

  /// False at 0 credits with the lock: «مهتم» is greyed, «لا» stays free
  final bool interestEnabled;
  final String interestLabel;
  final String declineLabel;
  final VoidCallback? onReport;
  final VoidCallback? onBlock;

  @override
  Widget build(BuildContext context) {
    final c = item.candidate;
    final actionable = item.actionableIn(tab);
    final subtitle = [if (c.age != null) '${c.age} سنة', if (c.city != null) c.city!].join(' · ');
    final menu = onReport != null || onBlock != null;
    final ring = item.compatibilityScore > 0 ? ScoreRing(score: item.compatibilityScore, size: 56) : null;
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        leading: IconButton(
          key: const Key('profile-back'),
          tooltip: 'الاقتراحات',
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        actions: [
          if (menu)
            PopupMenuButton<String>(
              key: Key('profile-menu-${item.id}'),
              tooltip: 'خيارات إضافية: ${c.firstName}',
              icon: const Icon(Icons.more_vert_rounded, color: AppColors.muted),
              onSelected: (v) {
                // Close the profile first so the existing dialogs show over the list
                final cb = v == 'block' ? onBlock : onReport;
                Navigator.of(context).pop();
                cb?.call();
              },
              itemBuilder: (_) => [
                if (onReport != null) const PopupMenuItem(value: 'report', child: Text('إبلاغ وحظر')),
                if (onBlock != null) const PopupMenuItem(value: 'block', child: Text('حظر')),
              ],
            ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(AppSpace.lg, AppSpace.sm, AppSpace.lg, AppSpace.xl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                MemberAvatar(name: c.firstName, size: 72, locked: true),
                const SizedBox(width: AppSpace.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      NameWithBadge(
                        isPro: item.isPro,
                        child: Text(c.firstName, style: AppText.title.copyWith(color: AppColors.ink)),
                      ),
                      if (subtitle.isNotEmpty) Text(subtitle, style: AppText.labelRegular.copyWith(color: AppColors.muted)),
                      if (item.activity != null && !item.declined)
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
                            ),
                            const SizedBox(width: 6),
                            Flexible(child: Text(item.activity!, style: AppText.caption.copyWith(color: AppColors.success))),
                          ],
                        ),
                    ],
                  ),
                ),
                if (ring != null) ...[const SizedBox(width: AppSpace.sm), ring],
              ],
            ),
            const SizedBox(height: AppSpace.md),
            Row(
              children: [
                const Icon(Icons.lock_outline_rounded, size: 15, color: AppColors.muted),
                const SizedBox(width: 6),
                Expanded(
                  child: Text('الصور تظهر بعد التوافق المتبادل فقط', style: AppText.caption.copyWith(color: AppColors.muted)),
                ),
              ],
            ),
            if (item.reason.isNotEmpty) ...[
              const SizedBox(height: AppSpace.md),
              Container(
                key: Key('profile-why-${item.id}'),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(color: AppColors.goldSoft, borderRadius: BorderRadius.circular(AppRadius.md)),
                child: Text(item.reason, style: AppText.labelRegular.copyWith(color: AppColors.goldText)),
              ),
            ],
            const SizedBox(height: AppSpace.lg),
            PersonDetailsView(person: c, female: candidateFemale, tribeLabel: tribeLabel, alwaysExpanded: true),
          ],
        ),
      ),
      bottomNavigationBar: !actionable && tab != FeedTab.waiting && !item.declined
          ? null
          : Material(
              color: AppColors.surface,
              elevation: 8,
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(AppSpace.lg, AppSpace.md, AppSpace.lg, AppSpace.md),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      answerNote,
                      if (actionable && tab != FeedTab.waiting) ...[
                        const SizedBox(height: AppSpace.sm),
                        Row(
                          children: [
                            Expanded(
                              flex: 2,
                              child: FilledButton.icon(
                                key: Key('profile-interested-${item.id}'),
                                style: FilledButton.styleFrom(minimumSize: const Size(0, 52)),
                                onPressed: interestEnabled
                                    ? () {
                                        HapticFeedback.lightImpact();
                                        Navigator.of(context).pop(ProfileAnswer.interested);
                                      }
                                    : null,
                                icon: const Icon(Icons.favorite_rounded, size: 20),
                                label: Text(interestLabel),
                              ),
                            ),
                            const SizedBox(width: AppSpace.sm),
                            Expanded(
                              child: OutlinedButton(
                                key: Key('profile-decline-${item.id}'),
                                style: OutlinedButton.styleFrom(foregroundColor: AppColors.ink, minimumSize: const Size(0, 52)),
                                onPressed: () => Navigator.of(context).pop(ProfileAnswer.declined),
                                child: Text(declineLabel),
                              ),
                            ),
                          ],
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
