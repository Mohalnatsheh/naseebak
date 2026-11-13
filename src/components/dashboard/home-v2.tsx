"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, Coins, Crown, Handshake, Inbox, MessageCircleQuestion, Sparkles, UserRound } from "lucide-react";
import { useDashboardData } from "@/contexts/dashboard-context";
import { cn, arabicCount } from "@/lib/utils";
import { GuardianConsentCard } from "@/components/intro/guardian-consent-card";
import { NextStepCard } from "@/components/dashboard/next-step-card";
import { PollCard } from "@/components/engagement/poll-card";
import { LoadError } from "@/components/shared/load-error";
import { MemberAvatar } from "@/components/shared/member-avatar";
import { BannerSlot, requestsWaiting } from "@/components/shared/banner-slot";
import { proIntroShown } from "@/components/payments/pro-intro-card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { listTimeLabel } from "@/components/chat/chat-utils";
import { formatDate } from "@/lib/countries";
import { qualifiesForSuggestions as qualifiesForSuggestionsGate } from "@/lib/profile-completeness";
import { matchesHref } from "@/lib/matches/links";
import { homeZeroCreditLine } from "@/lib/suggestions/copy";
import { PRO_PAGE_PATH } from "@/lib/pro/plans";
import type { ChatSummary } from "@/lib/chat/service";
import type { FeedItem } from "@/lib/suggestions/feed-types";
import type { PublicPoll } from "@/lib/engagement/poll-types";

const INTERESTED_HREF = "/dashboard/suggestions?tab=interested";
/** Desktop shows 5 people, phones 3 (the 4th and 5th are hidden under md) */
const INTERESTED_SHOWN = 5;
const INTERESTED_PHONE = 3;

/** Local time in Jordan and Saudi Arabia (both UTC+3 all year), whatever the device clock says */
function ammanHour(): number {
  return (new Date().getUTCHours() + 3) % 24;
}

function greeting() {
  const h = ammanHour();
  return h >= 4 && h < 12 ? "صباح الخير" : "مساء الخير";
}

/**
 * Member home, redesigned (switch `dashboard_redesign`, spec 2026-11-13 "Home"): one calm column, what needs me now
 * first. Greeting → the banner slot → (setup unfinished: the next step only) → «بانتظار ردّك» → guardian consent →
 * «مهتمون بك» → «اليوم» → «المزيد». A block with nothing in it is not shown; a failed load shows LoadError. Read-only:
 * the answers live on the suggestions page. Data rules are today's home's (`LegacyHome` in the dashboard page).
 */
