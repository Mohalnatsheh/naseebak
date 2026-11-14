"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Sparkles, Heart, Bell, ChevronLeft, Zap, Inbox, Coins, Handshake } from "lucide-react";
import { useDashboardData } from "@/contexts/dashboard-context";
import { cn } from "@/lib/utils";
import { GuardianConsentCard } from "@/components/intro/guardian-consent-card";
import { NextStepCard } from "@/components/dashboard/next-step-card";
import { PollCard } from "@/components/engagement/poll-card";
import { LoadError } from "@/components/shared/load-error";
import { listTimeLabel } from "@/components/chat/chat-utils";
import { formatDate, type CountryCode } from "@/lib/countries";
import { qualifiesForSuggestions as qualifiesForSuggestionsGate } from "@/lib/profile-completeness";
import { matchesHref } from "@/lib/matches/links";
import type { ChatSummary } from "@/lib/chat/service";
import type { FeedItem } from "@/lib/suggestions/feed-types";
import { homeZeroCreditLine } from "@/lib/suggestions/copy";
import { ProBadge } from "@/components/shared/pro-badge";
import { ProIntroCard, proIntroShown } from "@/components/payments/pro-intro-card";
import { MemberAvatar } from "@/components/shared/member-avatar";
import { BannerSlot, requestsWaiting } from "@/components/shared/banner-slot";
import { HomeV2 } from "@/components/dashboard/home-v2";

/** Local time in Jordan and Saudi Arabia (both UTC+3 all year), whatever the device clock says */
function ammanHour(): number {
  return (new Date().getUTCHours() + 3) % 24;
}

function getGreeting() {
  const h = ammanHour();
  return h >= 4 && h < 12 ? "صباح الخير" : "مساء الخير";
}

function getArabicDate(country: CountryCode) {
  return formatDate(new Date(), country, { weekday: "long", day: "numeric", month: "long" });
}

/**
 * Home: a daily action centre on two columns from lg (P2-6). Main: greeting → the banner slot → the one next step →
 * what waits for me → today's suggestions → the poll. Side: the count tiles (the app's) → conversations to continue →
 * guardian consent → profile strength (only while it's not complete). Phones: one column. Every number comes from the server (/api/me/counts, /api/chats).
 */
export default function DashboardPage() {
  const { counts } = useDashboardData();
  // Switch dashboard_redesign (2026-11-13): only one of the two homes mounts, so the top-up runs once. Once the counts
  // say the switch is on (even while the profile still loads), HomeV2 shows its own one-column skeleton; until then
  // today's home shows its skeleton. Both homes' effects wait for `loading`, so neither fetches before it settles
  if (counts?.dashboardRedesign) return <HomeV2 />;
  return <LegacyHome />;
}

