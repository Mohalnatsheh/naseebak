import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/localization/digits.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/json.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';

const ticketTypes = {'ISSUE': 'مشكلة', 'SUGGESTION': 'اقتراح', 'CHANGE_REQUEST': 'طلب تغيير'};
const ticketStatuses = {'OPEN': 'مفتوحة', 'IN_PROGRESS': 'قيد المعالجة', 'RESOLVED': 'تم الحل', 'CLOSED': 'مغلقة'};

class SupportTicket {
  const SupportTicket({
    required this.id,
    required this.type,
    required this.subject,
    required this.description,
    required this.status,
    this.adminNote,
    this.createdAt,
  });

  factory SupportTicket.fromJson(Map<String, dynamic> j) => SupportTicket(
        id: asStringOr(j['id']),
        type: asStringOr(j['type']),
        subject: asStringOr(j['subject']),
        description: asStringOr(j['description']),
        status: asStringOr(j['status'], 'OPEN'),
        adminNote: asString(j['adminNote']),
        createdAt: asDate(j['createdAt']),
      );

  final String id;
  final String type;
  final String subject;
  final String description;
  final String status;
  final String? adminNote;
  final DateTime? createdAt;
}

/// The web's ticket rules (`createTicketSchema`): subject 5–200, description 20–2000.
String? ticketError({String? type, required String subject, required String description}) {
  if (type == null) return 'يرجى اختيار نوع التذكرة';
  if (subject.trim().length < 5) return 'الموضوع يجب أن يكون 5 أحرف على الأقل';
  if (subject.trim().length > 200) return 'الموضوع يجب أن لا يتجاوز 200 حرف';
  if (description.trim().length < 20) return 'الوصف يجب أن يكون 20 حرف على الأقل';
  if (description.trim().length > 2000) return 'الوصف يجب أن لا يتجاوز 2000 حرف';
  return null;
}

/// One page of `GET /api/support?page=` (10 per page, newest first).
class TicketPage {
  const TicketPage({required this.tickets, required this.page, required this.totalPages});

  factory TicketPage.fromJson(Map<String, dynamic> j) => TicketPage(
        tickets: asMapList(j['tickets']).map(SupportTicket.fromJson).toList(),
        page: asInt(j['page']) ?? 1,
        totalPages: asInt(j['totalPages']) ?? 1,
      );

  final List<SupportTicket> tickets;
  final int page;
  final int totalPages;

  bool get hasMore => page < totalPages;

  /// This list followed by the [next] page (a ticket that moved between pages is kept once)
  TicketPage append(TicketPage next) {
    final seen = tickets.map((t) => t.id).toSet();
    return TicketPage(
      tickets: [...tickets, ...next.tickets.where((t) => !seen.contains(t.id))],
      page: next.page,
      totalPages: next.totalPages,
    );
  }
}

class SupportRepository {
  SupportRepository(this._api);
  final ApiClient _api;

  Future<TicketPage> list({int page = 1}) async =>
      TicketPage.fromJson(await _api.get('/api/support', query: {'page': page}));

  Future<void> create({required String type, required String subject, required String description}) async {
    await _api.post('/api/support', body: {'type': type, 'subject': subject.trim(), 'description': description.trim()});
  }
}

final supportRepositoryProvider = Provider<SupportRepository>((ref) => SupportRepository(ref.watch(apiClientProvider)));
/// My tickets, page by page («عرض المزيد» loads the next one).
class SupportTickets extends AutoDisposeAsyncNotifier<TicketPage> {
  bool _loadingMore = false;

  @override
  Future<TicketPage> build() => ref.watch(supportRepositoryProvider).list();

  /// Throws on failure (the screen shows it); the tickets already shown stay.
  Future<void> loadMore() async {
    final current = state.valueOrNull;
    if (current == null || !current.hasMore || _loadingMore) return;
    _loadingMore = true;
    try {
      final next = await ref.read(supportRepositoryProvider).list(page: current.page + 1);
      state = AsyncData(current.append(next));
    } finally {
      _loadingMore = false;
    }
  }
}

final supportTicketsProvider = AsyncNotifierProvider.autoDispose<SupportTickets, TicketPage>(SupportTickets.new);

/// «الدعم الفني»: my tickets (status and the team's reply) and a new ticket (at most 5 open, server rule).
class SupportScreen extends ConsumerWidget {
  const SupportScreen({super.key});

