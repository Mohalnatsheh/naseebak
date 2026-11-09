import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../home/gendered_copy.dart';
import 'suggestion_models.dart';

/// «مهتم» on a shared suggestion: choose how to get to know each other, then send.
/// Stays open (busy) until the server answers and shows fixable errors inside.
class InterestSheet extends StatefulWidget {
  const InterestSheet({
    super.key,
    required this.firstName,
    required this.chatAvailable,
    required this.creditOnInterest,
    required this.credits,
    required this.guardianConsented,
    required this.onSubmit,
    this.canRecharge = true,
    this.viewerFemale = false,
    this.onNoCredits,
    this.free = false,
  });

  final String firstName;
  final bool chatAvailable;
  final bool creditOnInterest;
  final int? credits;

  /// Payments shown in the app: offer «اشحن رصيدك» on NO_CREDITS
  final bool canRecharge;

  /// My guardian contact is saved and consent was already given (no checkbox needed)
  final bool guardianConsented;
  final Future<DecisionResult> Function(String introPreference, bool guardianConsent) onSubmit;
  final bool viewerFemale;

  /// NO_CREDITS: the stored balance is 0 now
  final VoidCallback? onNoCredits;

  /// A reply to someone who already said «مهتم» with free_interest_reply on: no credit is taken
  final bool free;

  /// A [DecisionResult] when sent, the [ApiException] when the card is gone (404: the sheet closes so the
  /// card can leave the list), null when dismissed.
  static Future<Object?> show(BuildContext context, InterestSheet sheet) {
    return showModalBottomSheet<Object>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => sheet,
    );
  }

  @override
  State<InterestSheet> createState() => _InterestSheetState();
}

class _InterestSheetState extends State<InterestSheet> {
  late String? _pref = widget.chatAvailable ? null : 'FAMILY';
  bool _consent = false;
  bool _busy = false;
  String? _error;
  String? _errorCode;

  String _g(String m, String f) => forViewer(widget.viewerFemale, m, f);

