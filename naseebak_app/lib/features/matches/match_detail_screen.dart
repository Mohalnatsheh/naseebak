import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/analytics/analytics.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/localization/digits.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/media_url.dart';
import '../../core/privacy/screen_privacy.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import '../../shared/widgets/person_details_view.dart';
import '../home/counts.dart';
import '../home/gendered_copy.dart';
import '../pro/pro_badge.dart';
import '../profile/guardian_form.dart' show GuardianSaved;
import 'match_models.dart';
import 'matches_repository.dart';
import 'safety_actions.dart';

export 'safety_actions.dart' show ReportAnswer, ReportSheet;

final _matchProvider = FutureProvider.autoDispose.family<MatchSummary?, String>(
  (ref, id) => ref.watch(matchesRepositoryProvider).find(id),
);

final introStateProvider = FutureProvider.autoDispose.family<IntroState, String>(
  (ref, id) => ref.watch(matchesRepositoryProvider).intro(id),
);

/// After any action on a match: the header (pill, photos, closed state), the next step, the badges and the
/// matches list all reload.
void refreshMatch(WidgetRef ref, String matchId) {
  ref.invalidate(introStateProvider(matchId));
  ref.invalidate(_matchProvider(matchId));
  ref.invalidate(countsProvider);
  ref.read(matchesListVersionProvider.notifier).state++;
}

/// One match: partner details, photos (revealed after the match), and the next step.
/// The list's copy (`initial`) only shows while the match itself is fetched: the fetched one always wins.
class MatchDetailScreen extends ConsumerStatefulWidget {
  const MatchDetailScreen({super.key, required this.matchId, this.initial});
  final String matchId;
  final MatchSummary? initial;

  @override
  ConsumerState<MatchDetailScreen> createState() => _MatchDetailScreenState();
}

/// What, in the counts, says something on a match may have moved (a request answered, a chat opened or ended)
(int, int, int) matchSignals(Counts? c) => (c?.pendingIntros ?? 0, c?.actionableMatches ?? 0, c?.unreadChats ?? 0);

/// Never stale (QA A-M04): the match re-reads on coming back to the app, on coming back from its chat (a report or a
/// block there), and when the counts say something moved (the partner accepted, a notice arrived).
class _MatchDetailScreenState extends ConsumerState<MatchDetailScreen> with WidgetsBindingObserver {
  ProviderSubscription<(int, int, int)>? _signals;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _signals = ref.listenManual(countsProvider.select((c) => matchSignals(c.valueOrNull)), (prev, next) {
      if (prev != null && prev != next) _reread();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _signals?.close();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _reread();
      ref.invalidate(countsProvider);
    }
  }

  void _reread() {
    if (!mounted) return;
    ref.invalidate(introStateProvider(widget.matchId));
    ref.invalidate(_matchProvider(widget.matchId));
  }

  @override
  Widget build(BuildContext context) {
    final matchId = widget.matchId;
    final initial = widget.initial;
    final match = ref.watch(_matchProvider(matchId));
    if (match.hasValue) {
      final m = match.value;
      return m == null
          ? Scaffold(
              appBar: AppBar(),
              body: const MessageView(icon: Icons.search_off_rounded, title: 'التوافق غير موجود'),
            )
          : _MatchView(match: m);
    }
    if (initial != null) return _MatchView(match: initial);
    return match.hasError
        ? Scaffold(
            appBar: AppBar(),
            body: ErrorView(error: match.error!, onRetry: () => ref.invalidate(_matchProvider(matchId))),
          )
        : Scaffold(appBar: AppBar(), body: const SkeletonList(count: 3));
  }
}

class _MatchView extends ConsumerWidget {
  const _MatchView({required this.match});
  final MatchSummary match;

  /// Website wording (matches-view.tsx): what a block on a match ends
  String _blockBody(bool viewerFemale, bool creditOnInterest) {
    final name = match.partner.firstName;
    final see = forViewer(viewerFemale, 'ترى', 'يرى');
    final reach = forViewer(viewerFemale, 'تتمكن', 'يتمكن');
    return 'سينتهي هذا التوافق: لن $see $name ملفك ولا $reach من مراسلتك، ولن تتوفر أي خطوات تعارف بينكما. '
        '${creditOnInterest ? 'تُلغى الطلبات المعلقة بينكما.' : 'تُلغى الطلبات المعلقة بينكما دون استرجاع الرصيد.'} '
        '${forViewer(viewerFemale, 'يمكنك', 'يمكنكِ')} إلغاء الحظر لاحقاً من صفحة «المحظورون».';
  }

