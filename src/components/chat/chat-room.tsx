"use client";

import { ProBadge } from "@/components/shared/pro-badge";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  MoreVertical,
  Clock,
  ShieldCheck,
  Users,
  CalendarPlus,
  XCircle,
  Flag,
  Loader2,
  Lock,
  CheckCircle2,
  ArrowLeft,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VerifiedBadge } from "@/components/shared/verified-badge";
import { cn } from "@/lib/utils";
import type { ChatSummary, ChatMessage } from "@/lib/chat/service";
import type { IntroState } from "@/lib/intro/requests";
import { FREE_REQUEST_NOTE, IntroConfirmDialog } from "@/components/intro/intro-confirm-dialog";
import { daysLabel, daysLeft, postJson } from "@/components/intro/intro-utils";
import { MessageBubble } from "./message-bubble";
import { ChatComposer, type ChatComposerHandle } from "./chat-composer";
import { StarterQuestions } from "./starter-questions";
import { EndChatDialog, type ReportReasonValue } from "./end-chat-dialog";
import { ConfirmActionDialog } from "@/components/intro/confirm-action-dialog";
import { dayLabel, mergeMessages, sameDay, type UiMessage } from "./chat-utils";
import { useChatChannel } from "./use-chat-channel";
import { ChatPushBanner } from "./chat-push-banner";
import { useDashboardData } from "@/contexts/dashboard-context";
import { formatDate } from "@/lib/countries";
import { checkMessage } from "@/lib/chat/filter";
import { markPageNotificationsRead } from "@/lib/notifications-client";

/** Id for an optimistic message until the server answers (also its clientNonce); only called from send(). */
function tempMessageId() {
  return `tmp-${Date.now()}`;
}

interface ChatResponse {
  conversation: ChatSummary;
  messages: ChatMessage[];
  hasMore: boolean;
  chatEnabled: boolean;
}

type LatestResult = { kind: "ok"; data: ChatResponse } | { kind: "notFound" } | { kind: "error" };

/** The newest page of the chat (applied by the component; network errors count as "error"). */
async function requestLatest(conversationId: string): Promise<LatestResult> {
  const res = await fetch(`/api/chats/${conversationId}`).catch(() => null);
  if (res?.status === 404) return { kind: "notFound" };
  if (res?.ok) return { kind: "ok", data: await res.json() };
  return { kind: "error" };
}

/** The match's introduction state, or null when it can't be loaded. */
async function requestIntro(matchId: string): Promise<IntroState | null> {
  const res = await fetch(`/api/matches/${matchId}/intro`).catch(() => null);
  return res?.ok ? res.json() : null;
}

