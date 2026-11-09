import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/localization/digits.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/json.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/person.dart';
import '../../shared/widgets/common.dart';
import '../auth/phone_validation.dart';
import 'profile_edit_screen.dart' show profileFieldLabels;
import 'profile_repository.dart';

/// Free-text fields the app lets a member fill or change. Filling an empty one saves at once; changing a
/// stored value goes to the team for review (`PROFILE_EDIT_NEEDS_REVIEW`), like on the website.
const editableTexts = <(String, String, int)>[
  ('aboutMe', 'نبذة عني', 500),
  ('job', 'العمل', 100),
  ('hobbies', 'الهوايات', 500),
  ('interests', 'الاهتمامات', 500),
  ('familyValues', 'قيم الأسرة', 500),
  ('partnerExpectations', 'ما أبحث عنه في شريك الحياة', 500),
];

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(myProfileProvider);
    final me = ref.watch(authControllerProvider).me;
    // An edit waiting for review shows here too (not only on «تعديل ملفي»)
    final pending = ref.watch(pendingEditProvider).valueOrNull;
    return Scaffold(
      appBar: AppBar(title: const Text('ملفي')),
      body: profile.when(
        loading: () => const SkeletonList(count: 4, itemHeight: 80),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(myProfileProvider)),
        data: (p) {
          final female = p.female;
          String? v(String k) => asString(p.field(k));
          final dob = asDate(p.field('dateOfBirth'));
          final facts = <(String, String?)>[
            ('تاريخ الميلاد', dob == null ? null : formatDate(dob)),
            ('الجنسية', v('nationality')),
            ('المدينة', [v('city'), v('area')].whereType<String>().join('، ')),
            ('التعليم', v('education')),
            ('الوظيفة', v('job')),
            ('الحالة الاجتماعية', v('maritalStatus') == null ? null : OptionLabels.self('maritalStatus', v('maritalStatus')!, female: female)),
            ('التدين', v('religiosity') == null ? null : OptionLabels.self('religiosity', v('religiosity')!, female: female)),
            if (female) ('الحجاب', hijabLabel(asBool(p.field('hijab')), asBool(p.field('niqab')))),
            ('العمر المناسب للشريك',
                p.field('prefAgeMin') == null ? null : '${asInt(p.field('prefAgeMin'))} – ${asInt(p.field('prefAgeMax'))}'),
          ];
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(myProfileProvider);
              ref.invalidate(pendingEditProvider);
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (pending != null) ...[
                  InfoBanner(
                    key: const Key('profile-pending-review'),
                    tone: BannerTone.warning,
                    icon: Icons.hourglass_top_rounded,
                    text: 'طلب تعديل قيد المراجعة: ${pending.fields.map((f) => profileFieldLabels[f] ?? f).join('، ')}. '
                        'تظهر القيم الجديدة بعد الموافقة.',
                  ),
                  const SizedBox(height: 12),
                ],
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${p.firstName} ${p.lastName}', style: Theme.of(context).textTheme.titleLarge),
                              if (me != null)
                                Directionality(
                                  textDirection: TextDirection.ltr,
                                  child: Text(displayPhone(me.phone, me.country),
                                      style: const TextStyle(color: AppColors.muted)),
                                ),
                              if (me != null) Text('${me.country.flagEmoji} ${me.country.nameAr}', style: const TextStyle(color: AppColors.muted)),
                            ],
                          ),
                        ),
                        Column(
                          children: [
                            SizedBox(
                              width: 58,
                              height: 58,
                              child: Stack(alignment: Alignment.center, children: [
                                CircularProgressIndicator(
                                  value: p.completeness / 100,
                                  strokeWidth: 5,
                                  color: AppColors.gold,
                                  backgroundColor: AppColors.line,
                                ),
                                Text('${p.completeness}%', style: const TextStyle(fontWeight: FontWeight.w800)),
                              ]),
                            ),
                            const SizedBox(height: 4),
                            const Text('اكتمال الملف', style: TextStyle(fontSize: 12, color: AppColors.muted)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                const SectionTitle('بياناتي الأساسية'),
                Card(
                  child: Column(
                    children: [
                      for (final f in facts.where((f) => f.$2 != null && f.$2!.isNotEmpty))
                        ListTile(
                          dense: true,
                          title: Text(f.$1, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                          subtitle: Text(f.$2!, style: const TextStyle(fontSize: 15.5, color: AppColors.ink, fontWeight: FontWeight.w600)),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                LoadingButton(
                  key: const Key('edit-profile'),
                  label: 'تعديل ملفي (كل البيانات)',
                  icon: Icons.edit_note_rounded,
                  onPressed: () async {
                    await context.push('/profile/edit');
                    if (context.mounted) ref.invalidate(myProfileProvider);
                  },
                ),
                const SizedBox(height: 8),
                const Text(
                  'الحقول الفارغة تُحفظ فوراً، وتغيير بيانات محفوظة يُراجع من فريق نصيبك قبل اعتماده.',
                  style: TextStyle(color: AppColors.muted, fontSize: 12.5),
                ),
                const SizedBox(height: 16),
                const SectionTitle('عنّي'),
                for (final t in editableTexts)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Card(
                      child: ListTile(
                        minVerticalPadding: 12,
                        title: Text(t.$2, style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text(
                          (v(t.$1) ?? '').isEmpty ? 'لم تُضف بعد' : (t.$1 == 'job' ? OptionLabels.self('job', v(t.$1)!, female: female) : v(t.$1)!),
                          style: TextStyle(color: (v(t.$1) ?? '').isEmpty ? AppColors.muted : AppColors.ink),
                        ),
                        trailing: const Icon(Icons.edit_outlined, color: AppColors.navy),
                        onTap: () => _edit(context, ref, p, t),
                      ),
                    ),
                  ),
                const SizedBox(height: 8),
                const SectionTitle('ملفي في نصيبك'),
                for (final link in const [
                  (Icons.photo_library_outlined, 'صوري', 'مخفية حتى التوافق المتبادل', '/profile/photos'),
                  (Icons.tune_rounded, 'تفضيلات الشريك', 'العمر والمدينة والتعليم… وشروطي الأساسية', '/profile/preferences'),
                  (Icons.psychology_alt_outlined, 'اختبار الشخصية', 'يدخل في نسبة التوافق', '/profile/quiz'),
                ])
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Card(
                      child: ListTile(
                        leading: Icon(link.$1, color: AppColors.navy),
                        title: Text(link.$2),
                        subtitle: Text(link.$3),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () async {
                          await context.push(link.$4);
                          if (context.mounted) ref.invalidate(myProfileProvider);
                        },
                      ),
                    ),
                  ),
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.family_restroom_rounded, color: AppColors.navy),
                    title: const Text('بيانات وليّ الأمر'),
                    subtitle: Text(p.hasGuardian ? (p.guardianConsented ? 'محفوظة · موافقة المشاركة مُعطاة' : 'محفوظة') : 'لم تُضف بعد'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/profile/guardian'),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _edit(BuildContext context, WidgetRef ref, MyProfile p, (String, String, int) field) async {
    final current = asString(p.field(field.$1)) ?? '';
    final value = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _TextEditSheet(title: field.$2, initial: current, maxLength: field.$3),
    );
    if (value == null || value.trim() == current.trim() || !context.mounted) return;
    final repo = ref.read(profileRepositoryProvider);
    try {
      if (current.isEmpty) {
        try {
          await repo.save({...requiredPayload(p), field.$1: value.trim()});
          if (context.mounted) showSnack(context, 'تم الحفظ');
        } on ApiException catch (e) {
          if (e.code != 'PROFILE_EDIT_NEEDS_REVIEW') rethrow;
          await repo.requestUpdate({field.$1: value.trim()});
          if (context.mounted) showSnack(context, 'أُرسل التعديل للمراجعة');
        }
      } else {
        final msg = await repo.requestUpdate({field.$1: value.trim()});
        if (context.mounted) showSnack(context, msg ?? 'أُرسل التعديل للمراجعة وسيظهر بعد اعتماده');
      }
      ref.invalidate(myProfileProvider);
    } on ApiException catch (e) {
      if (context.mounted) showSnack(context, e.message);
    }
  }
}

/// The required setup fields as stored, so a `PUT /api/profile` that fills one optional field keeps them.
Map<String, dynamic> requiredPayload(MyProfile p) {
  final dob = asString(p.field('dateOfBirth'));
  return {
    if (dob != null) 'dateOfBirth': dob.length >= 10 ? dob.substring(0, 10) : dob,
    'city': p.field('city'),
    'nationality': p.field('nationality'),
    'education': p.field('education'),
    'maritalStatus': p.field('maritalStatus'),
    'religiosity': p.field('religiosity'),
    'childrenCount': asInt(p.field('childrenCount')) ?? 0,
    'prefAgeMin': asInt(p.field('prefAgeMin')),
    'prefAgeMax': asInt(p.field('prefAgeMax')),
  }..removeWhere((_, v) => v == null);
}

class _TextEditSheet extends StatefulWidget {
  const _TextEditSheet({required this.title, required this.initial, required this.maxLength});
  final String title;
  final String initial;
  final int maxLength;

  @override
  State<_TextEditSheet> createState() => _TextEditSheetState();
}

class _TextEditSheetState extends State<_TextEditSheet> {
  late final _c = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 6),
            if (widget.initial.isNotEmpty)
              const Text('تغيير قيمة محفوظة يُرسل للمراجعة قبل ظهوره.', style: TextStyle(color: AppColors.muted, fontSize: 13)),
            const SizedBox(height: 12),
            TextField(controller: _c, maxLength: widget.maxLength, maxLines: widget.maxLength > 100 ? 5 : 1, autofocus: true),
            const SizedBox(height: 8),
            FilledButton(onPressed: () => Navigator.of(context).pop(_c.text), child: const Text('حفظ')),
          ],
        ),
      ),
    );
  }
}
