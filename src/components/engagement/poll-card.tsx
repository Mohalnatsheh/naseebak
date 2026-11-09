"use client";

import { useEffect, useState } from "react";
import { Coins, MessageCircleQuestion } from "lucide-react";
import { useDashboardData } from "@/contexts/dashboard-context";
import { arabicCount } from "@/lib/utils";
import type { PublicPoll } from "@/lib/engagement/poll-types";
import { PollWidget, SharePollButton } from "@/components/engagement/poll-widget";
import { LoadError } from "@/components/shared/load-error";

const CREDITS = { one: "رصيد واحد", two: "رصيدان", few: "أرصدة", many: "رصيداً" };
const DAYS = { one: "يوم", two: "يومين", few: "أيام", many: "يوماً" };

/** «سؤال جديد بعد يومين» / «سؤال جديد اليوم» from the running question's end time */
function nextQuestionLabel(endsAt: string | null, now: number): string | null {
  if (!endsAt) return null;
  const days = Math.ceil((new Date(endsAt).getTime() - now) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "سؤال جديد قريباً";
  if (days === 1) return "سؤال جديد غداً";
  return `سؤال جديد بعد ${arabicCount(days, DAYS)}`;
}

/**
 * Dashboard home: «سؤال نصيبك». Answering earns the member credits (poll_reward_credits, once per question).
 * Renders nothing while the switch is off or nothing is running; a failed load shows a small LoadError with a retry.
 */
export function PollCard() {
  const { refreshUnread } = useDashboardData();
  const [poll, setPoll] = useState<PublicPoll | null>(null);
  const [now] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/polls/current")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`poll ${r.status}`))))
      .then((data) => {
        if (cancelled) return;
        setFailed(false);
        if (data?.poll && data.poll.status === "ACTIVE") setPoll(data.poll);
      })
      // A failed load says so (QA WA-03), never a silent gap that looks like "no question this week"
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (!poll && failed) {
    return <LoadError className="py-5" message="تعذّر تحميل سؤال نصيبك." onRetry={() => setAttempt((n) => n + 1)} />;
  }
  if (!poll) return null;
  const answered = poll.myVote !== null;
  const next = nextQuestionLabel(poll.endsAt, now);
  return (
    <section aria-labelledby="poll-title" className="overflow-hidden rounded-2xl border border-accent/40 bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-accent/20 bg-accent/10 px-4 py-2.5">
        <MessageCircleQuestion className="h-4 w-4 text-accent-foreground" aria-hidden />
        <h2 id="poll-title" className="flex-1 text-sm font-bold text-foreground">
          سؤال نصيبك
        </h2>
        {!answered && poll.offerCredits > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-accent-foreground">
            <Coins className="h-3.5 w-3.5" aria-hidden />+{arabicCount(poll.offerCredits, CREDITS)}
          </span>
        )}
      </div>
      <div className="space-y-3 p-4">
        <p className="font-display text-lg leading-snug text-foreground">{poll.question}</p>
        {!answered && poll.offerCredits > 0 && (
          <p className="text-xs text-muted-foreground">إجابتك تضيف {arabicCount(poll.offerCredits, CREDITS)} إلى رصيدك.</p>
        )}
        <PollWidget
          key={poll.id}
          poll={poll}
          source="dashboard"
          onVoted={(p) => {
            setPoll(p);
            if (p.rewardCredits > 0) refreshUnread();
          }}
        />
        {answered && poll.rewardCredits > 0 && (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800">
            <Coins className="h-4 w-4 shrink-0" aria-hidden />
            أُضيف {arabicCount(poll.rewardCredits, CREDITS)} إلى رصيدك. شكراً على مشاركتك!
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {answered ? <SharePollButton slug={poll.slug} country={poll.country} className="text-primary" /> : <span />}
          {next && <span className="text-xs text-muted-foreground">{next}</span>}
        </div>
      </div>
    </section>
  );
}
