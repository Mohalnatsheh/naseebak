import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../country_selection/country.dart';
import '../country_selection/country_providers.dart';
import 'auth_repository.dart';
import 'pending_auth.dart';
import 'phone_validation.dart';

/// Phone number entry for sign-in or sign-up, with the picked country's dial code.
class PhoneScreen extends ConsumerWidget {
  const PhoneScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final country = ref.watch(pickedCountryProvider);
    return Scaffold(
      body: country.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(countriesProvider)),
        data: (c) => c == null
            ? MessageView(
                icon: Icons.public_rounded,
                title: 'اختر دولتك أولاً',
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
  String? _fieldError;
  String? _serverError;
  bool _sending = false;

  @override
  void dispose() {
    _controller.dispose();
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

  @override
  Widget build(BuildContext context) {
    final country = widget.country;
    final mode = ref.watch(authModeProvider);
    final register = mode == OtpContext.register;
    final theme = Theme.of(context);
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
        children: [
          const Align(alignment: AlignmentDirectional.centerStart, child: BrandLogo(height: 40)),
          const SizedBox(height: 32),
          Text(register ? 'إنشاء حساب جديد' : 'تسجيل الدخول', style: theme.textTheme.headlineSmall),
          const SizedBox(height: 8),
          Text(
            register
                ? 'أدخل رقم ${country.phoneWord}ك وسنرسل لك رمز تحقق لإنشاء حسابك.'
                : 'أدخل رقم ${country.phoneWord}ك وسنرسل لك رمز تحقق من 6 أرقام.',
            style: theme.textTheme.bodyMedium?.copyWith(color: AppColors.muted),
          ),
          const SizedBox(height: 24),
          if (register && !country.registrationOpen) ...[
            const InfoBanner(text: 'التسجيل مغلق مؤقتاً في هذه الدولة.', tone: BannerTone.warning),
            const SizedBox(height: 16),
          ],
          Text('رقم ${country.phoneWord}', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          Directionality(
            textDirection: TextDirection.ltr,
            child: TextField(
              key: const Key('phone-field'),
              controller: _controller,
              keyboardType: TextInputType.phone,
              textInputAction: TextInputAction.done,
              autofillHints: const [AutofillHints.telephoneNumberNational],
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[0-9٠-٩۰-۹+ ]')),
                LengthLimitingTextInputFormatter(16),
              ],
              style: const TextStyle(fontSize: 18, letterSpacing: 1),
              onSubmitted: (_) => _submit(),
              decoration: InputDecoration(
                hintText: country.phoneExample,
                errorText: _fieldError,
                errorMaxLines: 2,
                prefixIcon: Padding(
                  padding: const EdgeInsetsDirectional.only(start: 14, end: 8),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(country.flagEmoji, style: const TextStyle(fontSize: 20)),
                      const SizedBox(width: 6),
                      Text(country.dialCode, style: const TextStyle(fontSize: 16, color: AppColors.muted)),
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (_serverError != null) ...[
            const SizedBox(height: 14),
            InfoBanner(text: _serverError!, tone: BannerTone.danger),
          ],
          const SizedBox(height: 24),
          LoadingButton(
            key: const Key('send-otp'),
            label: 'إرسال رمز التحقق',
            loading: _sending,
            onPressed: _submit,
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: _sending
                ? null
                : () {
                    ref.read(authModeProvider.notifier).set(register ? OtpContext.login : OtpContext.register);
                    setState(() {
                      _serverError = null;
                      _fieldError = null;
                    });
                  },
            child: Text(register ? 'لديك حساب؟ سجّل الدخول' : 'عضو جديد؟ أنشئ حساباً'),
          ),
          const SizedBox(height: 8),
          Center(
            child: TextButton.icon(
              onPressed: _sending ? null : () => context.push('/country'),
              icon: Text(country.flagEmoji, style: const TextStyle(fontSize: 18)),
              label: Text('${country.nameAr} · تغيير الدولة'),
            ),
          ),
        ],
      ),
    );
  }
}
