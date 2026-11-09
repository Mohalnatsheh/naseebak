import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../chat/chat_format.dart' show messageDirection;
import '../home/gendered_copy.dart';
import 'matches_repository.dart';

/// «حظر» / «إبلاغ وحظر» / «إلغاء الحظر», shared by match and suggestion cards (website matches-view.tsx and
/// mutual-suggestions-view.tsx). Each asks first, shows the outcome and returns whether it went through.

Future<bool> confirmAndBlock(
  BuildContext context,
  WidgetRef ref, {
  required String userId,
  required String name,
  required bool viewerFemale,
  String? body,
}) async {
  final ok = await confirmDialog(
    context,
    title: 'حظر $name؟',
    body: body ?? blockConfirmText(viewerFemale),
    confirmLabel: 'حظر',
    destructive: true,
  );
  if (!ok || !context.mounted) return false;
  try {
    await ref.read(matchesRepositoryProvider).block(userId);
    if (context.mounted) showSnack(context, 'تم الحظر');
    return true;
  } catch (e) {
    if (context.mounted) showSnack(context, ApiException.messageOf(e));
    return false;
  }
}

/// The report sheet is the confirmation: its title, text and button all say «إبلاغ وحظر».
Future<bool> reportAndBlock(
  BuildContext context,
  WidgetRef ref, {
  required String userId,
  required String name,
  required bool viewerFemale,
  String? body,
}) async {
  final res = await showModalBottomSheet<(String, String)>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => ReportSheet(
      title: 'إبلاغ وحظر $name',
      description: body ?? reportBlockText(viewerFemale),
      submitLabel: 'إبلاغ وحظر',
    ),
  );
  if (res == null || !context.mounted) return false;
  try {
    await ref.read(matchesRepositoryProvider).reportAndBlock(userId, res.$1, details: res.$2);
    if (context.mounted) showSnack(context, 'تم الإبلاغ والحظر. سيراجع فريق نصيبك البلاغ.');
    return true;
  } catch (e) {
    if (context.mounted) showSnack(context, ApiException.messageOf(e));
    return false;
  }
}

Future<bool> confirmAndUnblock(
  BuildContext context,
  WidgetRef ref, {
  required String blockId,
  required String name,
}) async {
  final ok = await confirmDialog(
    context,
    title: 'إلغاء حظر $name',
    body: 'يعود التوافق ظاهراً لكما. الطلبات التي أُلغيت بسبب الحظر لا تعود.',
    confirmLabel: 'إلغاء الحظر',
  );
  if (!ok || !context.mounted) return false;
  try {
    await ref.read(matchesRepositoryProvider).unblock(blockId);
    if (context.mounted) showSnack(context, 'تم إلغاء الحظر');
    return true;
  } catch (e) {
    if (context.mounted) showSnack(context, ApiException.messageOf(e));
    return false;
  }
}

/// Report reasons of `POST /api/reports`.
class ReportSheet extends StatefulWidget {
  const ReportSheet({
    super.key,
    this.title = 'إبلاغ',
    this.description,
    this.submitLabel = 'إرسال البلاغ',
    this.initialDetails,
    this.reportedMessage,
  });

  final String title;

  /// «إبلاغ عن الرسالة»: the reported message's one-line snippet, shown as a quote above the reasons (its id goes with
  /// the report)
  final String? reportedMessage;

  /// Prefilled details (e.g. the chat message being reported), still editable
  final String? initialDetails;

  /// What happens after sending (e.g. the block that comes with it)
  final String? description;
  final String submitLabel;

  @override
  State<ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<ReportSheet> {
  static const reasons = [
    ('FAKE_PROFILE', 'حساب غير حقيقي'),
    ('INAPPROPRIATE_CONTENT', 'محتوى غير لائق'),
    ('HARASSMENT', 'إزعاج أو تحرش'),
    ('SPAM', 'رسائل مزعجة'),
    ('OTHER', 'سبب آخر'),
  ];
  String? _reason;
  late final _details = TextEditingController(text: widget.initialDetails ?? '');

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.title, style: Theme.of(context).textTheme.titleLarge),
            if (widget.description != null) ...[
              const SizedBox(height: 6),
              Text(widget.description!, style: const TextStyle(height: 1.6)),
            ],
            if (widget.reportedMessage != null) ...[
              const SizedBox(height: 10),
              Container(
                key: const Key('report-message'),
                padding: const EdgeInsetsDirectional.fromSTEB(10, 6, 10, 6),
                decoration: BoxDecoration(
                  color: AppColors.line.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(10),
                  border: BorderDirectional(start: BorderSide(color: AppColors.danger.withValues(alpha: 0.6), width: 3)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'الرسالة المُبلَّغ عنها',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      widget.reportedMessage!,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      textDirection: messageDirection(widget.reportedMessage!),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 8),
            RadioGroup<String>(
              groupValue: _reason,
              onChanged: (v) => setState(() => _reason = v),
              child: Column(
                children: [
                  for (final r in reasons)
                    RadioListTile<String>(value: r.$1, title: Text(r.$2), contentPadding: EdgeInsets.zero),
                ],
              ),
            ),
            TextField(
              controller: _details,
              maxLength: 1000,
              maxLines: 3,
              decoration: const InputDecoration(hintText: 'تفاصيل (اختياري)'),
            ),
            const SizedBox(height: 8),
            FilledButton(
              key: const Key('report-submit'),
              onPressed: _reason == null ? null : () => Navigator.of(context).pop((_reason!, _details.text)),
              child: Text(widget.submitLabel),
            ),
          ],
        ),
      ),
    );
  }
}
