import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/analytics/analytics.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../country_selection/country_providers.dart';
import '../../core/routing/website_links.dart';
import '../referral/referral_screen.dart' show cleanReferralCode;
import '../welcome/brand_visuals.dart';
import 'pending_auth.dart';

/// Arabic name rule of the backend: Arabic letters and spaces, at least 2 letters, at most 40 chars.
String? validateArabicName(String value, String label) {
  final v = value.trim().replaceAll(RegExp(r'\s+'), ' ');
  if (v.isEmpty) return '$label مطلوب';
  if (v.length > 40) return '$label طويل جداً (40 حرفاً كحد أقصى)';
  if (!RegExp(r'^[؀-ۿ\s]+$').hasMatch(v)) return '$label يجب أن يكون بالعربية فقط';
  final letters = RegExp(r'[ء-ي]').allMatches(v).length;
  if (letters < 2) return '$label يجب أن يكون حرفين على الأقل';
  return null;
}

/// New member details after the code is verified, then sign-in.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _invite = TextEditingController();
  String? _gender;
  bool _terms = false;
  bool _busy = false;

  /// The account was created by this screen (a retry after a failed sign-in answers 409 `PHONE_EXISTS`, and the
  /// invitation code must still be applied)
  bool _createdHere = false;
  String? _error;
  Map<String, String?> _fieldErrors = {};

  @override
  void initState() {
    super.initState();
    // Opened from a friend's referral link (naseebak.com/register?invitationCode=…)
    _invite.text = ref.read(sharedPreferencesProvider).getString(pendingInvitationKey) ?? '';
  }

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _invite.dispose();
    super.dispose();
  }

  Future<void> _submit(PendingAuth pending) async {
    final errors = <String, String?>{
      'first': validateArabicName(_first.text, 'الاسم الأول'),
      'last': validateArabicName(_last.text, 'اسم العائلة'),
      'gender': _gender == null ? 'اختر الجنس' : null,
      'invite': _invite.text.trim().isEmpty || cleanReferralCode(_invite.text).length == 8
          ? null
          : 'رمز الدعوة يتكون من 8 أحرف وأرقام',
      'terms': _terms ? null : 'يرجى الموافقة على الشروط وسياسة الخصوصية وتأكيد أن عمرك 18 سنة أو أكثر',
    };
    setState(() {
      _fieldErrors = errors;
      _error = null;
    });
    if (errors.values.any((e) => e != null) || _busy) return;
    final code = pending.code;
    if (code == null) {
      setState(() => _error = 'انتهت صلاحية الرمز. ابدأ من جديد.');
      return;
    }
    setState(() => _busy = true);
    // Read before any await: signing in moves the router on and disposes this screen
    final auth = ref.read(authControllerProvider.notifier);
    final api = ref.read(apiClientProvider);
    final inviteWarning = ref.read(inviteWarningProvider.notifier);
    final analytics = ref.read(analyticsProvider);
    inviteWarning.set(null);
    final prefs = ref.read(sharedPreferencesProvider);
    final invite = cleanReferralCode(_invite.text);
    try {
      try {
        await ref
            .read(authRepositoryProvider)
            .register(
              firstName: _first.text.trim().replaceAll(RegExp(r'\s+'), ' '),
              lastName: _last.text.trim().replaceAll(RegExp(r'\s+'), ' '),
              phone: pending.phone,
              gender: _gender!,
              otp: code,
              country: pending.countryCode,
            );
        _createdHere = true;
      } on ApiException catch (e) {
        // Already a member (or created by an earlier try on this screen whose sign-in failed): the verified code
        // signs them in
        if (e.code != 'PHONE_EXISTS') rethrow;
      }
      final applyInvite = _createdHere && invite.length == 8;
      // The link's code is used now (or never): don't offer it to the next sign-up on this phone
      if (_createdHere) await prefs.remove(pendingInvitationKey);
      await auth.signInWithCode(phone: pending.phone, code: code);
      _createdHere ? analytics.signedUp(withInvite: applyInvite) : analytics.loggedIn();
      // Invitation code, like the website: best effort, a wrong code never blocks the sign-up
      if (applyInvite) {
        try {
          await api.post('/api/referral/apply', body: {'code': invite});
          analytics.inviteCode(applied: true);
        } catch (e) {
          inviteWarning.set(ApiException.messageOf(e));
          analytics.inviteCode(applied: false);
        }
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = ApiException.genericMessage);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pending = ref.watch(pendingAuthProvider);
    if (pending == null) {
      return Scaffold(
        appBar: AppBar(),
        body: MessageView(
          icon: Icons.person_add_alt_1_outlined,
          title: 'ابدأ بإدخال رقمك',
          actionLabel: 'رجوع',
          onAction: () => context.go('/auth/phone'),
        ),
      );
    }
    final details = ref.watch(countryDetailsProvider(pending.countryCode)).valueOrNull;
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: AppColors.offWhite,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AuthHero(
            showBack: true,
            title: 'عرّفنا بنفسك',
            subtitle: 'خطوة أخيرة لإنشاء حسابك. يظهر اسمك الأول فقط للطرف الآخر.',
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 4, 24, 32),
              children: [
                TextField(
                  key: const Key('first-name'),
                  controller: _first,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(labelText: 'الاسم الأول', errorText: _fieldErrors['first']),
                ),
                const SizedBox(height: 14),
                TextField(
                  key: const Key('last-name'),
                  controller: _last,
                  textInputAction: TextInputAction.done,
                  decoration: InputDecoration(labelText: 'اسم العائلة', errorText: _fieldErrors['last']),
                ),
                const SizedBox(height: 14),
                TextField(
                  key: const Key('invite-code'),
                  controller: _invite,
                  textCapitalization: TextCapitalization.characters,
                  textDirection: TextDirection.ltr,
                  decoration: InputDecoration(labelText: 'رمز الدعوة (اختياري)', errorText: _fieldErrors['invite']),
                ),
                const SizedBox(height: 22),
                Text('أنا', style: theme.textTheme.titleSmall),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(child: _genderOption('MALE', 'رجل', 'أبحث عن زوجة', Icons.man_rounded)),
                    const SizedBox(width: 12),
                    Expanded(child: _genderOption('FEMALE', 'امرأة', 'أبحث عن زوج', Icons.woman_rounded)),
                  ],
                ),
                if (_fieldErrors['gender'] != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(_fieldErrors['gender']!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
                  ),
                const SizedBox(height: 20),
                InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => setState(() => _terms = !_terms),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Checkbox(
                        key: const Key('terms'),
                        value: _terms,
                        onChanged: (v) => setState(() => _terms = v ?? false),
                      ),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Text.rich(
                            TextSpan(
                              style: theme.textTheme.bodyMedium,
                              children: [
                                const TextSpan(text: 'أوافق على '),
                                TextSpan(
                                  text: 'الشروط والأحكام',
                                  style: const TextStyle(
                                    color: AppColors.navy,
                                    fontWeight: FontWeight.w700,
                                    decoration: TextDecoration.underline,
                                  ),
                                  recognizer: TapGestureRecognizer()
                                    ..onTap = () => openExternal(context, details?.links.terms),
                                ),
                                const TextSpan(text: ' و'),
                                TextSpan(
                                  text: 'سياسة الخصوصية',
                                  style: const TextStyle(
                                    color: AppColors.navy,
                                    fontWeight: FontWeight.w700,
                                    decoration: TextDecoration.underline,
                                  ),
                                  recognizer: TapGestureRecognizer()
                                    ..onTap = () => openExternal(context, details?.links.privacy),
                                ),
                                const TextSpan(text: '، وأؤكد أن عمري 18 سنة أو أكثر.'),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                if (_fieldErrors['terms'] != null)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(start: 12, top: 4),
                    child: Text(_fieldErrors['terms']!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
                  ),
                if (_error != null) ...[const SizedBox(height: 14), InfoBanner(text: _error!, tone: BannerTone.danger)],
                const SizedBox(height: 24),
                LoadingButton(
                  key: const Key('register-submit'),
                  label: 'إنشاء الحساب',
                  loading: _busy,
                  onPressed: () => _submit(pending),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _genderOption(String value, String title, String sub, IconData icon) {
    final selected = _gender == value;
    return Material(
      color: selected ? AppColors.navy.withValues(alpha: 0.06) : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: selected ? AppColors.navy : AppColors.line, width: selected ? 1.6 : 1),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => setState(() => _gender = value),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
          child: Column(
            children: [
              Icon(icon, size: 30, color: selected ? AppColors.navy : AppColors.muted),
              const SizedBox(height: 6),
              Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              Text(sub, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
            ],
          ),
        ),
      ),
    );
  }
}
