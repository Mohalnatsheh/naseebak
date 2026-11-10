"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
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
  ChevronDown,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VerifiedBadge } from "@/components/shared/verified-badge";
import { ProBadge } from "@/components/shared/pro-badge";
import { arabicCount, cn } from "@/lib/utils";
import type { ChatSummary, ChatMessage } from "@/lib/chat/service";
import type { IntroState } from "@/lib/intro/requests";
import { FREE_REQUEST_NOTE, IntroConfirmDialog } from "@/components/intro/intro-confirm-dialog";
import { daysLabel, daysLeft, postJson } from "@/components/intro/intro-utils";
import { MessageBubble } from "./message-bubble";
import { ChatComposer, type ChatComposerHandle } from "./chat-composer";
import type { MessageActions } from "./message-menu";
import { PhotoViewer, type ViewerPhoto } from "./photo-viewer";
import { useTypingSignal, usePartnerTyping } from "./use-typing";
import {
  applyMyReaction, applyReactionUpdates, emptyChatHint, nextReaction, quoteOf, reactionsSinceFor, showStarters,
} from "./chat-interactions";
import type { ChatReaction } from "@/lib/chat/reactions";
import type { ReplyQuote } from "@/lib/chat/reply";
import { forPartner } from "@/lib/gendered-copy";
import { EndChatDialog, reportDoneText, type ReportReasonValue } from "./end-chat-dialog";
import { ConfirmActionDialog } from "@/components/intro/confirm-action-dialog";
import { dayLabel, mergeMessages, timeLabel, type UiMessage } from "./chat-utils";
import { useChatChannel } from "./use-chat-channel";
import { useChatPushChip } from "./chat-push-banner";
import {
  EXPIRY_SOON_DAYS, chatRowLayout, chatStatusBar, closedChatFamilyNote, endedChatNote, familyStepOf, firstUnreadId, groupByDay,
} from "./chat-look";
import { ChatStatusBar } from "./chat-status-bar";
import { useDashboardData } from "@/contexts/dashboard-context";
import { formatDate } from "@/lib/countries";
import { checkMessage } from "@/lib/chat/filter";
import { markPageNotificationsRead, notifyChatChanged, notifyChatSent, notifyNotificationsRead } from "@/lib/notifications-client";
import { ProOfferDialog } from "@/components/payments/pro-offer-dialog";
import type { MyProState } from "@/lib/pro/pro-types";
import { composerMediaMode, type ComposerMedia, type MediaMode } from "./media-buttons";
import { preparePhoto } from "./photo-prepare";
import { UNSUPPORTED_IMAGE_MESSAGE } from "@/lib/chat/media-messages";
import type { PendingUpload } from "./chat-utils";
import { MemberAvatar, chatTimeFraction } from "@/components/shared/member-avatar";
import { SealMark } from "@/components/shared/match-seal";
import { TimeArcButton } from "./time-arc-button";

/** Id for an optimistic message until the server answers (also its clientNonce); only called from send() / sendMedia().
 *  Random, so two sends in the same millisecond (or two tabs) never share a nonce. */
function tempMessageId() {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return `tmp-${random}`;
}

/** One pill for the day labels and «رسائل جديدة» (P2-1) */
const CHAT_PILL = "rounded-full bg-card/95 px-3 py-1 text-caption font-semibold text-muted-ink shadow-sm ring-1 ring-border/50";

/** Polls ask from this long before the newest message they have */
const POLL_OVERLAP_MS = 5000;

/** How many messages one `?after=` answer holds at most (getConversation's `take`) */
const NEWER_PAGE_SIZE = 100;

/** Same pace as the server's burst limit (5 messages in 5 s): queued sends wait instead of being refused */
const SEND_BURST = 5;
const SEND_WINDOW_MS = 5000;

/** Same limit as the server (photos are usually far smaller after preparePhoto) */
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
/** The server's wording for a photo it can't read (src/lib/chat/media.ts, which client code can't import) */

/** A file name for the multipart upload (the server goes by the type, the name only helps logs and proxies) */
function uploadName(upload: PendingUpload): string {
  const type = upload.blob.type;
  if (upload.kind === "IMAGE") {
    if (type.startsWith("image/hei")) return "photo.heic"; // a HEIC/HEIF the browser couldn't decode: the server does
    return type === "image/png" ? "photo.png" : type === "image/webp" ? "photo.webp" : "photo.jpg";
  }
  return type.startsWith("audio/mp4") ? "voice.m4a" : type.startsWith("audio/ogg") ? "voice.ogg" : "voice.webm";
}

/** The local preview URL of an optimistic photo / voice note, if it has one */
function localUrl(m: UiMessage | undefined): string | null {
  const url = m?.media?.url;
  return url?.startsWith("blob:") ? url : null;
}

interface ChatResponse {
  conversation: ChatSummary;
  messages: ChatMessage[];
  hasMore: boolean;
  chatEnabled: boolean;
  /** Polls only: my newest message the partner has read */
  readUpTo?: { createdAt: string; readAt: string } | null;
  /** The partner signalled typing in the last few seconds (the polling fallback for the live `typing` event) */
  partnerTyping?: boolean;
  /** Conversation starters while I haven't written anything in an open chat */
  starters?: string[];
  /** Both members have written somewhere in the chat (the whole chat, not the loaded page) */
  bothWrote?: boolean;
  /** The server's time when it answered: the next poll asks for reaction changes since then (less an overlap) */
  polledAt?: string;
  /** Polls with reactionsSince: older messages whose reactions changed (the polling fallback for the live event) */
  reactionUpdates?: { messageId: string; reactions: ChatReaction[] }[];
}

type LatestResult = { kind: "ok"; data: ChatResponse } | { kind: "notFound" } | { kind: "error" };

/**
 * The newest page of the chat, or with `after` only what came since (applied by the component; network errors count as
 * "error"). A poll also asks for reaction changes on older messages since `reactionsSince`.
 */
