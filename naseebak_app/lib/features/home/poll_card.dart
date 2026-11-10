import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/json.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';

/// `PublicPoll` of src/lib/engagement/poll-types.ts.
class Poll {
  const Poll({
    required this.id,
    required this.question,
    required this.options,
    this.note,
    this.status = 'ACTIVE',
    this.myVote,
    this.offerCredits = 0,
    this.rewardCredits = 0,
    this.percents,
    this.votesNeeded = 0,
  });

  factory Poll.fromJson(Map<String, dynamic> j) {
    final results = asMapOrNull(j['results']);
    final percents = results == null ? null : asMap(results['percents']).map((k, v) => MapEntry(k, asInt(v) ?? 0));
    return Poll(
      id: asStringOr(j['id']),
      question: asStringOr(j['question']),
      options: asMapList(j['options']).map((o) => (id: asStringOr(o['id']), label: asStringOr(o['label']))).toList(),
      note: asString(j['note']),
      status: asStringOr(j['status'], 'ACTIVE'),
      myVote: asString(j['myVote']),
      offerCredits: asInt(j['offerCredits']) ?? 0,
      rewardCredits: asInt(j['rewardCredits']) ?? 0,
      percents: percents,
      votesNeeded: asInt(j['votesNeeded']) ?? 0,
    );
  }

  final String id;
  final String question;
  final List<({String id, String label})> options;
  final String? note;
  final String status;
  final String? myVote;
  final int offerCredits;
  final int rewardCredits;
  final Map<String, int>? percents;
  final int votesNeeded;

  bool get answered => myVote != null || status == 'CLOSED';
}

final currentPollProvider = FutureProvider.autoDispose<Poll?>((ref) async {
  final j = await ref.watch(apiClientProvider).get('/api/polls/current');
  final p = asMapOrNull(j['poll']);
  return p == null ? null : Poll.fromJson(p);
});

/// «سؤال نصيبك»: one question, one vote, results after voting.
class PollCard extends ConsumerStatefulWidget {
  const PollCard({super.key});

  @override
  ConsumerState<PollCard> createState() => _PollCardState();
}

class _PollCardState extends ConsumerState<PollCard> {
  Poll? _override;
  String? _voting;

  Future<void> _vote(Poll poll, String optionId) async {
    if (_voting != null || poll.answered) return;
    setState(() => _voting = optionId);
    try {
      final j = await ref.read(apiClientProvider).post(
            '/api/polls/vote',
            body: {'pollId': poll.id, 'optionId': optionId, 'source': 'dashboard'},
          );
      final updated = Poll.fromJson(asMap(j['poll']));
      if (!mounted) return;
      setState(() => _override = updated);
      if (updated.rewardCredits > 0) {
        showSnack(context, 'شكراً لمشاركتك! أُضيف ${updated.rewardCredits} إلى رصيدك.');
        ref.read(authControllerProvider.notifier).refreshMe();
      }
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message);
    } finally {
      if (mounted) setState(() => _voting = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(currentPollProvider);
    final poll = _override ?? async.valueOrNull;
    if (async.isLoading && poll == null) return const SkeletonBox(height: 140);
    if (poll == null) return const SizedBox.shrink();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.how_to_vote_outlined, color: AppColors.gold),
                const SizedBox(width: 8),
                const Expanded(child: Text('سؤال نصيبك', style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.gold))),
                if (!poll.answered && poll.offerCredits > 0) Pill(text: '+${poll.offerCredits} رصيد', color: AppColors.success),
              ],
            ),
            const SizedBox(height: 8),
            Text(poll.question, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            for (final o in poll.options) ...[
              _OptionRow(
                label: o.label,
                mine: poll.myVote == o.id,
                percent: poll.answered ? (poll.percents?[o.id]) : null,
                busy: _voting == o.id,
                onTap: poll.answered || _voting != null ? null : () => _vote(poll, o.id),
              ),
              const SizedBox(height: 8),
            ],
            if (poll.answered && poll.percents == null && poll.votesNeeded > 0)
              Text('تظهر النتائج بعد ${poll.votesNeeded} أصوات أخرى.',
                  style: AppText.labelRegular.copyWith(color: AppColors.muted)),
            if (poll.note != null && poll.note!.isNotEmpty)
              Text(poll.note!, style: AppText.labelRegular.copyWith(color: AppColors.muted)),
          ],
        ),
      ),
    );
  }
}

class _OptionRow extends StatelessWidget {
  const _OptionRow({required this.label, required this.mine, required this.percent, required this.busy, this.onTap});
  final String label;
  final bool mine;
  final int? percent;
  final bool busy;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          constraints: const BoxConstraints(minHeight: 48),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: mine ? AppColors.navy : AppColors.line, width: mine ? 1.5 : 1),
          ),
          child: Stack(
            children: [
              if (percent != null)
                Positioned.fill(
                  child: FractionallySizedBox(
                    alignment: AlignmentDirectional.centerStart,
                    widthFactor: (percent! / 100).clamp(0, 1).toDouble(),
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.gold.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(11),
                      ),
                    ),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                child: Row(
                  children: [
                    Expanded(child: Text(label, style: TextStyle(fontWeight: mine ? FontWeight.w700 : FontWeight.w500))),
                    if (busy) const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                    if (percent != null) Text('$percent%', style: const TextStyle(fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
