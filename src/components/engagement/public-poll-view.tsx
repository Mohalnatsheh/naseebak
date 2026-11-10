"use client";

import { useState } from "react";
import Link from "@/components/shared/site-link";
import { useVisitorCountry } from "@/components/shared/visitor-country";
import { ChevronLeft, MessageCircleQuestion } from "lucide-react";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { trackEvent } from "@/lib/analytics";
import { POLL_COPY, type PollSource, type PublicPoll } from "@/lib/engagement/poll-types";
import { PollWidget, SharePollButton } from "@/components/engagement/poll-widget";

/**
 * Public «سؤال نصيبك» page (/poll, /poll/<slug>): where Instagram story links land. Anyone can answer;
 * after answering a visitor is invited to register, a member is sent back to the dashboard.
 */
export function PublicPollView({
  poll: initial,
  member,
  source,
  pollsOff = false,
}: {
  poll: PublicPoll | null;
  member: boolean;
  source: PollSource;
  /** Polls are switched off (here or everywhere): the «no question now» page says nothing about new questions */
  pollsOff?: boolean;
}) {
  const [poll, setPoll] = useState(initial);
  const answered = poll?.myVote != null;
  const copy = POLL_COPY[useVisitorCountry()];

  return (
    <>
      <Navbar />
      <main id="main" tabIndex={-1} className="min-h-[70vh] bg-background px-4 pb-16 pt-24 sm:pt-28">
        <div className="mx-auto max-w-xl space-y-5">
          <section className="landing-night relative overflow-hidden rounded-3xl px-5 py-6 text-white shadow-lg shadow-primary/20 sm:px-7 sm:py-8">
            <div className="landing-khatam absolute inset-0" aria-hidden />
            <div className="relative space-y-4">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">
                <MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden />
                سؤال نصيبك · منصة زواج جاد
              </p>
              {poll ? (
                <>
                  <h1 className="font-display text-2xl leading-snug sm:text-3xl">{poll.question}</h1>
                  <PollWidget
                    key={poll.id}
                    poll={poll}
                    source={source}
                    tone="dark"
                    onVoted={(p) => {
                      setPoll(p);
                      trackEvent("poll_vote", { source });
                    }}
                  />
                  {answered && <SharePollButton slug={poll.slug} country={poll.country} className="text-accent" />}
                </>
              ) : (
                <>
                  <h1 className="font-display text-2xl leading-snug sm:text-3xl">لا يوجد سؤال مفتوح الآن</h1>
                  {!pollsOff && (
                    <p className="text-sm leading-relaxed text-white/75">{copy.nextQuestion}</p>
                  )}
                </>
              )}
            </div>
          </section>

          {member ? (
            <Link
              href="/dashboard"
              className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3 font-semibold text-foreground hover:bg-muted/40"
            >
              العودة إلى لوحتي
              <ChevronLeft className="h-4 w-4 text-primary" aria-hidden />
            </Link>
          ) : (
            (answered || !poll) && (
              <section className="space-y-3 rounded-2xl border border-accent/40 bg-card p-5">
                <h2 className="text-lg font-bold text-foreground">{copy.notDating}</h2>
                <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
                  <li>• الصور مخفية حتى يقول الطرفان «مهتم».</li>
                  <li>• لا تواصل قبل التوافق المتبادل، وقرار «لا» بدون إشعار.</li>
                  <li>• بعد التوافق تختار: محادثة محمية أو تعارف عائلي.</li>
                </ul>
                <Link
                  href="/register"
                  className="flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 text-base font-bold text-primary-foreground hover:bg-primary/90"
                >
                  سجّل الآن مجاناً
                </Link>
                {!pollsOff && (
                  <p className="text-center text-xs text-muted-foreground">{copy.answerInAccount}</p>
                )}
              </section>
            )
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
