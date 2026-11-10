import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/analytics/analytics.dart';
import '../../core/network/api_exception.dart';
import '../../core/routing/website_links.dart' show pendingInvitationKey;
import '../../core/theme/app_theme.dart';
import '../../core/localization/safe_input_formatter.dart';
import '../../shared/widgets/common.dart';
import '../country_selection/country.dart';
import '../country_selection/country_providers.dart';
import 'auth_repository.dart';
import 'pending_auth.dart';
import '../welcome/brand_visuals.dart';
import 'phone_validation.dart';

/// Phone number entry for sign-in or sign-up, with the picked country's dial code.
class PhoneScreen extends ConsumerWidget {
  const PhoneScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final country = ref.watch(pickedCountryProvider);
    return Scaffold(
      backgroundColor: AppColors.offWhite,
      body: country.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(countriesProvider)),
        data: (c) => c == null
            ? MessageView(
                icon: Icons.public_rounded,
                title: 'يُرجى اختيار دولتك أولاً',
                actionLabel: 'اختيار الدولة',
                onAction: () => context.push('/country'),
              )
            : PhoneForm(country: c),
      ),
    );
  }
}

class PhoneForm extends ConsumerStatefulWidget {
  const PhoneForm({super.key, required this.country});
  final Country country;

  @override
  ConsumerState<PhoneForm> createState() => _PhoneFormState();
}