/** Today's home, unchanged (the switch off) */
function LegacyHome() {
  const { profile, completeness, counts, unreadCount, loading, profileFailed, countsFailed, refreshProfile, refreshUnread, country } = useDashboardData();
  const [retrying, setRetrying] = useState(false);
  // Why nothing new came ("weekly_cap" | "no_candidates" | "pending" | null), from page 1 of /api/suggestions
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [suggestionsFailed, setSuggestionsFailed] = useState(false);
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const female = profile?.gender === "FEMALE";
  const g = (masculine: string, feminine: string) => (female ? feminine : masculine);
  // New cycle: finishing the short setup is enough; legacy: 50% completeness
  const qualifiesForSuggestions = qualifiesForSuggestionsGate({
    completenessTotal: completeness?.total ?? 0,
    isComplete: !!profile?.profile?.isComplete,
    newCycle: counts.flags.introRequests,
  });
  const chatOn = counts.flags.chat || counts.hasChats;
  const sharedFeed = counts.flags.mutualSuggestions;
  const [suggested, setSuggested] = useState<FeedItem[] | null>(null);
  // A failed section load shows LoadError there, never an empty state (QA WA-03); retry bumps these
  const [feedFailed, setFeedFailed] = useState(false);
  const [feedTry, setFeedTry] = useState(0);
  const [chatsFailed, setChatsFailed] = useState(false);
  const [chatsTry, setChatsTry] = useState(0);

  // Once the profile qualifies, page 1 of /api/suggestions tops up suggestions automatically (the counts
  // shown come from /api/me/counts; this call also says why nothing new came)
  useEffect(() => {
    if (loading || !qualifiesForSuggestions) return;
    let cancelled = false;
    fetch("/api/suggestions?page=1")
      .then((r) => {
        if (!r.ok) throw new Error(`suggestions ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setSuggestionsFailed(false);

        setEmptyReason(typeof d?.emptyReason === "string" ? d.emptyReason : null);
      })
      // A failure is not "no suggestions": the next-step card says it couldn't load
      .catch(() => { if (!cancelled) setSuggestionsFailed(true); })
      // «توافقات مقترحة»: the people in the «الجديد» tab, read after the top-up above ran
      .then(() => (sharedFeed ? fetch("/api/suggestions/feed?tab=new&page=1") : null))
      .then((r) => (r ? (r.ok ? r.json() : Promise.reject(new Error(`feed ${r.status}`))) : null))
      .then((d) => {
        if (cancelled || !d) return;
        setSuggested((d.items ?? []) as FeedItem[]);
        setFeedFailed(false);
      })
      .catch(() => { if (!cancelled) setFeedFailed(true); });
    return () => { cancelled = true; };
  }, [loading, qualifiesForSuggestions, sharedFeed, feedTry]);

  // Conversations to continue (the same list as the chats page)
  useEffect(() => {
    if (loading || !chatOn) return;
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
  }, [loading, chatOn, chatsTry]);

  if (loading) {
    // Shaped like the page (greeting, «بانتظار ردّك», chats, profile), about as tall as it, so nothing jumps when it
    // arrives (QA WM-02 / PA-M4)
    return (
      <div role="status" className="space-y-5 pb-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] lg:items-start lg:gap-6 lg:space-y-0">
        <span className="sr-only">جارٍ تحميل صفحتك…</span>
        <div className="space-y-5">
          <div className="h-[72px] animate-pulse rounded-2xl bg-primary/15" aria-hidden />
          <div className="h-48 animate-pulse rounded-2xl bg-primary/5" aria-hidden />
          <div className="h-56 animate-pulse rounded-2xl bg-primary/5" aria-hidden />
        </div>
        <div className="space-y-5">
          <div className="h-24 animate-pulse rounded-2xl bg-primary/5" aria-hidden />
          <div className="h-28 animate-pulse rounded-2xl bg-primary/5" aria-hidden />
        </div>
      </div>
    );
  }

  // The profile didn't load: say so with a retry, never "finish your setup" with a 0% ring
  if (!profile) {
    return (
      <div className="py-12">
        <LoadError
          message={profileFailed ? "تعذّر تحميل بياناتك. يمكنك التحقق من الاتصال والمحاولة مرة أخرى." : "تعذّر تحميل البيانات. يمكنك المحاولة مرة أخرى."}
          onRetry={
            retrying
              ? undefined
              : () => {
                  setRetrying(true);
                  refreshProfile().finally(() => setRetrying(false));
                }
          }
        />
      </div>
    );
  }

  // The switches never loaded (QA WA-02): the page would show the switched-off flow, so say so with a retry
  if (countsFailed) {
    return (
      <div className="py-12">
        <LoadError
          message="تعذّر تحميل صفحتك. يمكنك التحقق من الاتصال والمحاولة مرة أخرى."
          onRetry={
            retrying
              ? undefined
              : () => {
                  setRetrying(true);
                  refreshUnread().finally(() => setRetrying(false));
                }
          }
        />
      </div>
    );
  }

  const matchesCount = (profile._count?.matchesAsFemale || 0) + (profile._count?.matchesAsMale || 0);
  const credits = counts.credits ?? profile.matchCredits ?? 0;
  const completionPercent = completeness?.total ?? 0;
  const topTip = completeness?.tips?.[0];
  const shared = counts.flags.mutualSuggestions && typeof counts.newSuggestions === "number";

  // «بانتظار ردّك»: only what needs my answer, each with a button to the exact place to answer it
  const likedYou = counts.likedYou ?? 0;
  const fresh = counts.newSuggestions ?? 0;
  const outOfCredits = !!counts.flags.creditOnInterest && credits <= 0;
  // free_interest_reply: answering «مهتم» to someone who already said it costs nothing
  const freeReply = !!counts.flags.freeInterestReply;
  const zeroLine = homeZeroCreditLine({ freeReply, likedYou, fresh, female });
  const waiting: { key: string; icon: typeof Heart; title: string; note: string; href: string; cta: string }[] = [
    ...(counts.pendingIntros > 0
      ? [{
          key: "requests",
          icon: Inbox,
          title: `${requestsWaiting(counts.pendingIntros)} ${g("بانتظار ردّك", "بانتظار ردّكِ")}`,
          note: "على أحد توافقاتك المتبادلة، وتنتهي بعد 7 أيام من إرسالها.",
          href: matchesHref(counts.flags.mutualSuggestions, counts.pendingIntroMatchId),
          cta: g("ردّ الآن", "ردّي الآن"),
        }]
      : []),
    ...(shared && likedYou > 0
      ? [{
          key: "liked",
          icon: Heart,
          title: likedYou === 1 ? g("شخص مهتم بك", "شخص مهتم بكِ") : g(`${likedYou} أشخاص مهتمون بك`, `${likedYou} أشخاص مهتمون بكِ`),
          note: freeReply
            ? g("«مهتم» منك يعني توافقاً فورياً، والرد مجاني.", "«مهتم» منكِ يعني توافقاً فورياً، والرد مجاني.")
            : g("«مهتم» منك يعني توافقاً فورياً.", "«مهتم» منكِ يعني توافقاً فورياً."),
          href: "/dashboard/suggestions?tab=interested",
          cta: g("ردّ الآن", "ردّي الآن"),
        }]
      : []),
    ...(shared && fresh > 0
      ? [{
          key: "new",
          icon: Sparkles,
          title: fresh === 1 ? "اقتراح جديد بانتظار قرارك" : `${fresh} اقتراحات جديدة بانتظار قرارك`,
          note: "«مهتم» أو «لا»، ولا يعرف «لا» إلا من أبدى اهتمامه.",
          href: "/dashboard/suggestions",
          cta: g("قرّر الآن", "قرّري الآن"),
        }]
      : []),
  ];

  // Unread first, then the most recent; active chats only
  const recentChats = (chats ?? [])
    .filter((c) => c.status === "ACTIVE" && !c.matchHidden)
    .sort((a, b) => b.unread - a.unread || +new Date(b.lastMessage?.createdAt ?? 0) - +new Date(a.lastMessage?.createdAt ?? 0))
    .slice(0, 3);

  // The app's count tiles (P2-6): each count opens exactly its list; gold for someone's «مهتم», red for a request
  const tiles = shared && qualifiesForSuggestions ? (
    <HomeTiles
      fresh={fresh}
      likedYou={likedYou}
      matches={(counts.actionableMatches ?? 0) + counts.pendingIntros}
      requests={counts.pendingIntros}
      matchesLink={matchesHref(counts.flags.mutualSuggestions)}
      female={female}
    />
  ) : null;

  return (
    // Two columns on desktop (P2-6): greeting, the banner slot and today's suggestions | the counts, chats and profile
    // strength. Phones keep one column (the tiles come right after what waits for an answer).
    <div className="space-y-5 pb-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] lg:items-start lg:gap-6 lg:space-y-0">
      <div data-home-column="main" className="min-w-0 space-y-5">
        {/* Greeting: the navy brand card, compact */}
        <section className="landing-night relative flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-3.5 text-white shadow-md shadow-primary/15">
          <div className="landing-khatam absolute inset-0" aria-hidden />
          <MemberAvatar name={profile.firstName ?? ""} size={44} pro={!!counts.pro?.isPro} onNavy className="relative" />
          <div className="relative min-w-0 flex-1">
            <h1 className="font-display truncate text-xl leading-tight">
              {getGreeting()}، {profile.firstName}
              {counts.pro?.isPro && <ProBadge size="md" onDark className="ms-2 align-middle" />}
            </h1>
            <p className="mt-0.5 text-xs text-white/65">{getArabicDate(country)}</p>
          </div>
          {/* Phones have the bell in the top bar; desktop gets it here */}
          <Link
            href="/dashboard/notifications"
            aria-label={unreadCount > 0 ? `الإشعارات (${unreadCount} غير مقروءة)` : "الإشعارات"}
            className="relative hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 md:flex"
          >
            <Bell className="h-5 w-5" aria-hidden />
            {unreadCount > 0 && (
              <span aria-hidden className="absolute -top-1 -start-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-caption font-bold tabular-nums text-primary-deep">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        </section>

        {/* The one banner slot, under the greeting (home places it itself) */}
        <BannerSlot />

        {/* Profile setup not finished: the one thing to do before suggestions start */}
        {!qualifiesForSuggestions && (
          <NextStepCard
            qualifies={false}
            pendingSuggestions={0}
            matchesCount={matchesCount}
            credits={credits}
            emptyReason={emptyReason}
            suggestionsFailed={suggestionsFailed}
          />
        )}

        {/* «بانتظار ردّك»: only when something needs my answer */}
        {qualifiesForSuggestions && waiting.length > 0 && (
          <section aria-labelledby="waiting-title" className="overflow-hidden rounded-2xl border border-accent/40 bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b border-accent/20 bg-accent/10 px-4 py-2.5">
              <span className="relative flex h-2.5 w-2.5" aria-hidden>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
              </span>
              <h2 id="waiting-title" className="text-sm font-bold text-foreground">بانتظار ردّك</h2>
            </div>
            <ul className="divide-y divide-border/60">
              {waiting.map((w) => (
                <li key={w.key} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <w.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-foreground">{w.title}</span>
                    <span className="mt-0.5 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-caption font-semibold text-amber-800">
                      بانتظار ردّك
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{w.note}</span>
                  </span>
                  <Link
                    href={w.href}
                    className="inline-flex h-11 shrink-0 items-center gap-1 rounded-xl bg-primary px-3.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
                  >
                    {w.cta}
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            {/* «مهتم» needs a credit: say so here, before the member taps through */}
            {outOfCredits && zeroLine && (
              <Link href="/dashboard/payments" className="flex min-h-11 items-center gap-2 border-t border-border/60 bg-amber-50/70 px-4 py-2.5 text-xs font-semibold text-amber-900">
                <Coins className="h-4 w-4 shrink-0" aria-hidden />
                {zeroLine}
              </Link>
            )}
          </section>
        )}

        {tiles && <div className="lg:hidden">{tiles}</div>}

        {/* «توافقات مقترحة»: who is waiting in «الجديد», a tap away (photos stay hidden: initials only) */}
        {sharedFeed && qualifiesForSuggestions && (feedFailed || suggestionsFailed) && (suggested === null || suggested.length === 0) && (
          <LoadError
            className="py-5"
            message="تعذّر تحميل الاقتراحات الجديدة."
            onRetry={() => {
              setFeedFailed(false);
              setSuggestionsFailed(false);
              setFeedTry((n) => n + 1);
            }}
          />
        )}
        {sharedFeed && qualifiesForSuggestions && suggested !== null && !((feedFailed || suggestionsFailed) && suggested.length === 0) && (
          <section>
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-lg font-bold text-foreground">اقتراحات جديدة</h2>
              {suggested.length > 0 && (
                <Link href="/dashboard/suggestions" className="inline-flex min-h-11 items-center gap-0.5 text-sm font-semibold text-primary">
                  الكل <ChevronLeft className="h-4 w-4" aria-hidden />
                </Link>
              )}
            </div>
            {suggested.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-4 text-sm leading-relaxed text-muted-foreground">
                {emptyReason === "pending"
                  ? "لديك اقتراحات بانتظار الطرف الآخر. ستصلك اقتراحات جديدة قريباً."
                  : g("لا اقتراحات جديدة الآن. نُعلمك فور وصول اقتراح يناسبك.", "لا اقتراحات جديدة الآن. نُعلمكِ فور وصول اقتراح يناسبكِ.")}
              </p>
            ) : (
              <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto rounded-2xl border border-border/60 bg-card px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {suggested.map((s) => (
                  <li key={s.id} className="w-[5.25rem] shrink-0 snap-start">
                    <Link href="/dashboard/suggestions" className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-1 text-center transition-colors hover:bg-muted/40">
                      <span className="relative">
                        <MemberAvatar name={s.candidate.firstName} size={64} locked photoPreview={s.candidate.photoPreview} pro={!!s.isPro} />
                        <span className="absolute inset-x-0 -bottom-3 mx-auto w-fit rounded-full bg-accent px-1.5 text-caption font-bold leading-4 tabular-nums text-primary-deep">
                          {Math.round(s.compatibilityScore)}%
                        </span>
                      </span>
                      <span className="mt-3 w-full truncate text-sm font-semibold text-foreground">{s.candidate.firstName}</span>
                      <span className="w-full truncate text-caption text-muted-foreground">
                        {[s.candidate.age ? `${s.candidate.age} سنة` : null, s.candidate.city].filter(Boolean).join(" · ") || " "}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* «جديد: عضوية Pro»: only for a member who can buy it and isn't Pro, after setup; ✕ hides it on this device */}
        {qualifiesForSuggestions && proIntroShown(counts.pro) && (
          <ProIntroCard gender={profile.gender} chatOn={!!counts.flags.chat} />
        )}

        {/* «سؤال الأسبوع»: the same question as on Instagram and /poll (switch engagement_polls_enabled) */}
        <PollCard />

      </div>

      <aside data-home-column="side" aria-label="ملخص" className="min-w-0 space-y-5">
        {tiles && <div className="hidden lg:block">{tiles}</div>}

        {/* Conversations to continue */}
        {chatOn && chatsFailed && chats === null && (
          <LoadError className="py-5" message="تعذّر تحميل المحادثات." onRetry={() => setChatsTry((n) => n + 1)} />
        )}
        {chatOn && chats !== null && (
          <section>
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-lg font-bold text-foreground">{g("تابع محادثاتك", "تابعي محادثاتكِ")}</h2>
              {recentChats.length > 0 && (
                <Link href="/dashboard/chats" className="inline-flex min-h-11 items-center gap-0.5 text-sm font-semibold text-primary">
                  الكل <ChevronLeft className="h-4 w-4" aria-hidden />
                </Link>
              )}
            </div>
            {recentChats.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-4 text-sm leading-relaxed text-muted-foreground">
                {/* Open matches only: a match the other person blocked is gone from my list (QA WM-17) */}
                {(counts.openMatches ?? matchesCount) > 0
                  ? g("لا محادثة مفتوحة الآن. يمكنك طلب محادثة من التوافقات.", "لا محادثة مفتوحة الآن. يمكنكِ طلب محادثة من التوافقات.")
                  : "تبدأ المحادثة عندما يقول الطرفان «مهتم» ويختاران «محادثة هنا أولاً»."}
              </p>
            ) : (
              <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card">
                {recentChats.map((c) => (
                  <li key={c.id}>
                    <Link href={`/dashboard/chats/${c.id}`} className="flex items-center gap-3 px-3.5 py-3 hover:bg-muted/40">
                      <MemberAvatar name={c.partner.firstName} size={44} matched pro={!!c.partner.isPro} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          {/* Name and badge together (as in the chat list), so the time keeps its place */}
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate font-bold text-foreground">{c.partner.firstName}</span>
                            {c.partner.isPro && <ProBadge />}
                          </span>
                          {c.lastMessage && <span className="shrink-0 text-xs text-muted-foreground">{listTimeLabel(c.lastMessage.createdAt, country)}</span>}
                        </span>
                        <span className={cn("block truncate text-sm", c.unread > 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>
                          {c.lastMessage ? `${c.lastMessage.mine ? g("أنت: ", "أنتِ: ") : ""}${c.lastMessage.body}` : g("ابدأ المحادثة", "ابدئي المحادثة")}
                        </span>
                      </span>
                      {c.unread > 0 && (
                        <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-caption font-bold tabular-nums text-primary-foreground" aria-label={`${c.unread} غير مقروءة`}>
                          {c.unread > 99 ? "99+" : c.unread}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Guardian consent still missing (new cycle) */}
        {counts.flags.introRequests && counts.guardian?.exists && !counts.guardian.consented && <GuardianConsentCard />}

        {/* Profile strength: only while there is something left to add */}
        {completionPercent < 100 && (
          <section className="rounded-2xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-3">
              <div
                className="relative h-12 w-12 shrink-0 rounded-full"
                style={{ background: `conic-gradient(var(--accent) ${completionPercent * 3.6}deg, var(--muted) 0)` }}
                role="img"
                aria-label={`اكتمال الملف ${completionPercent}%`}
              >
                <span dir="ltr" className="absolute inset-1 flex items-center justify-center rounded-full bg-card text-xs font-bold text-primary">{completionPercent}%</span>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-foreground">
                  {/* «31%», never «%31» in RTL (QA WM-24) */}
                  {g("ملفك", "ملفكِ")} مكتمل <bdi dir="ltr">{completionPercent}%</bdi>
                </h2>
                <p className="text-sm text-muted-foreground">{g("كلما اكتمل ملفك كانت توافقاتك أدق.", "كلما اكتمل ملفكِ كانت توافقاتكِ أدق.")}</p>
              </div>
            </div>
            {topTip && (
              <Link href={topTip.link} className="mt-3 flex min-h-11 items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2.5 hover:bg-accent/15">
                <Zap className="h-4 w-4 shrink-0 text-accent-foreground" aria-hidden />
                <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">{topTip.message}</span>
                <span dir="ltr" className="shrink-0 text-xs font-bold text-primary">+{topTip.impact}%</span>
                <ChevronLeft className="h-4 w-4 shrink-0 text-primary/60" aria-hidden />
              </Link>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}

/** The three count tiles (the app's home): new suggestions, «مهتمون بك», matches waiting */
function HomeTiles({
  fresh,
  likedYou,
  matches,
  requests,
  matchesLink,
  female,
}: {
  fresh: number;
  likedYou: number;
  matches: number;
  requests: number;
  matchesLink: string;
  female: boolean;
}) {
  const tiles = [
    { key: "new", icon: Sparkles, n: fresh, label: "اقتراحات جديدة", href: "/dashboard/suggestions", tone: "plain" as const },
    { key: "liked", icon: Heart, n: likedYou, label: female ? "مهتمون بكِ" : "مهتمون بك", href: "/dashboard/suggestions?tab=interested", tone: likedYou > 0 ? ("news" as const) : ("plain" as const) },
    { key: "matches", icon: Handshake, n: matches, label: "توافقات تنتظرك", href: matchesLink, tone: requests > 0 ? ("urgent" as const) : ("plain" as const) },
  ];
  return (
    <ul data-testid="home-tiles" className="grid grid-cols-3 gap-2.5">
      {tiles.map((t) => (
        <li key={t.key}>
          <Link
            href={t.href}
            data-tone={t.tone}
            className={cn(
              "press flex h-full min-h-24 flex-col items-start justify-between gap-2 rounded-2xl border bg-card p-3 transition-colors hover:bg-muted/40",
              t.tone === "news" ? "border-accent/60 bg-accent-soft" : t.tone === "urgent" ? "border-destructive/40" : "border-border",
            )}
          >
            <t.icon className={cn("h-5 w-5", t.tone === "urgent" ? "text-destructive" : t.tone === "news" ? "text-accent-ink" : "text-primary")} aria-hidden />
            <span>
              <span className="block text-title tabular-nums text-ink">{t.n}</span>
              <span className="block text-caption text-muted-ink">{t.label}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
