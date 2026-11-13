import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/providers.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/network/json.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../../shared/widgets/grouped_section.dart';

/// A friend who signed up with my code: only the first name is ever read from the server's row.
class ReferredFriend {
  const ReferredFriend({required this.firstName, required this.completed});

  factory ReferredFriend.fromJson(Map<String, dynamic> j) {
    final referee = j['referee'];
    return ReferredFriend(
      firstName: referee is Map<String, dynamic> ? asStringOr(referee['firstName']) : '',
      completed: (asInt(j['creditsAwarded']) ?? 0) > 0,
    );
  }

  final String firstName;

  /// The friend finished the short setup and the reward was given
  final bool completed;
}

/// The reward stops after this many completed invitations (`maybeAwardReferral`)
const referralRewardLimit = 10;

class ReferralInfo {
  const ReferralInfo({required this.code, required this.total, required this.completed, this.friends = const []});

  factory ReferralInfo.fromJson(Map<String, dynamic> j) {
    final rows = j['referrals'];
    return ReferralInfo(
      code: asStringOr(j['referralCode']),
      total: asInt(j['totalReferrals']) ?? 0,
      completed: asInt(j['completedReferrals']) ?? 0,
      friends: rows is List
          ? [for (final r in rows) if (r is Map<String, dynamic>) ReferredFriend.fromJson(r)]
          : const [],
    );
  }

  final String code;
  final int total;
  final int completed;
  final List<ReferredFriend> friends;

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
          final friends = r.friends.where((f) => f.firstName.isNotEmpty).take(referralRewardLimit).toList();
          final done = r.completed > referralRewardLimit ? referralRewardLimit : r.completed;
          return ListView(
            padding: const EdgeInsets.fromLTRB(AppSpace.lg, AppSpace.sm, AppSpace.lg, AppSpace.x3),
            children: [
              Text(
                female
                    ? 'شاركي رمزكِ مع من تعرفين ممن يبحث عن الزواج. عندما يُكمل المدعو إعداد ملفه تحصلين على رصيد إضافي، ويحصل المدعو على رصيد هدية.'
                    : 'شارك رمزك مع من تعرف ممن يبحث عن الزواج. عندما يُكمل المدعو إعداد ملفه تحصل على رصيد إضافي، ويحصل المدعو على رصيد هدية.',
                style: AppText.labelRegular.copyWith(color: AppColors.muted),
              ),
              const SizedBox(height: AppSpace.xs),
              Text('رصيدان لك ورصيد لصديقك، بعد أن يكمل الإعداد القصير.',
                  style: AppText.label.copyWith(color: AppColors.goldText)),
              _header('رمز الدعوة'),
              Container(
                decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(AppRadius.md)),
                padding: const EdgeInsetsDirectional.fromSTEB(AppSpace.lg, AppSpace.sm, AppSpace.sm, AppSpace.sm),
                child: Row(children: [
                  Expanded(
                    child: SelectableText(r.code,
                        key: const Key('referral-code'),
                        textDirection: TextDirection.ltr,
                        style: AppText.headline.copyWith(letterSpacing: 3, color: AppColors.navy)),
                  ),
                  TextButton.icon(
                    onPressed: () async {
                      await Clipboard.setData(ClipboardData(text: link));
                      if (context.mounted) showSnack(context, 'نُسخ الرابط');
                    },
                    style: TextButton.styleFrom(minimumSize: const Size(44, 44)),
                    icon: const Icon(Icons.copy_rounded, size: 20),
                    label: const Text('نسخ'),
                  ),
                ]),
              ),
              const SizedBox(height: AppSpace.md),
              FilledButton.icon(
                onPressed: () => SharePlus.instance.share(ShareParams(text: text, subject: 'دعوة لمنصة نصيبك')),
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                icon: const Icon(Icons.share_rounded),
                label: const Text('مشاركة الدعوة'),
              ),
              _header('كيف تعمل'),
              GroupedSection(rows: [
                GroupedRow(icon: Icons.looks_one_rounded, title: 'شارك رمزك مع من يبحث عن الزواج بجدية'),
                GroupedRow(icon: Icons.looks_two_rounded, title: 'يسجّل صديقك ويكمل الإعداد القصير'),
                GroupedRow(icon: Icons.looks_3_rounded, title: 'تحصل على رصيدين، وصديقك على رصيد'),
              ]),
              _header('دعواتك'),
              Row(children: [
                Expanded(child: _Stat(label: female ? 'سجّلوا برمزكِ' : 'سجّلوا برمزك', value: r.total)),
                const SizedBox(width: 10),
                Expanded(child: _Stat(label: 'أكملوا ملفاتهم', value: r.completed)),
              ]),
              const SizedBox(height: AppSpace.sm),
              Text('دعوات مكتملة $done من $referralRewardLimit',
                  key: const Key('referral-progress'), style: AppText.label.copyWith(color: AppColors.ink)),
              if (friends.isNotEmpty) ...[
                _header('أصدقاؤك'),
                GroupedSection(rows: [
                  for (final f in friends)
                    GroupedRow(
                      title: f.firstName,
                      trailing: Text(
                        f.completed ? 'اكتمل' : 'لم يكمل الإعداد بعد',
                        style: AppText.label.copyWith(color: f.completed ? AppColors.success : AppColors.muted),
                      ),
                    ),
                ]),
              ],
            ],
          );
        },
      ),
    );
  }

  static Widget _header(String t) => Padding(
        padding: const EdgeInsets.fromLTRB(AppSpace.xs, AppSpace.xl, AppSpace.xs, AppSpace.sm),
        child: Text(t, style: AppText.label.copyWith(color: AppColors.muted)),
      );
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
            Text('$value', style: AppText.title.copyWith(fontWeight: FontWeight.w800, color: AppColors.goldText)),
            Text(label, style: AppText.labelRegular.copyWith(color: AppColors.muted)),
          ]),
        ),
      );
}
