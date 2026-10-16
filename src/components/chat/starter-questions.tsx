"use client";

import { Sparkles } from "lucide-react";

const QUESTIONS = [
  "السلام عليكم، سعيد/ة بالتوافق. كيف حالك؟",
  "ما أهم صفة تبحث/ين عنها في شريك الحياة؟",
  "كيف تتخيل/ين حياتنا اليومية بعد الزواج؟",
  "ما رأيك في السكن: قريباً من العائلة أم مستقلين؟",
  "ما الذي يجعلك تشعر/ين بالاحترام والتقدير؟",
];

/** Shown on an empty chat to help start a respectful conversation. */
export function StarterQuestions({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="mx-auto max-w-md py-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/20">
        <Sparkles className="h-6 w-6 text-primary" />
      </div>
      <p className="font-semibold text-foreground">ابدأ المحادثة</p>
      <p className="mt-1 text-sm text-muted-foreground">اختر سؤالاً لتبدأ، أو اكتب رسالتك.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="rounded-full border border-primary/20 bg-card px-3 py-1.5 text-sm text-foreground/80 transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
