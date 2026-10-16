"use client";

import { Sparkles } from "lucide-react";

/** Written for the speaker's and the listener's gender (no "/ة" slashes). */
function questions(myGender: string | null | undefined): string[] {
  const iAmMale = myGender !== "FEMALE";
  // The listener is the other gender
  const you = iAmMale
    ? { search: "تبحثين", imagine: "تتخيلين", feel: "تشعرين" }
    : { search: "تبحث", imagine: "تتخيل", feel: "تشعر" };
  return [
    `السلام عليكم، ${iAmMale ? "سعيد" : "سعيدة"} بالتوافق. كيف حالك؟`,
    `ما أهم صفة ${you.search} عنها في شريك الحياة؟`,
    `كيف ${you.imagine} حياتنا اليومية بعد الزواج؟`,
    "ما رأيك في السكن: قريباً من العائلة أم مستقلين؟",
    `ما الذي يجعلك ${you.feel} بالاحترام والتقدير؟`,
  ];
}

/** Shown on an empty chat to help start a respectful conversation. */
export function StarterQuestions({ onPick, myGender }: { onPick: (q: string) => void; myGender?: string | null }) {
  const QUESTIONS = questions(myGender);
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
