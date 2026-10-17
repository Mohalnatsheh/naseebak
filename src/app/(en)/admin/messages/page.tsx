"use client";

import { useEffect, useState } from "react";
import { Inbox, Loader2, CheckCircle2, RotateCcw, Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pager, fmtDate } from "@/components/admin/admin-list-bits";

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  userId: string | null;
  handledAt: string | null;
  createdAt: string;
}

type Filter = "open" | "handled" | "all";

export default function AdminMessagesPage() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [filter, setFilter] = useState<Filter>("open");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [open, setOpen] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    load(page, filter);
  }, [page, filter]);

  async function load(p: number, f: Filter) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/contact-messages?page=${p}&filter=${f}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Failed to load messages (${res.status})`);
        return;
      }
      setError("");
      // The last message of a page was handled: step back instead of showing an empty page
      if ((data.messages || []).length === 0 && p > 1) {
        setPage(p - 1);
        return;
      }
      setMessages(data.messages || []);
      setTotalPages(data.totalPages || 1);
      setOpen(data.open ?? 0);
    } catch {
      setError("Network error, please reload");
    } finally {
      setLoading(false);
    }
  }

  async function setHandled(id: string, handled: boolean) {
    setBusy(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/contact-messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Update failed (${res.status})`);
        return;
      }
      await load(page, filter);
    } catch {
      setError("Network error, please try again");
    } finally {
      setBusy(null);
    }
  }

  function changeFilter(f: Filter) {
    setFilter(f);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Inbox className="h-7 w-7 text-primary" />
          Contact Messages
        </h1>
        <p className="text-muted-foreground mt-1">
          Messages sent from the public contact page. Reply by email, then mark them handled.
          {open > 0 && <Badge className="ms-2">{open} open</Badge>}
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["open", "handled", "all"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => changeFilter(f)}>
            {f === "open" ? "Open" : f === "handled" ? "Handled" : "All"}
          </Button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : messages.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Inbox className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <h3 className="font-medium text-lg">No messages</h3>
            <p className="text-sm text-muted-foreground">
              {filter === "open" ? "Every contact message has been handled." : "Nothing here yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {messages.map((m) => (
            <Card key={m.id}>
              <CardContent className="pt-6 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold" dir="auto">{m.subject}</h3>
                    <p className="text-sm text-muted-foreground" dir="auto">
                      {m.name} ·{" "}
                      <a href={`mailto:${m.email}?subject=${encodeURIComponent("Re: " + m.subject)}`} className="text-primary hover:underline" dir="ltr">
                        {m.email}
                      </a>
                      {m.userId && <span className="ms-2 text-xs">(signed-in user)</span>}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{fmtDate(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm" dir="auto">{m.message}</p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button asChild size="sm" variant="outline">
                    <a href={`mailto:${m.email}?subject=${encodeURIComponent("Re: " + m.subject)}`}>
                      <Mail className="h-3.5 w-3.5 me-1" /> Reply by email
                    </a>
                  </Button>
                  {m.handledAt ? (
                    <Button size="sm" variant="ghost" disabled={busy === m.id} onClick={() => setHandled(m.id, false)}>
                      {busy === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><RotateCcw className="h-3.5 w-3.5 me-1" />Reopen</>}
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busy === m.id} onClick={() => setHandled(m.id, true)}>
                      {busy === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><CheckCircle2 className="h-3.5 w-3.5 me-1" />Mark handled</>}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          <Pager page={page} pages={totalPages} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
