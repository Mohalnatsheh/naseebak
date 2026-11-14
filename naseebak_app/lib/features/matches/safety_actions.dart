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

/// Runs [task] under a small modal progress (no tap through, no back) until it answers: after «حظر» / «إبلاغ وحظر»
/// nothing else showed the request was running, and the menu could be opened again meanwhile (audit M8).
Future<T> withSafetyProgress<T>(BuildContext context, Future<T> Function() task) {
  final future = task();
  showDialog<void>(
    context: context,
    useRootNavigator: true,
    barrierDismissible: false,
    builder: (_) => _SafetyProgress(future),
  );
  return future;
}

class _SafetyProgress extends StatefulWidget {
  const _SafetyProgress(this.future);
  final Future<Object?> future;

  @override
  State<_SafetyProgress> createState() => _SafetyProgressState();
}

class _SafetyProgressState extends State<_SafetyProgress> {
  @override
  void initState() {
    super.initState();
    // Closes itself once the request answered (even one that answered before this was built)
    widget.future.then<void>((_) {}, onError: (_) {}).whenComplete(() {
      if (mounted) Navigator.of(context).pop();
    });
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Center(
        child: Semantics(
          label: 'جارٍ التنفيذ',
          child: const CircularProgressIndicator(key: Key('safety-progress'), color: AppColors.gold),
        ),
      ),
    );
  }
}

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
    final repo = ref.read(matchesRepositoryProvider);
    await withSafetyProgress(context, () => repo.block(userId));
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
  final res = await showModalBottomSheet<ReportAnswer>(
    context: context,
    // Over the tab bar (also opened from a suggestion card, inside a tab): its send button is never under the bar
    useRootNavigator: true,
    isScrollControlled: true,
    useSafeArea: true,
    barrierLabel: 'إغلاق',
    builder: (_) => ReportSheet(
      title: 'إبلاغ وحظر $name',
      description: body ?? reportBlockText(viewerFemale),
      submitLabel: 'إبلاغ وحظر',
    ),
  );
  if (res == null || !context.mounted) return false;
  try {
    final repo = ref.read(matchesRepositoryProvider);
    await withSafetyProgress(context, () => repo.reportAndBlock(userId, res.reason, details: res.details));
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
    final repo = ref.read(matchesRepositoryProvider);
    await withSafetyProgress(context, () => repo.unblock(blockId));
    if (context.mounted) showSnack(context, 'تم إلغاء الحظر');
    return true;
  } catch (e) {
    if (context.mounted) showSnack(context, ApiException.messageOf(e));
    return false;
  }
}

/// Report reasons of `POST /api/reports`.
/// What the report sheet returns: the reason, the details, and whether the member chose the action that also ends
/// (or blocks) rather than «إبلاغ فقط» ([end] false)
class ReportAnswer {
  const ReportAnswer(this.reason, this.details, {this.end = true});
  final String reason;
  final String details;
  final bool end;
}

class ReportSheet extends StatefulWidget {
  const ReportSheet({
    super.key,
    this.title = 'إبلاغ',
    this.description,
    this.submitLabel = 'إرسال البلاغ',
    this.submitConsequence,
    this.reportOnlyLabel,
    this.reportOnlyConsequence,
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

  /// Under the submit button: exactly what it does besides the report (ends the chat, blocks, closes the match)
  final String? submitConsequence;

  /// A second, milder choice (the chat's «إبلاغ فقط»: the report is filed and nothing else changes). It comes first
  /// and returns [ReportAnswer.end] false.
  final String? reportOnlyLabel;
  final String? reportOnlyConsequence;

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
        // The last button stays clear of the home indicator (0 while the keyboard is up)
        padding: EdgeInsets.fromLTRB(20, 0, 20, 24 + MediaQuery.paddingOf(context).bottom),
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
                    Text(
                      'الرسالة المُبلَّغ عنها',
                      style: AppText.caption.copyWith(fontWeight: FontWeight.w600, color: AppColors.muted),
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
            if (widget.reportOnlyLabel != null) ...[
              FilledButton(
                key: const Key('report-only'),
                onPressed: _reason == null
                    ? null
                    : () => Navigator.of(context).pop(ReportAnswer(_reason!, _details.text, end: false)),
                child: Text(widget.reportOnlyLabel!),
              ),
              if (widget.reportOnlyConsequence != null) _Consequence(widget.reportOnlyConsequence!),
              const SizedBox(height: 10),
              OutlinedButton(
                key: const Key('report-submit'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.danger,
                  side: BorderSide(color: AppColors.danger.withValues(alpha: 0.5)),
                ),
                onPressed: _reason == null ? null : () => Navigator.of(context).pop(ReportAnswer(_reason!, _details.text)),
                child: Text(widget.submitLabel),
              ),
            ] else
              FilledButton(
                key: const Key('report-submit'),
                onPressed: _reason == null ? null : () => Navigator.of(context).pop(ReportAnswer(_reason!, _details.text)),
                child: Text(widget.submitLabel),
              ),
            if (widget.submitConsequence != null) _Consequence(widget.submitConsequence!, key: const Key('report-consequence')),
          ],
        ),
      ),
    );
  }
}

/// One muted line under a report button: what it does
class _Consequence extends StatelessWidget {
  const _Consequence(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Text(text, textAlign: TextAlign.center, style: AppText.caption.copyWith(color: AppColors.muted)),
      );
}
