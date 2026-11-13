"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ChatSummary, ChatMessage } from "@/lib/chat/service";
import type { IntroState } from "@/lib/intro/requests";
import { daysLeft, postJson } from "@/components/intro/intro-utils";
import type { ChatComposerHandle } from "./chat-composer";
import type { MessageActions } from "./message-menu";
import type { ViewerPhoto } from "./photo-viewer";
import { useTypingSignal, usePartnerTyping } from "./use-typing";
import {
  applyMyReaction, applyReactionUpdates, nextReaction, quoteOf, reactionsSinceFor, showStarters,
} from "./chat-interactions";
import type { ChatReaction } from "@/lib/chat/reactions";
import type { ReplyQuote } from "@/lib/chat/reply";
import { forPartner } from "@/lib/gendered-copy";
import { reportDoneText, type ReportReasonValue } from "./end-chat-dialog";
import { mergeMessages, timeLabel, type UiMessage } from "./chat-utils";
import { useChatChannel } from "./use-chat-channel";
import { useChatPushChip } from "./chat-push-banner";
import { chatStatusBar, closedChatFamilyNote, familyStepOf, firstUnreadId } from "./chat-look";
import { useDashboardData } from "@/contexts/dashboard-context";
import { formatDate } from "@/lib/countries";
import { checkMessage } from "@/lib/chat/filter";
import { markPageNotificationsRead, notifyChatChanged, notifyChatSent, notifyNotificationsRead } from "@/lib/notifications-client";
import type { MyProState } from "@/lib/pro/pro-types";
import { composerMediaMode, type ComposerMedia, type MediaMode } from "./media-buttons";
import { preparePhoto } from "./photo-prepare";
import { UNSUPPORTED_IMAGE_MESSAGE } from "@/lib/chat/media-messages";
import type { PendingUpload } from "./chat-utils";
import { deleteEntryMode } from "@/lib/chat/visibility";
import { useChatDelete } from "./delete-dialogs";

/** Id for an optimistic message until the server answers (also its clientNonce); only called from send() / sendMedia().
 *  Random, so two sends in the same millisecond (or two tabs) never share a nonce. */
/**
 * The filter run on this device, for instant feedback only: if it fails here (an older browser), the message goes
 * to the server, which checks every message anyway, instead of the send stopping silently.
 */
function instantCheck(text: string): ReturnType<typeof checkMessage> {
  try {
    return checkMessage(text);
  } catch {
    return { ok: true, text };
  }
}

function tempMessageId() {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return `tmp-${random}`;
}

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
  /** Chat delete is switched on (the entries show for Pro, or as the Pro offer for members who could buy it) */
  deleteEnabled?: boolean;
  /** My clear point: loaded messages at or before it leave the view */
  clearedBefore?: string | null;
  /** Polls with reactionsSince: messages deleted for everyone since then (shown as the trace) */
  deletedIds?: string[];
  /** Polls with reactionsSince: messages I hid since then (on another device): dropped */
  hiddenIds?: string[];
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

/** What the room shows once the chat has loaded (null until then: the views show the not-found / error / loading states) */
export interface ChatRoomReady {
  conversation: ChatSummary;
  left: number;
  open: boolean;
  canSend: boolean;
  endable: boolean;
  familyStep: ReturnType<typeof familyStepOf>;
  statusBar: ReturnType<typeof chatStatusBar>;
  activity: string | null;
  typingLabel: string | null;
  startersShown: boolean;
  closedFamily: ReturnType<typeof closedChatFamilyNote>;
  mediaMode: MediaMode | null;
  composerMedia: ComposerMedia | undefined;
  messageActions: MessageActions;
  viewerPhotos: ViewerPhoto[];
}

