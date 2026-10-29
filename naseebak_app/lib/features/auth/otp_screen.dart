import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import 'auth_repository.dart';
import 'pending_auth.dart';
import 'phone_validation.dart';

/// 6-digit code entry with a 60-second resend cooldown.
class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key, this.resendSeconds = 60});
  final int resendSeconds;

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _controller = TextEditingController();
  Timer? _timer;
  late int _left = widget.resendSeconds;
  bool _verifying = false;
  bool _resending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _startCooldown();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _startCooldown() {
    _timer?.cancel();
    setState(() => _left = widget.resendSeconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      setState(() => _left = _left > 0 ? _left - 1 : 0);
      if (_left == 0) t.cancel();
    });
  }

  Future<void> _resend(PendingAuth pending) async {
    if (_left > 0 || _resending) return;
    setState(() {
      _resending = true;
      _error = null;
    });
    try {
      await ref
          .read(authRepositoryProvider)
          .sendOtp(phone: pending.phone, context: pending.mode, country: pending.countryCode);
      _controller.clear();
      _startCooldown();
      if (mounted) showSnack(context, 'أرسلنا رمزاً جديداً');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  Future<void> _verify(PendingAuth pending) async {
    if (_verifying) return;
    final code = normalizeOtp(_controller.text);
    if (code == null) {
      setState(() => _error = 'أدخل الرمز المكوّن من 6 أرقام');
      return;
    }
    setState(() {
      _verifying = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).verifyOtp(phone: pending.phone, code: code);
      ref.read(pendingAuthProvider.notifier).set(pending.withCode(code));
      final knownMember = pending.mode == OtpContext.login && pending.userExists == true;
      if (knownMember) {
        // The router moves on once the session is set
        await ref.read(authControllerProvider.notifier).signInWithCode(phone: pending.phone, code: code);
      } else if (mounted) {
        context.pushReplacement('/auth/register');
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = ApiException.genericMessage);
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pending = ref.watch(pendingAuthProvider);
    final theme = Theme.of(context);
    if (pending == null) {
      return Scaffold(
        appBar: AppBar(),
        body: MessageView(
          icon: Icons.sms_outlined,
          title: 'ابدأ بإدخال رقمك',
          actionLabel: 'رجوع',
          onAction: () => context.go('/auth/phone'),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('رمز التحقق')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
          children: [
            Text('أدخل الرمز', style: theme.textTheme.headlineSmall),
            const SizedBox(height: 8),
            Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text('أرسلنا رمزاً من 6 أرقام إلى ',
                    style: theme.textTheme.bodyMedium?.copyWith(color: AppColors.muted)),
                Directionality(
                  textDirection: TextDirection.ltr,
                  child: Text(pending.phone,
                      style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
                ),
              ],
            ),
            const SizedBox(height: 28),
            Directionality(
              textDirection: TextDirection.ltr,
              child: TextField(
                key: const Key('otp-field'),
                controller: _controller,
                autofocus: true,
                keyboardType: TextInputType.number,
                textAlign: TextAlign.center,
                autofillHints: const [AutofillHints.oneTimeCode],
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9٠-٩۰-۹]')),
                  LengthLimitingTextInputFormatter(6),
                ],
                style: const TextStyle(fontSize: 28, letterSpacing: 14, fontWeight: FontWeight.w700),
                decoration: const InputDecoration(hintText: '••••••', counterText: ''),
                onChanged: (v) {
                  if (_error != null) setState(() => _error = null);
                  if (normalizeOtp(v) != null) _verify(pending);
                },
                onSubmitted: (_) => _verify(pending),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 14),
              InfoBanner(text: _error!, tone: BannerTone.danger),
            ],
            const SizedBox(height: 24),
            LoadingButton(
              key: const Key('verify-otp'),
              label: 'تأكيد',
              loading: _verifying,
              onPressed: () => _verify(pending),
            ),
            const SizedBox(height: 12),
            Center(
              child: _left > 0
                  ? Text('يمكنك طلب رمز جديد بعد $_left ثانية',
                      key: const Key('resend-countdown'),
                      style: const TextStyle(color: AppColors.muted))
                  : TextButton(
                      key: const Key('resend'),
                      onPressed: _resending ? null : () => _resend(pending),
                      child: Text(_resending ? 'جارٍ الإرسال…' : 'إعادة إرسال الرمز'),
                    ),
            ),
            Center(
              child: TextButton(
                onPressed: _verifying ? null : () => context.pop(),
                child: const Text('تعديل الرقم'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