  Future<void> _new(BuildContext context, WidgetRef ref) async {
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const NewTicketSheet(),
    );
    if (sent == true && context.mounted) {
      ref.invalidate(supportTicketsProvider);
      showSnack(context, 'أُرسلت تذكرتك، وسيرد عليك فريق نصيبك');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tickets = ref.watch(supportTicketsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('الدعم الفني')),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('new-ticket'),
        onPressed: () => _new(context, ref),
        icon: const Icon(Icons.add_comment_outlined),
        label: const Text('تذكرة جديدة'),
      ),
      body: tickets.when(
        loading: () => const SkeletonList(count: 3, itemHeight: 90),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(supportTicketsProvider)),
        data: (list) => list.tickets.isEmpty
            ? const MessageView(
                icon: Icons.support_agent_rounded,
                title: 'لا توجد تذاكر بعد',
                body: 'واجهتك مشكلة أو لديك اقتراح؟ أرسل تذكرة وسيرد عليك فريق نصيبك هنا.',
              )
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(supportTicketsProvider),
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                  itemCount: list.tickets.length + (list.hasMore ? 1 : 0),
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (_, i) =>
                      i < list.tickets.length ? _TicketCard(ticket: list.tickets[i]) : const _LoadMore(),
                ),
              ),
      ),
    );
  }
}

/// «عرض المزيد» under the last ticket while older pages remain.
class _LoadMore extends ConsumerStatefulWidget {
  const _LoadMore();

  @override
  ConsumerState<_LoadMore> createState() => _LoadMoreState();
}

class _LoadMoreState extends ConsumerState<_LoadMore> {
  bool _busy = false;

  Future<void> _load() async {
    setState(() => _busy = true);
    try {
      await ref.read(supportTicketsProvider.notifier).loadMore();
    } catch (e) {
      if (mounted) showSnack(context, ApiException.messageOf(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: TextButton.icon(
        key: const Key('support-load-more'),
        onPressed: _busy ? null : _load,
        icon: _busy
            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.expand_more_rounded),
        label: const Text('عرض المزيد'),
      ),
    );
  }
}

class _TicketCard extends StatelessWidget {
  const _TicketCard({required this.ticket});
  final SupportTicket ticket;

  @override
  Widget build(BuildContext context) {
    final color = switch (ticket.status) {
      'OPEN' => AppColors.warning,
      'RESOLVED' => AppColors.success,
      'CLOSED' => AppColors.muted,
      _ => AppColors.navy,
    };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Pill(text: ticketStatuses[ticket.status] ?? ticket.status, color: color),
              const SizedBox(width: 6),
              Pill(text: ticketTypes[ticket.type] ?? ticket.type, color: AppColors.gold),
              const SizedBox(width: 6),
              // Shrinks before the badges do on a narrow phone
              Expanded(
                child: ticket.createdAt == null
                    ? const SizedBox.shrink()
                    : Text(
                        formatDate(ticket.createdAt!),
                        textAlign: TextAlign.end,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: AppColors.muted, fontSize: 12),
                      ),
              ),
            ]),
            const SizedBox(height: 8),
            Text(ticket.subject, style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(ticket.description, style: const TextStyle(color: AppColors.muted, height: 1.5)),
            if (ticket.adminNote != null && ticket.adminNote!.isNotEmpty) ...[
              const SizedBox(height: 10),
              InfoBanner(tone: BannerTone.success, icon: Icons.reply_rounded, text: 'رد فريق نصيبك: ${ticket.adminNote}'),
            ],
          ],
        ),
      ),
    );
  }
}

class NewTicketSheet extends ConsumerStatefulWidget {
  const NewTicketSheet({super.key});

  @override
  ConsumerState<NewTicketSheet> createState() => _NewTicketSheetState();
}

class _NewTicketSheetState extends ConsumerState<NewTicketSheet> {
  String? _type;
  final _subject = TextEditingController();
  final _description = TextEditingController();
  String? _error;
  bool _sending = false;

  @override
  void dispose() {
    _subject.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final err = ticketError(type: _type, subject: _subject.text, description: _description.text);
    setState(() => _error = err);
    if (err != null) return;
    setState(() => _sending = true);
    try {
      await ref.read(supportRepositoryProvider).create(type: _type!, subject: _subject.text, description: _description.text);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
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
            Text('تذكرة جديدة', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            Wrap(spacing: 8, children: [
              for (final t in ticketTypes.entries)
                ChoiceChip(
                  key: Key('type-${t.key}'),
                  label: Text(t.value),
                  selected: _type == t.key,
                  onSelected: (_) => setState(() => _type = t.key),
                ),
            ]),
            const SizedBox(height: 12),
            TextField(key: const Key('ticket-subject'), controller: _subject, maxLength: 200, decoration: const InputDecoration(labelText: 'الموضوع')),
            TextField(
              key: const Key('ticket-description'),
              controller: _description,
              maxLength: 2000,
              maxLines: 5,
              decoration: const InputDecoration(labelText: 'التفاصيل', alignLabelWithHint: true),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: AppColors.danger)),
            ],
            const SizedBox(height: 12),
            LoadingButton(key: const Key('send-ticket'), label: 'إرسال', loading: _sending, onPressed: _send),
          ],
        ),
      ),
    );
  }
}