/** The chat room's engine (useChatRoom): everything a room view reads, under the names today's view uses */
export interface ChatRoomModel {
  conversationId: string;
  router: ReturnType<typeof useRouter>;
  // State
  conversation: ChatSummary | null;
  messages: UiMessage[];
  notFound: boolean;
  loadError: boolean;
  hasMore: boolean;
  loadingOlder: boolean;
  online: boolean;
  mode: ReturnType<typeof useChatChannel>["mode"];
  viewport: ReturnType<typeof useMobileViewport>;
  scroller: RefObject<HTMLDivElement | null>;
  composer: RefObject<ChatComposerHandle | null>;
  optionsButton: RefObject<HTMLButtonElement | null>;
  returnFocus: RefObject<HTMLElement | null>;
  // Derived (the ones that need the loaded chat are in `ready`)
  ready: ChatRoomReady | null;
  activeRowId: string | undefined;
  familyOpenUntil: string | null;
  family: IntroState["family"] | undefined;
  familyFree: boolean;
  intro: IntroState | null;
  deleteMode: ReturnType<typeof deleteEntryMode>;
  myGender: string | undefined;
  country: ReturnType<typeof useDashboardData>["country"];
  starters: string[];
  // UI state and setters
  refusal: string | null;
  setRefusal: Dispatch<SetStateAction<string | null>>;
  composerError: string | null;
  setComposerError: Dispatch<SetStateAction<string | null>>;
  replyTo: ReplyQuote | null;
  setReplyTo: Dispatch<SetStateAction<ReplyQuote | null>>;
  highlightId: string | null;
  unreadFromId: string | null;
  away: boolean;
  unseen: number;
  viewerId: string | null;
  setViewerId: Dispatch<SetStateAction<string | null>>;
  busy: boolean;
  endDialog: null | "end" | "report";
  setEndDialog: Dispatch<SetStateAction<null | "end" | "report">>;
  extendConfirm: boolean;
  setExtendConfirm: Dispatch<SetStateAction<boolean>>;
  familyDialog: boolean;
  setFamilyDialog: Dispatch<SetStateAction<boolean>>;
  offerOpen: boolean;
  setOfferOpen: Dispatch<SetStateAction<boolean>>;
  reportMessage: { id: string; snippet: string } | null;
  setReportMessage: Dispatch<SetStateAction<{ id: string; snippet: string } | null>>;
  pushChip: ReturnType<typeof useChatPushChip>;
  chatDelete: ReturnType<typeof useChatDelete>;
  // Actions
  send: (text: string, retryId?: string, quote?: ReplyQuote | null) => Promise<boolean>;
  sendMedia: (upload: PendingUpload, retryId?: string, quote?: ReplyQuote | null) => Promise<void>;
  fetchLatest: (mode: "replace" | "merge") => Promise<void>;
  loadOlder: () => Promise<void>;
  onScroll: () => void;
  extend: () => Promise<void>;
  end: (report?: { reason: ReportReasonValue; details?: string; end: boolean }) => Promise<boolean>;
  requestFamily: (consent: boolean) => Promise<void>;
  typing: ReturnType<typeof useTypingSignal>;
  wake: ReturnType<typeof useChatChannel>["wake"];
  setActiveRow: Dispatch<SetStateAction<string | null>>;
  /** The jump button: scroll smoothly to the newest message */
  jumpToNewest: () => void;
  /** Everything loaded counts as seen (the jump button's count goes back to 0) */
  markSeenNow: () => void;
  /** Removes a failed send (and releases its local photo / voice preview); anything else is left alone */
  dismissFailed: (id: string) => void;
}

/**
 * The chat room's engine: loading, polling, Ably, sending, reactions, delete, read and the dialogs' state. Hooks run
 * in the same order on every render; the views handle not-found / error / loading from `notFound`, `loadError` and
 * `ready`.
 */
