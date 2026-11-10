"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2, Sparkles, HeartHandshake, X, User, GraduationCap,
  Moon, Cigarette, Flag, ChevronLeft, ChevronRight, MoreVertical,
  ShieldAlert, Ban, Heart, Hourglass, Coins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonCard, WhyLine } from "@/components/shared/person-card";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/line-art";
import { LoadError } from "@/components/shared/load-error";
import { ConfirmActionDialog } from "@/components/intro/confirm-action-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { blockConfirmText, reportBlockText } from "@/lib/gendered-copy";
import { CandidateDetails } from "@/components/suggestions/candidate-details";
import { DealbreakersCard } from "@/components/suggestions/dealbreakers-card";
import { MatchesView } from "@/components/matches/matches-view";
import { InterestDialog, rechargeToContinue, type IntroPreferenceChoice } from "@/components/suggestions/interest-dialog";
import { freeReplyShort } from "@/lib/suggestions/copy";
import { trackEvent } from "@/lib/analytics";
import { useDashboardData } from "@/contexts/dashboard-context";
import { formatDate } from "@/lib/countries";
import { describeOption, nationalityLabel, oppositeGender } from "@/lib/profile-options";
import type { FeedItem, FeedTab, OpenFeedItem } from "@/lib/suggestions/feed-types";
import type { SuggestEmptyReason } from "@/lib/matching/auto-suggest";
import { markPageNotificationsRead } from "@/lib/notifications-client";
import { ProBadge } from "@/components/shared/pro-badge";

type Notice =
  | { kind: "match"; matchId?: string }
  | { kind: "interested" }
  | { kind: "declined" }
  | { kind: "no_credits" }
  | { kind: "error"; message: string };

type IntroChoice = { introPreference: IntroPreferenceChoice; guardianConsent?: boolean };

/** Errors answered inside the «مهتم» dialog (the member fixes them there); anything else closes it */
const DIALOG_ERRORS = new Set(["GUARDIAN_REQUIRED", "CONSENT_REQUIRED", "PREFERENCE_REQUIRED", "DISABLED", "NO_CREDITS"]);
const DECIDE_FAILED = "تعذّر حفظ قرارك، يمكنك المحاولة مرة أخرى";

/** What a decision came to: saved, or not (with an error to show in the dialog when it is one of those) */
type DecideResult = { ok: true } | { ok: false; dialogError?: string };

/** How long «لا» can be undone before it is sent */
const DECLINE_UNDO_MS = 5000;

/** Which endpoint answers a card: simultaneous rows, or legacy items still in flight. */
function decisionRequest(item: OpenFeedItem, interested: boolean, choice?: IntroChoice): { url: string; body?: string } {
  switch (item.kind) {
    case "mutual":
      return { url: `/api/suggestions/${item.id}/decide`, body: JSON.stringify({ interested, ...(interested && choice) }) };
    case "legacy_suggestion":
      return { url: `/api/suggestions/${item.id}/${interested ? "like" : "reject"}` };
    default:
      return { url: `/api/interests/${item.id}/${interested ? "accept" : "reject"}` };
  }
}

/**
 * Simultaneous suggestions (switch `new_suggestions_flow`): both people see the same suggestion and
 * decide on their own. Three tabs: new (nobody answered yet), «مهتمون بك» (the other side already
 * said «مهتم»: a «مهتم» here is an instant match) and «بانتظار الطرف الآخر» (my «مهتم»; a card the
 * other side declined shows «لم يحصل توافق» until its window ends). `?tab=interested` opens that tab.
 */
const TAB_KEYS: FeedTab[] = ["new", "interested", "waiting"];

/** After a «لا»: the other side learns of it only if they had already said «مهتم» */
function declineToast(item: OpenFeedItem, g: (m: string, f: string) => string): string {
  return item.likedYou || item.kind === "legacy_interest"
    ? g("تم. سيظهر للطرف الآخر أنه لم يحصل توافق.", "تم. سيظهر للطرف الآخر أنه لم يحصل توافق.")
    : g("تم. لن يظهر لك هذا الاقتراح مجدداً، ولن يعرف الطرف الآخر بقرارك.", "تم. لن يظهر لكِ هذا الاقتراح مجدداً، ولن يعرف الطرف الآخر بقراركِ.");
}

/** "الأحد 19 أكتوبر" (Western digits). */
function formatNextDate(iso: string, country: unknown): string {
  return formatDate(iso, country, { weekday: "long", day: "numeric", month: "long" });
}

