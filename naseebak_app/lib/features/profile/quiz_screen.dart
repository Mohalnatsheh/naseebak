import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common.dart';
import 'profile_repository.dart';

const quizScale = ['لا أوافق إطلاقاً', 'لا أوافق', 'محايد', 'أوافق', 'أوافق بشدة'];
const quizDimensions = ['الاجتماعية', 'الالتزام والتنظيم', 'التفاهم والانسجام', 'الاستقرار العاطفي', 'الانفتاح والتطوير'];

final quizProvider = FutureProvider.autoDispose<Quiz>((ref) => ref.watch(profileRepositoryProvider).quiz());

/// «اختبار الشخصية»: 20 statements, 1–5 each (30% of the match %). Retake after 3 months (server rule).
class QuizScreen extends ConsumerStatefulWidget {
  const QuizScreen({super.key});

  @override
  ConsumerState<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends ConsumerState<QuizScreen> {
  final Map<String, int> _answers = {};
  bool _retaking = false;
  bool _sending = false;

  Future<void> _submit(Quiz quiz) async {
    final missing = quiz.questions.where((q) => !_answers.containsKey(q.id)).length;
    if (missing > 0) {
      showSnack(context, 'يرجى الإجابة عن جميع الأسئلة (${quiz.questions.length - missing}/${quiz.questions.length})');
      return;
    }
    setState(() => _sending = true);
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      await ref.read(profileRepositoryProvider).submitQuiz(_answers);
      container.invalidate(quizProvider);
      if (mounted) {
        setState(() => _retaking = false);
        showSnack(context, 'تم حفظ نتيجة اختبار الشخصية');
      }
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final quiz = ref.watch(quizProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('اختبار الشخصية')),
      body: quiz.when(
        loading: () => const SkeletonList(count: 4, itemHeight: 120),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(quizProvider)),
        data: (q) => q.result != null && !_retaking ? _result(q.result!) : _questions(q),
      ),
    );
  }

  Widget _result(QuizResult r) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('أبرز ما في شخصيتك', style: TextStyle(color: AppColors.muted)),
                const SizedBox(height: 4),
                Text(r.type, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 16),
                for (var i = 0; i < quizDimensions.length && i < r.vector.length; i++) ...[
                  Row(children: [
                    Expanded(child: Text(quizDimensions[i])),
                    Text('${r.vector[i].toStringAsFixed(1)}/5', style: const TextStyle(fontWeight: FontWeight.w700)),
                  ]),
                  const SizedBox(height: 4),
                  LinearProgressIndicator(
                    value: (r.vector[i] / 5).clamp(0, 1),
                    minHeight: 8,
                    borderRadius: BorderRadius.circular(4),
                    color: AppColors.gold,
                    backgroundColor: AppColors.line,
                  ),
                  const SizedBox(height: 12),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        const InfoBanner(text: 'تدخل نتيجتك في حساب نسبة التوافق مع الاقتراحات، ولا يراها أحد غيرك.'),
        const SizedBox(height: 16),
        if (r.canRetake)
          LoadingButton(label: 'إعادة الاختبار', outlined: true, onPressed: () => setState(() => _retaking = true))
        else
          Text('يمكنك إعادة الاختبار بعد ${r.daysRemaining} يوم', style: const TextStyle(color: AppColors.muted)),
      ],
    );
  }

  Widget _questions(Quiz q) {
    final done = q.questions.where((x) => _answers.containsKey(x.id)).length;
    return Column(
      children: [
        LinearProgressIndicator(
          value: q.questions.isEmpty ? 0 : done / q.questions.length,
          color: AppColors.gold,
          backgroundColor: AppColors.line,
        ),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: q.questions.length + 1,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (_, i) {
              if (i == q.questions.length) {
                return Padding(
                  padding: const EdgeInsets.only(top: 8, bottom: 24),
                  child: LoadingButton(
                    key: const Key('submit-quiz'),
                    label: 'حفظ النتيجة ($done/${q.questions.length})',
                    loading: _sending,
                    onPressed: () => _submit(q),
                  ),
                );
              }
              final question = q.questions[i];
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${i + 1}. ${question.text}', style: const TextStyle(fontWeight: FontWeight.w700, height: 1.5)),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (var v = 1; v <= 5; v++)
                            ChoiceChip(
                              key: Key('${question.id}-$v'),
                              label: Text(quizScale[v - 1]),
                              selected: _answers[question.id] == v,
                              onSelected: (_) => setState(() => _answers[question.id] = v),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
