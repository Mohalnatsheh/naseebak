import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/brand_kit.dart';
import '../../discovery/card_facts.dart';
import '../../discovery/suggestion_card.dart' show ScorePill;
import '../../discovery/suggestion_models.dart';
import '../../notifications/notifications_screen.dart' show openAppRoute;
import '../../pro/pro_badge.dart';
import 'home_block_header.dart';
import 'home_load_error_row.dart';

/// How many suggestions «اقتراحات اليوم» shows
const homeSuggestionsShown = 5;

/// How wide one card of «اقتراحات اليوم» is
const homeSuggestionCardWidth = 250.0;

/// Opens one card on the suggestions tab: switches to [tab] and asks its list to open that card's full profile
/// (`feedOpenRequest`), so «مهتم» / «لا», credits and the paywall run there exactly as from the list.
void openOnSuggestions(BuildContext context, FeedTab tab, String id) {
  final router = GoRouter.of(context);
  openAppRoute(router, '/suggestions?tab=${tab.apiName}');
  feedOpenRequest.ask(tab, id);
}

/// «اقتراحات اليوم» (spec 2026-11-14 item 4): the first [homeSuggestionsShown] cards of «جديدة», side by side.
/// Nothing while loading or empty; a failed load says so with a retry. A tap opens that person on the suggestions tab.
class HomeSuggestionsCarousel extends ConsumerWidget {
  const HomeSuggestionsCarousel({super.key, required this.items, required this.onRetry});

  /// `homeSuggestionsProvider`
  final AsyncValue<List<FeedItem>> items;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (items.hasError && !items.isLoading) {
      return Padding(
        padding: const EdgeInsets.only(bottom: AppSpace.xl),
        child: HomeLoadErrorRow(
          key: const Key('home-suggestions-error'),
          text: 'تعذّر تحميل الاقتراحات.',
          onRetry: onRetry,
        ),
      );
    }
    final shown = (items.valueOrNull ?? const <FeedItem>[]).take(homeSuggestionsShown).toList();
    if (shown.isEmpty) return const SizedBox.shrink();
    final me = ref.watch(authControllerProvider).me;
    final candidateFemale = !(me?.isFemale ?? false);
    final tribeLabel = me?.country.tribeWord ?? 'العائلة';
    final lebanon = me?.country.code == 'LB';
    return Padding(
      key: const Key('home-suggestions'),
      padding: const EdgeInsets.only(bottom: AppSpace.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          HomeBlockHeader(
            title: 'اقتراحات اليوم',
            onAll: () => openAppRoute(GoRouter.of(context), '/suggestions?tab=new'),
          ),
          // Five cards at most: a row in a horizontal scroll, all as tall as the tallest, so no text size can cut one
          SingleChildScrollView(
            key: const Key('home-suggestions-carousel'),
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var i = 0; i < shown.length; i++) ...[
                    if (i > 0) const SizedBox(width: AppSpace.md),
                    SizedBox(
                      width: homeSuggestionCardWidth,
                      child: HomeSuggestionCard(
                        item: shown[i],
                        candidateFemale: candidateFemale,
                        tribeLabel: tribeLabel,
                        lebanon: lebanon,
                        onOpen: () => openOnSuggestions(context, FeedTab.newTab, shown[i].id),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One suggestion on home: locked avatar, «الاسم، العمر», city and activity, the score, up to three facts, the reason
/// and «الملف كاملاً». Read-only: the whole card opens the full profile on the suggestions tab. Never a photo.
class HomeSuggestionCard extends StatelessWidget {
  const HomeSuggestionCard({
    super.key,
    required this.item,
    required this.candidateFemale,
    required this.onOpen,
    this.tribeLabel = 'العائلة',
    this.lebanon = false,
  });

  final FeedItem item;

  /// Gender of the person shown (opposite of the viewer)
  final bool candidateFemale;
  final VoidCallback onOpen;
  final String tribeLabel;
  final bool lebanon;

  @override
  Widget build(BuildContext context) {
    final c = item.candidate;
    final title = c.age != null ? '${c.firstName}، ${c.age}' : c.firstName;
    final facts = cardFacts(c, female: candidateFemale, tribeLabel: tribeLabel, lebanon: lebanon).take(3).toList();
    final reason = item.reason.trim();
    final score = item.compatibilityScore > 0
        ? ScorePill(key: Key('home-suggestion-score-${item.id}'), score: item.compatibilityScore)
        : null;
    // Large text: the score goes under the name, so the name keeps its room
    final large = MediaQuery.textScalerOf(context).scale(16) / 16 > 1.15;
    final who = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        NameWithBadge(
          isPro: item.isPro,
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppText.label.copyWith(color: AppColors.ink, fontWeight: FontWeight.w800),
          ),
        ),
        if (c.city != null || item.activity != null) _place(c.city, item.activity),
        if (large && score != null) ...[const SizedBox(height: AppSpace.xs), score],
      ],
    );
    return Semantics(
      button: true,
      label: 'الملف كاملاً: $title',
      excludeSemantics: true,
      onTap: onOpen,
      child: PressScale(
        child: Material(
          key: Key('home-suggestion-${item.id}'),
          color: AppColors.surface,
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.card),
            side: const BorderSide(color: AppColors.line, width: 0.5),
          ),
          child: InkWell(
            onTap: onOpen,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(AppSpace.md, AppSpace.md, AppSpace.md, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      MemberAvatar(name: c.firstName, size: 46, locked: true, pro: item.isPro),
                      const SizedBox(width: AppSpace.sm),
                      Expanded(child: who),
                      if (!large && score != null) ...[const SizedBox(width: AppSpace.xs), score],
                    ],
                  ),
                  if (facts.isNotEmpty) ...[
                    const SizedBox(height: AppSpace.sm),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final f in facts) _FactChip(key: Key('home-suggestion-fact-${f.key}'), text: f.value),
                      ],
                    ),
                  ],
                  if (reason.isNotEmpty) ...[
                    const SizedBox(height: AppSpace.sm),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: AppSpace.sm, vertical: 6),
                      decoration: BoxDecoration(
                        color: AppColors.goldSoft,
                        borderRadius: BorderRadius.circular(AppRadius.sm),
                      ),
                      child: Text(
                        reason,
                        key: Key('home-suggestion-reason-${item.id}'),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.caption.copyWith(color: AppColors.goldText),
                      ),
                    ),
                  ],
                  // Keeps «الملف كاملاً» at the bottom of every card in the row
                  const Spacer(),
                  const Divider(height: AppSpace.sm, thickness: 0.5, color: AppColors.line),
                  ConstrainedBox(
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
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// «المدينة · نشطة اليوم» on one line
  Widget _place(String? city, String? activity) {
    return Row(
      children: [
        if (city != null)
          Flexible(
            child: Text(
              city,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppText.caption.copyWith(color: AppColors.muted),
            ),
          ),
        if (activity != null) ...[
          if (city != null) const SizedBox(width: 6),
          Container(
            width: 6,
            height: 6,
            decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
          ),
          const SizedBox(width: AppSpace.xs),
          Flexible(
            child: Text(
              activity,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppText.caption.copyWith(color: AppColors.success),
            ),
          ),
        ],
      ],
    );
  }
}

/// One fact as a soft chip
class _FactChip extends StatelessWidget {
  const _FactChip({super.key, required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.sm, vertical: 2),
      decoration: BoxDecoration(color: AppColors.offWhite, borderRadius: BorderRadius.circular(AppRadius.md)),
      child: Text(
        text,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: AppText.caption.copyWith(color: AppColors.ink),
      ),
    );
  }
}
