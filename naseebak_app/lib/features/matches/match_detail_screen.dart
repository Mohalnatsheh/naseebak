import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/localization/digits.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/media_url.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../../shared/widgets/person_details_view.dart';
import '../home/counts.dart';
import 'match_models.dart';
import 'matches_repository.dart';

final _matchProvider = FutureProvider.autoDispose.family<MatchSummary?, String>(
  (ref, id) => ref.watch(matchesRepositoryProvider).find(id),
);

final introStateProvider = FutureProvider.autoDispose.family<IntroState, String>(
  (ref, id) => ref.watch(matchesRepositoryProvider).intro(id),
);

/// One match: partner details, photos (revealed after the match), and the next step.
class MatchDetailScreen extends ConsumerWidget {
  const MatchDetailScreen({super.key, required this.matchId, this.initial});
  final String matchId;
  final MatchSummary? initial;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (initial != null) return _MatchView(match: initial!);
    final match = ref.watch(_matchProvider(matchId));
    return match.when(
      loading: () => Scaffold(appBar: AppBar(), body: const SkeletonList(count: 3)),
      error: (e, _) => Scaffold(
        appBar: AppBar(),
        body: ErrorView(error: e, onRetry: () => ref.invalidate(_matchProvider(matchId))),
      ),
      data: (m) => m == null
          ? Scaffold(
              appBar: AppBar(),
              body: const MessageView(icon: Icons.search_off_rounded, title: 'التوافق غير موجود'),
            )
          : _MatchView(match: m),
    );
  }
}

class _MatchView extends ConsumerWidget {
  const _MatchView({required this.match});
  final MatchSummary match;

  Future<void> _block(BuildContext context, WidgetRef ref) async {
    final p = match.partner;
    final ok = await confirmDialog(
      context,
      title: 'حظر ${p.firstName}',
      body: 'يُغلق هذا التوافق ولن يظهر لك ${p.firstName} مجدداً، وتُلغى الطلبات المعلّقة بينكما.',
      confirmLabel: 'حظر',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    try {
      await ref.read(matchesRepositoryProvider).block(p.id);
      if (context.mounted) {
        showSnack(context, 'تم الحظر');
        context.pop();
      }
    } catch (e) {
      if (context.mounted) showSnack(context, ApiException.messageOf(e));
    }
  }

  Future<void> _report(BuildContext context, WidgetRef ref) async {
    final res = await showModalBottomSheet<(String, String)>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const ReportSheet(),
    );
    if (res == null || !context.mounted) return;
    try {
      await ref.read(matchesRepositoryProvider).report(match.partner.id, res.$1, details: res.$2);
      if (context.mounted) showSnack(context, 'وصلنا بلاغك وسيراجعه فريق نصيبك. شكراً لك.');
    } catch (e) {
      if (context.mounted) showSnack(context, ApiException.messageOf(e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(authControllerProvider).me;
    final p = match.partner;
    final closed = match.closedLabel;
    return Scaffold(
      appBar: AppBar(
        title: Text(p.firstName),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'خيارات',
            onSelected: (v) => v == 'block' ? _block(context, ref) : _report(context, ref),
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'report', child: Text('إبلاغ')),
              if (match.closed != 'blocked') const PopupMenuItem(value: 'block', child: Text('حظر')),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(introStateProvider(match.id)),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(p.age != null ? '${p.firstName}، ${p.age} سنة' : p.firstName,
                              style: Theme.of(context).textTheme.titleLarge),
                          if (p.city != null) Text(p.city!, style: const TextStyle(color: AppColors.muted)),
                          const SizedBox(height: 8),
                          closed != null
                              ? Pill(text: closed, color: AppColors.muted)
                              : const Pill(text: 'توافق متبادل', color: AppColors.success, icon: Icons.favorite_rounded),
                        ],
                      ),
                    ),
                    if (match.compatibilityScore > 0) ScoreRing(score: match.compatibilityScore),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            if (match.photosRevealed && closed == null) ...[
              _PhotosSection(matchId: match.id),
              const SizedBox(height: 16),
            ],
            if (match.visitStatus != null) ...[
              InfoBanner(
                text: '${visitStatusLabel(match.visitStatus!)}'
                    '${match.scheduledDate != null ? ' · ${formatDate(match.scheduledDate!)}' : ''}',
                tone: BannerTone.success,
                icon: Icons.family_restroom_rounded,
              ),
              const SizedBox(height: 16),
            ],
            if (match.closed != 'blocked' && match.closed != 'inactive') ...[
              const SectionTitle('الخطوة التالية'),
              IntroPanel(matchId: match.id, partnerName: p.firstName),
              const SizedBox(height: 16),
            ],
            const SectionTitle('عن الطرف الآخر'),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: PersonDetailsView(
                  person: p,
                  female: !(me?.isFemale ?? false),
                  initiallyExpanded: true,
                  tribeLabel: me?.country.tribeWord ?? 'العائلة',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PhotosSection extends ConsumerStatefulWidget {
  const _PhotosSection({required this.matchId});
  final String matchId;

  @override
  ConsumerState<_PhotosSection> createState() => _PhotosSectionState();
}

class _PhotosSectionState extends ConsumerState<_PhotosSection> {
  List<String>? _photos;
  bool _loading = false;
  String? _error;

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final photos = await ref.read(matchesRepositoryProvider).photos(widget.matchId);
      if (mounted) setState(() => _photos = photos);
    } catch (e) {
      if (mounted) setState(() => _error = ApiException.messageOf(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_photos == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LoadingButton(
            label: 'عرض الصور',
            icon: Icons.photo_library_outlined,
            outlined: true,
            loading: _loading,
            onPressed: _load,
          ),
          if (_error != null) ...[const SizedBox(height: 8), InfoBanner(text: _error!, tone: BannerTone.danger)],
        ],
      );
    }
    if (_photos!.isEmpty) {
      return const InfoBanner(text: 'لم تُضف صور بعد.');
    }
    return SizedBox(
      height: 220,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _photos!.length,
        separatorBuilder: (_, _) => const SizedBox(width: 10),
        itemBuilder: (_, i) => ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Image.network(
            resolveMediaUrl(ref.read(apiBaseUrlProvider), _photos![i]),
            width: 170,
            height: 220,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => Container(
              width: 170,
              color: AppColors.line,
              alignment: Alignment.center,
              child: const Icon(Icons.broken_image_outlined, color: AppColors.muted),
            ),
          ),
        ),
      ),
    );
  }
}

