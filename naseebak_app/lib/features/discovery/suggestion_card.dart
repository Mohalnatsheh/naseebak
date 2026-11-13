import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/localization/digits.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/brand_kit.dart';
import '../../shared/widgets/common.dart';
import '../pro/pro_badge.dart';
import 'card_facts.dart';
import 'suggestion_models.dart';

/// A short suggestion card: header, the status line, up to eight key facts, «عنها» / «عنه» and «الملف كاملاً», then the
/// answers. The card (outside the answers and ⋮) opens the full profile. Never a photo.
class SuggestionCard extends StatelessWidget {
  const SuggestionCard({
    super.key,
    required this.item,
    required this.tab,
    required this.candidateFemale,
    required this.onInterested,
    required this.onDecline,
    required this.onOpen,
    this.busy = false,
    this.tribeLabel = 'العائلة',
    this.lebanon = false,
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

  /// Opens the full profile (a tap on the card or «الملف كاملاً»)
  final VoidCallback onOpen;

  /// An answer is in flight: both buttons are disabled
  final bool busy;
  final String tribeLabel;

  /// The viewer is in Lebanon: «المذهب» takes the tribe fact's place
  final bool lebanon;

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
    final actionable = item.actionableIn(tab);
    final all = cardFacts(c, female: candidateFemale, tribeLabel: tribeLabel, lebanon: lebanon);
    // A short phone (360x640): the first four facts and no «عنها», so «مهتم» and «لا» stay on the first screen;
    // the rest is in the full profile
    final short = MediaQuery.sizeOf(context).height < 700;
    final facts = short ? all.take(4).toList() : all;
    final menu = onBlock != null || onReport != null;
    final status = suggestionStatus(item, tab, candidateFemale: candidateFemale);
    final about = short ? '' : c.aboutMe?.trim() ?? '';
    final gap = short ? AppSpace.sm : AppSpace.md;
    return PressScale(
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            InkWell(
              key: Key('card-open-${item.id}'),
              onTap: onOpen,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(AppSpace.lg, AppSpace.lg, AppSpace.lg, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // No answers here (sent, waiting): ⋮ sits in the header's top corner, not alone under the card
                    _header(context, menu: menu && !actionable),
                    if (status != null) ...[
                      SizedBox(height: gap),
                      Align(alignment: AlignmentDirectional.centerStart, child: status),
                    ],
                    if (facts.isNotEmpty) ...[
                      SizedBox(height: gap),
                      _FactsGrid(facts: facts, itemId: item.id, compact: short),
                    ],
                    if (about.isNotEmpty) ...[
                      const SizedBox(height: AppSpace.md),
                      Text(candidateFemale ? 'عنها' : 'عنه', style: AppText.caption.copyWith(color: AppColors.muted)),
                      Text(
                        about,
                        key: Key('card-about-${item.id}'),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.labelRegular.copyWith(color: AppColors.ink),
                      ),
                    ],
                    // «الملف كاملاً ‹»: the explicit way in (the whole area above opens it too)
                    Semantics(
                      button: true,
                      label: 'الملف كاملاً: ${c.firstName}',
                      excludeSemantics: true,
                      onTap: onOpen,
                      child: ConstrainedBox(
                        key: Key('card-full-${item.id}'),
                        constraints: const BoxConstraints(minHeight: 44),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text('الملف كاملاً', style: AppText.label.copyWith(color: AppColors.navy)),
                            ),
                            const Icon(Icons.chevron_right_rounded, color: AppColors.navy),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpace.lg, 0, AppSpace.lg, AppSpace.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (actionable) ...[
                    if (creditNote != null) ...[
                      Text(creditNote!, style: AppText.caption.copyWith(color: AppColors.muted)),
                      const SizedBox(height: AppSpace.sm),
                    ],
                    Row(
                      children: [
                        // «مهتم»: navy and wide; «لا»: neutral (red is for errors only); ⋮ 44
                        Expanded(
                          flex: 2,
                          child: FilledButton.icon(
                            key: Key('interested-${item.id}'),
                            style: FilledButton.styleFrom(minimumSize: const Size(0, 48)),
                            onPressed: busy || interestDisabled
                                ? null
                                : () {
                                    HapticFeedback.lightImpact();
                                    onInterested();
                                  },
                            icon: busy
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : const Icon(Icons.favorite_rounded, size: 20),
                            label: Text(item.interestLabel),
                          ),
                        ),
                        const SizedBox(width: AppSpace.sm),
                        Expanded(
                          child: OutlinedButton(
                            key: Key('decline-${item.id}'),
                            style: OutlinedButton.styleFrom(foregroundColor: AppColors.ink, minimumSize: const Size(0, 48)),
                            onPressed: busy ? null : onDecline,
                            child: Text(item.declineLabel),
                          ),
                        ),
                        if (menu) _menu(c.firstName),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Avatar (locked), «الاسم، العمر», «المدينة · نشطة اليوم» and the score pill; on a narrow phone with large text
  /// the pill moves under the name so the name never breaks mid-word (QA A2-M5)
  Widget _header(BuildContext context, {bool menu = false}) {
    final c = item.candidate;
    final title = c.age != null ? '${c.firstName}، ${c.age}' : c.firstName;
    return LayoutBuilder(builder: (context, box) {
      final narrow = box.maxWidth < 280 || MediaQuery.textScalerOf(context).scale(16) / 16 > 1.25 && box.maxWidth < 360;
      final score = item.compatibilityScore > 0
          ? ScorePill(key: Key('card-score-${item.id}'), score: item.compatibilityScore)
          : null;
      final who = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          NameWithBadge(
            isPro: item.isPro,
            child: Text(
              title,
              key: Key('card-name-${item.id}'),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: AppText.headline.copyWith(color: AppColors.ink),
            ),
          ),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: AppSpace.sm,
            children: [
              if (c.city != null) Text(c.city!, style: AppText.labelRegular.copyWith(color: AppColors.muted)),
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
        ],
      );
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          MemberAvatar(name: c.firstName, size: 56, locked: true),
          const SizedBox(width: AppSpace.md),
          Expanded(
            child: narrow && score != null
                ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [who, const SizedBox(height: 6), score])
                : who,
          ),
          if (!narrow && score != null) ...[const SizedBox(width: AppSpace.sm), score],
          if (menu) _menu(c.firstName),
        ],
      );
    });
  }

  Widget _menu(String name) => SizedBox(
        width: 44,
        height: 48,
        child: PopupMenuButton<String>(
          key: Key('card-menu-${item.id}'),
          tooltip: 'خيارات إضافية: $name',
          padding: EdgeInsets.zero,
          icon: const Icon(Icons.more_vert_rounded, color: AppColors.muted),
          onSelected: (v) => v == 'block' ? onBlock?.call() : onReport?.call(),
          itemBuilder: (_) => [
            if (onReport != null) const PopupMenuItem(value: 'report', child: Text('إبلاغ وحظر')),
            if (onBlock != null) const PopupMenuItem(value: 'block', child: Text('حظر')),
          ],
        ),
      );
}

/// The compatibility score as a small gold pill «توافق 86%» (accent-ink on accent-soft), on the card and the profile
class ScorePill extends StatelessWidget {
  const ScorePill({super.key, required this.score});
  final double score;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: AppColors.goldSoft, borderRadius: BorderRadius.circular(AppRadius.sm)),
        child: Text(
          'توافق ${score.round()}%',
          style: AppText.caption.copyWith(color: AppColors.goldText, fontWeight: FontWeight.w700),
        ),
      );
}

/// The status line of a suggestion (liked you / no match / waiting until / available until), the same on the card and
/// on top of the full profile's answer block. Null when there is none.
Widget? suggestionStatus(FeedItem item, FeedTab tab, {required bool candidateFemale}) {
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

/// The facts as soft tiles, two per row
class _FactsGrid extends StatelessWidget {
  const _FactsGrid({required this.facts, required this.itemId, this.compact = false});
  final List<CardFact> facts;
  final String itemId;

  /// A short phone: label and value on one line, so the answers stay on the first screen
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, box) {
      final tile = (box.maxWidth - AppSpace.sm) / 2;
      return Wrap(
        spacing: AppSpace.sm,
        runSpacing: AppSpace.sm,
        children: [
          for (final f in facts)
            Container(
              key: Key('card-fact-$itemId-${f.key}'),
              width: tile,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.navy.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(AppRadius.sm),
              ),
              child: compact
                  ? Text.rich(
                      TextSpan(children: [
                        TextSpan(text: '${f.label} ', style: AppText.caption.copyWith(color: AppColors.muted)),
                        TextSpan(text: f.value, style: AppText.label.copyWith(color: AppColors.ink)),
                      ]),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(f.label, maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: AppText.caption.copyWith(color: AppColors.muted)),
                        Text(f.value, maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: AppText.label.copyWith(color: AppColors.ink)),
                      ],
                    ),
            ),
        ],
      );
    });
  }
}