export function useChatRoom(conversationId: string): ChatRoomModel {
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
  const [deleteEnabled, setDeleteEnabled] = useState(false);
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

  // Chat delete (Pro): the menu entries, «مسح المحادثة», the confirms and the Pro offer. «لدى الجميع» only while I can write
  // Set once fetchLatest exists (below): a refused delete loads the chat again
  const fetchLatestRef = useRef<(mode: "replace" | "merge") => Promise<void>>(async () => {});
  const writableNow = !!conversation && conversation.status === "ACTIVE" && !conversation.blocked && chatEnabled;
  const deleteMode = deleteEntryMode({ deleteEnabled, isPro: !!pro?.isPro || !!counts.pro?.isPro, canBuy: !!pro?.canBuy });
  const chatDelete = useChatDelete({
    conversationId,
    mode: deleteMode,
    canEveryone: writableNow,
    messagesRef,
    setMessages,
    setHasMore,
    hasMoreRef,
    returnFocus,
    onProRequired: () => void loadPro(),
    onRefused: () => void fetchLatestRef.current("merge"),
  });
  const { settle: settleDeletes } = chatDelete;

  // «رسائل جديدة»: fixed when the chat opens (the first unread message of theirs), gone once I write
  const [unreadFromId, setUnreadFromId] = useState<string | null>(null);
  const dividerPending = useRef(false);
  // The jump button counts the partner's messages after this point. On open: the newest message before «رسائل جديدة»
  // (all of them when nothing is unread), so the unread ones count and the ones read before don't (audit B22)
  const [seenUpTo, setSeenUpTo] = useState("");

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
      const at = id ? data.messages.findIndex((m) => m.id === id) : data.messages.length;
      setSeenUpTo(at > 0 ? data.messages[at - 1].createdAt : "");
    }
    if (data.polledAt) polledAt.current = data.polledAt;
    setConversation(data.conversation);
    setChatEnabled(data.chatEnabled);
    setDeleteEnabled(!!data.deleteEnabled);
    if (data.starters) setStarters(data.starters);
    if (data.bothWrote) setServerBothWrote(true);
    if (data.partnerTyping) markTyping();
    else if (data.partnerTyping === false) clearTyping();
    // Hides and the clear point, then traces: after my pending reactions, so a trace never shows any
    setMessages((prev) => settleDeletes(mode === "replace" ? data.messages : keepMyReactions(mergeMessages(prev, data.messages)), data));
    if (mode === "replace") setHasMore(data.hasMore);
  }, [markTyping, clearTyping, keepMyReactions, settleDeletes]);

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
  useEffect(() => {
    fetchLatestRef.current = fetchLatest;
  }, [fetchLatest]);

  /** A poll: only what came after the newest saved message (plus read ticks); true when something new arrived */
  const fetchNewer = useCallback(async (): Promise<boolean> => {
    let newest: ChatMessage | undefined;
    for (let i = messagesRef.current.length - 1; i >= 0; i--) {
      if (!messagesRef.current[i].pending) {
        newest = messagesRef.current[i];
        break;
      }
    }
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
    // Deletions again after the reaction updates: a trace never shows reactions
    if (reacted) setMessages((prev) => settleDeletes(keepMyReactions(applyReactionUpdates(prev, updates).messages), result.data));
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
  }, [conversationId, applyLatest, fetchLatest, keepMyReactions, settleDeletes]);

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
    onDeleted: chatDelete.onDeleted,
    onCleared: chatDelete.onCleared,
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
      setMessages((prev) => settleDeletes(mergeMessages(prev, data.messages), data));
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
    const pre = instantCheck(text);
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
  const writable = writableNow;
  useEffect(() => {
    if (!writable || focusedOnOpen.current === conversationId) return;
    focusedOnOpen.current = conversationId;
    if (window.matchMedia("(min-width: 768px) and (pointer: fine)").matches) composer.current?.focus();
  }, [writable, conversationId]);

  const family = intro?.family;
  // Credit on interest: every request is free, also after an earlier family request expired
  const familyFree = !!intro?.flags.creditOnInterest || !!family?.free;
  /** The free move to family stays open until the match fades (CHAT_STALE_DAYS after the chat ran out) */
  // Photos / voice: Pro members in an open chat; greyed (opens the offer) only when this member could buy Pro now
  // (sales on, the country selling, a plan priced); else hidden: never an offer that ends in «غير متاح».
  // Media already in the chat always shows, whatever the switch
  const myPro = !!pro?.isPro || !!counts.pro?.isPro;
  // The list's one Tab stop, worked out once per render (not per row: review X3 minor 4)
  const activeRowId = activeRow && messages.some((x) => x.id === activeRow) ? activeRow : messages[messages.length - 1]?.id;
  const familyOpenUntil = family?.openUntil
    ? formatDate(family.openUntil, country, { day: "numeric", month: "long" })
    : null;

  let ready: ChatRoomReady | null = null;
  if (conversation) {
    const left = daysLeft(conversation.expiresAt);
    const open = conversation.status === "ACTIVE";
    const canSend = open && chatEnabled && !conversation.blocked;
    // «إنهاء المحادثة» only on an open chat with no block either way (the server refuses the rest);
    // «إبلاغ» stays on every chat
    const endable = open && !conversation.blocked;
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
      deleteMode,
      canDeleteForEveryone: canSend,
      onDelete: (m, scope) => {
        returnFocus.current = scroller.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(m.id)}"]`) ?? null;
        chatDelete.requestDelete(m, scope);
      },
    };
    const viewerPhotos: ViewerPhoto[] = messages
      .filter((m) => m.kind === "IMAGE" && m.media)
      .map((m) => ({
        id: m.id,
        media: m.media!,
        caption: `${m.mine ? "أنت" : conversation.partner.firstName} · ${timeLabel(m.createdAt, country)}`,
      }));
    ready = {
      conversation, left, open, canSend, endable, familyStep, statusBar, activity, typingLabel, startersShown, closedFamily,
      mediaMode, composerMedia, messageActions, viewerPhotos,
    };
  }

  function jumpToNewest() {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  /** A failed send the member gave up on: off the screen, its local preview released (audit U5) */
  function dismissFailed(id: string) {
    setMessages((prev) => (prev.some((m) => m.id === id && m.pending === "failed") ? dropLocal(prev, id) : prev));
  }

  function markSeenNow() {
    setSeenUpTo(messages.length > 0 ? messages[messages.length - 1].createdAt : "");
  }

  return {
    conversationId, router,
    conversation, messages, notFound, loadError, hasMore, loadingOlder, online, mode, viewport, scroller, composer,
    optionsButton, returnFocus,
    ready, activeRowId, familyOpenUntil, family, familyFree, intro, deleteMode, myGender, country, starters,
    refusal, setRefusal, composerError, setComposerError, replyTo, setReplyTo, highlightId, unreadFromId, away, unseen,
    viewerId, setViewerId, busy, endDialog, setEndDialog, extendConfirm, setExtendConfirm, familyDialog, setFamilyDialog,
    offerOpen, setOfferOpen, reportMessage, setReportMessage, pushChip, chatDelete,
    send, sendMedia, fetchLatest, loadOlder, onScroll, extend, end, requestFamily, typing, wake, setActiveRow,
    jumpToNewest, markSeenNow, dismissFailed,
  };
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
