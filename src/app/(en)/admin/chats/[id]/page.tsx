"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CheckCheck, Loader2, MessagesSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtDate, PersonLink, StateBadge, type PersonRef } from "@/components/admin/admin-list-bits";

interface ChatDetail {
  id: string;
  people: PersonRef[];
  status: "ACTIVE" | "ENDED" | "EXPIRED";
  createdAt: string;
  expiresAt: string;
  extended: boolean;
  endedAt: string | null;
  endedBy: string | null;
}

interface Msg {
  id: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Full message history of one chat, oldest first. The first person is shown on the left. */
export default function AdminChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [chat, setChat] = useState<ChatDetail | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/admin/chats/${id}/messages`)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "Chat not found." : "Could not load the chat.");
        const d = await res.json();
        setChat(d.chat);
        setMessages(d.messages ?? []);
        setTruncated(!!d.truncated);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

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

  return (
    <div className="space-y-6">
      <Link href="/admin/chats" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All chats
      </Link>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <MessagesSquare className="h-5 w-5 text-primary" />
            <PersonLink p={left} /> <span className="text-muted-foreground">&amp;</span> <PersonLink p={right} />
            <StateBadge value={chat.status} group="chatStatus" />
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Started {fmtDate(chat.createdAt)} · Expires {fmtDate(chat.expiresAt)}
            {chat.extended && " (extended)"}
            {chat.endedAt && ` · Ended ${fmtDate(chat.endedAt)} ${chat.endedBy === "admin" ? "by admin" : `by ${chat.endedBy}`}`}
            {` · ${messages.length} messages`}
          </p>
        </CardHeader>
        <CardContent>
          {truncated && (
            <p className="mb-3 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800">Showing the first {messages.length} messages only.</p>
          )}
          {messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No messages in this chat.</p>
          ) : (
            <div className="space-y-2 rounded-lg bg-muted/30 p-3 sm:p-4">
              {messages.map((m, i) => {
                const day = fmtDate(m.createdAt);
                const showDay = i === 0 || day !== fmtDate(messages[i - 1].createdAt);
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
                        <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</p>
                        <p className={cn("mt-1 flex items-center justify-end gap-1 text-[11px]", mine ? "text-muted-foreground" : "text-primary-foreground/70")}>
                          {fmtTime(m.createdAt)}
                          {m.readAt ? <CheckCheck className="h-3 w-3" aria-label="Read" /> : <Check className="h-3 w-3" aria-label="Sent" />}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
