import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../shared/widgets/brand_kit.dart';
import '../../shared/widgets/common.dart';
import '../pro/pro_badge.dart';
import 'chat_format.dart';
import 'chat_models.dart';

/// What the ⋮ menu can do, in the order it is drawn
enum ChatMenuAction { match, extend, clear, report, end }

/// The entries of the ⋮ menu, always in the order match, extend, clear, report, end (the destructive ones last)
List<ChatMenuAction> chatMenuActions({
  required bool canOpenMatch,
  required bool canExtend,
  required bool canSend,
  required DeleteMode deleteMode,
}) => [
  if (canOpenMatch) ChatMenuAction.match,
  if (canExtend) ChatMenuAction.extend,
  if (deleteMode != DeleteMode.hidden) ChatMenuAction.clear,
  ChatMenuAction.report,
  if (canSend) ChatMenuAction.end,
];

/// The WhatsApp-style top bar: back, the avatar with the gold time arc, the name with its marks and a subtitle
/// ([status]: typing or the activity label), then one ⋮ menu: the days left (a label), «صفحة التوافق», «تمديد 7 أيام»,
/// «مسح المحادثة», and the destructive «إبلاغ» and «إنهاء المحادثة» in red.
class WaChatHeader extends StatelessWidget implements PreferredSizeWidget {
  const WaChatHeader({
    super.key,
    required this.chat,
    required this.status,
    required this.left,
    required this.deleteMode,
    required this.onOpenMatch,
    required this.onMenu,
    this.onBack,
    this.textScale = 1,
  });

  /// The toolbar's back arrow (shown only where the route can pop): leaves the chat even with the emoji panel open.
  /// Null keeps the default back button (the system back's order).
  final VoidCallback? onBack;

  final ChatSummary? chat;
  final Widget? status;
  final ({String text, bool urgent})? left;
  final DeleteMode deleteMode;

  /// Null when the match page isn't reachable (a hidden match)
  final VoidCallback? onOpenMatch;
  final ValueChanged<ChatMenuAction> onMenu;

  /// Larger system text: the bar grows with it, so the status line isn't cut under the name
  final double textScale;

  @override
  Size get preferredSize => Size.fromHeight(kToolbarHeight * (textScale < 1 ? 1 : textScale));

  @override
  Widget build(BuildContext context) {
    final chat = this.chat;
    final left = this.left;
    final actions = chat == null
        ? const <ChatMenuAction>[]
        : chatMenuActions(
            canOpenMatch: !chat.matchHidden,
            canExtend: chat.canExtend,
            canSend: chat.canSend,
            deleteMode: deleteMode,
          );
    return AppBar(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: const Border(bottom: BorderSide(color: AppColors.line)),
      titleSpacing: 0,
      toolbarHeight: preferredSize.height,
      leading: onBack != null && (ModalRoute.of(context)?.canPop ?? false)
          ? BackButton(key: const Key('chat-back'), onPressed: onBack)
          : null,
      title: Row(
        children: [
          // One avatar with the chat's time as a gold arc around it; the days are said on a tap and to screen readers
          Semantics(
            label: left?.text,
            button: left != null,
            child: GestureDetector(
              key: const Key('chat-time-arc'),
              onTap: left == null ? null : () => showSnack(context, left.text),
              child: MemberAvatar(
                name: chat?.partnerName ?? '',
                size: 42,
                timeLeft: chat?.status == 'ACTIVE' ? chatTimeFraction(chat?.expiresAt) : null,
              ),
            ),
          ),
          Expanded(
            child: InkWell(
              key: const Key('chat-header'),
              borderRadius: BorderRadius.circular(AppRadius.md),
              // The match page: the family introduction, the photos, ending the match
              onTap: onOpenMatch,
              child: Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(10, 4, 4, 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Flexible(
                          child: NameWithBadge(
                            isPro: chat?.partnerIsPro ?? false,
                            child: Text(chat?.partnerName ?? 'المحادثة', maxLines: 1, overflow: TextOverflow.ellipsis),
                          ),
                        ),
                        if (chat != null)
                          const Padding(padding: EdgeInsetsDirectional.only(start: 6), child: SealMark(size: 16)),
                      ],
                    ),
                    ?status,
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      actions: [
        if (chat != null)
          PopupMenuButton<ChatMenuAction>(
            tooltip: 'خيارات',
            onSelected: onMenu,
            itemBuilder: (_) => [
              if (left != null)
                PopupMenuItem<ChatMenuAction>(
                  key: const Key('chat-menu-days'),
                  enabled: false,
                  child: Text(left.text),
                ),
              for (final a in actions) _item(a),
            ],
          ),
      ],
    );
  }

  PopupMenuItem<ChatMenuAction> _item(ChatMenuAction a) {
    const red = TextStyle(color: AppColors.danger);
    return switch (a) {
      ChatMenuAction.match => const PopupMenuItem(value: ChatMenuAction.match, child: Text('صفحة التوافق')),
      ChatMenuAction.extend => const PopupMenuItem(value: ChatMenuAction.extend, child: Text('تمديد 7 أيام')),
      // Pro chat delete (a closed chat too: «مسح لديّ» works there)
      ChatMenuAction.clear => PopupMenuItem(
        key: const Key('chat-clear'),
        value: ChatMenuAction.clear,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('مسح المحادثة'),
            if (deleteMode == DeleteMode.upsell) ...[
              const SizedBox(width: 8),
              const Icon(Icons.lock_rounded, size: 16, color: AppColors.goldText, semanticLabel: 'مع Pro'),
            ],
          ],
        ),
      ),
      ChatMenuAction.report => const PopupMenuItem(value: ChatMenuAction.report, child: Text('إبلاغ', style: red)),
      ChatMenuAction.end => const PopupMenuItem(value: ChatMenuAction.end, child: Text('إنهاء المحادثة', style: red)),
    };
  }
}