class _PhoneFormState extends ConsumerState<PhoneForm> {
  final _controller = TextEditingController();
  final _focus = FocusNode();
  bool _valid = false;

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
    _controller.addListener(() {
      final ok = validatePhone(_controller.text, widget.country) == null;
      // An error from the last «متابعة» goes once the number is fixed (QA A2-L2: «رقم الهاتف مطلوب» stayed under a
      // valid number)
      final clear = ok && _fieldError != null;
      if (ok != _valid || clear) {
        setState(() {
          _valid = ok;
          if (clear) _fieldError = null;
        });
      }
    });
  }
  String? _fieldError;
  String? _serverError;
  bool _sending = false;

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final country = widget.country;
    final mode = ref.read(authModeProvider);
    final err = validatePhone(_controller.text, country);
    setState(() {
      _fieldError = err;
      _serverError = null;
    });
    if (err != null || _sending) return;
    final phone = localPhone(_controller.text, country);
    setState(() => _sending = true);
    try {
      final exists = await ref.read(authRepositoryProvider).sendOtp(phone: phone, context: mode, country: country.code);
      if (!mounted) return;
      ref.read(analyticsProvider).otpRequested(mode.name);
      ref.read(pendingAuthProvider.notifier).set(
            PendingAuth(phone: phone, countryCode: country.code, mode: mode, userExists: exists),
          );
      if (mounted) context.push('/auth/otp');
    } on ApiException catch (e) {
      setState(() => _serverError = e.message);
    } catch (_) {
      setState(() => _serverError = ApiException.genericMessage);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _switchMode(OtpContext to) {
    if (_sending || ref.read(authModeProvider) == to) return;
    ref.read(authModeProvider.notifier).set(to);
    setState(() {
      _serverError = null;
      _fieldError = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final country = widget.country;
    final mode = ref.watch(authModeProvider);
    final register = mode == OtpContext.register;
    final invitation = ref.read(sharedPreferencesProvider).getString(pendingInvitationKey);
    final focused = _focus.hasFocus;
    final borderColor = _fieldError != null
        ? AppColors.danger
        : focused
            ? AppColors.gold
            : AppColors.line;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AuthHero(
          title: register ? 'رحلتك نحو نصيبك تبدأ هنا' : 'أهلاً بعودتك',
          subtitle: register
              ? 'يمكنك إنشاء حسابك برقم ${country.phoneWord}ك في دقيقة واحدة.'
              : 'يمكنك الدخول برقم ${country.phoneWord}ك لنكمل من حيث توقفنا.',
          trailing: _CountryChip(country: country, onTap: _sending ? null : () => context.push('/country')),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
            children: [
              FadeSlideIn(
                key: const ValueKey('phone-in-1'),
                delay: const Duration(milliseconds: 200),
                child: _ModeSwitch(register: register, onChanged: _switchMode),
              ),
              const SizedBox(height: 22),
              if (register && !country.registrationOpen) ...[
                const InfoBanner(text: 'التسجيل مغلق مؤقتاً في هذه الدولة.', tone: BannerTone.warning),
                const SizedBox(height: 16),
              ],
              // Opened from a friend's referral link: the code waits for the sign-up details screen
              if (register && invitation != null && invitation.isNotEmpty) ...[
                InfoBanner(
                  key: const Key('invitation-banner'),
                  text: 'وصلتك دعوة من صديق. رمز الدعوة $invitation يُضاف تلقائياً عند التسجيل.',
                  tone: BannerTone.success,
                  icon: Icons.card_giftcard_rounded,
                ),
                const SizedBox(height: 16),
              ],
              FadeSlideIn(
                key: const ValueKey('phone-in-2'),
                delay: const Duration(milliseconds: 300),
                child: Text('رقم ${country.phoneWord}',
                    style: AppText.body.copyWith(fontWeight: FontWeight.w700, color: AppColors.ink)),
              ),
              const SizedBox(height: 10),
              FadeSlideIn(
                key: const ValueKey('phone-in-3'),
                delay: const Duration(milliseconds: 340),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: borderColor, width: focused ? 2 : 1.2),
                    boxShadow: [
                      BoxShadow(
                        color: (focused ? AppColors.gold : AppColors.navy).withValues(alpha: focused ? 0.18 : 0.06),
                        blurRadius: focused ? 22 : 12,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Directionality(
                    textDirection: TextDirection.ltr,
                    child: Row(children: [
                      Container(
                        margin: const EdgeInsets.all(8),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                        decoration: BoxDecoration(
                          color: AppColors.navy.withValues(alpha: 0.06),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          Text(country.flagEmoji, style: AppText.headline),
                          const SizedBox(width: 6),
                          Text(country.dialCode,
                              style: AppText.body.copyWith(fontWeight: FontWeight.w700, color: AppColors.navy)),
                        ]),
                      ),
                      Expanded(
                        child: TextField(
                          key: const Key('phone-field'),
                          controller: _controller,
                          focusNode: _focus,
                          keyboardType: TextInputType.phone,
                          textInputAction: TextInputAction.done,
                          autofillHints: const [AutofillHints.telephoneNumberNational],
                          inputFormatters: [SafeInputFormatter(allowed: RegExp(r'[0-9٠-٩۰-۹+ ]'), maxLength: 16)],
                          style: AppText.headline.copyWith(letterSpacing: 1.5, fontWeight: FontWeight.w600),
                          onSubmitted: (_) => _submit(),
                          decoration: InputDecoration(
                            hintText: country.phoneExample,
                            hintStyle: TextStyle(color: AppColors.muted.withValues(alpha: 0.5), letterSpacing: 1.5),
                            border: InputBorder.none,
                            enabledBorder: InputBorder.none,
                            focusedBorder: InputBorder.none,
                            errorBorder: InputBorder.none,
                            focusedErrorBorder: InputBorder.none,
                            filled: false,
                            contentPadding: const EdgeInsets.symmetric(vertical: 18),
                          ),
                        ),
                      ),
                      AnimatedScale(
                        scale: _valid ? 1 : 0,
                        duration: const Duration(milliseconds: 260),
                        curve: Curves.easeOutBack,
                        child: const Padding(
                          padding: EdgeInsets.only(right: 14),
                          child: Icon(Icons.check_circle_rounded, color: AppColors.success),
                        ),
                      ),
                    ]),
                  ),
                ),
              ),
              AnimatedSize(
                duration: const Duration(milliseconds: 200),
                child: _fieldError == null
                    ? const SizedBox(width: double.infinity)
                    : Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(_fieldError!, style: AppText.labelRegular.copyWith(color: AppColors.danger)),
                      ),
              ),
              const SizedBox(height: 8),
              FadeSlideIn(
                key: const ValueKey('phone-in-4'),
                delay: const Duration(milliseconds: 380),
                child: Row(children: [
                  const Icon(Icons.sms_outlined, size: 16, color: AppColors.muted),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text('سنرسل رمز تحقق من 6 أرقام ${widget.country.code == 'SA' ? 'عبر واتساب' : 'برسالة نصية'}.',
                        style: AppText.labelRegular.copyWith(color: AppColors.muted.withValues(alpha: 0.9))),
                  ),
                ]),
              ),
              if (_serverError != null) ...[
                const SizedBox(height: 14),
                InfoBanner(text: _serverError!, tone: BannerTone.danger),
              ],
              const SizedBox(height: 24),
              FadeSlideIn(
                key: const ValueKey('phone-in-5'),
                delay: const Duration(milliseconds: 440),
                child: _GoldButton(
                  key: const Key('send-otp'),
                  label: register ? 'إنشاء الحساب' : 'إرسال رمز التحقق',
                  loading: _sending,
                  onPressed: _submit,
                ),
              ),
              const SizedBox(height: 28),
              FadeSlideIn(
                key: const ValueKey('phone-in-6'),
                delay: Duration(milliseconds: 520),
                child: Row(children: [
                  Expanded(child: _Promise(icon: Icons.verified_user_outlined, text: 'رقم مؤكَّد\nلكل حساب')),
                  SizedBox(width: 10),
                  Expanded(child: _Promise(icon: Icons.visibility_off_outlined, text: 'الصور مخفية\nحتى التوافق')),
                  SizedBox(width: 10),
                  Expanded(child: _Promise(icon: Icons.family_restroom_rounded, text: 'العائلة جزء\nمن الطريق')),
                ]),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// «تسجيل الدخول | حساب جديد» with a sliding gold thumb.
class _ModeSwitch extends StatelessWidget {
  const _ModeSwitch({required this.register, required this.onChanged});
  final bool register;
  final ValueChanged<OtpContext> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 52,
      padding: const EdgeInsets.all(5),
      decoration: BoxDecoration(color: AppColors.navy.withValues(alpha: 0.07), borderRadius: BorderRadius.circular(16)),
      child: Stack(children: [
        AnimatedAlign(
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOutCubic,
          alignment: register ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
          child: FractionallySizedBox(
            widthFactor: 0.5,
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.12), blurRadius: 10, offset: const Offset(0, 3))],
              ),
            ),
          ),
        ),
        Row(children: [
          for (final (value, label) in const [(OtpContext.login, 'تسجيل الدخول'), (OtpContext.register, 'حساب جديد')])
            Expanded(
              child: InkWell(
                key: Key('mode-${value.name}'),
                borderRadius: BorderRadius.circular(12),
                onTap: () => onChanged(value),
                child: Center(
                  child: AnimatedDefaultTextStyle(
                    duration: const Duration(milliseconds: 250),
                    style: AppText.body.copyWith(
                      fontFamily: AppTheme.fontFamily,
                      fontWeight: FontWeight.w700,
                      color: (value == OtpContext.register) == register ? AppColors.navy : AppColors.muted),
                    child: Text(label),
                  ),
                ),
              ),
            ),
        ]),
      ]),
    );
  }
}

