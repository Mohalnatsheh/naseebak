import 'package:flutter/material.dart';

import '../../core/localization/arabic_count.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../home/gendered_copy.dart';
import '../pro/pro_repository.dart' show MediaButtons;

/// «الأحدث»: the round white button at the bottom end of the messages while scrolled up, with a navy badge for what
/// arrived meanwhile
class NewestButton extends StatelessWidget {
  const NewestButton({super.key, required this.unseen, required this.onPressed});
  final int unseen;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final label = unseen > 0
        ? 'الأحدث، ${arabicCount(unseen, one: 'رسالة جديدة', two: 'رسالتان جديدتان', few: 'رسائل جديدة', many: 'رسالة جديدة')}'
        : 'الأحدث';
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      onTap: onPressed,
      child: SizedBox(
        width: 48,
        height: 52,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            PositionedDirectional(
              bottom: 0,
              start: 0,
              child: Material(
                key: const Key('chat-newest'),
                color: Colors.white,
                elevation: 2,
                shadowColor: AppColors.navyDeep.withValues(alpha: 0.4),
                shape: const CircleBorder(),
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: onPressed,
                  child: const SizedBox(
                    width: 44,
                    height: 44,
                    child: Icon(Icons.keyboard_arrow_down_rounded, size: 28, color: AppColors.navy),
                  ),
                ),
              ),
            ),
            if (unseen > 0)
              PositionedDirectional(
                top: 0,
                start: 0,
                end: 0,
                child: Center(child: KeyedSubtree(key: const Key('chat-newest-count'), child: CountBadge(count: unseen))),
              ),
          ],
        ),
      ),
    );
  }
}

/// The room kept between the composer's start edge (where the cursor stands) and its hint
const composerHintGap = 6.0;

/// The white pill (WhatsApp-style composer), from the start: the emoji button (a keyboard while the panel is open),
/// the text field (1–6 lines, 2000 characters, Enter adds a line), and ONE paperclip whose sheet holds «المعرض» and
/// «الكاميرا». Pro rules: [MediaButtons.locked] greys the paperclip with the «Pro» tag and opens `/pro`
/// ([onOpenPro]); [MediaButtons.hidden] shows no paperclip.
class WaComposerPill extends StatelessWidget {
  const WaComposerPill({
    super.key,
    required this.controller,
    required this.focusNode,
    required this.female,
    required this.media,
    required this.emojiOpen,
    required this.onToggleEmoji,
    required this.onAttach,
    required this.onOpenPro,
    required this.onChanged,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool female;
  final MediaButtons media;
  final bool emojiOpen;
  final VoidCallback onToggleEmoji;
  final VoidCallback onAttach;
  final VoidCallback onOpenPro;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    const none = OutlineInputBorder(borderSide: BorderSide.none);
    final locked = media == MediaButtons.locked;
    return Container(
      key: const Key('chat-pill'),
      constraints: const BoxConstraints(minHeight: 48),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.sheet),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          // Part of the field's tap region: opening the panel is the room's own unfocus, never a tap outside
          TextFieldTapRegion(
            child: SizedBox(
              width: 44,
              height: 48,
              child: IconButton(
                key: const Key('chat-emoji'),
                tooltip: emojiOpen ? 'لوحة المفاتيح' : 'الرموز التعبيرية',
                onPressed: onToggleEmoji,
                style: IconButton.styleFrom(minimumSize: const Size(44, 48)),
                icon: Icon(
                  emojiOpen ? Icons.keyboard_alt_outlined : Icons.sentiment_satisfied_alt_outlined,
                  color: AppColors.muted,
                ),
              ),
            ),
          ),
          Expanded(
            child: TextField(
              key: const Key('chat-input'),
              controller: controller,
              focusNode: focusNode,
              minLines: 1,
              maxLines: 6,
              maxLength: 2000,
              textInputAction: TextInputAction.newline,
              onChanged: onChanged,
              // A tap anywhere else (the messages, the header) closes the keyboard
              onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
              style: AppText.body,
              decoration: InputDecoration(
                // A little room at the start: the cursor of the empty, focused field stands at the very edge and
                // would cover the hint's first letter, a thin «ا» («كتب رسالتك», simulator QA D1)
                hint: Padding(
                  padding: const EdgeInsetsDirectional.only(start: composerHintGap),
                  child: Text(
                    forViewer(female, 'اكتب رسالتك…', 'اكتبي رسالتكِ…'),
                    key: const Key('chat-input-hint'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.body.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
                  ),
                ),
                counterText: '',
                filled: false,
                isDense: true,
                border: none,
                enabledBorder: none,
                focusedBorder: none,
                contentPadding: const EdgeInsetsDirectional.fromSTEB(4, 11, 4, 11),
              ),
            ),
          ),
          if (media != MediaButtons.hidden)
            TextFieldTapRegion(
              child: ComposerMediaButton(
                key: const Key('chat-attach'),
                tagKey: const Key('chat-media-pro-tag'),
                icon: Icons.image_outlined,
                tooltip: locked ? 'إرفاق · متاح لأعضاء Pro' : 'إرفاق',
                locked: locked,
                onPressed: locked ? onOpenPro : onAttach,
              ),
            ),
        ],
      ),
    );
  }
}