async function requestLatest(conversationId: string, after?: string, reactionsSince?: string | null): Promise<LatestResult> {
  const query = after
    ? `?after=${encodeURIComponent(after)}${reactionsSince ? `&reactionsSince=${encodeURIComponent(reactionsSince)}` : ""}`
    : "";
  const res = await fetch(`/api/chats/${conversationId}${query}`).catch(() => null);
  if (res?.status === 404) return { kind: "notFound" };
  if (res?.ok) return { kind: "ok", data: await res.json() };
  return { kind: "error" };
}

/** The match's introduction state, or null when it can't be loaded. */
async function requestIntro(matchId: string): Promise<IntroState | null> {
  const res = await fetch(`/api/matches/${matchId}/intro`).catch(() => null);
  return res?.ok ? res.json() : null;
}


/** The chat's Pro bits from GET /api/pro, or null when the request failed */
async function fetchProBits(): Promise<Pick<MyProState, "canBuy" | "isPro"> | null> {
  const res = await fetch("/api/pro").catch(() => null);
  if (!res?.ok) return null;
  const data: MyProState | null = await res.json().catch(() => null);
  return data ? { canBuy: !!data.canBuy, isPro: !!data.isPro } : null;
}

export function ChatRoom({ conversationId }: { conversationId: string }) {
  // Opening this page clears the bell for the notifications that lead here
  useEffect(() => {
    markPageNotificationsRead(`/dashboard/chats/${conversationId}`);
  }, [conversationId]);

  const router = useRouter();
  const { profile: me, country, counts } = useDashboardData();
  const myGender = me?.gender as string | undefined;
  const [conversation, setConversation] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  // The latest list for callbacks that outlive a render (polls, the send queue, coming back online)
  const messagesRef = useRef<UiMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const online = useOnline();
  const [hasMore, setHasMore] = useState(false);
  const hasMoreRef = useRef(false);
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);
  const [chatEnabled, setChatEnabled] = useState(true);
  // «يكتب الآن…» to the other person (at most every 3 s while I type in an open chat)
  const typing = useTypingSignal(conversationId, !!conversation && conversation.status === "ACTIVE" && !conversation.blocked && chatEnabled);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  // A message the filter refused: an inline note in the thread, with the way to family (chat design P1, QA WC2-04)
  const [refusal, setRefusal] = useState<string | null>(null);
  // Roving focus in the message list: the row that is its one Tab stop (null: the newest)
  const [activeRow, setActiveRow] = useState<string | null>(null);
  // Where the focus goes back to when the end / report / extend dialog closes (the menu that opened it is gone, PA-M9)
  const returnFocus = useRef<HTMLElement | null>(null);
  const optionsButton = useRef<HTMLButtonElement>(null);
  const [intro, setIntro] = useState<IntroState | null>(null);
  const [familyDialog, setFamilyDialog] = useState(false);
  const [endDialog, setEndDialog] = useState<null | "end" | "report">(null);
  const [busy, setBusy] = useState(false);
  // «تمديد 7 أيام» is a one-time move: ask first
  const [extendConfirm, setExtendConfirm] = useState(false);
  // «إبلاغ عن الرسالة»: the reported message (its id goes with the report, its snippet shows in the dialog)
  const [reportMessage, setReportMessage] = useState<{ id: string; snippet: string } | null>(null);
  // Replying to this message (the strip above the composer)
  const [replyTo, setReplyTo] = useState<ReplyQuote | null>(null);
  // A quote was tapped: the original is marked for a moment
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
  }, []);
  // The server's time on its last answer: polls ask for reaction changes since then
  const polledAt = useRef<string | null>(null);
  // The full-screen photo viewer (the photo's message id)
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [starters, setStarters] = useState<string[]>([]);
  // The server's answer counts the whole chat; it never goes back to false once true
  const [serverBothWrote, setServerBothWrote] = useState(false);
  const partnerTyping = usePartnerTyping();
  const { mark: markTyping, clear: clearTyping } = partnerTyping;

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

  // Photo / voice previews made on this device: released when the saved copy replaces them, or on leaving
  const blobUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = blobUrls.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);
  const dropLocal = useCallback((list: UiMessage[], id: string): UiMessage[] => {
    const url = localUrl(list.find((m) => m.id === id));
    if (url && blobUrls.current.delete(url)) URL.revokeObjectURL(url);
    return list.filter((m) => m.id !== id);
  }, []);

  // Pro (photos and voice) and whether this member could buy it (greyed buttons that open the offer).
  // Fetched once for the page, again only after the server says PRO_REQUIRED.
  const [pro, setPro] = useState<Pick<MyProState, "canBuy" | "isPro"> | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);
  // A failed (re)fetch answers null and keeps the last known state: the buttons stay as they were, never vanish silently
  const loadPro = useCallback(() => fetchProBits().then((bits) => bits && setPro(bits)), []);
  useEffect(() => {
    let active = true;
    fetchProBits().then((bits) => {
      if (active && bits) setPro(bits);
    });
    return () => {
      active = false;
    };
  }, []);

  // «رسائل جديدة»: fixed when the chat opens (the first unread message of theirs), gone once I write
  const [unreadFromId, setUnreadFromId] = useState<string | null>(null);
  const dividerPending = useRef(false);

  // Reactions sent and not answered yet: a poll or live event already on its way must not undo them for a moment
  // (final review minor 8); the server's answer settles them
  const reactingNow = useRef(new Map<string, UiMessage["reactions"]>());
  const keepMyReactions = useCallback((list: UiMessage[]): UiMessage[] => {
    if (reactingNow.current.size === 0) return list;
    return list.map((m) => {
      const mine = reactingNow.current.get(m.id);
      return mine ? { ...m, reactions: mine } : m;
    });
  }, []);

  const applyResponse = useCallback((data: ChatResponse, mode: "replace" | "merge") => {
    if (mode === "replace") {
      const id = firstUnreadId(data.messages);
      setUnreadFromId(id);
      dividerPending.current = !!id;
    }
    if (data.polledAt) polledAt.current = data.polledAt;
    setConversation(data.conversation);
    setChatEnabled(data.chatEnabled);
    if (data.starters) setStarters(data.starters);
    if (data.bothWrote) setServerBothWrote(true);
    if (data.partnerTyping) markTyping();
    else if (data.partnerTyping === false) clearTyping();
    setMessages((prev) => (mode === "replace" ? data.messages : keepMyReactions(mergeMessages(prev, data.messages))));
    if (mode === "replace") setHasMore(data.hasMore);
  }, [markTyping, clearTyping, keepMyReactions]);

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

  /** A poll: only what came after the newest saved message (plus read ticks); true when something new arrived */
  const fetchNewer = useCallback(async (): Promise<boolean> => {
    const newest = messagesRef.current.findLast((m) => !m.pending);
    if (!newest) {
      const before = messagesRef.current.length;
      await fetchLatest("merge");
      return messagesRef.current.length !== before;
    }
    // A little before the newest: a partner message stamped earlier but saved a moment later is never skipped
    // (the overlap is merged by id)
    const since = new Date(Date.parse(newest.createdAt) - POLL_OVERLAP_MS).toISOString();
    const result = await requestLatest(conversationId, since, reactionsSinceFor(polledAt.current));
    if (result.kind !== "ok") {
      applyLatest(result, "merge");
      return false;
    }
    const known = new Set(messagesRef.current.map((m) => m.id));
    const fresh = result.data.messages.some((m) => !known.has(m.id));
    const read = result.data.readUpTo;
    // Reactions on older messages (no Ably): whatever changed since the last answer
    const updates = result.data.reactionUpdates;
    const reacted = applyReactionUpdates(messagesRef.current, updates).changed;
    applyLatest(result, "merge");
    if (reacted) setMessages((prev) => keepMyReactions(applyReactionUpdates(prev, updates).messages));
    if (read) {
      setMessages((prev) =>
        prev.map((m) => (m.mine && !m.readAt && !m.pending && m.createdAt <= read.createdAt ? { ...m, readAt: read.readAt } : m))
      );
    }
    // A full page (the server's cap): more came while away, so keep paging forward until caught up
    let page = result.data.messages;
    for (let i = 0; i < 10 && page.length >= NEWER_PAGE_SIZE; i++) {
      const more = await requestLatest(conversationId, page[page.length - 1].createdAt);
      if (more.kind !== "ok") break;
      applyLatest(more, "merge");
      page = more.data.messages;
    }
    // While the other person types, keep the fast pace (their message is on its way)
    return fresh || reacted || !!result.data.partnerTyping;
  }, [conversationId, applyLatest, fetchLatest, keepMyReactions]);

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
  const { mode, wake } = useChatChannel(conversationId, {
    onMessage: (m) => {
      if (!partnerId) return; // not loaded yet — the next poll/load picks it up
      const mine = m.senderId !== partnerId;
      if (!mine) clearTyping();
      const replyTo: ReplyQuote | null = m.replyTo
        ? { id: m.replyTo.id, mine: m.replyTo.senderId !== partnerId, kind: m.replyTo.kind, snippet: m.replyTo.snippet }
        : null;
      setMessages((prev) =>
        mergeMessages(
          // My own echo replaces exactly the optimistic copy it came from
          mine && m.clientNonce ? dropLocal(prev, m.clientNonce) : prev,
          [{ id: m.id, body: m.body, createdAt: m.createdAt, mine, readAt: null, kind: m.kind ?? "TEXT", media: m.media ?? null, replyTo, reactions: [] }]
        )
      );
    },
    onReaction: (e) => {
      if (!partnerId) return;
      const reactions = e.reactions.map((r) => ({ emoji: r.emoji, mine: r.userId !== partnerId }));
      setMessages((prev) => keepMyReactions(prev.map((m) => (m.id === e.messageId ? { ...m, reactions } : m))));
    },
    onTyping: (e) => {
      if (partnerId && e.userId === partnerId) markTyping();
    },
    onRead: (e) => {
      if (e.by !== partnerId) return;
      setMessages((prev) => prev.map((m) => (m.mine && !m.readAt ? { ...m, readAt: e.at } : m)));
    },
    onStatus: (e) => {
      setConversation((c) => (c ? { ...c, status: e.status as ChatSummary["status"], expiresAt: e.expiresAt ?? c.expiresAt } : c));
      // The event carries no "who": the chat's own answer says who ended it (`endedBy`); the list beside the room follows
      if (e.status !== "ACTIVE") void fetchNewer();
      notifyChatChanged();
    },
    poll: fetchNewer,
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
      .then(async (res) => {
        if (!res.ok) return;
        const at = new Date().toISOString();
        setMessages((prev) => prev.map((m) => (!m.mine && !m.readAt && m.createdAt <= upTo ? { ...m, readAt: at } : m)));
        const data = (await res.json().catch(() => null)) as { unreadCount?: unknown } | null;
        notifyNotificationsRead(typeof data?.unreadCount === "number" ? data.unreadCount : undefined);
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
      // From the last saved message on, not the newest page: more than a page may have arrived while the tab was
      // hidden (written in the app, say), and merging only the newest page left a hole nothing filled afterwards
      void fetchNewer();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchNewer]);

  // Keep the newest message in view unless the user scrolled up to read history
  useEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Opening a chat with unread messages: «رسائل جديدة» comes into view (near the top) instead of the very bottom
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !dividerPending.current || !unreadFromId) return;
    const divider = el.querySelector<HTMLElement>("[data-unread-divider]");
    if (!divider) return;
    dividerPending.current = false;
    el.scrollTop = Math.max(0, el.scrollTop + divider.getBoundingClientRect().top - el.getBoundingClientRect().top - 56);
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, [messages, unreadFromId]);

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
    // Reading back to the top loads the older messages by itself (the button stays for keyboards and short chats)
    if (el.scrollTop < 120 && hasMore) void loadOlder();
  }

  // The older page on its way: a second caller (a quote tap while scrolling loads) waits for it instead of giving up
  const olderLoad = useRef<Promise<void> | null>(null);
  function loadOlder(): Promise<void> {
    if (olderLoad.current) return olderLoad.current;
    const load = loadOlderPage().finally(() => {
      olderLoad.current = null;
    });
    olderLoad.current = load;
    return load;
  }

  async function loadOlderPage() {
    const el = scroller.current;
    const first = messagesRef.current.find((m) => !m.pending);
    // A ref, not the state: two scroll events before the re-render must not both load (and jump twice)
    if (!el || !first || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const before = el.scrollHeight;
    const res = await fetch(`/api/chats/${conversationId}?before=${encodeURIComponent(first.createdAt)}`).catch(() => null);
    if (res?.ok) {
      const data: ChatResponse = await res.json();
      stickToBottom.current = false;
      setMessages((prev) => mergeMessages(prev, data.messages));
      setHasMore(data.hasMore);
      hasMoreRef.current = data.hasMore;
      requestAnimationFrame(() => {
        if (scroller.current) scroller.current.scrollTop += scroller.current.scrollHeight - before;
      });
    }
    loadingOlderRef.current = false;
    setLoadingOlder(false);
  }

  /** A tapped quote: scroll to the original and mark it briefly (older pages load until it is there) */
  async function revealMessage(id: string) {
    for (let page = 0; page < 10 && !messagesRef.current.some((m) => m.id === id) && hasMoreRef.current; page++) {
      await loadOlder();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    const row = scroller.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
    if (!row) {
      toast.info("الرسالة الأصلية غير متاحة");
      return;
    }
    stickToBottom.current = false;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlightId(id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 1600);
  }

  // Text sends go out one at a time, in order, at the server's pace: a quick burst waits instead of being refused
  const sendQueue = useRef<Promise<void>>(Promise.resolve());
  const sentAt = useRef<number[]>([]);
  async function paced() {
    const now = Date.now();
    sentAt.current = sentAt.current.filter((t) => now - t < SEND_WINDOW_MS);
    if (sentAt.current.length >= SEND_BURST) {
      await new Promise((r) => setTimeout(r, SEND_WINDOW_MS - (now - sentAt.current[0]) + 50));
    }
    sentAt.current.push(Date.now());
  }

  /**
   * Shows the message at once and queues it. Returns false only when the instant check refuses it (the text
   * stays in the box); a message the server refuses later goes back into an empty box with the reason.
   */
  async function send(text: string, retryId?: string, quote: ReplyQuote | null = retryId ? null : replyTo): Promise<boolean> {
    setComposerError(null);
    // Same rules as the server, for instant feedback (the server still checks every message)
    const pre = checkMessage(text);
    if (!pre.ok) {
      showRefusal(pre.message);
      return false;
    }
    setRefusal(null);
    const tempId = retryId ?? tempMessageId();
    setUnreadFromId(null);
    typing.reset();
    const optimistic: UiMessage = {
      id: tempId, body: text, createdAt: new Date().toISOString(), mine: true, readAt: null, kind: "TEXT", media: null, replyTo: quote, reactions: [], pending: "sending",
    };
    stickToBottom.current = true;
    setMessages((prev) => (retryId ? prev.map((m) => (m.id === retryId ? optimistic : m)) : [...prev, optimistic]));
    if (!retryId) setReplyTo(null);
    sendQueue.current = sendQueue.current.then(() => deliver(text, tempId, quote?.id)).catch(() => {});
    return true;
  }

  async function deliver(text: string, tempId: string, replyToId?: string) {
    await paced();
    const res = await postJson<{ message: ChatMessage }>(`/api/chats/${conversationId}/messages`, {
      body: text,
      clientNonce: tempId,
      ...(replyToId && { replyToId }),
    });
    if (res.ok) {
      setMessages((prev) => mergeMessages(prev.filter((m) => m.id !== tempId), [res.data.message]));
      wake();
      notifyChatSent();
      return;
    }
    // Network trouble, a server error or the burst limit: the bubble stays with «إعادة المحاولة» (sent again
    // by itself when the connection comes back)
    if (res.status === 0 || res.status >= 500 || res.status === 429) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: "failed" } : m)));
      if (res.status === 429 && res.data.error) setComposerError(res.data.error);
      return;
    }
    // Refused (filter, closed chat …): not kept on screen; the text goes back into the box to edit
    setMessages((prev) => prev.filter((m) => m.id !== tempId));
    if (res.data.code === "FILTERED") showRefusal(res.data.error ?? "لا يمكن إرسال هذه الرسالة");
    else setComposerError(res.data.error ?? "تعذّر إرسال الرسالة");
    composer.current?.fill(text, { onlyIfEmpty: true });
    if (res.data.code === "EXPIRED" || res.data.code === "NOT_ALLOWED" || res.data.code === "DISABLED") fetchLatest("merge");
  }

  /** The filter's refusal as a note at the end of the thread (scrolled into view) */
  function showRefusal(message: string) {
    setComposerError(null);
    setRefusal(message);
    stickToBottom.current = true;
    requestAnimationFrame(() => {
      const el = scroller.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  /** A photo or voice note: shown at once from this device, uploaded, then swapped for the saved copy. */
  async function sendMedia(upload: PendingUpload, retryId?: string, quote: ReplyQuote | null = retryId ? null : replyTo) {
    setComposerError(null);
    setUnreadFromId(null);
    if (!retryId) setReplyTo(null);
    const tempId = retryId ?? tempMessageId();
    let url = localUrl(messages.find((m) => m.id === retryId));
    if (!url) {
      url = URL.createObjectURL(upload.blob);
      blobUrls.current.add(url);
    }
    const optimistic: UiMessage = {
      id: tempId,
      body: "",
      createdAt: new Date().toISOString(),
      mine: true,
      readAt: null,
      kind: upload.kind,
      media: { url, type: upload.blob.type, durationSec: upload.durationSec ?? null, width: upload.width ?? null, height: upload.height ?? null },
      replyTo: quote,
      reactions: [],
      pending: "sending",
      upload,
    };
    stickToBottom.current = true;
    setMessages((prev) => (retryId ? prev.map((m) => (m.id === retryId ? optimistic : m)) : [...prev, optimistic]));

    const form = new FormData();
    form.append("file", upload.blob, uploadName(upload));
    form.append("kind", upload.kind);
    if (upload.kind === "VOICE" && upload.durationSec) form.append("durationSec", String(upload.durationSec));
    form.append("clientNonce", tempId); // the same nonce on retry: the server never saves it twice
    if (quote) form.append("replyToId", quote.id);
    const res = await fetch(`/api/chats/${conversationId}/media`, { method: "POST", body: form }).catch(() => null);
    const data: { message?: ChatMessage; error?: string; code?: string } = res ? await res.json().catch(() => ({})) : {};

    if (res?.ok && data.message) {
      const saved = data.message;
      setMessages((prev) => mergeMessages(dropLocal(prev, tempId), [saved]));
      notifyChatSent();
      return;
    }
    // Network trouble, a server error or the burst limit: keep it with a retry button (the recording isn't lost)
    if (!res || res.status >= 500 || res.status === 429) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: "failed" } : m)));
      if (res?.status === 429 && data.error) setComposerError(data.error);
      return;
    }
    setMessages((prev) => dropLocal(prev, tempId));
    setComposerError(data.error ?? (upload.kind === "IMAGE" ? "تعذّر إرسال الصورة" : "تعذّر إرسال الرسالة الصوتية"));
    if (data.code === "PRO_REQUIRED") loadPro();
    if (data.code === "EXPIRED" || data.code === "NOT_ALLOWED" || data.code === "DISABLED") fetchLatest("merge");
  }

  async function sendPhoto(file: File) {
    setComposerError(null);
    const photo = await preparePhoto(file).catch(() => null);
    if (!photo) return setComposerError(UNSUPPORTED_IMAGE_MESSAGE);
    if (photo.blob.size > PHOTO_MAX_BYTES) return setComposerError("حجم الصورة أكبر من 10 ميغابايت");
    sendMedia({ kind: "IMAGE", blob: photo.blob, width: photo.width, height: photo.height });
  }

  // Back online: failed messages go out again by themselves, oldest first, and the chat catches up
  const retryFailed = useRef<() => void>(() => {});
  useEffect(() => {
    retryFailed.current = () => {
      for (const m of messagesRef.current.filter((x) => x.pending === "failed")) {
        if (m.upload) void sendMedia(m.upload, m.id, m.replyTo);
        else void send(m.body, m.id, m.replyTo);
      }
      void fetchNewer();
    };
  });
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    retryFailed.current();
  }, [online]);

  /** A reaction: shown at once, then the server's list (or put back, with a note, if refused) */
  async function react(target: UiMessage, emoji: string) {
    const before = messagesRef.current.find((m) => m.id === target.id)?.reactions ?? target.reactions;
    const next = nextReaction(before, emoji);
    const optimistic = applyMyReaction(before, next);
    reactingNow.current.set(target.id, optimistic);
    setMessages((prev) => prev.map((m) => (m.id === target.id ? { ...m, reactions: optimistic } : m)));
    const res = await postJson<{ reactions: UiMessage["reactions"] }>(`/api/chats/${conversationId}/messages/${target.id}/reaction`, { emoji: next });
    if (reactingNow.current.get(target.id) === optimistic) reactingNow.current.delete(target.id);
    if (res.ok) {
      setMessages((prev) => prev.map((m) => (m.id === target.id ? { ...m, reactions: res.data.reactions } : m)));
      return;
    }
    setMessages((prev) => prev.map((m) => (m.id === target.id ? { ...m, reactions: before } : m)));
    toast.error(res.data.error ?? "تعذّر إرسال التفاعل");
  }

  async function extend() {
    setExtendConfirm(false);
    setBusy(true);
    const res = await postJson<{ conversation: ChatSummary }>(`/api/chats/${conversationId}/extend`);
    setBusy(false);
    if (res.ok) {
      setConversation((c) => (c ? { ...c, ...res.data.conversation, lastMessage: c.lastMessage } : c));
      toast.success("تم تمديد المحادثة 7 أيام");
      notifyChatChanged();
    } else toast.error(res.data.error ?? "تعذّر التمديد");
  }

  /**
   * «إنهاء المحادثة», or a report: «إبلاغ فقط» (`end: false`: filed, the chat goes on, nobody blocked) or «إبلاغ
   * وإنهاء المحادثة» (ends the chat, blocks and closes the match; in a closed chat: reports and blocks).
   */
  async function end(report?: { reason: ReportReasonValue; details?: string; end: boolean }): Promise<boolean> {
    setBusy(true);
    const wasOpen = conversation?.status === "ACTIVE" && !conversation.blocked;
    // «إبلاغ عن الرسالة»: the message goes by id (the server checks it is the partner's message in this chat)
    const body = report
      ? {
          ...(!report.end && { end: false }),
          report: { reason: report.reason, ...(report.details && { details: report.details }), ...(reportMessage && { messageId: reportMessage.id }) },
        }
      : {};
    const res = await postJson(`/api/chats/${conversationId}/end`, body);
    setBusy(false);
    setEndDialog(null);
    if (res.ok) {
      toast.success(reportDoneText({ report: !!report, end: !report || report.end, open: wasOpen }));
      fetchLatest("merge");
      // The list beside the room (two panes) moves the chat to «المنتهية»
      notifyChatChanged();
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

  const pushChip = useChatPushChip();

  // Desktop: the composer has the focus when a chat opens, as in WhatsApp Web (QA PA-M7). Not on phones: the keyboard
  // would cover the thread
  const focusedOnOpen = useRef<string | null>(null);
  const writable = !!conversation && conversation.status === "ACTIVE" && !conversation.blocked && chatEnabled;
  useEffect(() => {
    if (!writable || focusedOnOpen.current === conversationId) return;
    focusedOnOpen.current = conversationId;
    if (window.matchMedia("(min-width: 768px) and (pointer: fine)").matches) composer.current?.focus();
  }, [writable, conversationId]);

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
        <p className="mt-1 text-sm text-muted-foreground">يمكنك التحقق من اتصالك والمحاولة مرة أخرى.</p>
        <Button variant="outline" className="mt-4" onClick={() => fetchLatest("replace")}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div role="status" className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <span className="sr-only">جارٍ التحميل…</span>
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
  // Photos / voice: Pro members in an open chat; greyed (opens the offer) only when this member could buy Pro now
  // (sales on, the country selling, a plan priced); else hidden: never an offer that ends in «غير متاح».
  // Media already in the chat always shows, whatever the switch
  const myPro = !!pro?.isPro || !!counts.pro?.isPro;
  const mediaMode: MediaMode | null = composerMediaMode({ canSend, isPro: myPro, canBuy: !!pro?.canBuy });
  const composerMedia: ComposerMedia | undefined = mediaMode
    ? {
        mode: mediaMode,
        onPhoto: (file) => void sendPhoto(file),
        onVoice: (r) => void sendMedia({ kind: "VOICE", blob: r.blob, durationSec: r.durationSec }),
        onLocked: () => setOfferOpen(true),
        onError: setComposerError,
      }
    : undefined;
  const familyStep = conversation.matchHidden
    ? null
    : familyStepOf(family?.status, { introRequests: !!intro?.flags.introRequests, closed: intro?.closed });
  const statusBar = chatStatusBar({
    open: open && !conversation.blocked,
    daysLeft: left,
    canExtend: conversation.canExtend,
    family: familyStep,
    pushOff: pushChip.pushOff,
    pushDismissed: pushChip.dismissed,
    keyboardOpen: !!viewport?.keyboard,
    // The server counts the whole chat (X3 minor 3); the loaded messages cover a first message sent since the last answer
    bothWrote: serverBothWrote || (messages.some((m) => m.mine && !m.pending) && messages.some((m) => !m.mine)),
  });
  const activity = open && !conversation.blocked ? conversation.partner.activityLabel : null;
  const startersShown = showStarters({ starters, canSend, messages });
  const closedFamily = closedChatFamilyNote(familyStep, myGender);
  // «يكتب الآن…» / «تكتب الآن…» (the partner's gender) wins over the activity label; never in a closed chat
  const typingLabel = open && !conversation.blocked && partnerTyping.typing ? forPartner(myGender, "يكتب الآن…", "تكتب الآن…") : null;
  const messageActions: MessageActions = {
    canInteract: canSend,
    onReply: (m) => {
      setReplyTo(quoteOf(m));
      // After the menu has closed (it would pull the focus back to its button, PA-L7)
      requestAnimationFrame(() => composer.current?.focus());
    },
    onReact: (m, emoji) => void react(m, emoji),
    onReport: (m) => {
      returnFocus.current = scroller.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(m.id)}"]`) ?? null;
      setReportMessage({ id: m.id, snippet: quoteOf(m).snippet });
      setEndDialog("report");
    },
    onOpenQuote: (id) => void revealMessage(id),
    onOpenPhoto: (id) => setViewerId(id),
  };
  const viewerPhotos: ViewerPhoto[] = messages
    .filter((m) => m.kind === "IMAGE" && m.media)
    .map((m) => ({
      id: m.id,
      media: m.media!,
      caption: `${m.mine ? "أنت" : conversation.partner.firstName} · ${timeLabel(m.createdAt, country)}`,
    }));
  // The list's one Tab stop, worked out once per render (not per row: review X3 minor 4)
  const activeRowId = activeRow && messages.some((x) => x.id === activeRow) ? activeRow : messages[messages.length - 1]?.id;
  const familyOpenUntil = family?.openUntil
    ? formatDate(family.openUntil, country, { day: "numeric", month: "long" })
    : null;

  return (
    <div
      // Phones: full screen over the dashboard bar, sized to the visible area so the keyboard never covers the box
      style={viewport ? { height: viewport.height, top: viewport.top } : undefined}
      className="mx-auto flex w-full max-w-3xl flex-col overflow-hidden bg-card max-md:fixed max-md:inset-x-0 max-md:top-0 max-md:z-50 max-md:h-[100dvh] md:h-[calc(100dvh-4rem)] md:rounded-2xl md:border md:border-border/60 md:shadow-sm lg:max-w-none"
    >
      {/* Header: who, and how long the chat stays open */}
      <header className="flex items-center gap-2 border-b border-border/60 px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] sm:px-4">
        {/* Desktop shows the list beside the chat: no way back needed there */}
        <Button asChild variant="ghost" size="icon" aria-label="رجوع" className="size-11 shrink-0 lg:hidden">
          <Link href="/dashboard/chats">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        {(() => {
          const who = (
            <>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="truncate font-bold leading-tight text-foreground">{conversation.partner.firstName}</h1>
                  {/* The match's seal (S1), small; gone with the match */}
                  {!conversation.matchHidden && <SealMark size={16} />}
                  <VerifiedBadge verified={conversation.partner.isVerified} />
                  {conversation.partner.isPro && <ProBadge />}
                </div>
                {/* The status line: «يكتب الآن…» while the partner types, else the activity label («نشط اليوم») in an
                    open chat, else the time left / why it's closed */}
                {/* Not a live region: typing on / off every few seconds would be read out each time */}
                <p data-testid="chat-status-line" className={cn("mt-0.5 flex items-center gap-1 truncate text-xs", typingLabel || activity ? "font-semibold text-primary" : open && left <= EXPIRY_SOON_DAYS ? "font-semibold text-amber-700" : "text-muted-foreground")}>
                  {typingLabel ? (
                    <span>{typingLabel}</span>
                  ) : activity ? (
                    activity
                  ) : (
                    <>
                      {open ? <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                      {open ? `متبقي ${daysLabel(left)}` : conversation.status === "ENDED" ? "المحادثة منتهية" : "انتهت مدة المحادثة"}
                    </>
                  )}
                  {mode === "live" && <span className="ms-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-label="متصل" />}
                </p>
              </div>
            </>
          );
          // The partner's avatar with the chat's days as a gold arc (S4); «متبقي N أيام» on tap or hover. It sits
          // outside the match link (no button inside a link). One Pro marker in the header: the badge by the name.
          const avatar = (
            <TimeArcButton
              daysLeftLabel={open ? `متبقي ${daysLabel(left)}` : null}
              avatar={
                <MemberAvatar
                  name={conversation.partner.firstName}
                  size={42}
                  matched={!open}
                  dimmed={!open}
                  // No end date (or none left): the plain avatar, never an empty gold track (review X4b minor 7)
                  timeLeft={open ? chatTimeFraction(conversation.expiresAt) : null}
                />
              }
            />
          );
          // Tapping the name opens the match (not for someone the other person blocked)
          return conversation.matchHidden ? (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              {avatar}
              {who}
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {avatar}
            <Link
              href={`/dashboard/matches?match=${conversation.matchId}`}
              aria-label={`عرض توافق ${conversation.partner.firstName}`}
              className="-my-1 flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 transition-colors hover:bg-muted/50"
            >
              {who}
            </Link>
            </div>
          );
        })()}
        <DropdownMenu dir="rtl">
          <DropdownMenuTrigger asChild>
            <Button ref={optionsButton} variant="ghost" size="icon" aria-label="خيارات المحادثة" className="size-11 shrink-0">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/* The days left, which the status line doesn't show while it carries the activity label */}
            {open && (
              <>
                <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" aria-hidden /> متبقي {daysLabel(left)} على المحادثة
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            )}
            {conversation.canExtend && (
              <DropdownMenuItem
                onClick={() => {
                  returnFocus.current = optionsButton.current;
                  setExtendConfirm(true);
                }}
                disabled={busy}
              >
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
                <DropdownMenuItem
                  onClick={() => {
                    returnFocus.current = optionsButton.current;
                    setEndDialog("end");
                  }}
                >
                  <XCircle className="h-4 w-4" /> إنهاء المحادثة
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                returnFocus.current = optionsButton.current;
                setReportMessage(null);
                setEndDialog("report");
              }}
            >
              <Flag className="h-4 w-4" /> إبلاغ
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Offline: failed messages go out again by themselves when the connection is back */}
      {!online && (
        <p role="status" className="flex min-h-9 items-center justify-center gap-1.5 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-xs font-semibold text-amber-800">
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
          لا يوجد اتصال بالإنترنت. تُرسل رسائلك عند عودة الاتصال.
        </p>
      )}
      {/* One slim bar, by priority: ending soon, the family step, the push chip (QA WC-07) */}
      <ChatStatusBar
        bar={statusBar}
        daysLeft={left}
        canExtend={conversation.canExtend}
        busy={busy}
        onExtend={() => setExtendConfirm(true)}
        family={familyStep}
        onFamily={() => setFamilyDialog(true)}
        matchHref={`/dashboard/matches?match=${conversation.matchId}`}
        viewerGender={myGender}
        pushBlocked={pushChip.blocked}
        onPushDismiss={pushChip.dismiss}
      />

      {/* Messages */}
      {canSend && (
        // Past the whole thread in one step (QA WC2-06 / PA-M7)
        <a
          href="#chat-composer"
          onClick={(e) => {
            e.preventDefault();
            composer.current?.focus();
          }}
          className="sr-only focus:not-sr-only focus:absolute focus:start-3 focus:top-20 focus:z-30 focus:rounded-xl focus:bg-primary focus:px-4 focus:py-3 focus:font-bold focus:text-primary-foreground"
        >
          الانتقال إلى مربع الرسالة
        </a>
      )}
      <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        onScroll={onScroll}
        // New messages are read out as they arrive (additions only: reactions and read ticks are not read out, review X3
        // minor 1); who wrote each is in the bubble (QA WC2-05)
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={`المحادثة مع ${conversation.partner.firstName}`}
        aria-busy={loadingOlder}
        data-message-list=""
        // The «majlis» (S3, P2-1): warm sand with the gold star at 4%, as in the app
        className="majlis h-full overflow-y-auto overscroll-contain px-1.5 py-3 sm:px-4"
      >
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

        {messages.length === 0 && canSend && (
          <p className="mx-auto mt-8 max-w-xs rounded-xl bg-card/90 px-4 py-3 text-center text-sm text-muted-foreground shadow-sm">
            {emptyChatHint({ female: myGender === "FEMALE", starters: startersShown && !viewport?.keyboard })}
          </p>
        )}
        {messages.length === 0 && !canSend && (
          <p className="py-10 text-center text-sm text-muted-foreground">لا توجد رسائل في هذه المحادثة.</p>
        )}

        {/* One section per day: its date chip stays at the top while that day scrolls by */}
        {groupByDay(messages).map((day) => (
          <section key={day.key} className="pb-1">
            <div className="sticky top-1 z-10 my-2 flex justify-center">
              <span className={CHAT_PILL}>
                {dayLabel(day.items[0].createdAt, country)}
              </span>
            </div>
            {day.items.map((m, k) => {
              const layout = chatRowLayout(messages, day.first + k, unreadFromId);
              return (
                <Fragment key={m.id}>
                  {layout.unreadDivider && (
                    <div data-unread-divider role="separator" className="my-3 flex justify-center">
                      <span className={cn(CHAT_PILL, "text-primary")}>رسائل جديدة</span>
                    </div>
                  )}
                  <MessageBubble
                    message={m}
                    rowActive={activeRowId === m.id}
                    onRowFocus={setActiveRow}
                    tail={layout.tail}
                    onRetry={() => (m.upload ? sendMedia(m.upload, m.id, m.replyTo) : send(m.body, m.id, m.replyTo))}
                    actions={messageActions}
                    partnerName={conversation.partner.firstName}
                    highlighted={highlightId === m.id}
                  />
                </Fragment>
              );
            })}
          </section>
        ))}

        {/* The filter refused a message: a note in the thread, and the way contact details are shared — the family
            introduction (chat design P1, QA WC2-04) */}
        {refusal && (
          <div
            data-testid="chat-refusal"
            // Inside the log: read out once as an addition (a nested alert was read twice, review X3 minor 1)
            className="mx-auto my-3 max-w-sm rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-center text-sm leading-relaxed text-foreground shadow-sm"
          >
            <p className="flex items-start justify-center gap-1.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" aria-hidden />
              <span>{refusal}</span>
            </p>
            {canSend && familyStep === "offer" ? (
              <Button size="sm" onClick={() => setFamilyDialog(true)} className="mt-2 min-h-11 gap-1.5">
                <Users className="h-4 w-4" aria-hidden="true" /> تعارف عائلي
              </Button>
            ) : familyStep && familyStep !== "offer" && !conversation.matchHidden ? (
              <Link
                href={`/dashboard/matches?match=${conversation.matchId}`}
                className="mt-1 inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
              >
                التعارف العائلي في صفحة التوافق
              </Link>
            ) : null}
          </div>
        )}
      </div>
        {/* Back to the newest message after scrolling up (with what arrived meanwhile) */}
        {away && (
          <button
            type="button"
            onClick={() => {
              const el = scroller.current;
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            }}
            aria-label={
              unseen > 0
                ? `${arabicCount(unseen, { one: "رسالة جديدة", two: "رسالتان جديدتان", few: "رسائل جديدة", many: "رسالة جديدة" })} · الانتقال لآخر رسالة`
                : "الانتقال لآخر رسالة"
            }
            className="absolute bottom-3 end-3 flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-card text-primary shadow-lg transition-transform active:scale-95"
          >
            <ChevronDown className="h-5 w-5" aria-hidden />
            {unseen > 0 && (
              <span aria-hidden className="absolute -top-1.5 -start-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-caption font-bold text-accent-foreground">
                {unseen > 99 ? "99+" : unseen}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Composer or read-only notice */}
      {canSend ? (
        <ChatComposer
          ref={composer}
          female={myGender === "FEMALE"}
          keyboardOpen={!!viewport?.keyboard}
          onSend={(t) => send(t)}
          error={composerError}
          onTyping={() => {
            if (composerError) setComposerError(null);
            if (refusal) setRefusal(null);
            typing.notify();
            // Polling (no Ably): someone composing is in a live exchange, so the next poll comes at the fast pace
            // (it brings their «يكتب الآن…» and the reply sooner). A wake never postpones a poll already due
            wake();
          }}
          media={composerMedia}
          replyTo={replyTo}
          partnerName={conversation.partner.firstName}
          onCancelReply={() => setReplyTo(null)}
          starters={startersShown ? starters : []}
        />
      ) : (
        <div className="border-t border-border/60 bg-muted/30 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-sm text-muted-foreground">
          {conversation.blocked
            ? "لا يمكن إرسال رسائل في هذه المحادثة."
            : intro?.chat.paused
            ? "المحادثة متوقفة مؤقتاً لمراجعة من فريق نصيبك. سنُعلمك عند استئنافها."
            : conversation.status === "ENDED"
            ? endedChatNote(conversation)
            : conversation.status === "EXPIRED"
              ? family?.status === "none" && intro?.flags.introRequests && !intro.closed
                ? `انتهت مدة المحادثة. هل تنتقلان لتعارف عائلي؟${familyFree ? " الانتقال مجاني" : ""}${familyOpenUntil ? ` ومتاح حتى ${familyOpenUntil}` : ""}.`
                : "انتهت مدة المحادثة."
              : "المحادثات متوقفة مؤقتاً. يمكنك قراءة الرسائل السابقة."}
          {/* An expired chat keeps its family links: a request on its way, one received, guardian details */}
          {conversation.status === "EXPIRED" && !conversation.blocked && closedFamily && (
            <p className="mt-1.5 font-semibold text-primary">
              {closedFamily.link ? (
                <Link href={`/dashboard/matches?match=${conversation.matchId}`} className="inline-flex min-h-11 items-center gap-1 underline-offset-4 hover:underline">
                  {closedFamily.text}
                </Link>
              ) : (
                closedFamily.text
              )}
            </p>
          )}
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

      <ProOfferDialog open={offerOpen} onOpenChange={setOfferOpen} />
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
        returnFocus={returnFocus}
        open={extendConfirm}
        onOpenChange={(o) => !busy && setExtendConfirm(o)}
        title="تمديد المحادثة 7 أيام؟"
        description="يمكن تمديد المحادثة مرة واحدة فقط، فتبقى مفتوحة 7 أيام إضافية لكليكما."
        confirmLabel="تمديد 7 أيام"
        busy={busy}
        onConfirm={extend}
      />
      <PhotoViewer photos={viewerPhotos} openId={viewerId} onClose={() => setViewerId(null)} />
      <EndChatDialog
        returnFocus={returnFocus}
        open={!!endDialog}
        onOpenChange={(o) => {
          if (o) return;
          setEndDialog(null);
          setReportMessage(null);
        }}
        reportedMessage={reportMessage?.snippet}
        report={endDialog === "report"}
        partnerName={conversation.partner.firstName}
        familyStatus={intro?.flags.introRequests && !intro.closed ? family?.status : undefined}
        busy={busy}
        ended={!endable}
        onConfirm={(report) => {
          // «إبلاغ فقط» stays in the chat; a report that ends or blocks goes back to the list
          end(report).then((ok) => ok && report?.end && router.push("/dashboard/chats"));
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

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** The browser's connection state (true on the server and when unknown) */
function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}
