import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/providers.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/network/json.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';

class ReferralInfo {
  const ReferralInfo({required this.code, required this.total, required this.completed});

  factory ReferralInfo.fromJson(Map<String, dynamic> j) => ReferralInfo(
        code: asStringOr(j['referralCode']),
        total: asInt(j['totalReferrals']) ?? 0,
        completed: asInt(j['completedReferrals']) ?? 0,
      );

  final String code;
  final int total;
  final int completed;

  /// Same link as the website's «دعوة الأصدقاء» (the register page reads `invitationCode`)
  String link(String siteUrl) => '${siteUrl.replaceAll(RegExp(r'/$'), '')}/register?invitationCode=$code';
}

/// A referral code as typed: Latin letters and digits only, upper case, 8 characters (`applyReferralSchema`).
String cleanReferralCode(String raw) {
  final code = raw.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
  return code.length > 8 ? code.substring(0, 8) : code;
}

final referralProvider = FutureProvider.autoDispose<ReferralInfo>(
  (ref) async => ReferralInfo.fromJson(await ref.watch(apiClientProvider).get('/api/referral')),
);

/// «دعوة الأصدقاء»: my code and link. The credits are given by the server once the friend finishes the setup.
class ReferralScreen extends ConsumerWidget {
  const ReferralScreen({super.key, this.siteUrl = 'https://naseebak.com'});
  final String siteUrl;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final info = ref.watch(referralProvider);
    final female = ref.watch(authControllerProvider).me?.isFemale ?? false;
    return Scaffold(
      appBar: AppBar(title: const Text('دعوة الأصدقاء')),
      body: info.when(
        loading: () => const SkeletonList(count: 2, itemHeight: 120),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(referralProvider)),
        data: (r) {
          final link = r.link(siteUrl);
          final text = 'أدعوك للتسجيل في نصيبك، منصة الزواج التقليدي. استخدم رمز الدعوة ${r.code} عند التسجيل: $link';
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              InfoBanner(
                icon: Icons.card_giftcard_rounded,
                text: female
                    ? 'شاركي رمزكِ مع من تعرفين ممن يبحث عن الزواج. عندما يُكمل المدعو إعداد ملفه تحصلين على رصيد إضافي، ويحصل المدعو على رصيد هدية.'
                    : 'شارك رمزك مع من تعرف ممن يبحث عن الزواج. عندما يُكمل المدعو إعداد ملفه تحصل على رصيد إضافي، ويحصل المدعو على رصيد هدية.',
              ),
              const SizedBox(height: 16),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(children: [
                    Text(female ? 'رمز الدعوة الخاص بكِ' : 'رمز الدعوة الخاص بك', style: TextStyle(color: AppColors.muted)),
                    const SizedBox(height: 8),
                    SelectableText(r.code,
                        key: const Key('referral-code'),
                        style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800, letterSpacing: 4, color: AppColors.navy)),
                    const SizedBox(height: 16),
                    Row(children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () async {
                            await Clipboard.setData(ClipboardData(text: link));
                            if (context.mounted) showSnack(context, 'نُسخ الرابط');
                          },
                          icon: const Icon(Icons.copy_rounded),
                          label: const Text('نسخ الرابط'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: () => SharePlus.instance.share(ShareParams(text: text, subject: 'دعوة لمنصة نصيبك')),
                          icon: const Icon(Icons.share_rounded),
                          label: const Text('مشاركة'),
                        ),
                      ),
                    ]),
                  ]),
                ),
              ),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: _Stat(label: female ? 'سجّلوا برمزكِ' : 'سجّلوا برمزك', value: r.total)),
                const SizedBox(width: 10),
                Expanded(child: _Stat(label: 'أكملوا ملفاتهم', value: r.completed)),
              ]),
            ],
          );
        },
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label;
  final int value;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(children: [
            Text('$value', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: AppColors.gold)),
            Text(label, style: const TextStyle(color: AppColors.muted)),
          ]),
        ),
      );
}
