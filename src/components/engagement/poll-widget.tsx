"use client";

import { useState } from "react";
import { Check, Loader2, Share2 } from "lucide-react";
import { arabicCount, cn } from "@/lib/utils";
import { MIN_POLL_RESULTS, type PollSource, type PublicPoll } from "@/lib/engagement/poll-types";

/**
 * «سؤال نصيبك»: the options, then (after voting) the results as bars with the voter's answer marked.
 * Used by the public page /poll and the dashboard home card. Votes are final.
 */
export function PollWidget({
  poll: initial,
  source,
  onVoted,
  tone = "light",
}: {
  poll: PublicPoll;
  source: PollSource;
  onVoted?: (poll: PublicPoll) => void;
  tone?: "light" | "dark";
}) {
  const [poll, setPoll] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const voted = poll.myVote !== null;
  const closed = poll.status === "CLOSED";
  const dark = tone === "dark";

  async function vote(optionId: string) {
    if (busy || voted || closed) return;
    setBusy(optionId);
    setError("");
    try {
      const res = await fetch("/api/polls/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pollId: poll.id, optionId, source }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.poll) {
        setError(data.error || "تعذّر تسجيل صوتك. حاول مرة أخرى.");
        return;
      }
      setPoll(data.poll);
      onVoted?.(data.poll);
    } catch {
      setError("تعذّر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.");
    } finally {
      setBusy(null);
    }
  }

  const results = poll.results;
  return (
    <div className="space-y-2.5">
      <ul className="space-y-2" aria-label="الخيارات">
        {poll.options.map((o) => {
          const mine = poll.myVote === o.id;
          const pct = results?.percents[o.id] ?? 0;
          if (voted || closed) {
            return (
              <li
                key={o.id}
                className={cn(
                  "relative overflow-hidden rounded-xl border px-3.5 py-3",
                  dark ? "border-white/15 bg-white/5" : "border-border/70 bg-card",
                  mine && (dark ? "border-accent/70" : "border-accent"),
                )}
              >
                {results && (
                  <span
                    aria-hidden
                    className={cn("absolute inset-y-0 start-0 rounded-e-lg transition-[width] duration-700", mine ? "bg-accent/30" : dark ? "bg-white/10" : "bg-primary/10")}
                    style={{ width: `${pct}%` }}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  {mine && <Check className="h-4 w-4 shrink-0 text-accent" aria-label="إجابتك" />}
                  <span className={cn("min-w-0 flex-1 font-semibold", dark ? "text-white" : "text-foreground")}>{o.label}</span>
                  {results && <span className={cn("shrink-0 text-sm font-bold", dark ? "text-white" : "text-primary")}>{pct}%</span>}
                </span>
                {results?.split && (
                  <span className={cn("relative mt-1 block text-xs", dark ? "text-white/60" : "text-muted-foreground")}>
                    النساء {results.split.women[o.id]}% · الرجال {results.split.men[o.id]}%
                  </span>
                )}
              </li>
            );
          }
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => vote(o.id)}
                disabled={busy !== null}
                className={cn(
                  "flex min-h-12 w-full items-center gap-2 rounded-xl border-2 px-4 py-3 text-start font-semibold transition-colors disabled:opacity-70",
                  dark
                    ? "border-white/20 bg-white/5 text-white hover:border-accent hover:bg-white/10"
                    : "border-primary/15 bg-card text-foreground hover:border-accent hover:bg-accent/5",
                )}
              >
                <span className="min-w-0 flex-1">{o.label}</span>
                {busy === o.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
      {(voted || closed) && (
        <p className={cn("text-xs leading-relaxed", dark ? "text-white/65" : "text-muted-foreground")}>
          {results
            ? `${closed ? "النتيجة النهائية" : "النتيجة حتى الآن"}: ${arabicCount(results.total, VOTES)}.`
            : voted
              ? `سجّلنا إجابتك. تظهر النتيجة عند وصول ${MIN_POLL_RESULTS} أصوات.`
              : "انتهى التصويت على هذا السؤال."}
        </p>
      )}
      {voted && poll.note && <p className={cn("rounded-xl px-3 py-2.5 text-sm leading-relaxed", dark ? "bg-white/10 text-white/90" : "bg-primary/5 text-foreground")}>{poll.note}</p>}
    </div>
  );
}

const VOTES = { one: "صوت واحد", two: "صوتان", few: "أصوات", many: "صوتاً" };

/** Share the question (native share sheet on phones, else copy the link) */
export function SharePollButton({ slug, className }: { slug: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = `${window.location.origin}/poll/${slug}`;
    const data = { title: "سؤال نصيبك", text: "شو رأيك؟ جاوب على سؤال نصيبك:", url };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Share sheet dismissed
    }
  }
  return (
    <button type="button" onClick={share} className={cn("inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold", className)}>
      {copied ? <Check className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
      {copied ? "نُسخ الرابط" : "شارك السؤال"}
    </button>
  );
}
