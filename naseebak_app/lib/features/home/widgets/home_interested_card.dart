import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../discovery/suggestion_models.dart';
import '../../notifications/notifications_screen.dart' show openAppRoute;
import '../gendered_copy.dart';
import 'home_load_error_row.dart';
import 'home_block_header.dart';
import 'home_suggestion_card.dart' show openOnSuggestions;

/// How many people «مهتمون بك» shows on home
const homeInterestedCardsShown = 3;

/// «مهتمون بك» (spec 2026-11-14 item 5): up to three cards, each a hidden-photo tile with «مخفية», «الاسم، العمر»
/// and the city, plus «ردّك مجاني» while the free reply is on. Nothing while loading or empty; a failed load says so
/// with a retry. A tap opens that card on the suggestions tab «مهتمون بك».
class HomeInterestedCards extends StatelessWidget {
  const HomeInterestedCards({
    super.key,
    required this.items,
    required this.onRetry,
    required this.female,
    required this.freeReply,
  });

  /// `homeInterestedProvider`
  final AsyncValue<List<FeedItem>> items;
  final VoidCallback onRetry;

  /// The viewer is a woman (gendered copy)
  final bool female;

  /// `counts.flags.freeInterestReply`
  final bool freeReply;

  @override
  Widget build(BuildContext context) {
    if (items.hasError && !items.isLoading) {
      return Padding(
        padding: const EdgeInsets.only(bottom: AppSpace.xl),
        child: HomeLoadErrorRow(
          key: const Key('home-interested-error'),
          text: 'تعذّر تحميل من اهتم بك.',
          onRetry: onRetry,
        ),
      );
    }
    final people = (items.valueOrNull ?? const <FeedItem>[]).take(homeInterestedCardsShown).toList();
    if (people.isEmpty) return const SizedBox.shrink();
    return Padding(
      key: const Key('home-interested-cards'),
      padding: const EdgeInsets.only(bottom: AppSpace.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          HomeBlockHeader(
            title: forViewer(female, 'مهتمون بك', 'مهتمون بكِ'),
            onAll: () => openAppRoute(GoRouter.of(context), '/suggestions?tab=interested'),
          ),
          // Three columns whatever the count, all as tall as the tallest
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < homeInterestedCardsShown; i++) ...[
                  if (i > 0) const SizedBox(width: AppSpace.sm),
                  Expanded(
                    child: i < people.length
                        ? HomeInterestedCard(
                            item: people[i],
                            freeReplyLabel: freeReply ? forViewer(female, 'ردّك مجاني', 'ردّكِ مجاني') : null,
                            onOpen: () => openOnSuggestions(context, FeedTab.interested, people[i].id),
                          )
                        : const SizedBox(),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// One person who said «مهتم»: a neutral tile in place of the photo (never a photo, nor an image of any kind, before
/// a match) tagged «مخفية», then «الاسم، العمر», the city and the free-reply tag
class HomeInterestedCard extends StatelessWidget {
  const HomeInterestedCard({super.key, required this.item, required this.onOpen, this.freeReplyLabel});
  final FeedItem item;
  final VoidCallback onOpen;

  /// «ردّك مجاني» (free_interest_reply on); null hides it
  final String? freeReplyLabel;

  @override
  Widget build(BuildContext context) {
    final p = item.candidate;
    final title = p.age != null ? '${p.firstName}، ${p.age}' : p.firstName;
    return Semantics(
      button: true,
      label: [title, ?p.city, ?freeReplyLabel].join('، '),
      excludeSemantics: true,
      onTap: onOpen,
      child: Material(
        key: Key('home-interested-card-${item.id}'),
        color: AppColors.surface,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.card),
          side: const BorderSide(color: AppColors.line, width: 0.5),
        ),
        child: InkWell(
          onTap: onOpen,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const _HiddenPhotoTile(),
              Padding(
                padding: const EdgeInsets.fromLTRB(AppSpace.xs, AppSpace.sm, AppSpace.xs, AppSpace.sm),
                child: Column(
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                      style: AppText.label.copyWith(color: AppColors.ink),
                    ),
                    if (p.city != null)
                      Text(
                        p.city!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: AppText.caption.copyWith(color: AppColors.muted),
                      ),
                    if (freeReplyLabel != null) ...[
                      const SizedBox(height: AppSpace.xs),
                      Container(
                        key: Key('home-interested-free-${item.id}'),
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                        decoration: BoxDecoration(
                          color: AppColors.successBg,
                          borderRadius: BorderRadius.circular(AppRadius.sm),
                        ),
                        child: Text(
                          freeReplyLabel!,
                          textAlign: TextAlign.center,
                          style: AppText.caption.copyWith(color: AppColors.success, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The photo's place: a blurred neutral wash (two soft shapes under a blur) with a lock, tagged «مخفية». Drawn in
/// code from tokens; no image at all.
class _HiddenPhotoTile extends StatelessWidget {
  const _HiddenPhotoTile();

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('home-interested-hidden-tile'),
      height: 88,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: AlignmentDirectional.topStart,
          end: AlignmentDirectional.bottomEnd,
          colors: [AppColors.line, AppColors.muted.withValues(alpha: 0.45)],
        ),
      ),
      child: Stack(
        children: [
          Positioned.fill(
            child: ImageFiltered(
              imageFilter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
              child: Stack(
                children: [
                  PositionedDirectional(top: 14, start: 18, child: _blob(36, AppColors.offWhite)),
                  PositionedDirectional(
                    bottom: -10,
                    end: 10,
                    child: _blob(56, AppColors.muted.withValues(alpha: 0.35)),
                  ),
                ],
              ),
            ),
          ),
          Center(child: Icon(Icons.lock_outline_rounded, color: AppColors.surface.withValues(alpha: 0.9))),
          PositionedDirectional(
            bottom: 6,
            end: 6,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: AppColors.ink.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(AppRadius.sm),
              ),
              child: Text('مخفية', style: AppText.caption.copyWith(color: AppColors.surface)),
            ),
          ),
        ],
      ),
    );
  }

  static Widget _blob(double size, Color color) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(color: color, shape: BoxShape.circle),
  );
}