export function MutualSuggestionsView({
  emptyReason = null,
  nextSuggestionsAt = null,
  creditOnInterest = false,
  freeInterestReply = false,
  chatEnabled = true,
  credits = 0,
}: {
  /** Why no new suggestion came on the last run (from page 1 of /api/suggestions) */
  emptyReason?: SuggestEmptyReason | null;
  /** At the weekly cap: when the oldest suggestion of the 7-day window ages out */
  nextSuggestionsAt?: string | null;
  /** Switch credit_on_interest (from /api/suggestions): "مهتم" costs 1 credit and opens the chat/family dialog */
  creditOnInterest?: boolean;
  /** Switch free_interest_reply: «مهتم» on a card that already says «أبدى اهتمامه بك» is free, also at 0 credits */
  freeInterestReply?: boolean;
  /** Chat switch: the dialog hides the chat choice when off */
  chatEnabled?: boolean;
  /** Balance when the page loaded (from /api/suggestions) */
  credits?: number;
} = {}) {
  const { profile, counts, refreshProfile, refreshUnread, country } = useDashboardData();
  // Opening this page clears the bell for the notifications that lead here
  useEffect(() => {
    markPageNotificationsRead("/dashboard/suggestions");
  }, []);

  const viewerGender = profile?.gender;
  const partnerGender = oppositeGender(viewerGender);
  const viewerFemale = viewerGender === "FEMALE";
  const g = (masculine: string, feminine: string) => (viewerFemale ? feminine : masculine);
  // Credit on interest: my balance, kept in step with each "مهتم"
  const [balance, setBalance] = useState(credits);
  const [loadedCredits, setLoadedCredits] = useState(credits);
  if (credits !== loadedCredits) {
    // The page reloaded the balance: start from the new value
    setLoadedCredits(credits);
    setBalance(credits);
  }
  const outOfCredits = creditOnInterest && balance <= 0;
  // A reply to someone who already said «مهتم» costs nothing with free_interest_reply on
  const isFreeReply = (item: OpenFeedItem) => creditOnInterest && freeInterestReply && item.kind === "mutual" && !!item.likedYou;
  // Nothing left because of my own «شروط أساسية»: which one to ease (never changed for me)
  const [filterTip, setFilterTip] = useState<string | null>(null);
  useEffect(() => {
    if (emptyReason !== "no_candidates") return;
    let cancelled = false;
    fetch("/api/suggestions/filter-tip")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setFilterTip(data?.text ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [emptyReason]);
  // «مهتمون بك» at 0 credits: the smallest package, one tap to buy it (the payments page starts it from ?buy=)
  const [topUp, setTopUp] = useState<{ id: string; name: string; price: number; currencySymbol: string } | null>(null);
  useEffect(() => {
    if (!outOfCredits || topUp) return;
    let cancelled = false;
    fetch("/api/payments/plans")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.purchasesEnabled) return;
        const smallest = [...(data.packages ?? [])].sort((a, b) => a.credits - b.credits)[0];
        if (smallest) setTopUp(smallest);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [outOfCredits, topUp]);
  const guardian = counts.guardian ?? { exists: !!profile?.parentInfo, consented: !!profile?.parentInfo?.shareConsentAt };
  const [interestFor, setInterestFor] = useState<OpenFeedItem | null>(null);
  // Start on the tab in the URL right away (this view only renders in the browser, after the page's own load)
  const [tab, setTab] = useState<FeedTab>(() => {
    if (typeof window === "undefined") return "new";
    const wanted = new URLSearchParams(window.location.search).get("tab");
    return wanted === "interested" || wanted === "waiting" ? wanted : "new";
  });
  // The fourth category, «توافق متبادل» (?tab=matches): the mutual-matches list, not a feed tab
  const [showMatches, setShowMatches] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "matches"
  );
  const [items, setItems] = useState<FeedItem[]>([]);
  const [totals, setTotals] = useState<Record<FeedTab, number>>({ new: 0, interested: 0, waiting: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [blockFor, setBlockFor] = useState<OpenFeedItem | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [report, setReport] = useState<{ userId: string; name: string } | null>(null);
  const [reportReason, setReportReason] = useState("FAKE_PROFILE");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  /** «لا» waiting out its undo window: hidden from the list, sent when the timer ends (or the page closes) */
  const pendingDeclines = useRef(new Map<string, { item: OpenFeedItem; from: FeedTab; timer: ReturnType<typeof setTimeout> }>());

  /** Only the latest load may touch the screen (a slower, older answer for another tab is dropped) */
  const loadSeq = useRef(0);
  /** quiet: refresh in place (after an answer in «جديدة», so the next card in line appears) without the loading state */
  const load = useCallback(async (t: FeedTab, p: number, opts: { quiet?: boolean } = {}) => {
    const seq = ++loadSeq.current;
    if (!opts.quiet) setLoading(true);
    setLoadFailed(false);
    try {
      const others = TAB_KEYS.filter((k) => k !== t);
      const [cur, ...rest] = await Promise.all([
        fetch(`/api/suggestions/feed?tab=${t}&page=${p}`).then((r) => {
          if (!r.ok) throw new Error(`feed ${r.status}`);
          return r.json();
        }),
        ...others.map((k) => fetch(`/api/suggestions/feed?tab=${k}&page=1&count=1`).then((r) => (r.ok ? r.json() : { total: 0 }) as Promise<{ total?: number }>)),
      ]);
      if (seq !== loadSeq.current) return;
      setItems(((cur.items ?? []) as FeedItem[]).filter((i) => !pendingDeclines.current.has(i.id)));
      setTotalPages(Math.max(1, cur.totalPages ?? 1));
      const next = { new: 0, interested: 0, waiting: 0 } as Record<FeedTab, number>;
      next[t] = cur.total ?? 0;
      others.forEach((k, i) => { next[k] = rest[i]?.total ?? 0; });
      // A «لا» still in its undo window isn't sent yet, so the server still counts its card: not on screen
      for (const { from } of pendingDeclines.current.values()) next[from] = Math.max(0, next[from] - 1);
      setTotals(next);
    } catch {
      // Shown in place of the list (with a retry), never as an empty state
      if (seq === loadSeq.current) setLoadFailed(true);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  // «توافق متبادل» shows the matches list: only the tab counts are needed, not the hidden feed page (QA WM-07)
  const loadCounts = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(false);
    const all = await Promise.all(
      TAB_KEYS.map((k) =>
        fetch(`/api/suggestions/feed?tab=${k}&page=1&count=1`)
          .then((r) => (r.ok ? r.json() : null) as Promise<{ total?: number } | null>)
          .catch(() => null)
      )
    );
    if (seq !== loadSeq.current) return;
    setTotals((prev) => {
      const next = { ...prev };
      TAB_KEYS.forEach((k, i) => {
        if (typeof all[i]?.total === "number") next[k] = all[i]!.total!;
      });
      return next;
    });
  }, []);

  useEffect(() => {
    if (showMatches) void loadCounts();
    else void load(tab, page);
  }, [load, loadCounts, showMatches, tab, page]);

  // The tab lives in the URL (?tab=new|interested|waiting): notice links, the home cards, refresh and
  // back/forward all land on the right category
  useEffect(() => {
    const fromUrl = () => {
      const wanted = new URLSearchParams(window.location.search).get("tab");
      setShowMatches(wanted === "matches");
      if (wanted !== "matches") setTab(wanted === "interested" || wanted === "waiting" ? wanted : "new");
      setPage(1);
    };
    // The first tab comes from the URL in useState; this follows back/forward afterwards
    window.addEventListener("popstate", fromUrl);
    return () => window.removeEventListener("popstate", fromUrl);
  }, []);

  // Leaving the page inside the undo window still sends the «لا» (keepalive survives the navigation)
  useEffect(() => {
    const pending = pendingDeclines.current;
    const flush = () => {
      for (const [id, { item, timer }] of pending) {
        clearTimeout(timer);
        pending.delete(id);
        void sendDecline(item);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  /** Send a «لا» (free, never charged). Errors only matter when the card is still on screen elsewhere. */
  async function sendDecline(item: OpenFeedItem): Promise<boolean> {
    const { url } = decisionRequest(item, false);
    const body = item.kind === "mutual" ? JSON.stringify({ interested: false }) : undefined;
    const res = await fetch(url, {
      method: "POST",
      keepalive: true,
      ...(body && { headers: { "Content-Type": "application/json" }, body }),
    }).catch(() => null);
    return !!res?.ok;
  }

  /**
   * After a decision the card leaves: the focus goes to the next card's «مهتم» (or the card, or the list), never the
   * page body (QA PA-M9). `nextFocus` is the index the next card will have.
   */
  const nextFocus = useRef<number | null>(null);
  // The «مهتم» dialog closed after a decision: it must not pull the focus back to the button that is gone
  const decidedInDialog = useRef(false);
  const focusNextCard = useCallback(() => {
    const index = nextFocus.current;
    if (index === null) return;
    nextFocus.current = null;
    requestAnimationFrame(() => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-feed-card]"));
      const card = cards[Math.min(index, cards.length - 1)];
      const target = card?.querySelector<HTMLElement>("[data-primary-action]:not(:disabled)") ?? card ?? document.getElementById("feed-panel");
      target?.focus();
    });
  }, []);
  useEffect(() => {
    if (!interestFor) focusNextCard();
  }, [items, interestFor, focusNextCard]);

  /** «لا»: hide the card now, offer «تراجع» for a few seconds, then send it */
  function declineWithUndo(item: OpenFeedItem, index = 0) {
    nextFocus.current = index;
    setNotice(null);
    removeAndRefill(item.id);
    // The count of the tab the card was on (a «لا» on «مهتمون بالتحدث معك» used to lower «الجديد»)
    const from: FeedTab = item.likedYou || item.kind === "legacy_interest" ? "interested" : "new";
    setTotals((t) => ({ ...t, [from]: Math.max(0, t[from] - 1) }));
    const timer = setTimeout(async () => {
      pendingDeclines.current.delete(item.id);
      const ok = await sendDecline(item);
      if (ok) {
        trackEvent("suggestion_response", { response: "reject", mutual_match: false });
        // Bottom bar / home badges follow the confirmed decision
        refreshUnread();
      } else {
        toast.error("تعذّر حفظ قرارك، يمكنك المحاولة مرة أخرى");
        load(tab, page);
      }
    }, DECLINE_UNDO_MS);
    pendingDeclines.current.set(item.id, { item, from, timer });
    toast(declineToast(item, g), {
      duration: DECLINE_UNDO_MS,
      action: {
        label: "تراجع",
        onClick: () => {
          const pending = pendingDeclines.current.get(item.id);
          if (!pending) return;
          clearTimeout(pending.timer);
          pendingDeclines.current.delete(item.id);
          load(tab, page);
        },
      },
    });
  }

  function switchTab(t: FeedTab | "matches") {
    if (t === "matches" ? showMatches : !showMatches && t === tab) return;
    setShowMatches(t === "matches");
    if (t !== "matches") {
      setTab(t);
      setPage(1);
    }
    setNotice(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("match"); // a ?match= focus only belongs to the first visit
    if (t === "new") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    window.history.pushState(null, "", url.pathname + url.search);
  }

  /**
   * "مهتم" costs a credit with credit on interest, so it always confirms first: a shared suggestion
   * also asks chat or family, older items (no choice to make) confirm the credit only.
   */
  function onInterested(item: OpenFeedItem) {
    if (creditOnInterest) setInterestFor(item);
    else void decide(item, true);
  }

  /**
   * `fromDialog`: the «مهتم» dialog stays open until this answers, and the errors the member can fix
   * there (guardian, consent, choice, credits, a network failure) come back as `dialogError` instead
   * of a notice at the top of the page.
   */
  async function decide(item: OpenFeedItem, interested: boolean, choice?: IntroChoice, fromDialog = false): Promise<DecideResult> {
    setActing(item.id);
    setNotice(null);
    try {
      const { url, body } = decisionRequest(item, interested, choice);
      const res = await fetch(url, {
        method: "POST",
        ...(body && { headers: { "Content-Type": "application/json" }, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (fromDialog && (DIALOG_ERRORS.has(data.code) || res.status >= 500)) {
          if (data.code === "NO_CREDITS") setBalance(0);
          return { ok: false, dialogError: data.error || DECIDE_FAILED };
        }
        if (data.code === "NO_CREDITS") {
          // Same message as the disabled "مهتم"; reloading shows the 0-credit banner and "liked you" tags
          setBalance(0);
          setNotice({ kind: "no_credits" });
        } else {
          setNotice({ kind: "error", message: data.error || "تعذّر حفظ قرارك" });
        }
        // The card may be gone (expired / blocked): refresh the list
        load(tab, page);
        return { ok: false };
      }
      if (creditOnInterest && interested) {
        // A free reply keeps the balance (the server sends it back); never take a credit off on our own then
        const left = typeof data.creditsLeft === "number" ? data.creditsLeft : isFreeReply(item) ? balance : Math.max(0, balance - 1);
        setBalance(left);
        refreshUnread();
        if (choice?.guardianConsent) refreshProfile();
        // Nothing left: reload so the 0-credit banner and "liked you" tags show (the feed says so)
        if (left <= 0) load(tab, page);
      }
      trackEvent("suggestion_response", { response: interested ? "accept" : "reject", mutual_match: !!data.match });
      removeAndRefill(item.id);
      // A legacy interest answered "yes" is always a match; a legacy suggestion "yes" waits like a mutual one
      const waitsNow = interested && !data.match;
      setTotals((t) => ({ ...t, [tab]: Math.max(0, t[tab] - 1), waiting: t.waiting + (waitsNow ? 1 : 0) }));
      setNotice(data.match ? { kind: "match", matchId: data.matchId } : interested ? { kind: "interested" } : { kind: "declined" });
      return { ok: true };
    } catch {
      if (fromDialog) return { ok: false, dialogError: DECIDE_FAILED };
      setNotice({ kind: "error", message: "تعذّر حفظ قرارك" });
      return { ok: false };
    } finally {
      setActing(null);
    }
  }

  /**
   * Drop a decided card; when the page empties, load the next items so the empty state isn't shown by mistake.
   * «جديدة» shows at most NEW_TAB_LIMIT cards, so any answer there lets the next one in: reload quietly.
   */
  function removeAndRefill(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (items.length <= 1) {
      const p = page > 1 ? page - 1 : 1;
      if (p !== page) setPage(p);
      else load(tab, p);
    } else if (tab === "new") {
      load(tab, page, { quiet: true });
    }
  }

  async function block(item: OpenFeedItem) {
    setBlocking(true);
    const res = await fetch("/api/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedId: item.candidate.id }),
    }).catch(() => null);
    if (res?.ok) {
      removeAndRefill(item.id);
      setTotals((t) => ({ ...t, [tab]: Math.max(0, t[tab] - 1) }));
      toast.success("تم الحظر");
      setBlockFor(null);
    } else {
      toast.error("تعذّر الحظر، يمكنك المحاولة مرة أخرى");
    }
    setBlocking(false);
  }

  /**
   * Report always comes with a block, as on the matches page: the card leaves the list. The block goes
   * first, so a report never stands without it; a report that then fails keeps the dialog open, and a
   * retry blocks again harmlessly (409 = already blocked).
   */
  async function submitReport() {
    if (!report) return;
    setReportSubmitting(true);
    const blocked = await fetch("/api/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedId: report.userId }),
    }).catch(() => null);
    if (!blocked || (!blocked.ok && blocked.status !== 409)) {
      setReportSubmitting(false);
      const data = await blocked?.json().catch(() => ({}));
      toast.error(data?.error || "تعذّر الحظر والإبلاغ، يمكنك المحاولة مرة أخرى");
      return;
    }
    const item = items.find((i) => i.candidate.id === report.userId);
    if (item) {
      removeAndRefill(item.id);
      setTotals((t) => ({ ...t, [tab]: Math.max(0, t[tab] - 1) }));
    }
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportedId: report.userId, reason: reportReason, details: reportDetails || undefined }),
    }).catch(() => null);
    setReportSubmitting(false);
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      toast.error(data?.error || "تم الحظر، وتعذّر إرسال البلاغ. يمكنك المحاولة مرة أخرى");
      return;
    }
    toast.success("تم الإبلاغ والحظر. سيراجع فريق نصيبك البلاغ.");
    setReport(null);
    setReportReason("FAKE_PROFILE");
    setReportDetails("");
  }

  // The four categories: three feed tabs (same rules as before) + the mutual matches
  const tabs: { key: FeedTab | "matches"; label: string; subtitle: string; icon: typeof Sparkles }[] = [
    { key: "new", label: "جديدة", subtitle: g("اطّلع على الاقتراحات الجديدة.", "اطّلعي على الاقتراحات الجديدة."), icon: Sparkles },
    {
      key: "interested",
      label: g("مهتمون بك", "مهتمون بكِ"),
      subtitle: g("أشخاص أبدوا اهتمامهم بالتعرف إليك. «مهتم» منك هنا توافق فوري.", "أشخاص أبدوا اهتمامهم بالتعرف إليكِ. «مهتمة» منكِ هنا توافق فوري."),
      icon: Heart,
    },
    {
      key: "waiting",
      label: "بانتظار ردّهم",
      subtitle: g("الأشخاص الذين أرسلت إليهم اهتمامك، حتى يقرّروا أو تنتهي المدة.", "الأشخاص الذين أرسلتِ إليهم اهتمامكِ، حتى يقرّروا أو تنتهي المدة."),
      icon: Hourglass,
    },
    {
      key: "matches",
      label: "التوافقات",
      subtitle: g(
        "قال كلاكما «مهتم»: الصور والتفاصيل، والتعارف الذي اخترتماه، والخطوة التالية.",
        "قال كلاكما «مهتم»: الصور والتفاصيل، والتعارف الذي اخترتماه، والخطوة التالية."
      ),
      icon: HeartHandshake,
    },
  ];
  const activeKey = showMatches ? "matches" : tab;
  const activeTab = tabs.find((t) => t.key === activeKey) ?? tabs[0];
  const matchesCount = (profile?._count?.matchesAsFemale ?? 0) + (profile?._count?.matchesAsMale ?? 0);
  // Badge per category: what waits (red for requests to answer on a match), else how many
  // Closed matches (blocked, ended, finished) don't count in «توافق متبادل»
  const badgeFor = (key: FeedTab | "matches") =>
    key === "matches" ? counts.pendingIntros || (counts.openMatches ?? matchesCount) : totals[key];

  /** «عرض التوافق» after a match: the matches tab, focused on that match */
  function openMatch(matchId?: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "matches");
    if (matchId) url.searchParams.set("match", matchId);
    window.history.pushState(null, "", url.pathname + url.search);
    setNotice(null);
    setShowMatches(true);
    refreshProfile();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon={Sparkles}
        title="الاقتراحات"
        description="يرى الطرفان الاقتراح نفسه، ويقرّر كلٌّ منكما وحده."
        className="mb-0"
      />

      {/* Four categories: 2×2 on phones (labels never clipped), one row from sm up */}
      <div>
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border/50 bg-muted/50 p-1 sm:grid-cols-4" role="tablist" aria-label="أقسام الاقتراحات">
          {tabs.map((t) => {
            const on = activeKey === t.key;
            const badge = badgeFor(t.key);
                        return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`feed-tab-${t.key}`}
                aria-selected={on}
                aria-controls="feed-panel"
                onClick={() => switchTab(t.key)}
                className={`relative flex min-h-12 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-center text-label font-semibold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:flex-col sm:gap-0.5 sm:text-sm lg:flex-row lg:gap-1.5 ${
                  on ? "border border-border/50 bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span>{t.label}</span>
                {badge > 0 && (
                  <span
                    className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-caption font-bold tabular-nums ${
                      t.key === "matches" && counts.pendingIntros > 0
                        ? "bg-destructive text-white"
                        : t.key === "interested"
                          ? "bg-accent text-primary-deep"
                          : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 px-1 text-sm text-muted-foreground">{activeTab.subtitle}</p>
      </div>

      {/* «الجديد»: what I won't compromise on, as a filter bar right above the new suggestions */}
      {!showMatches && tab === "new" && <DealbreakersCard />}

      {/* Result of the last decision */}
      {notice && (
        <div
          role="status"
          className={`rounded-xl border p-4 text-sm leading-relaxed ${
            notice.kind === "match"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : notice.kind === "error"
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : notice.kind === "no_credits"
                  ? "border-amber-200/60 bg-amber-50/70 text-amber-900"
                : "border-primary/15 bg-primary/5 text-foreground"
          }`}
        >
          {notice.kind === "match" && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-semibold">
                <Heart className="h-4 w-4" /> تهانينا! الاهتمام متبادل وأصبح لديك توافق جديد.
              </span>
              <Button size="sm" className="rounded-lg" onClick={() => openMatch(notice.matchId)}>
                عرض التوافق <ChevronLeft className="h-4 w-4 ms-1" />
              </Button>
            </div>
          )}
          {notice.kind === "interested" && "تم تسجيل اهتمامك. إذا أبدى الطرف الآخر اهتمامه أيضاً يصبح توافقاً متبادلاً ونخبرك فوراً."}
          {notice.kind === "declined" && g("تم. لن يظهر لك هذا الاقتراح مجدداً.", "تم. لن يظهر لكِ هذا الاقتراح مجدداً.")}
          {notice.kind === "no_credits" && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{rechargeToContinue(viewerFemale)}</span>
              <Button asChild size="sm" className="rounded-lg">
                <Link href="/dashboard/payments">
                  {g("اشحن رصيدك", "اشحني رصيدك")} <ChevronLeft className="h-4 w-4 ms-1" />
                </Link>
              </Button>
            </div>
          )}
          {notice.kind === "error" && notice.message}
        </div>
      )}

      {showMatches ? (
        <div id="feed-panel" role="tabpanel" aria-labelledby="feed-tab-matches">
          <MatchesView embedded />
        </div>
      ) : (
      <div id="feed-panel" role="tabpanel" tabIndex={-1} aria-labelledby={`feed-tab-${tab}`} className="outline-none">
      {loading ? (
        <div role="status" className="flex min-h-[50vh] flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">جاري التحميل...</p>
        </div>
      ) : loadFailed && items.length === 0 ? (
        <LoadError message="تعذّر تحميل الاقتراحات. يمكنك التحقق من الاتصال والمحاولة مرة أخرى." onRetry={() => load(tab, page)} />
      ) : items.length === 0 ? (
        <EmptyState
          art={tab === "interested" ? "envelope" : tab === "waiting" ? "cupsTray" : "dallah"}
          title={
              tab === "interested"
                ? "لا توجد اهتمامات جديدة حالياً"
                : tab === "waiting"
                ? g("لم ترسل أي اهتمام بعد", "لم ترسلي أي اهتمام بعد")
                : emptyReason === "no_candidates"
                  ? "لا يوجد حالياً من يطابق شروطك"
                  : emptyReason === "weekly_cap" && nextSuggestionsAt
                    ? `اقتراحاتك القادمة يوم ${formatNextDate(nextSuggestionsAt, country)}`
                    : emptyReason === "pending"
                      ? totals.waiting > 0
                        ? "اقتراحاتك المفتوحة بانتظار الطرف الآخر"
                        : "لديك اقتراحات بانتظار قرارك"
                      : "نبحث لك عن اقتراحات مناسبة"}
          description={<>
              {tab === "interested"
                ? g(
                    "استمر في استكشاف الاقتراحات، فقد تتعرّف إلى شخص يناسبك. من يبدي اهتمامه بك يظهر هنا.",
                    "استمري في استكشاف الاقتراحات، فقد تتعرّفين إلى شخص يناسبكِ. من يبدي اهتمامه بكِ يظهر هنا."
                  )
                : tab === "waiting"
                ? g(
                    "ابدأ باكتشاف الاقتراحات الجديدة. عندما تختار «مهتم» على اقتراح، يظهر هنا حتى يقرّر الطرف الآخر أو تنتهي مدته.",
                    "ابدئي باكتشاف الاقتراحات الجديدة. عندما تختارين «مهتم» على اقتراح، يظهر هنا حتى يقرّر الطرف الآخر أو تنتهي مدته."
                  )
                : emptyReason === "no_candidates"
                  ? "لم نجد حالياً أحداً تنطبق عليه شروطك الأساسية وتفضيلاتك. مراجعتها قد توسّع فرصك، ونبحث لك من جديد تلقائياً كلما انضم أشخاص جدد."
                  : emptyReason === "weekly_cap"
                    ? "تصلك حتى 3 اقتراحات مجانية كل 7 أيام، وسنرسل لك إشعاراً فور وصولها."
                    : emptyReason === "pending"
                      ? totals.waiting > 0
                        ? "تصلك اقتراحات جديدة عندما يردّ الطرف الآخر على اقتراحاتك المفتوحة أو تنتهي مدتها، وسنرسل لك إشعاراً فور وصولها."
                        : g(
                            "عندما تقرّر في اقتراحاتك الحالية أو تنتهي مدتها، تصلك اقتراحات جديدة وسنرسل لك إشعاراً فور وصولها.",
                            "عندما تقرّرين في اقتراحاتك الحالية أو تنتهي مدتها، تصلك اقتراحات جديدة وسنرسل لك إشعاراً فور وصولها."
                          )
                      : creditOnInterest
                        ? "تصلك اقتراحات مجانية جديدة كلما توفّر من يناسبك، وسنرسل لك إشعاراً فور وصولها. إكمال ملفك واختبار الشخصية يجعلها أدق."
                        : "تصلك حتى 3 اقتراحات مجانية كل أسبوع، وسنرسل لك إشعاراً فور وصولها. إكمال ملفك واختبار الشخصية يجعلها أدق."}
          </>}
        >
            {tab !== "new" && totals.new > 0 && (
              <Button type="button" className="h-11 rounded-xl" onClick={() => switchTab("new")}>
                <Sparkles className="h-4 w-4 me-1.5" aria-hidden /> {g("اكتشف الجديدة", "اكتشفي الجديدة")} ({totals.new})
              </Button>
            )}
            {tab === "new" && emptyReason === "pending" && totals.waiting > 0 && (
              <Button type="button" variant="neutral" className="h-11 rounded-xl" onClick={() => switchTab("waiting")}>
                عرض ما ينتظر الرد ({totals.waiting})
              </Button>
            )}
            {tab === "new" && emptyReason === "no_candidates" && filterTip && (
              <p role="note" className="w-full max-w-md rounded-xl border border-amber-200/60 bg-amber-50/70 px-4 py-3 text-sm font-medium text-amber-900">
                {filterTip}
              </p>
            )}
            {tab === "new" && emptyReason === "no_candidates" && (
              <>
                <Button asChild className="h-11 rounded-xl">
                  <a href="#dealbreakers">شروطي الأساسية</a>
                </Button>
                <Button asChild variant="neutral" className="h-11 rounded-xl">
                  <Link href="/dashboard/profile/edit?step=3">تفضيلاتي في الملف الشخصي</Link>
                </Button>
              </>
            )}
        </EmptyState>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {/* 0 credits: everything stays visible and «لا» is free; only «مهتم» waits for a recharge */}
          {tab === "interested" && outOfCredits && freeInterestReply ? (
            <div role="note" className="lg:col-span-2 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200/60 bg-emerald-50/70 p-4 text-sm leading-relaxed text-emerald-900">
              <Heart className="h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="min-w-0 flex-1">
                <span className="font-semibold">{g("شخص مهتم بك ينتظر ردّك.", "شخص مهتم بكِ ينتظر ردّكِ.")}</span>{" "}
                {g("الرد بـ«مهتم» مجاني حتى برصيد صفر.", "الرد بـ«مهتمة» مجاني حتى برصيد صفر.")}
              </p>
            </div>
          ) : tab === "interested" && outOfCredits && topUp ? (
            <div role="note" className="lg:col-span-2 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200/60 bg-amber-50/70 p-4 text-sm leading-relaxed text-amber-900">
              <Heart className="h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="min-w-0 flex-1">
                <span className="font-semibold">{g("شخص مهتم بك ينتظر ردّك.", "شخص مهتم بكِ ينتظر ردّكِ.")}</span>{" "}
                {g("انتهى رصيدك، اشحن لتردّ بـ«مهتم».", "انتهى رصيدكِ، اشحني لتردّي بـ«مهتمة».")}
              </p>
              <Button asChild size="sm" className="h-10 rounded-lg">
                <Link href={`/dashboard/payments?buy=${encodeURIComponent(topUp.id)}`}>
                  {g("اشحن", "اشحني")} {topUp.name} بـ {topUp.price} {topUp.currencySymbol}
                </Link>
              </Button>
            </div>
          ) : tab !== "waiting" && outOfCredits && (
            <div role="note" className="lg:col-span-2 flex flex-wrap items-start gap-3 rounded-xl border border-amber-200/60 bg-amber-50/70 p-4 text-sm leading-relaxed text-amber-900">
              <Coins className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="min-w-0 flex-1">
                <span className="font-semibold">{g("انتهى رصيدك.", "انتهى رصيدكِ.")}</span>{" "}
                {g(
                  "يمكنك تصفّح اقتراحاتك والرد بـ«لا» مجاناً، واشحن رصيدك لتختار «مهتم».",
                  "يمكنكِ تصفّح اقتراحاتكِ والرد بـ«لا» مجاناً، واشحني رصيدكِ لتختاري «مهتمة»."
                )}
              </p>
              <Link href="/dashboard/payments" className="font-semibold underline underline-offset-4">
                {g("اشحن رصيدك", "اشحني رصيدك")}
              </Link>
            </div>
          )}
          {items.map((item, index) => {
            const c = item.candidate;
            const score = Math.round(item.compatibilityScore);
            const isOpen = expanded.has(item.id);
            const waiting = tab === "waiting";
            const declined = waiting && !!item.declined;
            return (
              <div key={item.id} data-feed-card="" tabIndex={-1} className="animate-appear outline-none" style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}>
                <PersonCard
                  name={c.firstName}
                  verified={c.isVerified}
                  age={c.age}
                  city={c.city}
                  area={c.area}
                  job={c.job && describeOption("job", c.job, partnerGender)}
                  score={score}
                  photoLocked
                  pro={!!item.isPro}
                  activity={declined ? null : item.activity}
                  badges={
                    <>
                      {item.isPro && <ProBadge />}
                      {declined ? (
                        <Badge className="bg-muted text-muted-foreground border border-border text-caption gap-1">
                          <X className="h-3 w-3" /> لم يحصل توافق
                        </Badge>
                      ) : waiting ? (
                        <Badge className="bg-amber-100 text-amber-800 border border-amber-200/60 text-caption gap-1">
                          <Hourglass className="h-3 w-3" /> بانتظار الطرف الآخر
                        </Badge>
                      ) : null}
                      {(item.kind === "legacy_interest" || item.likedYou) && (
                        <Badge variant="news" className="text-caption gap-1">
                          <Heart className="h-3 w-3" /> {partnerGender === "FEMALE" ? "أبدت اهتمامها بك" : "أبدى اهتمامه بك"}
                        </Badge>
                      )}
                    </>
                  }
                  tone={declined ? "muted" : waiting ? "pending" : "default"}
                  /* Third-person, gender-correct labels about the other person */
                  tags={[
                    // The first three are the card's chips (P1-4); the rest wait under the details
                    { icon: GraduationCap, label: c.education },
                    { icon: User, label: c.maritalStatus && describeOption("maritalStatus", c.maritalStatus, partnerGender) },
                    { icon: Moon, label: c.religiosity && describeOption("religiosity", c.religiosity, partnerGender) },
                    { icon: Cigarette, label: c.smokingStatus && describeOption("smokingStatus", c.smokingStatus, partnerGender) },
                    { icon: Flag, label: nationalityLabel(c.nationality, partnerGender) },
                  ]}
                  aboutMe={c.aboutMe}
                  expanded={isOpen}
                  onToggleExpand={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    })
                  }
                  details={<CandidateDetails c={c} />}
                  actions={
                    <>
                      {declined && (
                        <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
                          {partnerGender === "FEMALE" ? "اختارت «لا» هذه المرة." : "اختار «لا» هذه المرة."}{" "}
                          {g("لا يُسترجع الرصيد، وتصلك اقتراحات جديدة تباعاً.", "لا يُسترجع الرصيد، وتصلكِ اقتراحات جديدة تباعاً.")}
                        </p>
                      )}
                      {waiting && !declined && (
                        <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
                          {partnerGender === "FEMALE" ? "إذا أبدت اهتمامها أيضاً" : "إذا أبدى اهتمامه أيضاً"} يصبح توافقاً متبادلاً ونخبرك فوراً.
                          {item.expiresAt && ` يُغلق الاقتراح تلقائياً يوم ${formatNextDate(item.expiresAt, country)} إن لم يكتمل.`}
                        </p>
                      )}
                      {tab === "interested" && (!outOfCredits || isFreeReply(item)) && (
                        <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-foreground/85">
                          <Heart className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                          {g("«مهتم» الآن توافق فوري", "«مهتمة» الآن توافق فوري")}
                        </p>
                      )}
                      {!waiting && creditOnInterest && (
                        isFreeReply(item) ? (
                          <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                            <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                            {freeReplyShort(viewerFemale)}
                          </p>
                        ) : outOfCredits ? (
                          <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-800">
                            <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                            <Link href="/dashboard/payments" className="font-semibold underline underline-offset-4">
                              {rechargeToContinue(viewerFemale)}
                            </Link>
                          </p>
                        ) : (
                          <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Coins className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                            «{g("مهتم", "مهتمة")}» يستخدم رصيداً واحداً
                          </p>
                        )
                      )}
                      <div className="flex gap-2">
                        {!waiting && (
                          <>
                            <Button
                              data-primary-action=""
                              // The person's name in the button's name: one «مهتم» per card on the page (QA PA-L2)
                              aria-label={`${g("مهتم", "مهتمة")} · ${c.firstName}`}
                              onClick={() => onInterested(item)}
                              disabled={acting === item.id || (outOfCredits && !isFreeReply(item))}
                              size="cta"
                              className="flex-[2]"
                            >
                              {acting === item.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <><HeartHandshake className="h-5 w-5 me-2" />{g("مهتم", "مهتمة")}</>}
                            </Button>
                            <Button
                              variant="neutral"
                              size="cta"
                              aria-label={`لا · ${c.firstName}`}
                              onClick={() => declineWithUndo(item, index)}
                              // «لا» is always free, also at 0 credits. Neutral, as in the app: red is for errors only (QA DS-09)
                              disabled={acting === item.id}
                              className="flex-1"
                            >
                              لا
                            </Button>
                          </>
                        )}
                        <div className={waiting ? "ms-auto" : ""}>
                          <DropdownMenu dir="rtl">
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`خيارات إضافية: ${c.firstName}`} className="h-12 w-11 rounded-xl text-muted-ink">
                                <MoreVertical className="h-5 w-5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem className="min-h-11 gap-2 text-amber-700" onSelect={() => setReport({ userId: c.id, name: c.firstName })}>
                                <ShieldAlert className="h-4 w-4" /> إبلاغ وحظر
                              </DropdownMenuItem>
                              <DropdownMenuItem className="min-h-11 gap-2 text-destructive" onSelect={() => setBlockFor(item)}>
                                <Ban className="h-4 w-4" /> حظر
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </>
                  }
                >
                  {/* Why this suggestion: one line in soft gold (P1-4) */}
                  {item.reason && (
                    <WhyLine>
                      <span className="sr-only">لماذا هذا الاقتراح؟ </span>
                      {item.reason}
                    </WhyLine>
                  )}
                </PersonCard>
              </div>
            );
          })}

          {totalPages > 1 && (
            <div className="lg:col-span-2 flex items-center justify-center gap-4 mt-8">
              <Button variant="outline" className="h-11" disabled={page <= 1} onClick={() => { setPage(page - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                <ChevronRight className="h-4 w-4 me-1" /> السابق
              </Button>
              <span className="text-sm text-muted-foreground">صفحة {page} من {totalPages}</span>
              <Button variant="outline" className="h-11" disabled={page >= totalPages} onClick={() => { setPage(page + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                التالي <ChevronLeft className="h-4 w-4 ms-1" />
              </Button>
            </div>
          )}
        </div>
      )}
      </div>
      )}

      {creditOnInterest && (
        <InterestDialog
          open={!!interestFor}
          onOpenChange={(o) => !o && setInterestFor(null)}
          partnerGender={partnerGender}
          credits={balance}
          chatEnabled={chatEnabled}
          guardian={guardian}
          costOnly={!!interestFor && interestFor.kind !== "mutual"}
          free={!!interestFor && isFreeReply(interestFor)}
          likedYou={!!interestFor?.likedYou}
          onCloseAutoFocus={(e) => {
            if (!decidedInDialog.current) return;
            decidedInDialog.current = false;
            e.preventDefault();
            focusNextCard();
          }}
          onConfirm={async (choice) => {
            const item = interestFor;
            if (!item) return false;
            // The dialog stays open (busy) until the server answers; fixable errors are shown in it
            const index = items.findIndex((i) => i.id === item.id);
            const result = await decide(item, true, choice, true);
            if (!result.ok && result.dialogError) return result.dialogError;
            if (result.ok) {
              nextFocus.current = Math.max(0, index);
              decidedInDialog.current = true;
            }
            setInterestFor(null);
            return result.ok;
          }}
        />
      )}

      <ConfirmActionDialog
        open={!!blockFor}
        onOpenChange={(o) => !o && !blocking && setBlockFor(null)}
        title={`حظر ${blockFor?.candidate.firstName ?? ""}؟`}
        description={blockConfirmText(viewerGender)}
        confirmLabel="حظر"
        destructive
        busy={blocking}
        onConfirm={() => blockFor && block(blockFor)}
      />

      <Dialog open={!!report} onOpenChange={(o) => !o && setReport(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إبلاغ وحظر {report?.name}</DialogTitle>
            <DialogDescription className="text-start">
              {reportBlockText(viewerGender)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label htmlFor="suggestion-report-reason" className="text-sm font-medium text-foreground block">سبب الإبلاغ</label>
            <select
              id="suggestion-report-reason"
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
            >
              <option value="FAKE_PROFILE">ملف شخصي مزيف</option>
              <option value="INAPPROPRIATE_CONTENT">محتوى غير لائق</option>
              <option value="HARASSMENT">تحرّش</option>
              <option value="SPAM">رسائل مزعجة</option>
              <option value="OTHER">أخرى</option>
            </select>
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm min-h-[80px] resize-none"
              placeholder="تفاصيل إضافية (اختياري)"
              aria-label="تفاصيل إضافية (اختياري)"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button onClick={submitReport} disabled={reportSubmitting} className="rounded-xl">
              {reportSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "إبلاغ وحظر"}
            </Button>
            <Button variant="outline" onClick={() => setReport(null)} className="rounded-xl">إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
