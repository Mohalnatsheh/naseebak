import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/localization/digits.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/person.dart';
import '../../shared/widgets/brand_kit.dart';
import '../../shared/widgets/common.dart';
import '../../shared/widgets/person_details_view.dart';
import '../pro/pro_badge.dart';
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

  /// Up to three key facts as chips (design review P1-4): education, marital status, religiosity
  List<String> _chips() {
    final c = item.candidate;
    String d(String field, String? v) => v == null || v.isEmpty ? '' : OptionLabels.describe(field, v, female: candidateFemale);
    return [
      if (c.education != null) c.education!,
      d('maritalStatus', c.maritalStatus),
      d('religiosity', c.religiosity),
    ].where((e) => e.isNotEmpty).take(3).toList();
  }

  @override
  Widget build(BuildContext context) {
    final c = item.candidate;
    final actionable = item.actionableIn(tab);
    final subtitle = [if (c.age != null) '${c.age} سنة', if (c.city != null) c.city!].join(' · ');
    // A short phone (360x640): «مهتم» and «لا» stay on the first screen; the chips and the full "why" wait in the
    // details, which open below the answers
    final fold = actionable && MediaQuery.sizeOf(context).height < 700;
    final chips = fold ? const <String>[] : _chips();
    final menu = onBlock != null || onReport != null;
    final details = _Details(
      key: Key('card-details-${item.id}'),
      child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    PersonDetailsView(person: c, female: candidateFemale, tribeLabel: tribeLabel),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        const Icon(Icons.lock_outline_rounded, size: 15, color: AppColors.muted),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text('الصور تظهر بعد التوافق المتبادل فقط',
                              style: AppText.caption.copyWith(color: AppColors.muted)),
                        ),
                      ],
                    ),
                  ],
                ),
              );
    return PressScale(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Avatar, name, «28 سنة · عمّان», activity, and the score ring; on a narrow phone with large text the
              // ring moves under the name so the name never breaks mid-word (QA A2-M5)
              LayoutBuilder(builder: (context, box) {
                final narrow = box.maxWidth < 300 || MediaQuery.textScalerOf(context).scale(16) / 16 > 1.25 && box.maxWidth < 360;
                final ring = item.compatibilityScore > 0 ? ScoreRing(score: item.compatibilityScore, size: 56) : null;
                final who = Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    NameWithBadge(
                      isPro: item.isPro,
                      child: Text(
                        c.firstName,
                        key: Key('card-name-${item.id}'),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.title.copyWith(color: AppColors.ink),
                      ),
                    ),
                    if (subtitle.isNotEmpty)
                      Text(subtitle, style: AppText.labelRegular.copyWith(color: AppColors.muted)),
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
                );
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    MemberAvatar(name: c.firstName, size: 48, locked: true),
                    const SizedBox(width: AppSpace.md),
                    Expanded(
                      child: narrow && ring != null
                          ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [who, const SizedBox(height: 8), ring])
                          : who,
                    ),
                    if (!narrow && ring != null) ...[const SizedBox(width: AppSpace.sm), ring],
                  ],
                );
              }),
              if (_status() != null) ...[
                const SizedBox(height: AppSpace.md),
                Align(alignment: AlignmentDirectional.centerStart, child: _status()!),
              ],
              if (chips.isNotEmpty) ...[
                const SizedBox(height: AppSpace.md),
                Wrap(
                  spacing: AppSpace.sm,
                  runSpacing: AppSpace.sm,
                  children: [
                    for (final t in chips)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                        decoration: BoxDecoration(
                          border: Border.all(color: AppColors.line),
                          borderRadius: BorderRadius.circular(AppRadius.full),
                        ),
                        child: Text(t, style: AppText.label.copyWith(color: AppColors.ink)),
                      ),
                  ],
                ),
              ],
              if (item.reason.isNotEmpty) ...[
                const SizedBox(height: AppSpace.md),
                // The one "why" line: soft gold with dark-gold text (accent-ink, never gold text on white)
                Container(
                  key: Key('card-why-${item.id}'),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(color: AppColors.goldSoft, borderRadius: BorderRadius.circular(AppRadius.md)),
                  child: Text(
                    item.reason,
                    maxLines: fold ? 2 : null,
                    overflow: fold ? TextOverflow.ellipsis : null,
                    style: AppText.labelRegular.copyWith(color: AppColors.goldText),
                  ),
                ),
              ],
              const SizedBox(height: AppSpace.sm),
              // The rest of the details, folded behind one tap
              if (!fold) details,
              if (actionable) ...[
                const SizedBox(height: AppSpace.sm),
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
                                width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Icon(Icons.favorite_rounded, size: 20),
                        label: Text(item.kind == FeedKind.legacyInterest ? 'قبول' : 'مهتم'),
                      ),
                    ),
                    const SizedBox(width: AppSpace.sm),
                    Expanded(
                      child: OutlinedButton(
                        key: Key('decline-${item.id}'),
                        style: OutlinedButton.styleFrom(foregroundColor: AppColors.ink, minimumSize: const Size(0, 48)),
                        onPressed: busy ? null : onDecline,
                        child: Text(item.kind == FeedKind.legacyInterest ? 'اعتذار' : 'لا'),
                      ),
                    ),
                    if (menu) _menu(c.firstName),
                  ],
                ),
              ] else if (menu)
                Align(alignment: AlignmentDirectional.centerEnd, child: _menu(c.firstName)),
              if (fold) details,
            ],
          ),
        ),
      ),
    );
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

class _Details extends StatefulWidget {
  const _Details({super.key, required this.child});
  final Widget child;

  @override
  State<_Details> createState() => _DetailsState();
}

class _DetailsState extends State<_Details> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton.icon(
            key: Key(_open ? 'card-details-close' : 'card-details-open'),
            style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
            onPressed: () => setState(() => _open = !_open),
            icon: Icon(_open ? Icons.expand_less_rounded : Icons.expand_more_rounded),
            label: Text(_open ? 'إخفاء التفاصيل' : 'عرض جميع التفاصيل'),
          ),
        ),
        AnimatedSize(
          duration: AppMotion.of(context, AppMotion.appear),
          curve: AppMotion.curve,
          alignment: AlignmentDirectional.topStart,
          child: _open ? widget.child : const SizedBox(width: double.infinity),
        ),
      ],
    );
  }
}