/// The family / chat introduction state of a match and its actions.
class IntroPanel extends ConsumerStatefulWidget {
  const IntroPanel({super.key, required this.matchId, required this.partnerName});
  final String matchId;
  final String partnerName;

  @override
  ConsumerState<IntroPanel> createState() => _IntroPanelState();
}

class _IntroPanelState extends ConsumerState<IntroPanel> {
  String? _busy;

  Future<void> _run(String key, Future<void> Function() action, {String? success}) async {
    if (_busy != null) return;
    setState(() => _busy = key);
    try {
      await action();
      ref.invalidate(introStateProvider(widget.matchId));
      ref.invalidate(countsProvider);
      if (success != null && mounted) showSnack(context, success);
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.code == 'GUARDIAN_REQUIRED') {
        showSnack(context, e.message,
            action: SnackBarAction(label: 'إضافة', onPressed: () => context.push('/profile/guardian')));
      } else if (e.kind == ApiErrorKind.noCredits) {
        showSnack(context, e.message, action: SnackBarAction(label: 'شحن', onPressed: () => context.push('/credits')));
      } else {
        showSnack(context, e.message);
      }
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<bool> _consent(String title) => confirmDialog(
        context,
        title: title,
        body: 'عند القبول تتبادل العائلتان بيانات التواصل: اسم وليّ أمرك وصلة القرابة ورقمه. هل توافق على مشاركتها؟',
        confirmLabel: 'أوافق',
      );

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(introStateProvider(widget.matchId));
    final repo = ref.read(matchesRepositoryProvider);
    return state.when(
      loading: () => const SkeletonBox(height: 120),
      error: (e, _) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Text(ApiException.messageOf(e), textAlign: TextAlign.center),
              TextButton(
                onPressed: () => ref.invalidate(introStateProvider(widget.matchId)),
                child: const Text('إعادة المحاولة'),
              ),
            ],
          ),
        ),
      ),
      data: (s) {
        final children = <Widget>[];
        void gap() => children.add(const SizedBox(height: 10));

        if (s.closed != null) {
          children.add(InfoBanner(text: _closedText(s.closed!), tone: BannerTone.warning));
        }

        // Chat
        if (s.chatStatus == 'open' && s.conversationId != null) {
          children.add(LoadingButton(
            label: s.chatPaused ? 'المحادثة متوقفة مؤقتاً للمراجعة' : 'فتح المحادثة',
            icon: Icons.chat_bubble_outline_rounded,
            onPressed: () => context.push('/chats/${s.conversationId}'),
          ));
          if (s.chatExpiresAt != null) {
            gap();
            children.add(Text('تنتهي المحادثة في ${formatDate(s.chatExpiresAt!, withYear: false)}',
                style: const TextStyle(color: AppColors.muted, fontSize: 13)));
          }
          gap();
        } else if ((s.chatStatus == 'ended' || s.chatStatus == 'expired') && s.conversationId != null) {
          children.add(LoadingButton(
            label: 'عرض المحادثة السابقة',
            outlined: true,
            icon: Icons.history_rounded,
            onPressed: () => context.push('/chats/${s.conversationId}'),
          ));
          gap();
        }

        // Family introduction
        switch (s.familyStatus) {
          case 'accepted':
            if (s.contacts != null) {
              children.add(_GuardianCard(contact: s.contacts!));
            } else {
              children.add(const InfoBanner(
                text: 'تم قبول التعارف العائلي. تظهر بيانات التواصل عندما يشاركها الطرفان.',
                tone: BannerTone.success,
              ));
            }
            gap();
          case 'pending_sent':
            children.add(InfoBanner(
              text: 'أرسلت طلب تعارف عائلي، بانتظار رد ${widget.partnerName}'
                  '${s.familyExpiresAt != null ? ' حتى ${formatDate(s.familyExpiresAt!, withYear: false)}' : ''}.',
              tone: BannerTone.warning,
            ));
            if (s.familyRequestId != null) {
              children.add(TextButton(
                onPressed: _busy != null
                    ? null
                    : () => _run('cancel-f', () => repo.cancelRequest(s.familyRequestId!), success: 'تم سحب الطلب'),
                child: const Text('سحب الطلب'),
              ));
            }
            gap();
          case 'pending_received':
            children.add(InfoBanner(text: '${widget.partnerName} يطلب تعارفاً عائلياً.', tone: BannerTone.info));
            gap();
            children.add(_ReplyRow(
              busy: _busy,
              keyPrefix: 'f',
              onAccept: () async {
                final needConsent = !s.guardianConsented;
                if (needConsent && !await _consent('قبول التعارف العائلي')) return;
                await _run('f-yes', () => repo.respond(s.familyRequestId!, accept: true, consent: needConsent ? true : null),
                    success: 'تم قبول التعارف العائلي');
              },
              onDecline: () => _run('f-no', () => repo.respond(s.familyRequestId!, accept: false), success: 'تم الرد'),
            ));
            gap();
          case 'legacy_admin':
            children.add(const InfoBanner(
              text: 'يتابع فريق نصيبك ترتيب الزيارة العائلية ويتواصل مع العائلتين.',
              icon: Icons.support_agent_rounded,
            ));
            gap();
          case 'declined':
            children.add(const InfoBanner(text: 'لم يتم قبول التعارف العائلي على هذا التوافق.', tone: BannerTone.warning));
            gap();
          case 'none':
            if (s.flags.introRequests && s.closed == null) {
              children.add(LoadingButton(
                label: s.familyFree || s.flags.creditOnInterest ? 'طلب تعارف عائلي (مجاني)' : 'طلب تعارف عائلي (رصيد واحد)',
                icon: Icons.family_restroom_rounded,
                loading: _busy == 'family',
                onPressed: () async {
                  if (!await _consent('طلب تعارف عائلي')) return;
                  await _run('family', () => repo.sendIntro(widget.matchId, 'FAMILY', consent: true),
                      success: 'تم إرسال طلب التعارف العائلي');
                },
              ));
              gap();
            }
        }

        // Chat requests
        switch (s.chatStatus) {
          case 'pending_sent':
            children.add(InfoBanner(text: 'أرسلت طلب محادثة، بانتظار رد ${widget.partnerName}.', tone: BannerTone.warning));
            if (s.chatRequestId != null) {
              children.add(TextButton(
                onPressed: _busy != null
                    ? null
                    : () => _run('cancel-c', () => repo.cancelRequest(s.chatRequestId!), success: 'تم سحب الطلب'),
                child: const Text('سحب الطلب'),
              ));
            }
            gap();
          case 'pending_received':
            children.add(InfoBanner(text: '${widget.partnerName} يطلب محادثة قصيرة داخل التطبيق.'));
            gap();
            children.add(_ReplyRow(
              busy: _busy,
              keyPrefix: 'c',
              onAccept: () => _run('c-yes', () => repo.respond(s.chatRequestId!, accept: true), success: 'تم فتح المحادثة'),
              onDecline: () => _run('c-no', () => repo.respond(s.chatRequestId!, accept: false), success: 'تم الرد'),
            ));
            gap();
          case 'none':
            if (s.flags.chat && s.flags.introRequests && s.closed == null) {
              children.add(LoadingButton(
                label: s.flags.creditOnInterest ? 'طلب محادثة (مجاني)' : 'طلب محادثة (رصيد واحد)',
                icon: Icons.chat_outlined,
                outlined: true,
                loading: _busy == 'chat',
                onPressed: () => _run('chat', () => repo.sendIntro(widget.matchId, 'CHAT'), success: 'تم إرسال طلب المحادثة'),
              ));
              gap();
            }
        }

        if (s.askShare) {
          children.add(InfoBanner(
            text: 'اختار ${widget.partnerName} التعارف العائلي. شارك بيانات وليّ أمرك لتظهر بيانات العائلتين.',
            action: TextButton(
              onPressed: _busy != null
                  ? null
                  : () async {
                      if (!await _consent('مشاركة بيانات وليّ الأمر')) return;
                      await _run('share', () async => repo.shareGuardian(widget.matchId), success: 'تمت المشاركة');
                    },
              child: const Text('مشاركة الآن'),
            ),
          ));
          gap();
        }

        if (s.followUpAsk && s.closed == null) {
          children.add(_FollowUp(
            mine: s.followUpMine,
            busy: _busy,
            onPick: (o) async {
              if (o != 'CONTINUING') {
                final ok = await confirmDialog(
                  context,
                  title: o == 'ENGAGED' ? 'تمت الخطبة' : 'لم يحصل نصيب',
                  body: o == 'ENGAGED'
                      ? 'مبارك! سنغلق اقتراحاتك وتوافقاتك الأخرى ونوقف الاقتراحات الجديدة.'
                      : 'سيُغلق هذا التوافق للطرفين ويُبلَّغ الطرف الآخر بلطف.',
                  confirmLabel: 'تأكيد',
                  destructive: o == 'NOT_A_MATCH',
                );
                if (!ok) return;
              }
              await _run('outcome', () async => repo.outcome(widget.matchId, o), success: 'شكراً، تم الحفظ');
            },
          ));
        }

        if (children.isEmpty) {
          children.add(const InfoBanner(text: 'لا توجد خطوة مطلوبة منك الآن.'));
        }
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children);
      },
    );
  }

  static String _closedText(String closed) => switch (closed) {
        'blocked' => 'هذا التوافق مغلق بسبب الحظر.',
        'inactive' => 'حساب الطرف الآخر غير نشط حالياً.',
        'ended' => 'انتهى هذا التوافق («لم يحصل نصيب»).',
        'engaged' => 'تمت الخطبة. مبارك!',
        _ => 'لا توجد خطوات أخرى متاحة على هذا التوافق.',
      };
}

