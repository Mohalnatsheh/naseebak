import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import 'country.dart';
import 'country_providers.dart';

/// First launch (or «تغيير الدولة» before sign-in): pick the country from `GET /api/countries`.
class CountryPickerScreen extends ConsumerStatefulWidget {
  const CountryPickerScreen({super.key, this.onPicked});

  /// Called after the pick is saved (tests use this).
  final ValueChanged<Country>? onPicked;

  @override
  ConsumerState<CountryPickerScreen> createState() => _CountryPickerScreenState();
}

class _CountryPickerScreenState extends ConsumerState<CountryPickerScreen> {
  String? _saving;

  Future<void> _pick(Country c) async {
    if (_saving != null) return;
    final router = GoRouter.maybeOf(context);
    // «تغيير الدولة» (pushed from the phone screen): leave first, then save. Saving refreshes the router,
    // and a pop racing that refresh would be undone.
    if (router != null && router.canPop()) {
      router.pop();
      await ref.read(selectedCountryCodeProvider.notifier).select(c.code);
      widget.onPicked?.call(c);
      return;
    }
    setState(() => _saving = c.code);
    await ref.read(selectedCountryCodeProvider.notifier).select(c.code);
    if (mounted) setState(() => _saving = null);
    widget.onPicked?.call(c);
    // First launch: on to sign-in
    router?.go('/auth/phone');
  }

  @override
  Widget build(BuildContext context) {
    final countries = ref.watch(countriesProvider);
    final selected = ref.watch(selectedCountryCodeProvider);
    return Scaffold(
      backgroundColor: AppColors.offWhite,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            color: AppColors.navy,
            padding: EdgeInsets.fromLTRB(24, MediaQuery.paddingOf(context).top + 32, 24, 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (Navigator.of(context).canPop())
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: IconButton(
                      tooltip: 'رجوع',
                      onPressed: () => Navigator.of(context).maybePop(),
                      icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                    ),
                  ),
                const BrandLogo(height: 52, onDark: true),
                const SizedBox(height: 24),
                const Text(
                  'أهلاً بك في نصيبك',
                  style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 6),
                Text(
                  'اختر دولتك لنعرض لك ما يناسبك. يُحدَّد حسابك برقم هاتفك، ولا ترى إلا أعضاء دولتك.',
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.82), fontSize: 15, height: 1.6),
                ),
              ],
            ),
          ),
          Expanded(
            child: countries.when(
              loading: () => const SkeletonList(count: 2, itemHeight: 76),
              error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(countriesProvider)),
              data: (list) {
                if (list.countries.isEmpty) {
                  return const MessageView(
                    icon: Icons.public_off_rounded,
                    title: 'لا توجد دول متاحة الآن',
                    body: 'حاول مرة أخرى لاحقاً.',
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.all(20),
                  itemCount: list.countries.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 12),
                  itemBuilder: (context, i) {
                    final c = list.countries[i];
                    return _CountryTile(
                      country: c,
                      selected: c.code == selected,
                      busy: _saving == c.code,
                      onTap: () => _pick(c),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _CountryTile extends StatelessWidget {
  const _CountryTile({required this.country, required this.selected, required this.busy, required this.onTap});
  final Country country;
  final bool selected;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: selected ? AppColors.gold : AppColors.line, width: selected ? 1.6 : 1),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: busy ? null : onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 72),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
            child: Row(
              children: [
                Text(country.flagEmoji, style: const TextStyle(fontSize: 30)),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(country.nameAr, style: Theme.of(context).textTheme.titleMedium),
                      if (!country.registrationOpen)
                        const Text('التسجيل مغلق مؤقتاً', style: TextStyle(color: AppColors.muted, fontSize: 13)),
                    ],
                  ),
                ),
                Directionality(
                  textDirection: TextDirection.ltr,
                  child: Text(country.dialCode, style: const TextStyle(color: AppColors.muted, fontSize: 15)),
                ),
                const SizedBox(width: 10),
                if (busy)
                  const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                else
                  Icon(
                    selected ? Icons.check_circle_rounded : Icons.chevron_right,
                    color: selected ? AppColors.gold : AppColors.muted,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