export function HomeV2() {
  const { profile, completeness, counts, loading, profileFailed, countsFailed, refreshProfile, refreshUnread, country } = useDashboardData();
  const [retrying, setRetrying] = useState(false);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [interested, setInterested] = useState<FeedItem[] | null>(null);
  const [interestedFailed, setInterestedFailed] = useState(false);
  const [interestedTry, setInterestedTry] = useState(0);
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [chatsFailed, setChatsFailed] = useState(false);
  const [chatsTry, setChatsTry] = useState(0);
  const [poll, setPoll] = useState<PublicPoll | null>(null);
  const [pollFailed, setPollFailed] = useState(false);
  const [pollTry, setPollTry] = useState(0);
  const [pollOpen, setPollOpen] = useState(false);

  const female = profile?.gender === "FEMALE";
  const g = (masculine: string, feminine: string) => (female ? feminine : masculine);
  const qualifies = qualifiesForSuggestionsGate({
    completenessTotal: completeness?.total ?? 0,
    isComplete: !!profile?.profile?.isComplete,
    newCycle: counts.flags.introRequests,
  });
  const chatOn = counts.flags.chat || counts.hasChats;
  const sharedFeed = counts.flags.mutualSuggestions;

  // Page 1 of /api/suggestions tops suggestions up (as today's home, spec call 7), then «مهتمون بك» is read
  useEffect(() => {
    if (loading || !qualifies) return;
    let cancelled = false;
    fetch("/api/suggestions?page=1")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`suggestions ${r.status}`))))
      .then((d) => {
        if (!cancelled) setEmptyReason(typeof d?.emptyReason === "string" ? d.emptyReason : null);
      })
      // The top-up shows nothing itself (the counts come from /api/me/counts): a failure only skips it
      .catch(() => {})
      .then(() => (sharedFeed ? fetch("/api/suggestions/feed?tab=interested&page=1") : null))
      .then((r) => (r ? (r.ok ? r.json() : Promise.reject(new Error(`feed ${r.status}`))) : null))
      .then((d) => {
        if (cancelled || !d) return;
        setInterested((d.items ?? []) as FeedItem[]);
        setInterestedFailed(false);
      })
      .catch(() => { if (!cancelled) setInterestedFailed(true); });
    return () => { cancelled = true; };
  }, [loading, qualifies, sharedFeed, interestedTry]);

  // Conversations (the same list as the chats page)
  useEffect(() => {
    if (loading || !qualifies || !chatOn) return;
    let cancelled = false;
    fetch("/api/chats")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`chats ${r.status}`))))
      .then((d) => {
        if (cancelled) return;
        setChats((d.conversations ?? []) as ChatSummary[]);
        setChatsFailed(false);
      })
      .catch(() => { if (!cancelled) setChatsFailed(true); });
    return () => { cancelled = true; };
  }, [loading, qualifies, chatOn, chatsTry]);

  // «سؤال الأسبوع»: the same endpoint as PollCard; re-read after the dialog closes so «جديد» follows a vote
  useEffect(() => {
    if (loading || !qualifies) return;
    let cancelled = false;
    fetch("/api/polls/current")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`poll ${r.status}`))))
      .then((d) => {
        if (cancelled) return;
        setPollFailed(false);
        setPoll(d?.poll && d.poll.status === "ACTIVE" ? (d.poll as PublicPoll) : null);
      })
      .catch(() => { if (!cancelled) setPollFailed(true); });
    return () => { cancelled = true; };
  }, [loading, qualifies, pollTry]);

  if (loading) {
    return (
      <div role="status" className="mx-auto max-w-2xl space-y-5 pb-8">
        <span className="sr-only">جارٍ تحميل صفحتك…</span>
        <div className="h-14 animate-pulse rounded-2xl bg-primary/10" aria-hidden />
        <div className="h-28 animate-pulse rounded-2xl bg-primary/5" aria-hidden />
        <div className="h-36 animate-pulse rounded-2xl bg-primary/5" aria-hidden />
        <div className="h-40 animate-pulse rounded-2xl bg-primary/5" aria-hidden />
      </div>
    );
  }

  // The profile didn't load: say so with a retry, never "finish your setup" with a 0% ring
  if (!profile) {
    return (
      <div className="py-12">
        <LoadError
          message={profileFailed ? "تعذّر تحميل بياناتك. يمكنك التحقق من الاتصال والمحاولة مرة أخرى." : "تعذّر تحميل البيانات. يمكنك المحاولة مرة أخرى."}
          onRetry={retrying ? undefined : () => { setRetrying(true); refreshProfile().finally(() => setRetrying(false)); }}
        />
      </div>
    );
  }

  // The switches never loaded (QA WA-02)
  if (countsFailed) {
    return (
      <div className="py-12">
        <LoadError
          message="تعذّر تحميل صفحتك. يمكنك التحقق من الاتصال والمحاولة مرة أخرى."
          onRetry={retrying ? undefined : () => { setRetrying(true); refreshUnread().finally(() => setRetrying(false)); }}
        />
      </div>
    );
  }

  const matchesCount = (profile._count?.matchesAsFemale || 0) + (profile._count?.matchesAsMale || 0);
  const credits = counts.credits ?? profile.matchCredits ?? 0;
  const completionPercent = completeness?.total ?? 0;
  const topTip = completeness?.tips?.[0];
  const likedYou = counts.likedYou ?? 0;
  const fresh = counts.newSuggestions ?? 0;
  const freeReply = !!counts.flags.freeInterestReply;
  const outOfCredits = !!counts.flags.creditOnInterest && credits <= 0;
  const zeroLine = outOfCredits ? homeZeroCreditLine({ freeReply, likedYou, fresh, female }) : null;
  const yours = g("ك", "كِ");

  // «بانتظار ردّك»: only what /api/me/counts already sends (spec call 1), no per-item deadline
  const waiting: (RowProps & { key: string })[] = [
    ...(counts.pendingIntros > 0
      ? [{
          key: "requests",
          icon: Inbox,
          tone: "urgent" as const,
          title: `${counts.pendingIntros === 1 ? "طلب تعارف" : requestsWaiting(counts.pendingIntros)} بانتظار ردّ${yours}`,
          href: matchesHref(counts.flags.mutualSuggestions, counts.pendingIntroMatchId),
        }]
      : []),
    ...((counts.actionableMatches ?? 0) > 0
      ? [{
          key: "matches",
          icon: Handshake,
          title: `${arabicCount(counts.actionableMatches, { one: "توافق ينتظر", two: "توافقان ينتظران", few: "توافقات تنتظر", many: "توافقاً ينتظر" })}${yours}`,
          sub: g("يمكنك طلب تعارف عائلي أو محادثة.", "يمكنكِ طلب تعارف عائلي أو محادثة."),
          href: matchesHref(counts.flags.mutualSuggestions),
        }]
      : []),
  ];

  // Unread first, then the most recent; active chats only (today's "conversations to continue", max 3)
  const recentChats = (chats ?? [])
    .filter((c) => c.status === "ACTIVE" && !c.matchHidden)
    .sort((a, b) => b.unread - a.unread || +new Date(b.lastMessage?.createdAt ?? 0) - +new Date(a.lastMessage?.createdAt ?? 0))
    .slice(0, 3);
  const showFresh = sharedFeed && typeof counts.newSuggestions === "number";
  const showToday = showFresh || recentChats.length > 0 || (chatOn && chatsFailed && chats === null);

  const people = (interested ?? []).slice(0, INTERESTED_SHOWN);
  const showPro = proIntroShown(counts.pro);
  const showProfile = completionPercent < 100;
  const showMore = !!poll || (pollFailed && !poll) || showProfile || showPro;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      <header className="px-1">
        <p className="text-caption text-muted-ink">{formatDate(new Date(), country, { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="font-display text-title text-ink">{greeting()}، {profile.firstName}</h1>
      </header>

      <BannerSlot />

      {/* Setup not finished: the one next step replaces everything below that needs the gate */}
      {!qualifies && (
        <NextStepCard qualifies={false} pendingSuggestions={0} matchesCount={matchesCount} credits={credits} emptyReason={emptyReason} suggestionsFailed={false} />
      )}

      {qualifies && waiting.length > 0 && (
        <Section id="home-waiting" title="بانتظار ردّك">
          <Group>{waiting.map(({ key, ...w }) => <Row key={key} {...w} />)}</Group>
        </Section>
      )}

      {/* Guardian consent still missing (new cycle): unchanged card, in the "needs me" part */}
      {counts.flags.introRequests && counts.guardian?.exists && !counts.guardian.consented && <GuardianConsentCard />}

      {qualifies && (
        <>
          {sharedFeed && interestedFailed && interested === null && (
            <LoadError className="py-5" message="تعذّر تحميل من اهتم بك." onRetry={() => { setInterestedFailed(false); setInterestedTry((n) => n + 1); }} />
          )}
          {people.length > 0 && (
            <Section
              id="home-interested"
              title="مهتمون بك"
              action={
                <Link href={INTERESTED_HREF} className="inline-flex min-h-11 items-center gap-0.5 text-label text-primary">
                  عرض الكل <ChevronLeft className="h-4 w-4" aria-hidden />
                </Link>
              }
            >
              <ul className="grid grid-cols-3 gap-2 rounded-2xl border border-border/60 bg-card px-2 py-3 md:grid-cols-5">
                {people.map((p, i) => (
                  <li key={p.id} data-person className={cn(i >= INTERESTED_PHONE && "max-md:hidden")}>
                    <Link href={INTERESTED_HREF} className="flex min-h-11 flex-col items-center gap-1 rounded-xl px-1 py-1 text-center transition-colors hover:bg-muted/40">
                      <MemberAvatar name={p.candidate.firstName} size={56} locked pro={!!p.isPro} />
                      <span className="w-full truncate text-label text-ink">{p.candidate.age ? `${p.candidate.firstName}، ${p.candidate.age}` : p.candidate.firstName}</span>
                      {p.candidate.city && <span className="w-full truncate text-caption text-muted-ink">{p.candidate.city}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
              {freeReply && (
                <p className="mt-2 px-1 text-caption text-muted-ink">{g("ردّك بـ«مهتم» على من اهتم بك مجاني.", "ردّكِ بـ«مهتم» على من اهتم بكِ مجاني.")}</p>
              )}
            </Section>
          )}

          {showToday && (
            <Section id="home-today" title="اليوم">
              <Group>
                {showFresh && <Row icon={Sparkles} title="اقتراحات جديدة" value={String(fresh)} href="/dashboard/suggestions" />}
                {recentChats.map((c) => (
                  <li key={c.id}>
                    <Link href={`/dashboard/chats/${c.id}`} className="flex min-h-[52px] items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/40">
                      <MemberAvatar name={c.partner.firstName} size={36} matched pro={!!c.partner.isPro} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-label text-ink">{c.partner.firstName}</span>
                        <span className={cn("block truncate text-caption", c.unread > 0 ? "font-semibold text-ink" : "text-muted-ink")}>
                          {c.lastMessage ? `${c.lastMessage.mine ? g("أنت: ", "أنتِ: ") : ""}${c.lastMessage.body}` : g("ابدأ المحادثة", "ابدئي المحادثة")}
                        </span>
                      </span>
                      {c.unread > 0 ? (
                        <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-caption font-bold tabular-nums text-primary-foreground" aria-label={`${c.unread} غير مقروءة`}>
                          {c.unread > 99 ? "99+" : c.unread}
                        </span>
                      ) : (
                        c.lastMessage && <span className="shrink-0 text-caption text-muted-ink">{listTimeLabel(c.lastMessage.createdAt, country)}</span>
                      )}
                      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-ink" aria-hidden />
                    </Link>
                  </li>
                ))}
              </Group>
              {chatOn && chatsFailed && chats === null && (
                <LoadError className="py-4" message="تعذّر تحميل المحادثات." onRetry={() => { setChatsFailed(false); setChatsTry((n) => n + 1); }} />
              )}
              {/* «مهتم» needs a credit: say so before the member taps through (today's zero-credit line) */}
              {zeroLine && (
                <Link href="/dashboard/payments" className="mt-2 flex min-h-11 items-center gap-2 rounded-xl bg-amber-50 px-4 py-2 text-caption font-semibold text-amber-900">
                  <Coins className="h-4 w-4 shrink-0" aria-hidden />
                  {zeroLine}
                </Link>
              )}
            </Section>
          )}

          {showMore && (
            <section id="home-more" aria-labelledby="home-more-title">
              <h2 id="home-more-title" className="mb-2 px-1 text-label text-muted-ink">المزيد</h2>
              <Group>
                {poll && (
                  <li>
                    <button type="button" onClick={() => setPollOpen(true)} className="flex min-h-11 w-full items-center gap-3 px-4 py-1.5 text-start transition-colors hover:bg-muted/40">
                      <RowIcon icon={MessageCircleQuestion} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-label text-ink">سؤال الأسبوع</span>
                        <span className="block truncate text-caption text-muted-ink">{poll.question}</span>
                      </span>
                      {poll.myVote === null && <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-caption font-bold text-accent-ink">جديد</span>}
                      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-ink" aria-hidden />
                    </button>
                  </li>
                )}
                {showProfile && (
                  <li>
                    <Link href={topTip?.link ?? "/dashboard/profile"} className="flex min-h-11 items-center gap-3 px-4 py-1.5 transition-colors hover:bg-muted/40">
                      <RowIcon icon={UserRound} />
                      <span className="min-w-0 flex-1">
                        {/* «31%», never «%31» in RTL (QA WM-24) */}
                        <span className="block text-label text-ink">{g("ملفك", "ملفكِ")} مكتمل <bdi dir="ltr">{completionPercent}%</bdi></span>
                        {topTip && <span className="block truncate text-caption text-muted-ink">{topTip.message}</span>}
                      </span>
                      <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${completionPercent}%` }} />
                      </span>
                      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-ink" aria-hidden />
                    </Link>
                  </li>
                )}
                {showPro && (
                  <li>
                    <Link href={PRO_PAGE_PATH} className="flex min-h-11 items-center gap-3 px-4 py-1.5 transition-colors hover:bg-muted/40">
                      <RowIcon icon={Crown} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-label text-ink">عضوية Pro</span>
                        <span className="block truncate text-caption text-muted-ink">
                          {counts.flags.chat ? "صور ورسائل صوتية في المحادثة، وشارة Pro على بطاقتك." : "شارة Pro على بطاقتك."}
                        </span>
                      </span>
                      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-ink" aria-hidden />
                    </Link>
                  </li>
                )}
              </Group>
              {pollFailed && !poll && (
                <LoadError className="py-4" message="تعذّر تحميل سؤال الأسبوع." onRetry={() => setPollTry((n) => n + 1)} />
              )}
            </section>
          )}

          <Dialog
            open={pollOpen}
            onOpenChange={(open) => {
              setPollOpen(open);
              if (!open) setPollTry((n) => n + 1);
            }}
          >
            <DialogContent dir="rtl" aria-describedby={undefined} className="p-0 sm:max-w-md">
              <DialogTitle className="sr-only">سؤال الأسبوع</DialogTitle>
              {pollOpen && <PollCard />}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function Section({ id, title, action, children }: { id: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`}>
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 id={`${id}-title`} className="text-headline text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card">{children}</ul>;
}

function RowIcon({ icon: Icon, tone }: { icon: typeof Inbox; tone?: "urgent" }) {
  return (
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone === "urgent" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
      <Icon className="h-[18px] w-[18px]" aria-hidden />
    </span>
  );
}

interface RowProps {
  icon: typeof Inbox;
  title: string;
  sub?: string;
  value?: string;
  href: string;
  tone?: "urgent";
}

/** One 52 px grouped-list row: icon, title (and a line under it), an optional value, the chevron */
function Row({ icon, title, sub, value, href, tone }: RowProps) {
  return (
    <li>
      <Link href={href} className="flex min-h-[52px] items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/40">
        <RowIcon icon={icon} tone={tone} />
        <span className="min-w-0 flex-1">
          <span className="block text-label text-ink">{title}</span>
          {sub && <span className="block truncate text-caption text-muted-ink">{sub}</span>}
        </span>
        {value && <span className="shrink-0 text-label tabular-nums text-ink">{value}</span>}
        <ChevronLeft className="h-4 w-4 shrink-0 text-muted-ink" aria-hidden />
      </Link>
    </li>
  );
}