class _ReplyRow extends StatelessWidget {
  const _ReplyRow({required this.busy, required this.keyPrefix, required this.onAccept, required this.onDecline});
  final String? busy;
  final String keyPrefix;
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: LoadingButton(
            label: 'قبول',
            loading: busy == '$keyPrefix-yes',
            onPressed: busy != null ? null : onAccept,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: LoadingButton(
            label: 'اعتذار',
            outlined: true,
            loading: busy == '$keyPrefix-no',
            onPressed: busy != null ? null : onDecline,
          ),
        ),
      ],
    );
  }
}

class _GuardianCard extends StatelessWidget {
  const _GuardianCard({required this.contact});
  final GuardianContact contact;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppColors.successBg, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('بيانات التواصل العائلي', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.success)),
          const SizedBox(height: 8),
          Text('${contact.name} (${contact.relationshipLabel})', style: const TextStyle(fontSize: 15.5)),
          const SizedBox(height: 4),
          Directionality(
            textDirection: TextDirection.ltr,
            child: SelectableText(contact.phone, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}

class _FollowUp extends StatelessWidget {
  const _FollowUp({required this.mine, required this.busy, required this.onPick});
  final String? mine;
  final String? busy;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    const options = [('CONTINUING', 'ما زلنا نتعارف'), ('ENGAGED', 'تمت الخطبة'), ('NOT_A_MATCH', 'لم يحصل نصيب')];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('كيف يسير التعارف العائلي؟', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final o in options)
                  ChoiceChip(
                    label: Text(o.$2),
                    selected: mine == o.$1,
                    onSelected: busy != null ? null : (_) => onPick(o.$1),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Report reasons of `POST /api/reports`.
class ReportSheet extends StatefulWidget {
  const ReportSheet({super.key});

  @override
  State<ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<ReportSheet> {
  static const reasons = [
    ('FAKE_PROFILE', 'حساب غير حقيقي'),
    ('INAPPROPRIATE_CONTENT', 'محتوى غير لائق'),
    ('HARASSMENT', 'إزعاج أو تحرش'),
    ('SPAM', 'رسائل مزعجة'),
    ('OTHER', 'سبب آخر'),
  ];
  String? _reason;
  final _details = TextEditingController();

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('إبلاغ', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            RadioGroup<String>(
              groupValue: _reason,
              onChanged: (v) => setState(() => _reason = v),
              child: Column(
                children: [
                  for (final r in reasons)
                    RadioListTile<String>(value: r.$1, title: Text(r.$2), contentPadding: EdgeInsets.zero),
                ],
              ),
            ),
            TextField(
              controller: _details,
              maxLength: 1000,
              maxLines: 3,
              decoration: const InputDecoration(hintText: 'تفاصيل (اختياري)'),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _reason == null ? null : () => Navigator.of(context).pop((_reason!, _details.text)),
              child: const Text('إرسال البلاغ'),
            ),
          ],
        ),
      ),
    );
  }
}
