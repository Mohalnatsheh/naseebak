import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'emoji_data.dart';

/// [insert] in place of [value]'s selection (at the end when there is no valid one), the cursor right after it.
/// [value] unchanged when the result would pass [maxLength] characters (counted like `TextField.maxLength`).
TextEditingValue insertAtCursor(TextEditingValue value, String insert, {int maxLength = 2000}) {
  final text = value.text;
  final sel = value.selection;
  final valid = sel.isValid && sel.start >= 0 && sel.end <= text.length;
  final start = valid ? sel.start : text.length;
  final end = valid ? sel.end : text.length;
  final next = text.replaceRange(start, end, insert);
  if (next.characters.length > maxLength) return value;
  return TextEditingValue(text: next, selection: TextSelection.collapsed(offset: start + insert.length));
}

/// The emoji panel in the keyboard's place (WhatsApp-style composer): the group tabs on top, a grid of emoji below.
/// A pick never takes the focus: the text field stays unfocused, so the keyboard doesn't come back over the panel.
class EmojiPanel extends StatefulWidget {
  const EmojiPanel({super.key, required this.onPick, required this.height});
  final ValueChanged<String> onPick;
  final double height;

  @override
  State<EmojiPanel> createState() => _EmojiPanelState();
}

class _EmojiPanelState extends State<EmojiPanel> {
  int _group = 0;

  @override
  Widget build(BuildContext context) {
    final current = emojiGroups[_group];
    return Container(
      key: const Key('emoji-panel'),
      height: widget.height,
      color: Colors.white,
      child: Semantics(
        container: true,
        label: 'لوحة الرموز التعبيرية',
        child: Column(
          children: [
            // One line on a phone: the tabs share the width
            Container(
              decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.line))),
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              child: Row(
                children: [
                  for (var i = 0; i < emojiGroups.length; i++) Expanded(child: _tab(i)),
                ],
              ),
            ),
            Expanded(
              child: GridView.builder(
                key: ValueKey('emoji-grid-$_group'),
                padding: const EdgeInsets.all(4),
                // At least 44 px a cell at any width from about 300 px up
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 52, mainAxisExtent: 44),
                itemCount: current.emoji.length,
                itemBuilder: (_, i) => _cell(current.emoji[i]),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tab(int i) {
    final active = i == _group;
    void pick() => setState(() => _group = i);
    return Semantics(
      button: true,
      selected: active,
      label: emojiGroups[i].label,
      onTap: pick,
      excludeSemantics: true,
      child: InkWell(
        key: Key('emoji-tab-$i'),
        canRequestFocus: false,
        borderRadius: BorderRadius.circular(AppRadius.full),
        onTap: pick,
        child: Container(
          constraints: const BoxConstraints(minHeight: 44),
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 2),
          decoration: active
              ? BoxDecoration(
                  color: AppColors.navy.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(AppRadius.full),
                )
              : null,
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              emojiGroups[i].label,
              maxLines: 1,
              style: active ? AppText.label.copyWith(color: AppColors.navy) : AppText.labelRegular.copyWith(color: AppColors.muted),
            ),
          ),
        ),
      ),
    );
  }

  Widget _cell(String emoji) {
    void pick() => widget.onPick(emoji);
    return Semantics(
      button: true,
      label: emoji,
      onTap: pick,
      excludeSemantics: true,
      child: InkWell(
        key: Key('emoji-$emoji'),
        canRequestFocus: false,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        onTap: pick,
        child: Center(child: Text(emoji, style: AppText.title)),
      ),
    );
  }
}