  Future<void> _send() async {
    if (_pref == null) {
      setState(() => _error = '${_g('اختر', 'اختاري')} طريقة التعارف: محادثة أو تعارف عائلي');
      return;
    }
    if (_pref == 'FAMILY' && !widget.guardianConsented && !_consent) {
      setState(() => _error = 'يلزم موافقتك على مشاركة بيانات وليّ الأمر');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _errorCode = null;
    });
    try {
      final res = await widget.onSubmit(_pref!, _pref == 'FAMILY' ? (widget.guardianConsented || _consent) : false);
      if (mounted) Navigator.of(context).pop(res);
    } on ApiException catch (e) {
      if (!mounted) return;
      // Closed meanwhile (expired, the other side said «لا», blocked): nothing to fix here
      if (e.kind == ApiErrorKind.notFound) {
        Navigator.of(context).pop(e);
        return;
      }
      final code = e.code ?? (e.kind == ApiErrorKind.noCredits ? 'NO_CREDITS' : null);
      if (code == 'NO_CREDITS') widget.onNoCredits?.call();
      setState(() {
        _error = e.message;
        _errorCode = code;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// A hint the sheet showed itself (no server code) goes once the member acts on it.
  void _clearHint() {
    if (_errorCode == null) _error = null;
  }

  void _pick(String pref) {
    _pref = pref;
    _clearHint();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('${_g('مهتم', 'مهتمة')} بـ${widget.firstName}', style: theme.textTheme.titleLarge),
            const SizedBox(height: 6),
            Text(
              '${forPartner(widget.viewerFemale, 'إذا أبدى اهتمامه', 'إذا أبدت اهتمامها')} أيضاً، يتم التوافق ونبدأ '
              'بالطريقة التي ${_g('تختارها', 'تختارينها')}.',
              style: theme.textTheme.bodyMedium?.copyWith(color: AppColors.muted),
            ),
            const SizedBox(height: 18),
            if (widget.chatAvailable)
              _Option(
                key: const Key('pref-chat'),
                selected: _pref == 'CHAT',
                icon: Icons.chat_bubble_outline_rounded,
                title: 'محادثة قصيرة داخل التطبيق',
                body: 'نصية فقط ومراقبة، لمدة 14 يوماً، ويمكن الانتقال للتعارف العائلي لاحقاً.',
                onTap: _busy ? null : () => setState(() => _pick('CHAT')),
              ),
            if (widget.chatAvailable) const SizedBox(height: 10),
            _Option(
              key: const Key('pref-family'),
              selected: _pref == 'FAMILY',
              icon: Icons.family_restroom_rounded,
              title: 'تعارف عائلي',
              body: 'عند التوافق تتبادل العائلتان بيانات التواصل لوليّ الأمر.',
              onTap: _busy ? null : () => setState(() => _pick('FAMILY')),
            ),
            if (_pref == 'FAMILY' && !widget.guardianConsented) ...[
              const SizedBox(height: 12),
              CheckboxListTile(
                key: const Key('guardian-consent'),
                value: _consent,
                onChanged: _busy ? null : (v) => setState(() {
                  _consent = v ?? false;
                  _clearHint();
                }),
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
                title: const Text(
                  'أوافق على مشاركة اسم وليّ أمري ورقمه مع عائلة الطرف الآخر عند التوافق.',
                  style: TextStyle(fontSize: 14),
                ),
              ),
            ],
            if (widget.creditOnInterest && widget.free) ...[
              const SizedBox(height: 12),
              InfoBanner(
                key: const Key('free-reply-note'),
                tone: BannerTone.success,
                text: 'الرد بـ«مهتم» مجاني، ولن يُخصم شيء من ${widget.viewerFemale ? 'رصيدكِ' : 'رصيدك'}.',
                icon: Icons.favorite_outline,
              ),
            ] else if (widget.creditOnInterest) ...[
              const SizedBox(height: 12),
              InfoBanner(
                text: 'يُخصم رصيد واحد عند إرسال «مهتم»${widget.credits != null ? ' · رصيدك الحالي ${widget.credits}' : ''}.',
                icon: Icons.account_balance_wallet_outlined,
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              InfoBanner(
                text: _error!,
                tone: BannerTone.danger,
                action: _errorAction(context),
              ),
            ],
            const SizedBox(height: 18),
            LoadingButton(key: const Key('send-interest'), label: 'إرسال «مهتم»', loading: _busy, onPressed: _send),
            const SizedBox(height: 6),
            TextButton(onPressed: _busy ? null : () => Navigator.of(context).pop(), child: const Text('إلغاء')),
          ],
        ),
      ),
    );
  }

  Widget? _errorAction(BuildContext context) {
    switch (_errorCode) {
      case 'NO_CREDITS':
        if (!widget.canRecharge) return null;
        return TextButton(
          onPressed: () {
            Navigator.of(context).pop();
            context.push('/credits');
          },
          child: Text(_g('اشحن رصيدك', 'اشحني رصيدك')),
        );
      case 'GUARDIAN_REQUIRED':
        return TextButton(
          onPressed: () async {
            await context.push('/profile/guardian');
            if (mounted) setState(() => _error = null);
          },
          child: const Text('إضافة بيانات وليّ الأمر'),
        );
      default:
        return null;
    }
  }
}

class _Option extends StatelessWidget {
  const _Option({super.key, required this.selected, required this.icon, required this.title, required this.body, this.onTap});
  final bool selected;
  final IconData icon;
  final String title;
  final String body;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.navy.withValues(alpha: 0.06) : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: selected ? AppColors.navy : AppColors.line, width: selected ? 1.6 : 1),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: selected ? AppColors.navy : AppColors.muted),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5)),
                    const SizedBox(height: 2),
                    Text(body, style: const TextStyle(color: AppColors.muted, fontSize: 13.5, height: 1.5)),
                  ],
                ),
              ),
              Icon(selected ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
                  color: selected ? AppColors.navy : AppColors.line),
            ],
          ),
        ),
      ),
    );
  }
}