/// Main action: navy-to-blue gradient pill with a gold arrow that nudges forward.
class _GoldButton extends StatelessWidget {
  const _GoldButton({super.key, required this.label, required this.loading, required this.onPressed});
  final String label;
  final bool loading;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 58,
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [AppColors.navy, AppColors.navy2]),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.3), blurRadius: 18, offset: const Offset(0, 8))],
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: loading ? null : onPressed,
          child: Center(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: loading
                  ? const SizedBox(
                      key: ValueKey('loading'),
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(strokeWidth: 2.6, color: Colors.white),
                    )
                  : Row(key: const ValueKey('label'), mainAxisSize: MainAxisSize.min, children: [
                      Text(label, style: AppText.body.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
                      const SizedBox(width: 10),
                      Container(
                        padding: const EdgeInsets.all(4),
                        decoration: const BoxDecoration(color: AppColors.gold, shape: BoxShape.circle),
                        child: const Icon(Icons.arrow_forward_rounded, color: Colors.white, size: 18),
                      ),
                    ]),
            ),
          ),
        ),
      ),
    );
  }
}

class _Promise extends StatelessWidget {
  const _Promise({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(children: [
        Icon(icon, color: AppColors.gold, size: 22),
        const SizedBox(height: 6),
        Text(text, textAlign: TextAlign.center, style: AppText.caption.copyWith(height: 1.45, color: AppColors.ink)),
      ]),
    );
  }
}

/// The picked country in the header; tap to change it.
class _CountryChip extends StatelessWidget {
  const _CountryChip({required this.country, required this.onTap});
  final Country country;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.12),
      shape: StadiumBorder(side: BorderSide(color: Colors.white.withValues(alpha: 0.25))),
      child: InkWell(
        key: const Key('change-country'),
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(country.flagEmoji, style: AppText.body),
            const SizedBox(width: 6),
            Text(country.nameAr, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
            const Icon(Icons.expand_more_rounded, color: Colors.white70, size: 18),
          ]),
        ),
      ),
    );
  }
}