  String _reportBody(bool viewerFemale, bool creditOnInterest) =>
      'سيصل البلاغ لفريق نصيبك، ويُحظر ${match.partner.firstName} فينتهي هذا التوافق ولا '
      '${forViewer(viewerFemale, 'ترى', 'يرى')} ملفك بعد الآن. '
      '${creditOnInterest ? 'تُلغى الطلبات المعلقة بينكما.' : 'تُلغى الطلبات المعلقة بينكما دون استرجاع الرصيد.'}';

  Future<void> _safety(BuildContext context, WidgetRef ref, String action) async {
    final p = match.partner;
    final female = ref.read(authControllerProvider).me?.isFemale ?? false;
    final coi = ref.read(countsProvider).valueOrNull?.flags.creditOnInterest ?? false;
    final run = action == 'block' ? confirmAndBlock : reportAndBlock;
    final body = action == 'block' ? _blockBody(female, coi) : _reportBody(female, coi);
    final done = await run(context, ref, userId: p.id, name: p.firstName, viewerFemale: female, body: body);
    // Stays open on the now blocked match (with «إلغاء الحظر»), like the website's card
    if (done) refreshMatch(ref, match.id);
  }

  Future<void> _unblock(BuildContext context, WidgetRef ref) async {
    if (match.blockId == null) return;
    if (await confirmAndUnblock(context, ref, blockId: match.blockId!, name: match.partner.firstName)) {
      refreshMatch(ref, match.id);
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
          if (match.closed != 'blocked')
            PopupMenuButton<String>(
              key: const Key('match-menu'),
              tooltip: 'خيارات',
              onSelected: (v) => _safety(context, ref, v),
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'block', child: Text('حظر')),
                PopupMenuItem(value: 'report', child: Text('إبلاغ وحظر')),
              ],
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => refreshMatch(ref, match.id),
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
                          NameWithBadge(
                            isPro: p.isPro,
                            child: Text(p.age != null ? '${p.firstName}، ${p.age} سنة' : p.firstName,
                                style: Theme.of(context).textTheme.titleLarge),
                          ),
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
            if (match.closed == 'blocked') ...[
              InfoBanner(
                text: 'هذا التوافق مغلق بسبب الحظر.',
                tone: BannerTone.warning,
                action: match.blockId == null
                    ? null
                    : TextButton(
                        key: const Key('unblock'),
                        onPressed: () => _unblock(context, ref),
                        child: const Text('إلغاء الحظر'),
                      ),
              ),
              const SizedBox(height: 16),
            ] else if (match.closed == 'inactive') ...[
              const InfoBanner(text: 'حساب الطرف الآخر غير نشط حالياً.', tone: BannerTone.warning),
              const SizedBox(height: 16),
            ] else ...[
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
    // Their photos: no screenshots (Android), hidden during screen recording (iOS)
    return SecureArea(
      screenshotNote: 'صور الطرف الآخر أمانة: لا يجوز حفظها أو مشاركتها.',
      child: SizedBox(
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
      ),
    );
  }
}

/// The family / chat introduction state of a match and its actions (website match-intro-panel.tsx).
class IntroPanel extends ConsumerStatefulWidget {
  const IntroPanel({super.key, required this.matchId, required this.partnerName});
  final String matchId;
  final String partnerName;

  @override
  ConsumerState<IntroPanel> createState() => _IntroPanelState();
}

class _IntroPanelState extends ConsumerState<IntroPanel> {
  /// Opens the chat; back here, the match re-reads (a report, a block or an end in the chat changed it)
  Future<void> _openChat(String conversationId) async {
    final container = ProviderScope.containerOf(context, listen: false);
    await context.push('/chats/$conversationId');
    container
      ..invalidate(introStateProvider(widget.matchId))
      ..invalidate(_matchProvider(widget.matchId))
      ..invalidate(countsProvider);
  }

  String? _busy;

  bool get _viewerFemale => ref.read(authControllerProvider).me?.isFemale ?? false;
  String _g(String m, String f) => forViewer(_viewerFemale, m, f);
  String _p(String m, String f) => forPartner(_viewerFemale, m, f);

  void _requested(String type) => ref.read(analyticsProvider).introRequestSent(type);
  void _answered(String type, bool accepted) => ref.read(analyticsProvider).introRequestAnswered(type: type, accepted: accepted);

