"use client";

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
import { IntroConfirmDialog } from "@/components/intro/intro-confirm-dialog";
import { daysLabel, daysLeft, postJson } from "@/components/intro/intro-utils";
import { MessageBubble } from "./message-bubble";
import { ChatComposer, type ChatComposerHandle } from "./chat-composer";
import { StarterQuestions } from "./starter-questions";
import { EndChatDialog, type ReportReasonValue } from "./end-chat-dialog";
import { dayLabel, mergeMessages, sameDay, type UiMessage } from "./chat-utils";
import { useChatChannel } from "./use-chat-channel";
import { checkMessage } from "@/lib/chat/filter";

interface ChatResponse {
  conversation: ChatSummary;
  messages: ChatMessage[];
  hasMore: boolean;
  chatEnabled: boolean;
}

export function ChatRoom({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [conversation, setConversation] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [intro, setIntro] = useState<IntroState | null>(null);
  const [familyDialog, setFamilyDialog] = useState(false);
  const [endDialog, setEndDialog] = useState<null | "end" | "report">(null);
  const [busy, setBusy] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<ChatComposerHandle>(null);
  const stickToBottom = useRef(true);
  const markingRead = useRef(false);

  const applyResponse = useCallback((data: ChatResponse, mode: "replace" | "merge") => {
    setConversation(data.conversation);
    setChatEnabled(data.chatEnabled);
    setMessages((prev) => (mode === "replace" ? data.messages : mergeMessages(prev, data.messages)));
    if (mode === "replace") setHasMore(data.hasMore);
  }, []);

  const fetchLatest = useCallback(
    async (mode: "replace" | "merge") => {
      const res = await fetch(`/api/chats/${conversationId}`).catch(() => null);
      if (!res) return;
      if (res.status === 404) return setNotFound(true);
      if (res.ok) applyResponse(await res.json(), mode);
    },
    [conversationId, applyResponse]
  );

  const loadIntro = useCallback(async (matchId: string) => {
    const res = await fetch(`/api/matches/${matchId}/intro`).catch(() => null);
    if (res?.ok) setIntro(await res.json());
  }, []);

  useEffect(() => {
    fetchLatest("replace");
  }, [fetchLatest]);

  const matchId = conversation?.matchId;
  useEffect(() => {
    if (matchId) loadIntro(matchId);
  }, [matchId, loadIntro]);

  const partnerId = conversation?.partner.id;
  const mode = useChatChannel(conversationId, {
    onMessage: (m) => {
      if (!partnerId) return; // not loaded yet — the next poll/load picks it up
      const mine = m.senderId !== partnerId;
      setMessages((prev) =>
        mergeMessages(
          // My own echo replaces exactly the optimistic copy it came from
          mine && m.clientNonce ? prev.filter((p) => p.id !== m.clientNonce) : prev,
          [{ id: m.id, body: m.body, createdAt: m.createdAt, mine, readAt: null }]
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

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
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
    const tempId = retryId ?? `tmp-${Date.now()}`;
    const optimistic: UiMessage = { id: tempId, body: text, createdAt: new Date().toISOString(), mine: true, readAt: null, pending: "sending" };
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
    setBusy(true);
    const res = await postJson<{ conversation: ChatSummary }>(`/api/chats/${conversationId}/extend`);
    setBusy(false);
    if (res.ok) {
      setConversation((c) => (c ? { ...c, ...res.data.conversation, lastMessage: c.lastMessage } : c));
      toast.success("تم تمديد المحادثة ٧ أيام");
    } else toast.error(res.data.error ?? "تعذّر التمديد");
  }

  async function end(report?: { reason: ReportReasonValue; details?: string }) {
    setBusy(true);
    const res = await postJson(`/api/chats/${conversationId}/end`, report ? { report } : {});
    setBusy(false);
    setEndDialog(null);
    if (res.ok) {
      toast.success(report ? "تم إنهاء المحادثة وإرسال البلاغ" : "تم إنهاء المحادثة");
      fetchLatest("merge");
    } else toast.error(res.data.error ?? "حدث خطأ");
  }

  async function requestFamily(consent: boolean) {
    if (!conversation) return;
    setBusy(true);
    if (consent) await postJson("/api/profile/guardian-consent");
    const res = await postJson(`/api/matches/${conversation.matchId}/intro`, { type: "FAMILY" });
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
  const family = intro?.family;

  return (
    <div className="mx-auto flex h-[calc(100dvh-106px)] max-w-3xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm md:h-[calc(100dvh-4rem)]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border/60 px-3 py-3 sm:px-4">
        <Button asChild variant="ghost" size="icon-sm" aria-label="رجوع">
          <Link href="/dashboard/chats">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/15 to-accent/15">
          <span className="text-lg font-bold text-primary">{conversation.partner.firstName.charAt(0)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate font-bold text-foreground">{conversation.partner.firstName}</h1>
            <VerifiedBadge verified={conversation.partner.isVerified} />
          </div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            محادثة خاصة عبر نصيبك
            {mode === "live" && <span className="ms-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-label="متصل" />}
          </p>
        </div>
        <DropdownMenu dir="rtl">
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="خيارات">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {conversation.canExtend && (
              <DropdownMenuItem onClick={extend}>
                <CalendarPlus className="h-4 w-4" /> تمديد ٧ أيام
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/matches?match=${conversation.matchId}`}>
                <Users className="h-4 w-4" /> عرض التوافق
              </Link>
            </DropdownMenuItem>
            {conversation.status !== "ENDED" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setEndDialog("end")}>
                  <XCircle className="h-4 w-4" /> إنهاء المحادثة
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem variant="destructive" onClick={() => setEndDialog("report")}>
              <Flag className="h-4 w-4" /> إنهاء وإبلاغ
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Info strip */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 bg-muted/30 px-4 py-2 text-xs">
        {open ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold",
              left <= 3 ? "border-amber-200/70 bg-amber-50 text-amber-700" : "border-border/60 bg-card text-muted-foreground"
            )}
          >
            <Clock className="h-3.5 w-3.5" /> متبقي {daysLabel(left)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card px-2.5 py-1 font-semibold text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> {conversation.status === "ENDED" ? "المحادثة منتهية" : "انتهت مدة المحادثة"}
          </span>
        )}
        {conversation.canExtend && (
          <button type="button" onClick={extend} disabled={busy} className="font-semibold text-primary hover:underline">
            تمديد ٧ أيام
          </button>
        )}
        <span className="text-muted-foreground">لا تشارك أرقام الهواتف أو الحسابات.</span>

        <span className="ms-auto">
          {family?.status === "none" && conversation.status !== "ENDED" && (
            <Button size="xs" onClick={() => setFamilyDialog(true)} className="gap-1">
              <Users className="h-3.5 w-3.5" /> ننتقل لتعارف عائلي
            </Button>
          )}
          {family?.status === "pending_sent" && (
            <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
              <Clock className="h-3.5 w-3.5" /> طلب التعارف العائلي بانتظار الرد
            </span>
          )}
          {family?.status === "pending_received" && (
            <Link href={`/dashboard/matches?match=${conversation.matchId}`} className="inline-flex items-center gap-1 font-semibold text-accent-foreground hover:underline">
              وصلك طلب تعارف عائلي <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          )}
          {family?.status === "accepted" && (
            <Link href={`/dashboard/matches?match=${conversation.matchId}`} className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline">
              <CheckCircle2 className="h-3.5 w-3.5" /> بيانات وليّ الأمر
            </Link>
          )}
        </span>
      </div>

      {/* Messages */}
      <div ref={scroller} onScroll={onScroll} className="chat-backdrop flex-1 overflow-y-auto px-3 py-4 sm:px-5">
        {hasMore && (
          <div className="mb-2 text-center">
            <Button variant="outline" size="xs" onClick={loadOlder} disabled={loadingOlder}>
              {loadingOlder && <Loader2 className="h-3 w-3 animate-spin" />}
              تحميل رسائل أقدم
            </Button>
          </div>
        )}

        {messages.length === 0 && canSend && <StarterQuestions onPick={(q) => composer.current?.fill(q)} />}
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
                    {dayLabel(m.createdAt)}
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

      {/* Composer or read-only notice */}
      {canSend ? (
        <ChatComposer ref={composer} onSend={(t) => send(t)} error={composerError} onTyping={() => composerError && setComposerError(null)} />
      ) : (
        <div className="border-t border-border/60 bg-muted/30 px-4 py-3 text-center text-sm text-muted-foreground">
          {conversation.blocked
            ? "لا يمكن إرسال رسائل في هذه المحادثة."
            : conversation.status === "ENDED"
            ? conversation.endedByMe
              ? "أنهيتَ هذه المحادثة."
              : "أنهى الطرف الآخر هذه المحادثة."
            : conversation.status === "EXPIRED"
              ? "انتهت مدة المحادثة. يمكنكما الانتقال لتعارف عائلي."
              : "المحادثات متوقفة مؤقتاً. يمكنك قراءة الرسائل السابقة."}
        </div>
      )}

      <IntroConfirmDialog
        open={familyDialog}
        onOpenChange={setFamilyDialog}
        mode="send"
        type="FAMILY"
        partnerName={conversation.partner.firstName}
        credits={intro?.credits ?? 0}
        free={family?.free}
        guardian={intro?.myGuardian ?? { exists: false, consented: false }}
        busy={busy}
        onConfirm={requestFamily}
      />
      <EndChatDialog
        open={!!endDialog}
        onOpenChange={(o) => !o && setEndDialog(null)}
        report={endDialog === "report"}
        partnerName={conversation.partner.firstName}
        busy={busy}
        onConfirm={(report) => {
          end(report).then(() => report && router.push("/dashboard/chats"));
        }}
      />
    </div>
  );
}
