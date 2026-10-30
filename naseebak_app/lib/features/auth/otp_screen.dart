import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/localization/digits.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../welcome/brand_visuals.dart';
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
  final _focus = FocusNode();
  Timer? _timer;
  late int _left = widget.resendSeconds;
  bool _verifying = false;
  bool _resending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
    _startCooldown();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    _focus.dispose();
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
    final digits = toLatinDigits(_controller.text);
    return Scaffold(
      backgroundColor: AppColors.offWhite,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AuthHero(
            showBack: true,
            title: 'أدخل رمز التحقق',
            subtitle: 'أرسلنا رمزاً من 6 أرقام برسالة نصية إلى \u2066${pending.phone}\u2069',
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
              children: [
                FadeSlideIn(
                  delay: const Duration(milliseconds: 250),
                  child: Directionality(
                    textDirection: TextDirection.ltr,
                    child: SizedBox(
                      height: 64,
                      child: Stack(children: [
                        // Six boxes show the code; the real (invisible) field sits on top and takes the input
                        Row(children: [
                          for (var i = 0; i < 6; i++) ...[
                            if (i > 0) const SizedBox(width: 8),
                            Expanded(child: _CodeBox(char: i < digits.length ? digits[i] : null, active: i == digits.length && _focus.hasFocus, error: _error != null)),
                          ],
                        ]),
                        Positioned.fill(
                          child: TextField(
                            key: const Key('otp-field'),
                            controller: _controller,
                            focusNode: _focus,
                            autofocus: true,
                            keyboardType: TextInputType.number,
                            autofillHints: const [AutofillHints.oneTimeCode],
                            inputFormatters: [
                              FilteringTextInputFormatter.allow(RegExp(r'[0-9٠-٩۰-۹]')),
                              LengthLimitingTextInputFormatter(6),
                            ],
                            showCursor: false,
                            enableInteractiveSelection: false,
                            style: const TextStyle(color: Colors.transparent, fontSize: 1),
                            decoration: const InputDecoration(
                              counterText: '',
                              border: InputBorder.none,
                              enabledBorder: InputBorder.none,
                              focusedBorder: InputBorder.none,
                              filled: false,
                            ),
                            onChanged: (v) {
                              setState(() => _error = null);
                              if (normalizeOtp(v) != null) _verify(pending);
                            },
                            onSubmitted: (_) => _verify(pending),
                          ),
                        ),
                      ]),
                    ),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 14),
                  InfoBanner(text: _error!, tone: BannerTone.danger),
                ],
                const SizedBox(height: 24),
                FadeSlideIn(
                  delay: const Duration(milliseconds: 350),
                  child: LoadingButton(
                    key: const Key('verify-otp'),
                    label: 'تأكيد',
                    loading: _verifying,
                    onPressed: () => _verify(pending),
                  ),
                ),
                const SizedBox(height: 16),
                Center(
                  child: _left > 0
                      ? Row(mainAxisSize: MainAxisSize.min, children: [
                          SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              value: _left / widget.resendSeconds,
                              strokeWidth: 2,
                              color: AppColors.gold,
                              backgroundColor: AppColors.line,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text('يمكنك طلب رمز جديد بعد $_left ثانية',
                              key: const Key('resend-countdown'), style: const TextStyle(color: AppColors.muted)),
                        ])
                      : TextButton.icon(
                          key: const Key('resend'),
                          onPressed: _resending ? null : () => _resend(pending),
                          icon: const Icon(Icons.refresh_rounded),
                          label: Text(_resending ? 'جارٍ الإرسال…' : 'إعادة إرسال الرمز'),
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
        ],
      ),
    );
  }
}

/// One digit of the code: gold border on the next box to fill, a soft pop when a digit lands.
class _CodeBox extends StatelessWidget {
  const _CodeBox({required this.char, required this.active, required this.error});
  final String? char;
  final bool active;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final color = error
        ? AppColors.danger
        : active
            ? AppColors.gold
            : char != null
                ? AppColors.navy
                : AppColors.line;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color, width: active || char != null ? 2 : 1.2),
        boxShadow: [
          if (active) BoxShadow(color: AppColors.gold.withValues(alpha: 0.25), blurRadius: 14, offset: const Offset(0, 4)),
        ],
      ),
      alignment: Alignment.center,
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 180),
        transitionBuilder: (child, a) => ScaleTransition(scale: a, child: child),
        child: Text(
          char ?? '',
          key: ValueKey(char),
          style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: AppColors.navy),
        ),
      ),
    );
  }
}