  Future<void> _run(String key, Future<void> Function() action, {String? success}) async {
    if (_busy != null) return;
    setState(() => _busy = key);
    try {
      await action();
      refreshMatch(ref, widget.matchId);
      if (success != null && mounted) showSnack(context, success);
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.code == 'GUARDIAN_REQUIRED') {
        showSnack(context, e.message,
            action: SnackBarAction(label: 'إضافة', onPressed: () => context.push('/profile/guardian')));
      } else if (e.kind == ApiErrorKind.noCredits && ref.read(appPaymentsProvider)) {
        showSnack(context, e.message, action: SnackBarAction(label: 'شحن', onPressed: () => context.push('/credits')));
      } else {
        showSnack(context, e.message);
      }
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  /// A family step needs a guardian: without one the form opens first (QA A2-M4: consent was asked, then the server
  /// said the guardian was missing). Returns whether to go on, and whether the form already recorded the consent.
  Future<({bool go, bool consented})> _guardianFirst(IntroState s) async {
    if (s.guardianExists) return (go: true, consented: false);
    final container = ProviderScope.containerOf(context, listen: false);
    final saved = await context.push<GuardianSaved>('/profile/guardian');
    container.invalidate(introStateProvider(widget.matchId));
    if (saved == null || !mounted) return (go: false, consented: false);
    return (go: true, consented: saved == GuardianSaved.consented);
  }

  Future<bool> _consent(String title) => confirmDialog(
        context,
        title: title,
        body: 'عند القبول تتبادل العائلتان بيانات التواصل: اسم وليّ أمرك وصلة القرابة ورقمه. '
            'هل ${_g('توافق', 'توافقين')} على مشاركتها؟',
        confirmLabel: 'أوافق',
      );

  /// «تمت الخطبة» / «لم يحصل نصيب» / «إنهاء التوافق» ask first (website wording); «ما زلنا نتعارف» doesn't.
  Future<void> _outcome(String outcome, IntroState s) async {
    if (outcome != 'CONTINUING') {
      final engaged = outcome == 'ENGAGED';
      final ok = await confirmDialog(
        context,
        title: engaged ? 'تأكيد الخطبة' : 'إنهاء التوافق مع ${widget.partnerName}؟',
        body: engaged
            ? 'مبارك! سنوقف إرسال اقتراحات جديدة لك، وتُغلق اقتراحاتك المفتوحة وتوافقاتك الأخرى (تنتهي محادثاتها '
                'المفتوحة ويُبلَّغ أصحابها بلطف). ${_g('يمكنك', 'يمكنكِ')} التراجع لاحقاً من هذه الصفحة لاستئناف '
                'الاقتراحات.'
            : 'سينتهي التوافق مع ${widget.partnerName}${s.chatStatus == 'open' ? ' وتُغلق المحادثة' : ''}، '
                'وسنُعلم الطرف الآخر بلطف. لا يمكن التراجع عن ذلك.',
        confirmLabel: engaged ? 'نعم، تمت الخطبة' : 'نعم، إنهاء التوافق',
        destructive: !engaged,
      );
      if (!ok || !mounted) return;
    }
    await _run('outcome', () async => ref.read(matchesRepositoryProvider).outcome(widget.matchId, outcome),
        success: outcome == 'NOT_A_MATCH' ? 'انتهى التوافق' : 'شكراً، تم الحفظ');
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(introStateProvider(widget.matchId));
    ref.watch(authControllerProvider.select((a) => a.me?.isFemale));
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
        final name = widget.partnerName;

        if (s.closed != null) {
          children.add(InfoBanner(
            text: _closedText(s.closed!),
            tone: BannerTone.warning,
            // «تمت الخطبة» said by mistake (or called off): back to «ما زلنا نتعارف»
            action: s.closed == 'engaged'
                ? TextButton(
                    key: const Key('undo-engaged'),
                    onPressed: _busy != null ? null : () => _outcome('CONTINUING', s),
                    child: const Text('تراجع: ما زلنا نتعارف'),
                  )
                : null,
          ));
          gap();
        }

        // Chat
        if (s.chatStatus == 'open' && s.conversationId != null) {
          children.add(LoadingButton(
            label: s.chatPaused ? 'المحادثة متوقفة مؤقتاً للمراجعة' : 'فتح المحادثة',
            icon: Icons.chat_bubble_outline_rounded,
            onPressed: () => _openChat(s.conversationId!),
          ));
          if (s.chatExpiresAt != null) {
            gap();
            children.add(Text('تنتهي المحادثة في ${formatDate(s.chatExpiresAt!, withYear: false)}',
                style: AppText.labelRegular.copyWith(color: AppColors.muted)));
          }
          gap();
        } else if ((s.chatStatus == 'ended' || s.chatStatus == 'expired') && s.conversationId != null) {
          children.add(LoadingButton(
            label: s.chatPaused ? 'المحادثة متوقفة مؤقتاً للمراجعة' : 'عرض المحادثة السابقة',
            outlined: true,
            icon: Icons.history_rounded,
            onPressed: () => _openChat(s.conversationId!),
          ));
          gap();
        }

        // Family introduction
        switch (s.familyStatus) {
          case 'accepted':
            if (s.contacts != null) {
              children.add(_GuardianCard(contact: s.contacts!, dialCode: ref.read(authControllerProvider).me?.country.dialDigits));
            } else {
              children.add(const InfoBanner(
                text: 'تم قبول التعارف العائلي. تظهر بيانات التواصل عندما يشاركها الطرفان.',
                tone: BannerTone.success,
              ));
            }
            gap();
          case 'pending_sent':
            children.add(InfoBanner(
              text: 'أرسلت طلب تعارف عائلي، بانتظار رد $name'
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
            children.add(InfoBanner(text: '$name ${_p('يطلب', 'تطلب')} تعارفاً عائلياً.', tone: BannerTone.info));
            gap();
            children.add(_ReplyRow(
              busy: _busy,
              keyPrefix: 'f',
              onAccept: () async {
                final guardian = await _guardianFirst(s);
                if (!guardian.go) return;
                final needConsent = !s.guardianConsented;
                if (needConsent && !guardian.consented && !await _consent('قبول التعارف العائلي')) return;
                await _run('f-yes', () => repo.respond(s.familyRequestId!, accept: true, consent: needConsent ? true : null).then((_) => _answered('FAMILY', true)),
                    success: 'تم قبول التعارف العائلي');
              },
              onDecline: () => _run('f-no', () => repo.respond(s.familyRequestId!, accept: false).then((_) => _answered('FAMILY', false)),
                  success: 'تم الرد'),
            ));
            gap();
          case 'legacy_admin':
            // An older admin-arranged visit: its status shows above; the team no longer contacts the families
            break;
          case 'declined':
            children.add(InfoBanner(
              text: s.familyDeclinedByMe
                  ? 'تم الاعتذار عن التعارف العائلي من طرفك.'
                  : 'لم يتم قبول طلب التعارف العائلي على هذا التوافق.',
              tone: BannerTone.warning,
            ));
            gap();
          case 'closed':
            // One of the two ended the chat: no family request on this match any more
            children.add(
                const InfoBanner(text: 'التعارف العائلي غير متاح بعد إنهاء المحادثة.', tone: BannerTone.warning));
            gap();
          case 'none':
            if (s.flags.introRequests && s.closed == null) {
              children.add(LoadingButton(
                label: s.familyFree || s.flags.creditOnInterest ? 'طلب تعارف عائلي (مجاني)' : 'طلب تعارف عائلي (رصيد واحد)',
                icon: Icons.family_restroom_rounded,
                loading: _busy == 'family',
                onPressed: () async {
                  final guardian = await _guardianFirst(s);
                  if (!guardian.go) return;
                  if (!guardian.consented && !await _consent('طلب تعارف عائلي')) return;
                  await _run('family', () => repo.sendIntro(widget.matchId, 'FAMILY', consent: true).then((_) => _requested('FAMILY')),
                      success: 'تم إرسال طلب التعارف العائلي');
                },
              ));
              if (s.familyOpenUntil != null) {
                gap();
                children.add(Text(
                  'انتهت مدة المحادثة. هل تنتقلان لتعارف عائلي؟${s.familyFree ? ' الانتقال مجاني' : ''}'
                  '${s.familyFree ? ' و' : ' '}متاح حتى ${formatDate(s.familyOpenUntil!, withYear: false)}.',
                  key: const Key('family-open-until'),
                  style: AppText.labelRegular.copyWith(color: AppColors.muted),
                ));
              }
              gap();
            }
        }

        // Chat requests
        switch (s.chatStatus) {
          case 'pending_sent':
            children.add(InfoBanner(text: 'أرسلت طلب محادثة، بانتظار رد $name.', tone: BannerTone.warning));
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
            children.add(InfoBanner(text: '$name ${_p('يطلب', 'تطلب')} محادثة قصيرة داخل التطبيق.'));
            gap();
            children.add(_ReplyRow(
              busy: _busy,
              keyPrefix: 'c',
              onAccept: () => _run('c-yes', () => repo.respond(s.chatRequestId!, accept: true).then((_) => _answered('CHAT', true)),
                  success: 'تم فتح المحادثة'),
              onDecline: () => _run('c-no', () => repo.respond(s.chatRequestId!, accept: false).then((_) => _answered('CHAT', false)),
                  success: 'تم الرد'),
            ));
            gap();
          case 'declined':
            children.add(InfoBanner(
              text: s.chatDeclinedByMe ? 'تم الاعتذار عن طلب المحادثة من طرفك.' : 'لم يتم قبول طلب المحادثة.',
              tone: BannerTone.warning,
            ));
            gap();
          case 'disabled':
            children.add(const InfoBanner(text: 'المحادثة غير متاحة حالياً.', icon: Icons.schedule_rounded));
            gap();
          case 'none':
            if (s.flags.chat && s.flags.introRequests && s.closed == null) {
              children.add(LoadingButton(
                label: s.flags.creditOnInterest ? 'طلب محادثة (مجاني)' : 'طلب محادثة (رصيد واحد)',
                icon: Icons.chat_outlined,
                outlined: true,
                loading: _busy == 'chat',
                onPressed: () => _run('chat', () => repo.sendIntro(widget.matchId, 'CHAT').then((_) => _requested('CHAT')),
                    success: 'تم إرسال طلب المحادثة'),
              ));
              gap();
            }
        }

        if (s.askShare) {
          children.add(InfoBanner(
            text: '${_p('اختار', 'اختارت')} $name التعارف العائلي. ${_g('شارك', 'شاركي')} بيانات وليّ أمرك '
                'لتظهر بيانات العائلتين.',
            action: Wrap(
              children: [
                TextButton(
                  onPressed: _busy != null
                      ? null
                      : () async {
                          final guardian = await _guardianFirst(s);
                          if (!guardian.go) return;
                          if (!guardian.consented && !await _consent('مشاركة بيانات وليّ الأمر')) return;
                          await _run('share', () async => repo.shareGuardian(widget.matchId), success: 'تمت المشاركة');
                        },
                  child: const Text('مشاركة الآن'),
                ),
                TextButton(
                  key: const Key('not-continue'),
                  onPressed: _busy != null ? null : () => _outcome('NOT_A_MATCH', s),
                  child: const Text('لا أرغب بالمتابعة'),
                ),
              ],
            ),
          ));
          gap();
        }

        if (s.followUpAsk && s.closed == null) {
          children.add(_FollowUp(
            mine: s.followUpMine,
            busy: _busy,
            text: s.followUpPartner == 'ENGAGED' && s.followUpMine != 'ENGAGED'
                ? 'أخبرنا الطرف الآخر أن التعارف انتهى بالخطبة. ${_g('هل تؤكد ذلك؟', 'هل تؤكدين ذلك؟')}'
                : s.followUpMine == 'CONTINUING'
                    ? 'أخبرتنا أنكما ما زلتما تتعارفان. حدّثنا عندما يتغيّر شيء.'
                    : _g('أخبِرنا بما وصلتم إليه، فهذا يساعدنا على متابعتك وإيقاف الاقتراحات عند الخطبة.',
                        'أخبِرينا بما وصلتم إليه، فهذا يساعدنا على متابعتكِ وإيقاف الاقتراحات عند الخطبة.'),
            onPick: (o) => _outcome(o, s),
          ));
          gap();
        }

        if (children.isEmpty) {
          children.add(const InfoBanner(text: 'لا توجد خطوة مطلوبة منك الآن.'));
        }

        // A polite way out of any open match (no block needed)
        if (s.closed == null && !s.followUpAsk && !s.askShare) {
          children.add(Align(
            alignment: AlignmentDirectional.centerEnd,
            child: TextButton(
              key: const Key('end-match'),
              style: TextButton.styleFrom(foregroundColor: AppColors.muted),
              onPressed: _busy != null ? null : () => _outcome('NOT_A_MATCH', s),
              child: const Text('إنهاء التوافق'),
            ),
          ));
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
  const _GuardianCard({required this.contact, this.dialCode});
  final GuardianContact contact;
  final String? dialCode;

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
          Text('${contact.name} (${contact.relationshipLabel})', style: AppText.body),
          const SizedBox(height: 4),
          Directionality(
            textDirection: TextDirection.ltr,
            child: SelectableText(formatGuardianPhone(contact.phone, dialCode: (dialCode ?? '').isEmpty ? '962' : dialCode!), style: AppText.body.copyWith(fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}

class _FollowUp extends StatelessWidget {
  const _FollowUp({required this.mine, required this.busy, required this.text, required this.onPick});
  final String? mine;
  final String? busy;
  final String text;
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
            Text('كيف يسير التعارف العائلي؟', style: AppText.body.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(text, style: AppText.labelRegular.copyWith(color: AppColors.muted, height: 1.5)),
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