/// A composer media button (the paperclip, the locked mic). Locked: greyed, with a small gold lock (the «Pro» tag,
/// design P2-1, DS-14); the whole button (tag included) opens the plans.
class ComposerMediaButton extends StatelessWidget {
  const ComposerMediaButton({
    super.key,
    required this.tagKey,
    required this.icon,
    required this.tooltip,
    required this.locked,
    required this.onPressed,
  });

  final Key tagKey;
  final IconData icon;
  final String tooltip;
  final bool locked;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 48,
      height: 48,
      child: Stack(
        alignment: Alignment.center,
        children: [
          IconButton(
            tooltip: tooltip,
            onPressed: onPressed,
            style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
            icon: Icon(icon, color: locked ? AppColors.muted.withValues(alpha: 0.6) : AppColors.muted),
          ),
          if (locked)
            PositionedDirectional(
              top: 6,
              end: 6,
              child: IgnorePointer(
                child: Container(
                  key: tagKey,
                  width: 16,
                  height: 16,
                  decoration: const BoxDecoration(color: AppColors.gold, shape: BoxShape.circle),
                  child: const Icon(Icons.lock_rounded, size: 10, color: Colors.white),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Where the paperclip's photo comes from
enum AttachSource { gallery, camera }

/// The paperclip's sheet: «المعرض» or «الكاميرا»; null when closed without a choice
Future<AttachSource?> showAttachSheet(BuildContext context) {
  Widget item(BuildContext sheet, Key key, IconData icon, String label, AttachSource source) => ListTile(
        key: key,
        minTileHeight: 52,
        leading: CircleAvatar(
          backgroundColor: AppColors.navy.withValues(alpha: 0.10),
          child: Icon(icon, color: AppColors.navy),
        ),
        title: Text(label, style: AppText.body),
        onTap: () => Navigator.of(sheet).pop(source),
      );
  return showModalBottomSheet<AttachSource>(
    context: context,
    useRootNavigator: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (sheet) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          item(sheet, const Key('attach-gallery'), Icons.photo_library_outlined, 'المعرض', AttachSource.gallery),
          item(sheet, const Key('attach-camera'), Icons.photo_camera_outlined, 'الكاميرا', AttachSource.camera),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
}

/// A chat that can't be written to (ended, expired, blocked, chats off): today's text in a full-width white bar with
/// a top border, in the composer's place
class WaReadOnlyFooter extends StatelessWidget {
  const WaReadOnlyFooter({super.key, required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('chat-read-only'),
      width: double.infinity,
      decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: AppColors.line))),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Text(text, textAlign: TextAlign.center, style: AppText.labelRegular.copyWith(color: AppColors.muted)),
        ),
      ),
    );
  }
}
