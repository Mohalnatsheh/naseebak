import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/localization/safe_input_formatter.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../auth/phone_validation.dart';
import '../country_selection/country.dart';
import '../home/counts.dart';
import '../onboarding/profile_options.dart';
import 'profile_repository.dart';

/// Guardian contact fields (shared by the setup step and the «بيانات وليّ الأمر» screen).
class GuardianFields {
  final name = TextEditingController();
  final phone = TextEditingController();
  final address = TextEditingController();
  String? relationship;
  bool consent = false;

  /// What the server has (null before the first save)
  GuardianInfo? stored;

  void fill(GuardianInfo g, String dialDigits) {
    stored = g;
    name.text = g.name;
    phone.text = g.phone.startsWith(dialDigits) ? '0${g.phone.substring(dialDigits.length)}' : g.phone;
    address.text = g.address;
    relationship = g.relationship.isEmpty ? null : g.relationship;
    consent = g.consented;
  }

  /// The number to send: the stored (normalised, "962…") form while the member left it as it was, so the server's
  /// "same contact, only the consent changes" shortcut (it compares with what it stored) matches; else the typed one.
  String phoneToSend(Country country) {
    final s = stored;
    if (s != null && s.phone.isNotEmpty && nationalNumber(phone.text, country) == nationalNumber(s.phone, country)) {
      return s.phone;
    }
    return localPhone(phone.text, country);
  }

  void dispose() {
    name.dispose();
    phone.dispose();
    address.dispose();
  }
}

class GuardianFieldsView extends ConsumerWidget {
  const GuardianFieldsView({super.key, required this.fields, required this.errors, required this.onFieldChanged});
  final GuardianFields fields;
  final Map<String, String?> errors;

  /// An answer changed (its key: `parentName`, `relationship`, `parentPhone`, `address`, `consent`): the owner of
  /// [errors] clears that one and rebuilds
  final ValueChanged<String> onFieldChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final country = ref.watch(authControllerProvider).me?.country;
    void changed(String key) => onFieldChanged(key);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: fields.name,
          onChanged: (_) => changed('parentName'),
          decoration: InputDecoration(labelText: 'اسم وليّ الأمر', errorText: errors['parentName']),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: fields.relationship,
          decoration: InputDecoration(labelText: 'صلة القرابة', errorText: errors['relationship']),
          items: [
            for (final e in ProfileOptions.relationships.entries) DropdownMenuItem(value: e.key, child: Text(e.value)),
          ],
          onChanged: (v) {
            fields.relationship = v;
            changed('relationship');
          },
        ),
        const SizedBox(height: 12),
        Directionality(
          textDirection: TextDirection.ltr,
          child: TextField(
            controller: fields.phone,
            keyboardType: TextInputType.phone,
            inputFormatters: [LatinDigitsFormatter()],
            onChanged: (_) => changed('parentPhone'),
            decoration: InputDecoration(
              labelText: 'رقم ${country?.phoneWord ?? 'هاتف'} وليّ الأمر',
              hintText: country?.phoneExample,
              errorText: errors['parentPhone'],
            ),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: fields.address,
          onChanged: (_) => changed('address'),
          decoration: InputDecoration(labelText: 'العنوان (المدينة والحي)', errorText: errors['address']),
        ),
        const SizedBox(height: 4),
        CheckboxListTile(
          value: fields.consent,
          onChanged: (v) {
            fields.consent = v ?? false;
            changed('consent');
          },
          controlAffinity: ListTileControlAffinity.leading,
          contentPadding: EdgeInsets.zero,
          title: const Text(
            'أوافق على مشاركة اسم وليّ أمري ورقمه مع عائلة الطرف الآخر بعد قبول تعارف عائلي.',
            style: TextStyle(fontSize: 14),
          ),
        ),
        const Text(
          'لا تظهر هذه البيانات لأي عضو إلا بعد تعارف عائلي مقبول وبموافقتك.',
          style: TextStyle(color: AppColors.muted, fontSize: 12.5),
        ),
      ],
    );
  }
}

/// Client-side checks matching the server's `parentInfoSchemaFor` (the server still decides).
Map<String, String?> validateGuardian(GuardianFields f) {
  final errors = <String, String?>{};
  final name = f.name.text.trim();
  if (name.length < 2) {
    errors['parentName'] = 'اسم ولي الأمر مطلوب';
  } else if (!RegExp(r'^[؀-ۿ\s]+$').hasMatch(name)) {
    errors['parentName'] = 'يرجى كتابة اسم ولي الأمر باللغة العربية';
  }
  if (f.relationship == null) errors['relationship'] = 'صلة القرابة مطلوبة';
  if (f.address.text.trim().length < 3) errors['address'] = 'العنوان مطلوب';
  return errors;
}

/// «بيانات وليّ الأمر» (also opened from a family step that answered `GUARDIAN_REQUIRED`).
class GuardianScreen extends ConsumerStatefulWidget {
  const GuardianScreen({super.key});

  @override
  ConsumerState<GuardianScreen> createState() => _GuardianScreenState();
}

class _GuardianScreenState extends ConsumerState<GuardianScreen> {
  final _fields = GuardianFields();
  Map<String, String?> _errors = {};
  bool _loading = true;
  bool _saving = false;
  Object? _loadError;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _fields.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final g = await ref.read(profileRepositoryProvider).guardian();
      final dial = ref.read(authControllerProvider).me?.country.dialDigits ?? '962';
      if (g != null) _fields.fill(g, dial);
    } catch (e) {
      _loadError = e;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    final country = ref.read(authControllerProvider).me?.country;
    if (country == null) return;
    final errors = validateGuardian(_fields);
    final phoneErr = validatePhone(_fields.phone.text, country);
    if (phoneErr != null) errors['parentPhone'] = phoneErr;
    setState(() {
      _errors = errors;
      _error = null;
    });
    if (errors.values.any((e) => e != null)) return;
    setState(() => _saving = true);
    try {
      await ref.read(profileRepositoryProvider).saveGuardian(
            name: _fields.name.text,
            phone: _fields.phoneToSend(country),
            relationship: _fields.relationship!,
            address: _fields.address.text,
            shareConsent: _fields.consent,
          );
      ref.invalidate(countsProvider);
      ref.invalidate(myProfileProvider);
      if (mounted) {
        showSnack(context, 'تم حفظ بيانات وليّ الأمر');
        Navigator.of(context).maybePop();
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('بيانات وليّ الأمر')),
      body: _loading
          ? const SkeletonList(count: 4, itemHeight: 56)
          : _loadError != null
              ? ErrorView(error: _loadError!, onRetry: _load)
              : ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    GuardianFieldsView(
                      fields: _fields,
                      errors: _errors,
                      // An error goes as soon as its answer changes (not only at the next save)
                      onFieldChanged: (key) => setState(() => _errors = {..._errors}..remove(key)),
                    ),
                    if (_error != null) ...[const SizedBox(height: 12), InfoBanner(text: _error!, tone: BannerTone.danger)],
                    const SizedBox(height: 20),
                    LoadingButton(label: 'حفظ', loading: _saving, onPressed: _save),
                  ],
                ),
    );
  }
}
