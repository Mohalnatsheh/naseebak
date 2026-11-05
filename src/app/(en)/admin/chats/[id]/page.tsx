"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, Check, CheckCheck, Eye, Flag, Heart, Loader2, MessagesSquare, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime, PersonLink, StateBadge, type PersonRef } from "@/components/admin/admin-list-bits";
import { enumLabel } from "@/lib/admin/enum-labels";
import { fmtLeft } from "@/lib/admin/matching-time";

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
  reports: { id: string; status: string; createdAt: string }[];
}

interface Msg {
  id: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Amman" });
}

/** Same wording as the chats list */
function endedByLabel(by: string | null) {
  if (by === "admin") return "by admin";
  if (by === "system") return "by the system";
  return by ? `by ${by}` : "";
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

  const load = useCallback(async () => {
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

  async function endChat() {
    if (!chat) return;
    if (!confirm(`End the chat between ${chat.people.map((p) => p.firstName).join(" & ")}? Both are told.`)) return;
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

  const term = find.trim().toLowerCase();
  const shown = useMemo(
    () => messages.filter((m) => (!only || m.senderId === only) && (!term || m.body.toLowerCase().includes(term))),
    [messages, only, term],
  );

  if (error) return <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>;
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
            {` · ${messages.length} messages (${left.firstName} ${countOf(left.id)} · ${right.firstName} ${countOf(right.id)})`}
            {messages.length > 0 && ` · last ${fmtDate(messages[messages.length - 1].createdAt)} ${fmtTime(messages[messages.length - 1].createdAt)}`}
          </p>
          {messages.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-0 flex-1 basis-56">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="chat-find"
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                  placeholder="Search in this chat…"
                  dir="auto"
                  className="h-9 w-full rounded-md border bg-background ps-8 pe-3 text-sm"
                />
              </label>
              <select id="chat-only" value={only} onChange={(e) => setOnly(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                <option value="">Both people</option>
                <option value={left.id}>Only {left.firstName}</option>
                <option value={right.id}>Only {right.firstName}</option>
              </select>
              <a href="#chat-top" className="inline-flex h-9 items-center gap-1 rounded-md border px-2.5 text-sm hover:bg-muted"><ArrowUp className="h-3.5 w-3.5" /> First</a>
              <a href="#chat-end" className="inline-flex h-9 items-center gap-1 rounded-md border px-2.5 text-sm hover:bg-muted"><ArrowDown className="h-3.5 w-3.5" /> Latest</a>
              {filtering && <span className="text-xs text-muted-foreground">{shown.length} of {messages.length} shown</span>}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {truncated && (
            <p className="mb-3 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800">Showing the latest {messages.length} messages only.</p>
          )}
          {messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No messages in this chat.</p>
          ) : (
            <div id="chat-top" className="space-y-2 rounded-lg bg-muted/30 p-3 sm:p-4">
              {filtering && shown.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No message matches.</p>}
              {shown.map((m, i) => {
                const day = fmtDate(m.createdAt);
                const showDay = i === 0 || day !== fmtDate(shown[i - 1].createdAt);
                const mine = m.senderId === left.id;
                return (
                  <div key={m.id}>
                    {showDay && <p className="py-2 text-center text-xs font-medium text-muted-foreground">{day}</p>}
                    <div className={cn("flex", mine ? "justify-start" : "justify-end")}>
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-3 py-2 shadow-sm",
                          mine ? "rounded-bl-sm bg-background" : "rounded-br-sm bg-primary text-primary-foreground"
                        )}
                      >
                        <p className={cn("text-xs font-semibold", mine ? "text-primary" : "text-primary-foreground/80")}>{nameOf(m.senderId)}</p>
                        <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-relaxed"><Highlight text={m.body} term={term} /></p>
                        <p className={cn("mt-1 flex items-center justify-end gap-1 text-[11px]", mine ? "text-muted-foreground" : "text-primary-foreground/70")}>
                          {fmtTime(m.createdAt)}
                          {m.readAt ? <CheckCheck className="h-3 w-3" aria-label="Read" /> : <Check className="h-3 w-3" aria-label="Sent" />}
                        </p>
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
