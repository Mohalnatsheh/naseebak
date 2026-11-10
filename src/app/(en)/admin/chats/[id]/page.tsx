"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowDown, ArrowLeft, ArrowUp, Check, CheckCheck, ChevronDown, ChevronUp, Eye, Flag, Heart, Loader2, MessagesSquare, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime, PersonLink, StateBadge, type PersonRef } from "@/components/admin/admin-list-bits";
import { enumLabel } from "@/lib/admin/enum-labels";
import { fmtLeft } from "@/lib/admin/matching-time";
import { AdminEmptyState, AdminLoadError } from "@/components/admin/admin-states";
import { useConfirm } from "@/components/admin/confirm-dialog";
import { clockLabel } from "@/components/chat/media-buttons";

interface ChatDetail {
  id: string;
  matchId: string;
  people: PersonRef[];
  status: "ACTIVE" | "ENDED" | "EXPIRED";
  createdAt: string;
  expiresAt: string;
  extended: boolean;
  endedAt: string | null;
  /** "paused" (report review), "system", "admin", the member's first name, or null */
  endedBy: string | null;
  /** `messageId`: «إبلاغ عن الرسالة» (that message is highlighted) */
  reports: { id: string; status: string; createdAt: string; messageId?: string | null }[];
}

interface Msg {
  id: string;
  senderId: string;
  /** For a photo / voice note: the fallback text old apps show */
  body: string;
  readAt: string | null;
  createdAt: string;
  kind?: "TEXT" | "IMAGE" | "VOICE";
  media?: { url: string; type: string; durationSec: number | null; width: number | null; height: number | null } | null;
  /** The quoted message (read-only) */
  replyTo?: { id: string; senderId: string; kind: string; snippet: string } | null;
  reactions?: { emoji: string; userId: string }[];
}

/** A photo (opens full size in a new tab) or a voice note (native player); every fetch is logged server-side */
function AdminMedia({ m }: { m: Msg }) {
  if (!m.media) return null;
  if (m.kind === "IMAGE") {
    return (
      <a href={m.media.url} target="_blank" rel="noreferrer" className="mt-1 block" aria-label="Open photo full size">
        <Image
          src={m.media.url}
          alt="Chat photo"
          width={m.media.width ?? 240}
          height={m.media.height ?? 240}
          unoptimized
          className="h-auto max-h-72 w-auto max-w-60 rounded-lg object-contain"
        />
      </a>
    );
  }
  return <AdminVoice url={m.media.url} declared={m.media.durationSec} />;
}

/**
 * Same length as the member sees (WC2-15): the file's own once its metadata loads (members' VoiceBubble), the
 * declared length (rounded up when sent) until then. preload="none": each fetch is a logged view.
 */
function AdminVoice({ url, declared }: { url: string; declared: number | null }) {
  const [fileLength, setFileLength] = useState<number | null>(null);
  const length = fileLength ?? declared;
  return (
    <div className="mt-1">
      <audio
        controls
        preload="none"
        src={url}
        className="h-10 w-60 max-w-full"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setFileLength(d);
        }}
      />
      {length != null && <p className="text-[11px] opacity-70">Voice note · {clockLabel(length)}</p>}
    </div>
  );
}

/** Messages drawn at first; «Load older» adds this many more (ADM-26: long chats no longer render 3,000 at once) */
const PAGE = 200;

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Amman" });
}

/** Same wording as the chats list */
function endedByLabel(by: string | null) {
  if (by === "admin") return "by admin";
  if (by === "system") return "by the system";
  return by ? <>by <bdi>{by}</bdi></> : "";
}

