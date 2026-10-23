"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Sparkles, Heart, MessageCircle, Bell, ChevronLeft, Zap } from "lucide-react";
import { useDashboardData } from "@/contexts/dashboard-context";
import { cn } from "@/lib/utils";
import { GuardianConsentCard } from "@/components/intro/guardian-consent-card";
import { NextStepCard } from "@/components/dashboard/next-step-card";
import { InstallAppCard } from "@/components/shared/install-app-card";
import { LoadError } from "@/components/shared/load-error";
import { listTimeLabel } from "@/components/chat/chat-utils";
import { qualifiesForSuggestions as qualifiesForSuggestionsGate } from "@/lib/profile-completeness";
import type { ChatSummary } from "@/lib/chat/service";

/** Amman time (UTC+3 all year), whatever the device clock says */
function ammanHour(): number {
  return (new Date().getUTCHours() + 3) % 24;
}

function getGreeting() {
  const h = ammanHour();
  return h >= 4 && h < 12 ? "صباح الخير" : "مساء الخير";
}

function getArabicDate() {
  return new Date().toLocaleDateString("ar-JO-u-nu-latn", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Amman" });
}

/**
 * Home: a daily action centre. Greeting → the one next step → what waits for me (each count opens
 * exactly that list) → conversations to continue → one helper card → profile strength (only while
 * it's not complete). Every number comes from the server (/api/me/counts, /api/chats).
 */
export default function DashboardPage() {
  const { profile, completeness, counts, unreadCount, loading, profileFailed, refreshProfile } = useDashboardData();
  const [retrying, setRetrying] = useState(false);
  const [pendingSuggestions, setPendingSuggestions] = useState<number | null>(null);
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

  // Once the profile qualifies, page 1 of /api/suggestions also tops up suggestions automatically
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
        setPendingSuggestions(d?.total ?? 0);
        setEmptyReason(typeof d?.emptyReason === "string" ? d.emptyReason : null);
      })
      // A failure is not "no suggestions": the next-step card says it couldn't load
      .catch(() => { if (!cancelled) setSuggestionsFailed(true); });
    return () => { cancelled = true; };
  }, [loading, qualifiesForSuggestions]);

  // Conversations to continue (the same list as the chats page)
  useEffect(() => {
    if (loading || !chatOn) return;
    let cancelled = false;
    fetch("/api/chats")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`chats ${r.status}`))))
      .then((d) => { if (!cancelled) setChats((d.conversations ?? []) as ChatSummary[]); })
      .catch(() => { if (!cancelled) setChats([]); });
    return () => { cancelled = true; };
  }, [loading, chatOn]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">جارٍ تحميل صفحتك…</p>
      </div>
    );
  }

  // The profile didn't load: say so with a retry, never "finish your setup" with a 0% ring
  if (!profile) {
    return (
      <div className="py-12">
        <LoadError
          message={profileFailed ? "تعذّر تحميل بياناتك. تحقّق من الاتصال وحاول مرة أخرى." : "تعذّر تحميل البيانات. حاول مرة أخرى."}
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

  const matchesCount = (profile._count?.matchesAsFemale || 0) + (profile._count?.matchesAsMale || 0);
  const credits = counts.credits ?? profile.matchCredits ?? 0;
  const completionPercent = completeness?.total ?? 0;
  const topTip = completeness?.tips?.[0];
  const shared = counts.flags.mutualSuggestions && typeof counts.newSuggestions === "number";

  // What waits for me — each tile opens exactly the list it counts
  const tiles = shared
    ? [
        { key: "new", href: "/dashboard/suggestions", icon: Sparkles, value: counts.newSuggestions ?? 0, label: "توافقات جديدة" },
        { key: "liked", href: "/dashboard/suggestions?tab=interested", icon: Heart, value: counts.likedYou ?? 0, label: g("مهتمون بالتحدث معك", "مهتمون بالتحدث معكِ") },
        ...(chatOn ? [{ key: "chats", href: "/dashboard/chats", icon: MessageCircle, value: counts.unreadChats, label: "رسائل جديدة" }] : []),
      ]
    : [];

  // Unread first, then the most recent; active chats only
  const recentChats = (chats ?? [])
    .filter((c) => c.status === "ACTIVE" && !c.matchHidden)
    .sort((a, b) => b.unread - a.unread || +new Date(b.lastMessage?.createdAt ?? 0) - +new Date(a.lastMessage?.createdAt ?? 0))
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-8">
      {/* Greeting + the one next step */}
      <section className="landing-night relative overflow-hidden rounded-[1.75rem] p-4 text-white shadow-lg shadow-primary/15 sm:p-6">
        <div className="landing-khatam absolute inset-0" aria-hidden />
        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-white/60">{getArabicDate()}</p>
              <h1 className="font-display mt-1 truncate text-2xl leading-tight sm:text-3xl">
                {getGreeting()}، {profile.firstName}
              </h1>
            </div>
            {/* Phones have the bell in the top bar; desktop gets it here */}
            <Link
              href="/dashboard/notifications"
              aria-label={unreadCount > 0 ? `الإشعارات (${unreadCount} غير مقروءة)` : "الإشعارات"}
              className="relative hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 md:flex"
            >
              <Bell className="h-5 w-5" aria-hidden />
              {unreadCount > 0 && (
                <span aria-hidden className="absolute -top-1 -start-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          </div>
          <div className="mt-4">
            <NextStepCard
              variant="hero"
              qualifies={qualifiesForSuggestions}
              pendingSuggestions={qualifiesForSuggestions ? (shared ? counts.newSuggestions ?? 0 : pendingSuggestions) : 0}
              matchesCount={matchesCount}
              credits={credits}
              emptyReason={emptyReason}
              suggestionsFailed={suggestionsFailed}
            />
          </div>
        </div>
      </section>

      {/* What waits for me */}
      {qualifiesForSuggestions && tiles.length > 0 && (
        <section aria-label="ما ينتظرك اليوم">
          <ul className={cn("grid gap-2.5", tiles.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
            {tiles.map((t) => (
              <li key={t.key}>
                <Link
                  href={t.href}
                  aria-label={`${t.label}: ${t.value}`}
                  className={cn(
                    "flex h-full min-h-24 flex-col justify-between rounded-2xl border p-3 transition-colors",
                    t.value > 0 ? "border-primary/20 bg-primary/5 hover:bg-primary/10" : "border-border/60 bg-card hover:bg-muted/50"
                  )}
                >
                  <span className="flex items-center justify-between">
                    <t.icon className={cn("h-5 w-5", t.value > 0 ? "text-primary" : "text-muted-foreground")} aria-hidden />
                    <span className={cn("font-display text-2xl leading-none", t.value > 0 ? "text-primary" : "text-muted-foreground/70")}>{t.value}</span>
                  </span>
                  <span className="mt-2 text-[13px] font-semibold leading-snug text-foreground">{t.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Conversations to continue */}
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
              {matchesCount > 0
                ? g("لا محادثة مفتوحة الآن. يمكنك طلب محادثة من التوافقات المتبادلة.", "لا محادثة مفتوحة الآن. يمكنكِ طلب محادثة من التوافقات المتبادلة.")
                : "تبدأ المحادثة عندما يقول الطرفان «مهتم» ويختاران «محادثة هنا أولاً»."}
            </p>
          ) : (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card">
              {recentChats.map((c) => (
                <li key={c.id}>
                  <Link href={`/dashboard/chats/${c.id}`} className="flex items-center gap-3 px-3.5 py-3 hover:bg-muted/40">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary" aria-hidden>
                      {c.partner.firstName.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-bold text-foreground">{c.partner.firstName}</span>
                        {c.lastMessage && <span className="shrink-0 text-xs text-muted-foreground">{listTimeLabel(c.lastMessage.createdAt)}</span>}
                      </span>
                      <span className={cn("block truncate text-sm", c.unread > 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>
                        {c.lastMessage ? `${c.lastMessage.mine ? g("أنت: ", "أنتِ: ") : ""}${c.lastMessage.body}` : g("ابدأ المحادثة", "ابدئي المحادثة")}
                      </span>
                    </span>
                    {c.unread > 0 && (
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-accent-foreground" aria-label={`${c.unread} غير مقروءة`}>
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

      {/* One helper card at a time: guardian consent first, then installing the app */}
      {counts.flags.introRequests && counts.guardian?.exists && !counts.guardian.consented ? <GuardianConsentCard /> : <InstallAppCard />}

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
              <span className="absolute inset-1 flex items-center justify-center rounded-full bg-card text-xs font-bold text-primary">{completionPercent}%</span>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-foreground">{g("ملفك", "ملفكِ")} مكتمل {completionPercent}%</h2>
              <p className="text-sm text-muted-foreground">{g("كلما اكتمل ملفك كانت توافقاتك أدق.", "كلما اكتمل ملفكِ كانت توافقاتكِ أدق.")}</p>
            </div>
          </div>
          {topTip && (
            <Link href={topTip.link} className="mt-3 flex min-h-11 items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2.5 hover:bg-accent/15">
              <Zap className="h-4 w-4 shrink-0 text-accent-foreground" aria-hidden />
              <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">{topTip.message}</span>
              <span className="shrink-0 text-xs font-bold text-primary">+{topTip.impact}%</span>
              <ChevronLeft className="h-4 w-4 shrink-0 text-primary/60" aria-hidden />
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
