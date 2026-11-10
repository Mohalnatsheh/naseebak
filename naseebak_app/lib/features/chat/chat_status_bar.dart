import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// The one slim bar under the chat header (it replaces the stacked bars that took ~42% of a phone screen)
/// [expiry]: ending soon with «تمديد 7 أيام»; [expiryInfo]: ending soon, nothing to do about it
enum ChatBar { none, expiry, family, expiryInfo, push }

/// Where the family introduction stands, as the chat shows it (from `GET /api/matches/{id}/intro`)
enum FamilyStep { offer, pendingSent, pendingReceived, accepted }

/// The family step worth showing in the chat, like the website's bar: offered only while requests are on and nothing
/// closed the match; then the request's state. A declined request (final) or a closed match shows nothing.
FamilyStep? familyStepOf(String familyStatus, {required bool introRequests, String? closed}) {
  if (!introRequests || closed != null) return null;
  return switch (familyStatus) {
    'none' => FamilyStep.offer,
    'pending_sent' => FamilyStep.pendingSent,
    'pending_received' => FamilyStep.pendingReceived,
    'accepted' => FamilyStep.accepted,
    _ => null,
  };
}

/// Which bar, by priority (owner ruling, 2026-11-10):
/// 1. the chat ending soon, only when it can still be extended (the bar carries «تمديد 7 أيام»);
/// 2. a family step to act on (the offer, or a request received), which then also says the days left;
/// 3. the chat ending soon with no action (no extension left), above a family step with nothing to do;
/// 4. the push chip (until dismissed).
/// In the last days a non-extendable expiry no longer hides the only way forward: the family introduction.
/// Nothing in a chat that can't be written in.
ChatBar chatStatusBar({
  required bool open,
  required ({String text, bool urgent})? left,
  bool canExtend = false,
  FamilyStep? family,
  bool pushOff = false,
  bool pushDismissed = false,
}) {
  if (!open) return ChatBar.none;
  final urgent = left != null && left.urgent;
  if (urgent && canExtend) return ChatBar.expiry;
  if (family == FamilyStep.offer || family == FamilyStep.pendingReceived) return ChatBar.family;
  if (urgent) return ChatBar.expiryInfo;
  if (family != null) return ChatBar.family;
  if (pushOff && !pushDismissed) return ChatBar.push;
  return ChatBar.none;
}

/// The bar itself: an icon, one line, and at most one action (or ✕ for the push chip)
class ChatStatusStrip extends StatelessWidget {
  const ChatStatusStrip({
    super.key,
    required this.icon,
    required this.text,
    this.tone = AppColors.navy,
    this.actionLabel,
    this.onAction,
    this.onTap,
    this.onClose,
  });

  final IconData icon;
  final String text;
  final Color tone;
  final String? actionLabel;
  final VoidCallback? onAction;

  /// The whole line opens something (e.g. the match page)
  final VoidCallback? onTap;

  /// ✕ (the push chip)
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    final line = Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(14, 4, 6, 4),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 44),
        child: Row(
          children: [
            Icon(icon, size: 18, color: tone),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                text,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.label.copyWith(fontWeight: FontWeight.w600, color: tone),
              ),
            ),
            if (actionLabel != null && onAction != null)
              TextButton(
                onPressed: onAction,
                style: TextButton.styleFrom(
                  minimumSize: const Size(44, 40),
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  foregroundColor: AppColors.navy,
                  textStyle: AppText.label.copyWith(fontWeight: FontWeight.w700),
                ),
                child: Text(actionLabel!),
              ),
            if (onTap != null && onAction == null)
              const Padding(
                padding: EdgeInsetsDirectional.only(end: 8),
                // RTL: «التالي» points left
                child: Icon(Icons.chevron_left_rounded, size: 20, color: AppColors.muted),
              ),
            if (onClose != null)
              IconButton(
                tooltip: 'إخفاء',
                onPressed: onClose,
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.close_rounded, size: 18, color: AppColors.muted),
              ),
          ],
        ),
      ),
    );
    return Material(
      color: tone == AppColors.warning ? AppColors.warningBg : AppColors.gold.withValues(alpha: 0.10),
      child: InkWell(
        onTap: onTap,
        child: DecoratedBox(
          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.line))),
          child: line,
        ),
      ),
    );
  }
}