/** Full message history of one chat, oldest first. The first person is shown on the left. */
export default function AdminChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [chat, setChat] = useState<ChatDetail | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");
  const [find, setFind] = useState("");
  const [only, setOnly] = useState("");
  const [ending, setEnding] = useState(false);
  // How many of the newest messages are drawn (searching or filtering looks through all of them)
  const [windowSize, setWindowSize] = useState(PAGE);
  const [reportAt, setReportAt] = useState(-1);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/admin/chats/${id}/messages`);
      if (!res.ok) throw new Error(res.status === 404 ? "Chat not found." : "Could not load the chat.");
      const d = await res.json();
      setChat(d.chat);
      setMessages(d.messages ?? []);
      setTruncated(!!d.truncated);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Opened from a report («Show in chat», #msg-<id>): scroll to that message once the chat is on screen
  const loadedCount = messages.length;
  const [hashTarget, setHashTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!loadedCount || typeof window === "undefined" || !window.location.hash.startsWith("#msg-")) return;
    setHashTarget(window.location.hash.slice(5));
  }, [loadedCount]);

  async function endChat() {
    if (!chat) return;
    const ok = await confirm({
      title: "End this chat?",
      description: (
        <>
          The chat between <bdi>{chat.people[0]?.firstName}</bdi> &amp; <bdi>{chat.people[1]?.firstName}</bdi> ends now.
          Both are told. This can&apos;t be undone.
        </>
      ),
      confirmLabel: "End chat",
      destructive: true,
    });
    if (!ok) return;
    setEnding(true);
    const res = await fetch(`/api/admin/chats/${id}/end`, { method: "POST" }).catch(() => null);
    if (res?.ok) {
      toast.success("Chat ended");
      await load();
    } else {
      const d = res ? await res.json().catch(() => ({})) : {};
      toast.error(d.error || "Could not end the chat.");
    }
    setEnding(false);
  }

  const reportedIds = useMemo(() => new Set((chat?.reports ?? []).flatMap((r) => (r.messageId ? [r.messageId] : []))), [chat]);
  const term = find.trim().toLowerCase();
  const filteringNow = !!term || !!only;
  const matching = useMemo(
    () => messages.filter((m) => (!only || m.senderId === only) && (!term || m.body.toLowerCase().includes(term))),
    [messages, only, term],
  );
  // Reported messages in the order they appear: the jump chip steps through them
  const reportedInOrder = useMemo(() => messages.filter((m) => reportedIds.has(m.id)).map((m) => m.id), [messages, reportedIds]);
  // Keep a message the admin jumps to inside the drawn window
  const needIndex = (msgId: string | null) => (msgId ? messages.findIndex((m) => m.id === msgId) : -1);
  const target = reportAt >= 0 ? reportedInOrder[reportAt] ?? null : hashTarget;
  const targetIndex = needIndex(target);
  const windowFrom = Math.max(0, Math.min(messages.length - windowSize, targetIndex >= 0 ? targetIndex - 20 : Number.MAX_SAFE_INTEGER));
  const shown = filteringNow ? matching : messages.slice(windowFrom);
  const hiddenOlder = filteringNow ? 0 : windowFrom;

  useEffect(() => {
    if (target) document.getElementById(`msg-${target}`)?.scrollIntoView({ block: "center" });
  }, [target, windowFrom]);

  function jumpReported(step: 1 | -1) {
    if (!reportedInOrder.length) return;
    setFind("");
    setOnly("");
    setReportAt((i) => (i < 0 ? (step === 1 ? 0 : reportedInOrder.length - 1) : (i + step + reportedInOrder.length) % reportedInOrder.length));
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link href="/admin/chats" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All chats
        </Link>
        <AdminLoadError message={error} onRetry={error === "Chat not found." ? undefined : load} />
      </div>
    );
  }
  if (!chat) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const [left, right] = chat.people;
  const nameOf = (uid: string) => chat.people.find((p) => p.id === uid)?.firstName ?? "?";
  const countOf = (uid: string) => messages.filter((m) => m.senderId === uid).length;
  const filtering = !!term || !!only;
  const paused = chat.endedBy === "paused";
  const pendingReports = chat.reports.filter((r) => r.status === "PENDING").length;

  return (
    <div className="space-y-6">
      <p className="flex items-center gap-2 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800">
        <Eye className="h-4 w-4 shrink-0" /> Reading a chat is logged. Open chats only for reports or safety.
      </p>

      <Link href="/admin/chats" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All chats
      </Link>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <MessagesSquare className="h-5 w-5 text-primary" />
            <PersonLink p={left} /> <span className="text-muted-foreground">&amp;</span> <PersonLink p={right} />
            {paused ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800">Paused for review</span>
            ) : (
              <StateBadge value={chat.status} group="chatStatus" />
            )}
            {chat.status === "ACTIVE" && (
              <Button size="sm" variant="outline" className="ms-auto" disabled={ending} onClick={endChat}>
                {ending ? <Loader2 className="h-3 w-3 animate-spin" /> : "End chat"}
              </Button>
            )}
          </CardTitle>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href={`/admin/matches?q=${chat.matchId}`} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 hover:bg-muted">
              <Heart className="h-3.5 w-3.5" /> Match
            </Link>
            {chat.reports.length > 0 && (
              <Link href="/admin/reports" className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-destructive hover:bg-muted">
                <Flag className="h-3.5 w-3.5" />
                {chat.reports.length} report{chat.reports.length === 1 ? "" : "s"}
                {pendingReports > 0 ? ` (${pendingReports} ${enumLabel("reportStatus", "PENDING").toLowerCase()})` : ""}
              </Link>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Started {fmtDate(chat.createdAt)}
            {chat.status === "ACTIVE"
              ? ` · Expires ${fmtLeft(chat.expiresAt)} (${fmtDate(chat.expiresAt)})`
              : !chat.endedAt && ` · Expired ${fmtDate(chat.expiresAt)}`}
            {chat.extended && " (extended)"}
            {paused
              ? ` · Paused ${fmtDateTime(chat.endedAt)} while reports are reviewed (resumes by itself if cleared)`
              : chat.endedAt && ` · Ended ${fmtDate(chat.endedAt)} ${endedByLabel(chat.endedBy)}`}
            {` · ${messages.length} message${messages.length === 1 ? "" : "s"} (`}
            <bdi>{left.firstName}</bdi> {countOf(left.id)} · <bdi>{right.firstName}</bdi> {countOf(right.id)})
            {messages.length > 0 && ` · last ${fmtDate(messages[messages.length - 1].createdAt)} ${fmtTime(messages[messages.length - 1].createdAt)}`}
          </p>
          {messages.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-0 flex-1 basis-56">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <span className="sr-only">Search in this chat</span>
                <input
                  id="chat-find"
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                  placeholder="Search in this chat…"
                  dir="auto"
                  className="h-9 w-full rounded-md border bg-background ps-8 pe-3 text-sm"
                />
              </label>
              <select id="chat-only" aria-label="Whose messages" value={only} onChange={(e) => setOnly(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                <option value="">Both people</option>
                <option value={left.id}>Only {"\u2068"}{left.firstName}{"\u2069"}</option>
                <option value={right.id}>Only {"\u2068"}{right.firstName}{"\u2069"}</option>
              </select>
              <a
                href="#chat-top"
                onClick={() => {
                  setReportAt(-1);
                  setHashTarget(null);
                  setWindowSize(messages.length);
                }}
                className="inline-flex h-9 items-center gap-1 rounded-md border px-2.5 text-sm hover:bg-muted"
              >
                <ArrowUp className="h-3.5 w-3.5" /> First
              </a>
              <a href="#chat-end" className="inline-flex h-9 items-center gap-1 rounded-md border px-2.5 text-sm hover:bg-muted"><ArrowDown className="h-3.5 w-3.5" /> Latest</a>
              {reportedInOrder.length > 0 && (
                <span className="inline-flex h-9 items-center rounded-md border border-accent bg-accent/10 text-sm">
                  <button
                    type="button"
                    onClick={() => jumpReported(1)}
                    className="inline-flex h-full items-center gap-1.5 px-2.5 font-medium text-foreground hover:bg-accent/20"
                  >
                    <Flag className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                    Reported message{reportedInOrder.length > 1 ? ` ${reportAt >= 0 ? reportAt + 1 : "–"} of ${reportedInOrder.length}` : ""}
                  </button>
                  {reportedInOrder.length > 1 && (
                    <>
                      <button type="button" aria-label="Previous reported message" onClick={() => jumpReported(-1)} className="inline-flex h-full items-center border-s border-accent/40 px-1.5 hover:bg-accent/20">
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button type="button" aria-label="Next reported message" onClick={() => jumpReported(1)} className="inline-flex h-full items-center border-s border-accent/40 px-1.5 hover:bg-accent/20">
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </span>
              )}
              {filtering && <span className="text-xs text-muted-foreground">{shown.length} of {messages.length} shown</span>}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {truncated && (
            <p className="mb-3 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800">Showing the latest {messages.length} messages only.</p>
          )}
          {messages.length === 0 ? (
            <AdminEmptyState icon={MessagesSquare} title="No messages in this chat" />
          ) : (
            <div id="chat-top" className="space-y-2 rounded-lg bg-muted/30 p-3 sm:p-4">
              {hiddenOlder > 0 && (
                <div className="flex justify-center pb-2">
                  <Button size="sm" variant="outline" onClick={() => setWindowSize((n) => n + PAGE)}>
                    <ArrowUp className="me-1 h-3.5 w-3.5" /> Load older ({hiddenOlder.toLocaleString("en-GB")} more)
                  </Button>
                </div>
              )}
              {filtering && shown.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No message matches.</p>}
              {shown.map((m, i) => {
                const day = fmtDate(m.createdAt);
                const showDay = i === 0 || day !== fmtDate(shown[i - 1].createdAt);
                const mine = m.senderId === left.id;
                return (
                  <div key={m.id} id={`msg-${m.id}`}>
                    {showDay && <p className="py-2 text-center text-xs font-medium text-muted-foreground">{day}</p>}
                    <div className={cn("flex", mine ? "justify-start" : "justify-end")}>
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-3 py-2 shadow-sm",
                          mine ? "rounded-bl-sm bg-background" : "rounded-br-sm bg-primary text-primary-foreground",
                          // Gold, not red: the reported message is evidence to read, not an error (design P2)
                          reportedIds.has(m.id) && "ring-2 ring-accent ring-offset-2",
                          m.id === target && "outline-2 outline-offset-4 outline-accent"
                        )}
                      >
                        {reportedIds.has(m.id) && (
                          <p className="mb-1 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
                            <Flag className="h-3 w-3" /> Reported message
                          </p>
                        )}
                        <p className={cn("text-xs font-semibold", mine ? "text-primary" : "text-primary-foreground/80")}><bdi>{nameOf(m.senderId)}</bdi></p>
                        {m.replyTo && (
                          <a
                            href={`#msg-${m.replyTo.id}`}
                            className={cn(
                              "mt-1 block rounded-md border-s-2 px-2 py-1 text-xs",
                              mine ? "border-primary bg-muted" : "border-primary-foreground/60 bg-primary-foreground/10"
                            )}
                          >
                            <span className="font-semibold">Reply to <bdi>{nameOf(m.replyTo.senderId)}</bdi>: </span>
                            <span dir="auto">{m.replyTo.snippet}</span>
                          </a>
                        )}
                        {m.media && (m.kind === "IMAGE" || m.kind === "VOICE") ? (
                          <AdminMedia m={m} />
                        ) : (
                          <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-relaxed"><Highlight text={m.body} term={term} /></p>
                        )}
                        <p className={cn("mt-1 flex items-center justify-end gap-1 text-[11px]", mine ? "text-muted-foreground" : "text-primary-foreground/70")}>
                          {fmtTime(m.createdAt)}
                          {m.readAt ? <CheckCheck className="h-3 w-3" aria-label="Read" /> : <Check className="h-3 w-3" aria-label="Sent" />}
                        </p>
                        {m.reactions && m.reactions.length > 0 && (
                          <p className={cn("mt-1 flex flex-wrap gap-1 text-[11px]", mine ? "text-muted-foreground" : "text-primary-foreground/80")}>
                            {m.reactions.map((r) => (
                              <span key={r.userId} className="rounded-full bg-background/80 px-1.5 py-0.5 text-foreground">
                                {r.emoji} <bdi>{nameOf(r.userId)}</bdi>
                              </span>
                            ))}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div id="chat-end" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Marks every occurrence of the search term (case-insensitive) */
function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  let at = 0;
  for (let i = lower.indexOf(term); i !== -1; i = lower.indexOf(term, i + term.length)) {
    parts.push(text.slice(at, i), <mark key={i} className="rounded bg-amber-200 px-0.5 text-foreground">{text.slice(i, i + term.length)}</mark>);
    at = i + term.length;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}
