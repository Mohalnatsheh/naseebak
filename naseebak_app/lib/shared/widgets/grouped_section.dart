import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// One row of a [GroupedSection]: navy icon tile, title, an optional trailing value, a chevron.
///
/// A row without [onTap] is plain (no chevron); [trailing] replaces the value and chevron (a button, an amount),
/// [tags] sit after the title and [subtitle] under it.
class GroupedRow {
  const GroupedRow({
    this.icon,
    required this.title,
    this.onTap,
    this.value,
    this.rowKey,
    this.subtitle,
    this.tags = const [],
    this.trailing,
    this.color,
  });

  /// The navy tile at the start; none when null
  final IconData? icon;
  final String title;
  final VoidCallback? onTap;

  /// Shown at the trailing edge before the chevron (a balance, a plan, a short state)
  final String? value;

  /// Lets a test or a screen find this row
  final Key? rowKey;

  /// A muted line, or any small widget (a struck price), under the title
  final Widget? subtitle;

  /// Small pills after the title
  final List<Widget> tags;

  /// Replaces [value] and the chevron
  final Widget? trailing;

  /// Tints the icon tile and the title (a warning or destructive row); the navy tile and ink title when null
  final Color? color;
}

/// A white rounded group of rows with hairline dividers (the mockup's iOS-style grouped list).
class GroupedSection extends StatelessWidget {
  const GroupedSection({super.key, required this.rows});

  final List<GroupedRow> rows;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) return const SizedBox.shrink();
    return Container(
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(AppRadius.md)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0)
              Divider(height: 1, thickness: 0.5, indent: rows[i].icon == null ? AppSpace.lg : 60, color: AppColors.line),
            _Row(row: rows[i]),
          ],
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.row});
  final GroupedRow row;

  @override
  Widget build(BuildContext context) {
    final title = Text(row.title, style: AppText.body.copyWith(color: row.color ?? AppColors.ink));
    final content = ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 52),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg, vertical: AppSpace.sm),
        child: Row(
          children: [
            if (row.icon != null) ...[
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(color: row.color ?? AppColors.navy, borderRadius: BorderRadius.circular(AppRadius.sm)),
                child: Icon(row.icon, size: 20, color: Colors.white),
              ),
              const SizedBox(width: AppSpace.md),
            ],
            Expanded(
              child: row.tags.isEmpty && row.subtitle == null
                  ? title
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (row.tags.isEmpty)
                          title
                        else
                          Wrap(
                            spacing: AppSpace.sm,
                            runSpacing: AppSpace.xs,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [title, ...row.tags],
                          ),
                        ?row.subtitle,
                      ],
                    ),
            ),
            if (row.trailing != null) ...[
              const SizedBox(width: AppSpace.sm),
              row.trailing!,
            ] else ...[
              if (row.value != null) ...[
                const SizedBox(width: AppSpace.sm),
                Text(row.value!, style: AppText.body.copyWith(color: AppColors.muted)),
              ],
              if (row.onTap != null) ...[
                const SizedBox(width: AppSpace.xs),
                const Icon(Icons.chevron_right_rounded, color: AppColors.muted),
              ],
            ],
          ],
        ),
      ),
    );
    if (row.onTap == null) return KeyedSubtree(key: row.rowKey, child: content);
    return InkWell(key: row.rowKey, onTap: row.onTap, child: content);
  }
}