export function ChatRoom({ conversationId }: { conversationId: string }) {
  // Opening this page clears the bell for the notifications that lead here
  useEffect(() => {
    markPageNotificationsRead(`/dashboard/chats/${conversationId}`);
  }, [conversationId]);

  const router = useRouter();
  const { profile: me, country } = useDashboardData();
  const myGender = me?.gender as string | undefined;
  const [conversation, setConversation] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [intro, setIntro] = useState<IntroState | null>(null);
  const [familyDialog, setFamilyDialog] = useState(false);
  const [endDialog, setEndDialog] = useState<null | "end" | "report">(null);
  const [busy, setBusy] = useState(false);
  // «تمديد 7 أيام» is a one-time move: ask first
  const [extendConfirm, setExtendConfirm] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const viewport = useMobileViewport();
  const composer = useRef<ChatComposerHandle>(null);
  const stickToBottom = useRef(true);
  // The message area changes size after opening (the family bar loads, the keyboard opens / closes):
  // keep the newest message in view while the reader is at the bottom
  const loaded = messages.length > 0 || hasMore;
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);
  const markingRead = useRef(false);

  const applyResponse = useCallback((data: ChatResponse, mode: "replace" | "merge") => {
    setConversation(data.conversation);
    setChatEnabled(data.chatEnabled);
    setMessages((prev) => (mode === "replace" ? data.messages : mergeMessages(prev, data.messages)));
    if (mode === "replace") setHasMore(data.hasMore);
  }, []);

  const applyLatest = useCallback(
    (result: LatestResult, mode: "replace" | "merge") => {
      if (result.kind === "notFound") return setNotFound(true);
      if (result.kind === "ok") {
        setLoadError(false);
        applyResponse(result.data, mode);
      } else if (mode === "replace") {
        setLoadError(true);
      }
    },
    [applyResponse]
  );

  const fetchLatest = useCallback(
    async (mode: "replace" | "merge") => applyLatest(await requestLatest(conversationId), mode),
    [conversationId, applyLatest]
  );

  const loadIntro = useCallback(async (matchId: string) => {
    const data = await requestIntro(matchId);
    if (data) setIntro(data);
  }, []);

  useEffect(() => {
    let active = true;
    requestLatest(conversationId).then((result) => {
      if (active) applyLatest(result, "replace");
    });
    return () => {
      active = false;
    };
  }, [conversationId, applyLatest]);

  // No match page for someone the other person blocked: don't ask for it
  const matchId = conversation && !conversation.matchHidden ? conversation.matchId : undefined;
  useEffect(() => {
    if (!matchId) return;
    let active = true;
    requestIntro(matchId).then((data) => {
      if (active && data) setIntro(data);
    });
    return () => {
      active = false;
    };
  }, [matchId]);

  const partnerId = conversation?.partner.id;
  const mode = useChatChannel(conversationId, {
    onMessage: (m) => {
      if (!partnerId) return; // not loaded yet — the next poll/load picks it up
      const mine = m.senderId !== partnerId;
      setMessages((prev) =>
        mergeMessages(
          // My own echo replaces exactly the optimistic copy it came from
          mine && m.clientNonce ? prev.filter((p) => p.id !== m.clientNonce) : prev,
          [{ id: m.id, body: m.body, createdAt: m.createdAt, mine, readAt: null, kind: m.kind ?? "TEXT", media: m.media ?? null }]
        )
      );
    },
    onRead: (e) => {
      if (e.by !== partnerId) return;
      setMessages((prev) => prev.map((m) => (m.mine && !m.readAt ? { ...m, readAt: e.at } : m)));
    },
    onStatus: (e) => {
      setConversation((c) => (c ? { ...c, status: e.status as ChatSummary["status"], expiresAt: e.expiresAt ?? c.expiresAt } : c));
    },
    poll: () => fetchLatest("merge"),
  });

  // Mark the partner's messages read while the chat is on screen — only those shown, so a
  // message that arrives mid-request stays unread until it is actually seen
  const [visibleTick, setVisibleTick] = useState(0);
  useEffect(() => {
    if (markingRead.current) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const unread = messages.filter((m) => !m.mine && !m.readAt && !m.pending);
    if (unread.length === 0) return;
    const upTo = unread[unread.length - 1].createdAt;
    markingRead.current = true;
    fetch(`/api/chats/${conversationId}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upTo }),
    })
      .then((res) => {
        if (!res.ok) return;
        const at = new Date().toISOString();
        setMessages((prev) => prev.map((m) => (!m.mine && !m.readAt && m.createdAt <= upTo ? { ...m, readAt: at } : m)));
        window.dispatchEvent(new CustomEvent("naseeb:notifications-read"));
      })
      .catch(() => {})
      .finally(() => {
        markingRead.current = false;
      });
  }, [messages, visibleTick, conversationId]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setVisibleTick((t) => t + 1);
      fetchLatest("merge");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchLatest]);

  // Keep the newest message in view unless the user scrolled up to read history
  useEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Scrolled up to read history: a "back to the newest" button with how many arrived since
  const [away, setAway] = useState(false);
  const [seenUpTo, setSeenUpTo] = useState("");
  const unseen = away ? messages.filter((m) => !m.mine && !m.pending && m.createdAt > seenUpTo).length : 0;

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distance < 120;
    setAway(distance > 160);
    if (distance < 120) setSeenUpTo(messages.at(-1)?.createdAt ?? "");
  }

  async function loadOlder() {
    const el = scroller.current;
    const first = messages.find((m) => !m.pending);
    if (!el || !first || loadingOlder) return;
    setLoadingOlder(true);
    const before = el.scrollHeight;
    const res = await fetch(`/api/chats/${conversationId}?before=${encodeURIComponent(first.createdAt)}`).catch(() => null);
    if (res?.ok) {
      const data: ChatResponse = await res.json();
      stickToBottom.current = false;
      setMessages((prev) => mergeMessages(prev, data.messages));
      setHasMore(data.hasMore);
      requestAnimationFrame(() => {
        if (scroller.current) scroller.current.scrollTop += scroller.current.scrollHeight - before;
      });
    }
    setLoadingOlder(false);
  }

  async function send(text: string, retryId?: string): Promise<boolean> {
    setComposerError(null);
    // Same rules as the server, for instant feedback (the server still checks every message)
    const pre = checkMessage(text);
    if (!pre.ok) {
      setComposerError(pre.message);
      return false;
    }
    const tempId = retryId ?? tempMessageId();
    const optimistic: UiMessage = {
      id: tempId, body: text, createdAt: new Date().toISOString(), mine: true, readAt: null, kind: "TEXT", media: null, pending: "sending",
    };
    stickToBottom.current = true;
    setMessages((prev) => (retryId ? prev.map((m) => (m.id === retryId ? optimistic : m)) : [...prev, optimistic]));

    const res = await postJson<{ message: ChatMessage }>(`/api/chats/${conversationId}/messages`, {
      body: text,
      clientNonce: tempId,
    });
    if (res.ok) {
      setMessages((prev) => mergeMessages(prev.filter((m) => m.id !== tempId), [res.data.message]));
      return true;
    }
    // Filtered / limited messages are not kept on screen; network errors stay with a retry button
    if (res.status === 0 || res.status >= 500) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: "failed" } : m)));
      return true;
    }
    setMessages((prev) => prev.filter((m) => m.id !== tempId));
    setComposerError(res.data.error ?? "تعذّر إرسال الرسالة");
    if (res.data.code === "EXPIRED" || res.data.code === "NOT_ALLOWED" || res.data.code === "DISABLED") fetchLatest("merge");
    return false;
  }

  async function extend() {
    setExtendConfirm(false);
    setBusy(true);
    const res = await postJson<{ conversation: ChatSummary }>(`/api/chats/${conversationId}/extend`);
    setBusy(false);
    if (res.ok) {
      setConversation((c) => (c ? { ...c, ...res.data.conversation, lastMessage: c.lastMessage } : c));
      toast.success("تم تمديد المحادثة 7 أيام");
    } else toast.error(res.data.error ?? "تعذّر التمديد");
  }

  async function end(report?: { reason: ReportReasonValue; details?: string }): Promise<boolean> {
    setBusy(true);
    const res = await postJson(`/api/chats/${conversationId}/end`, report ? { report } : {});
    setBusy(false);
    setEndDialog(null);
    if (res.ok) {
      toast.success(report ? (conversation?.status === "ENDED" ? "تم إرسال البلاغ" : "تم إنهاء المحادثة وإرسال البلاغ") : "تم إنهاء المحادثة");
      fetchLatest("merge");
    } else toast.error(res.data.error ?? "حدث خطأ");
    return res.ok;
  }

  async function requestFamily(consent: boolean) {
    if (!conversation) return;
    setBusy(true);
    // The guardian consent goes with the request: stored only if the request is sent
    const res = await postJson(`/api/matches/${conversation.matchId}/intro`, { type: "FAMILY", ...(consent && { consent: true }) });
    setBusy(false);
    setFamilyDialog(false);
    if (res.ok) toast.success("تم إرسال طلب التعارف العائلي");
    else toast.error(res.data.error ?? "تعذّر إرسال الطلب");
    loadIntro(conversation.matchId);
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="font-semibold">المحادثة غير موجودة</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/dashboard/chats">العودة للمحادثات</Link>
        </Button>
      </div>
    );
  }

  if (!conversation && loadError) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="font-semibold">تعذّر تحميل المحادثة</p>
        <p className="mt-1 text-sm text-muted-foreground">تحقق من اتصالك وحاول مرة أخرى.</p>
        <Button variant="outline" className="mt-4" onClick={() => fetchLatest("replace")}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const left = daysLeft(conversation.expiresAt);
  const open = conversation.status === "ACTIVE";
  const canSend = open && chatEnabled && !conversation.blocked;
  // «إنهاء المحادثة» only on an open chat with no block either way (the server refuses the rest);
  // «إبلاغ» stays on every chat
  const endable = open && !conversation.blocked;
  const family = intro?.family;
  // Credit on interest: every request is free, also after an earlier family request expired
  const familyFree = !!intro?.flags.creditOnInterest || !!family?.free;
  /** The free move to family stays open until the match fades (CHAT_STALE_DAYS after the chat ran out) */
  const familyOpenUntil = family?.openUntil
    ? formatDate(family.openUntil, country, { day: "numeric", month: "long" })
    : null;

  return (
    <div
      // Phones: full screen over the dashboard bar, sized to the visible area so the keyboard never covers the box
      style={viewport ? { height: viewport.height, top: viewport.top } : undefined}
      className="mx-auto flex max-w-3xl flex-col overflow-hidden bg-card max-md:fixed max-md:inset-x-0 max-md:top-0 max-md:z-50 max-md:h-[100dvh] md:h-[calc(100dvh-4rem)] md:rounded-2xl md:border md:border-border/60 md:shadow-sm"
    >
      {/* Header: who, and how long the chat stays open */}
      <header className="flex items-center gap-2 border-b border-border/60 px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] sm:px-4">
        <Button asChild variant="ghost" size="icon" aria-label="رجوع" className="shrink-0">
          <Link href="/dashboard/chats">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        {(() => {
          const who = (
            <>
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">
                {conversation.partner.firstName.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="truncate font-bold leading-tight text-foreground">{conversation.partner.firstName}</h1>
                  <VerifiedBadge verified={conversation.partner.isVerified} />
                  {conversation.partner.isPro && <ProBadge />}
                </div>
                <p className={cn("mt-0.5 flex items-center gap-1 text-xs", open && left <= 3 ? "font-semibold text-amber-700" : "text-muted-foreground")}>
                  {open ? <Clock className="h-3.5 w-3.5" aria-hidden /> : <Lock className="h-3.5 w-3.5" aria-hidden />}
                  {open ? `متبقي ${daysLabel(left)}` : conversation.status === "ENDED" ? "المحادثة منتهية" : "انتهت مدة المحادثة"}
                  {mode === "live" && <span className="ms-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-label="متصل" />}
                </p>
              </div>
            </>
          );
          // Tapping the name opens the match (not for someone the other person blocked)
          return conversation.matchHidden ? (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">{who}</div>
          ) : (
            <Link
              href={`/dashboard/matches?match=${conversation.matchId}`}
              aria-label={`عرض توافق ${conversation.partner.firstName}`}
              className="-my-1 flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 transition-colors hover:bg-muted/50"
            >
              {who}
            </Link>
          );
        })()}
        <DropdownMenu dir="rtl">
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="خيارات" className="shrink-0">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {conversation.canExtend && (
              <DropdownMenuItem onClick={() => setExtendConfirm(true)} disabled={busy}>
                <CalendarPlus className="h-4 w-4" /> تمديد 7 أيام
              </DropdownMenuItem>
            )}
            {!conversation.matchHidden && (
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/matches?match=${conversation.matchId}`}>
                  <Users className="h-4 w-4" /> عرض التوافق
                </Link>
              </DropdownMenuItem>
            )}
            {endable && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setEndDialog("end")}>
                  <XCircle className="h-4 w-4" /> إنهاء المحادثة
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem variant="destructive" onClick={() => setEndDialog("report")}>
              <Flag className="h-4 w-4" /> {endable ? "إنهاء وإبلاغ" : "إبلاغ"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Notifications off on this device: a slim line with the guided setup, while the chat is open */}
      {open && !conversation.blocked && <ChatPushBanner viewerGender={myGender} partnerName={conversation.partner.firstName} />}

      {/* One slim bar, only when there is something to do: extend near the end, the family step */}
      {(() => {
        const offerFamily =
          family?.status === "none" && !!intro?.flags.introRequests && !intro.closed && !conversation.blocked && conversation.status === "ACTIVE";
        const extendSoon = conversation.canExtend && left <= 3;
        const familyNote =
          family?.status === "pending_sent" || family?.status === "pending_received" || family?.status === "accepted" ? family.status : null;
        if (!offerFamily && !extendSoon && !familyNote) return null;
        return (
          <div className="flex min-h-11 items-center gap-2 border-b border-border/40 bg-accent/10 px-3 py-1.5 text-sm">
            {extendSoon && (
              <>
                <Clock className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-foreground/80">تنتهي المحادثة قريباً</span>
                <Button size="xs" variant="outline" onClick={() => setExtendConfirm(true)} disabled={busy} className="shrink-0">
                  تمديد 7 أيام
                </Button>
              </>
            )}
            {!extendSoon && offerFamily && (
              <>
                <Users className="h-4 w-4 shrink-0 text-accent-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-foreground/80">جاهزان للخطوة التالية؟</span>
                <Button size="xs" onClick={() => setFamilyDialog(true)} className="shrink-0">
                  تعارف عائلي
                </Button>
              </>
            )}
            {!extendSoon && !offerFamily && familyNote === "pending_sent" && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                <Clock className="h-4 w-4" aria-hidden /> طلب التعارف العائلي بانتظار الرد
              </span>
            )}
            {!extendSoon && !offerFamily && familyNote === "pending_received" && (
              <Link href={`/dashboard/matches?match=${conversation.matchId}`} className="inline-flex min-h-11 flex-1 items-center gap-1.5 font-semibold text-primary">
                <Users className="h-4 w-4" aria-hidden /> وصلك طلب تعارف عائلي <ArrowLeft className="ms-auto h-4 w-4" aria-hidden />
              </Link>
            )}
            {!extendSoon && !offerFamily && familyNote === "accepted" && (
              <Link href={`/dashboard/matches?match=${conversation.matchId}`} className="inline-flex min-h-11 flex-1 items-center gap-1.5 font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> بيانات وليّ الأمر <ArrowLeft className="ms-auto h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
        );
      })()}

      {/* Messages */}
      <div className="relative min-h-0 flex-1">
      <div ref={scroller} onScroll={onScroll} className="chat-backdrop h-full overflow-y-auto overscroll-contain px-3 py-3 sm:px-5">
        {/* Shown once at the top of every chat (most members chat on phones) */}
        <p className="mx-auto mb-1 flex w-fit max-w-full items-center gap-1.5 rounded-full bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm ring-1 ring-border/50">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          {myGender === "FEMALE" ? "محادثة خاصة · لا تشاركي الأرقام أو الحسابات" : "محادثة خاصة · لا تشارك الأرقام أو الحسابات"}
        </p>
        {hasMore && (
          <div className="mb-2 text-center">
            <Button variant="outline" size="xs" onClick={loadOlder} disabled={loadingOlder}>
              {loadingOlder && <Loader2 className="h-3 w-3 animate-spin" />}
              تحميل رسائل أقدم
            </Button>
          </div>
        )}

        {messages.length === 0 && canSend && <StarterQuestions myGender={myGender} onPick={(q) => composer.current?.fill(q)} />}
        {messages.length === 0 && !canSend && (
          <p className="py-10 text-center text-sm text-muted-foreground">لا توجد رسائل في هذه المحادثة.</p>
        )}

        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
          return (
            <Fragment key={m.id}>
              {newDay && (
                <div className="my-4 flex justify-center">
                  <span className="rounded-full bg-card/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm ring-1 ring-border/50">
                    {dayLabel(m.createdAt, country)}
                  </span>
                </div>
              )}
              <MessageBubble
                message={m}
                grouped={!newDay && !!prev && prev.mine === m.mine}
                onRetry={() => send(m.body, m.id)}
              />
            </Fragment>
          );
        })}
      </div>
        {/* Back to the newest message after scrolling up (with what arrived meanwhile) */}
        {away && (
          <button
            type="button"
            onClick={() => {
              const el = scroller.current;
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            }}
            aria-label={unseen > 0 ? `${unseen} رسائل جديدة — انتقل لآخر رسالة` : "انتقل لآخر رسالة"}
            className="absolute bottom-3 end-3 flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-card text-primary shadow-lg transition-transform active:scale-95"
          >
            <ChevronDown className="h-5 w-5" aria-hidden />
            {unseen > 0 && (
              <span aria-hidden className="absolute -top-1.5 -start-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-foreground">
                {unseen > 99 ? "99+" : unseen}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Composer or read-only notice */}
      {canSend ? (
        <ChatComposer ref={composer} female={myGender === "FEMALE"} keyboardOpen={!!viewport?.keyboard} onSend={(t) => send(t)} error={composerError} onTyping={() => composerError && setComposerError(null)} />
      ) : (
        <div className="border-t border-border/60 bg-muted/30 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-sm text-muted-foreground">
          {conversation.blocked
            ? "لا يمكن إرسال رسائل في هذه المحادثة."
            : intro?.chat.paused
            ? "المحادثة متوقفة مؤقتاً لمراجعة من فريق نصيبك. سنُعلمك عند استئنافها."
            : conversation.status === "ENDED"
            ? conversation.endedByMe
              ? "أنهيت هذه المحادثة."
              : "أنهى الطرف الآخر هذه المحادثة."
            : conversation.status === "EXPIRED"
              ? family?.status === "none" && intro?.flags.introRequests && !intro.closed
                ? `انتهت مدة المحادثة. هل تنتقلان لتعارف عائلي؟${familyFree ? " الانتقال مجاني" : ""}${familyOpenUntil ? ` ومتاح حتى ${familyOpenUntil}` : ""}.`
                : "انتهت مدة المحادثة."
              : "المحادثات متوقفة مؤقتاً. يمكنك قراءة الرسائل السابقة."}
          {/* An expired chat keeps the free move to family: offer it right here */}
          {conversation.status === "EXPIRED" && !conversation.blocked && family?.status === "none" && intro?.flags.introRequests && !intro.closed && (
            <div className="mt-2">
              <Button size="sm" onClick={() => setFamilyDialog(true)} className="gap-1.5">
                <Users className="h-4 w-4" aria-hidden="true" /> ننتقل لتعارف عائلي
              </Button>
            </div>
          )}
        </div>
      )}

      <IntroConfirmDialog
        open={familyDialog}
        onOpenChange={setFamilyDialog}
        mode="send"
        type="FAMILY"
        partnerName={conversation.partner.firstName}
        credits={intro?.credits ?? 0}
        free={familyFree}
        freeNote={intro?.flags.creditOnInterest ? FREE_REQUEST_NOTE : undefined}
        guardian={intro?.myGuardian ?? { exists: false, consented: false }}
        busy={busy}
        onConfirm={requestFamily}
      />
      <ConfirmActionDialog
        open={extendConfirm}
        onOpenChange={(o) => !busy && setExtendConfirm(o)}
        title="تمديد المحادثة 7 أيام؟"
        description="يمكن تمديد المحادثة مرة واحدة فقط، فتبقى مفتوحة 7 أيام إضافية لكليكما."
        confirmLabel="تمديد 7 أيام"
        busy={busy}
        onConfirm={extend}
      />
      <EndChatDialog
        open={!!endDialog}
        onOpenChange={(o) => !o && setEndDialog(null)}
        report={endDialog === "report"}
        partnerName={conversation.partner.firstName}
        familyStatus={intro?.flags.introRequests && !intro.closed ? family?.status : undefined}
        busy={busy}
        ended={!endable}
        onConfirm={(report) => {
          end(report).then((ok) => ok && report && router.push("/dashboard/chats"));
        }}
      />
    </div>
  );
}

/**
 * Phones only: the visible area (shrinks when the keyboard opens, unlike 100dvh on iPhone).
 * Also stops the page behind the full-screen chat from scrolling. null on tablets / desktop.
 */
function useMobileViewport(): { height: number; top: number; keyboard: boolean } | null {
  const [vp, setVp] = useState<{ height: number; top: number; keyboard: boolean } | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const vv = window.visualViewport;
    const update = () => {
      const height = Math.round(vv?.height ?? window.innerHeight);
      // The keyboard covers the home indicator: no safe-area gap under the box then
      setVp(mq.matches ? { height, top: Math.round(vv?.offsetTop ?? 0), keyboard: window.innerHeight - height > 120 } : null);
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    mq.addEventListener("change", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      mq.removeEventListener("change", update);
    };
  }, []);
  const mobile = vp !== null;
  useEffect(() => {
    if (!mobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobile]);
  return vp;
}
