import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// One row of a [GroupedSection]: navy icon tile, title, an optional trailing value, a chevron.
class GroupedRow {
  const GroupedRow({required this.icon, required this.title, required this.onTap, this.value, this.rowKey});

  final IconData icon;
  final String title;
  final VoidCallback onTap;

  /// Shown at the trailing edge before the chevron (a balance, a plan, a short state)
  final String? value;

  /// Lets a test or a screen find this row
  final Key? rowKey;
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
            if (i > 0) const Divider(height: 1, thickness: 0.5, indent: 60, color: AppColors.line),
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
    return InkWell(
      key: row.rowKey,
      onTap: row.onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 52),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg, vertical: AppSpace.sm),
          child: Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(color: AppColors.navy, borderRadius: BorderRadius.circular(AppRadius.sm)),
                child: Icon(row.icon, size: 20, color: Colors.white),
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(child: Text(row.title, style: AppText.body.copyWith(color: AppColors.ink))),
              if (row.value != null) ...[
                const SizedBox(width: AppSpace.sm),
                Text(row.value!, style: AppText.body.copyWith(color: AppColors.muted)),
              ],
              const SizedBox(width: AppSpace.xs),
              const Icon(Icons.chevron_left_rounded, color: AppColors.muted),
            ],
          ),
        ),
      ),
    );
  }
}
