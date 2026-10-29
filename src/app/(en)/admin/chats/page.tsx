"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Flag, Loader2, MessagesSquare, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtDate, Pager, PersonLink, SearchBox, StateBadge, type PersonRef } from "@/components/admin/admin-list-bits";
import { enumLabel } from "@/lib/admin/enum-labels";

interface ChatRow {
  id: string;
  people: (PersonRef & { messages: number })[];
  status: "ACTIVE" | "ENDED" | "EXPIRED";
  createdAt: string;
  expiresAt: string;
  extended: boolean;
  endedAt: string | null;
  endedBy: string | null;
  messages: number;
  unread: number;
  lastAt: string | null;
  lastBy: string | null;
  reported: boolean;
  sms: { talking: boolean; members: { name: string; status: string | null; at: string | null }[] } | null;
}

interface Summary {
  open: number;
  talkedToday: number;
  notStarted: number;
  oneSided: number;
  quiet: number;
  expiring: number;
  reported: number;
}

const STATUSES: [string, string][] = [["", "All"], ...(["ACTIVE", "ENDED", "EXPIRED"] as const).map((s): [string, string] => [s, enumLabel("chatStatus", s)])];

const VIEWS: [string, string, string][] = [
  ["", "Any activity", ""],
  ["talking", "Both talking", "Both members have written"],
  ["one_sided", "One-sided", "Only one member has written"],
  ["not_started", "Not started", "No message yet"],
  ["quiet", "Gone quiet", "Open, but no message for 48 hours"],
  ["expiring", "Ending soon", "Open and ends within 3 days"],
  ["reported", "Reported", "A member reported this chat"],
  ["paused", "Paused for review", "Paused while reports are reviewed"],
];

const SORTS: [string, string][] = [
  ["last_message", "Last message"],
  ["newest", "Newest chat"],
  ["most_messages", "Most messages"],
  ["expiring", "Ending soonest"],
];

const HOUR = 60 * 60 * 1000;

/** «5 min ago» / «3 h ago» / «2 d ago» */
function ago(iso: string | null, now: number): string {
  if (!iso) return "—";
  const ms = now - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < HOUR) return `${Math.round(ms / 60_000)} min ago`;
  if (ms < 24 * HOUR) return `${Math.round(ms / HOUR)} h ago`;
  return `${Math.round(ms / (24 * HOUR))} d ago`;
}

/** Days left for an open chat, or null */
function daysLeft(c: ChatRow, now: number): number | null {
  if (c.status !== "ACTIVE") return null;
  return Math.max(0, Math.ceil((new Date(c.expiresAt).getTime() - now) / (24 * HOUR)));
}

/** Every in-app chat with its activity; «View» opens the full message history. */
export default function AdminChatsPage() {
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [view, setView] = useState("");
  const [sort, setSort] = useState("last_message");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [ending, setEnding] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), sort });
    if (status) params.set("status", status);
    if (view) params.set("view", view);
    if (search) params.set("q", search);
    try {
      const res = await fetch(`/api/admin/chats?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      setRows(d.chats ?? []);
      setPages(d.totalPages ?? 1);
      setTotal(d.total ?? 0);
      setSummary(d.summary ?? null);
      setLoadedAt(Date.now());
    } catch {
      setError("Could not load chats.");
    } finally {
      setLoading(false);
    }
  }, [page, status, view, sort, search]);

  useEffect(() => {
    load();
  }, [load]);

  const pick = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const [smsing, setSmsing] = useState<string | null>(null);
  async function sendSms(c: ChatRow) {
    if (!confirm(`Send an SMS now to ${(c.sms?.members ?? []).map((m) => m.name).join(" & ") || "the member"} (chat not started)?`)) return;
    setSmsing(c.id);
    const res = await fetch(`/api/admin/chats/${c.id}/sms`, { method: "POST" }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setSmsing(null);
    if (!res?.ok) alert(data?.error === "both_talking" ? "Both members are already talking — no SMS." : "SMS could not be sent.");
    else alert(`Result: ${(data?.results ?? []).map((r: string) => SMS_LABEL[r] ?? r).join(", ")}`);
    load();
  }

  async function endChat(c: ChatRow) {
    const names = c.people.map((p) => p.firstName).join(" & ");
    if (!confirm(`End the chat between ${names}? Both are told.`)) return;
    setEnding(c.id);
    setError("");
    const res = await fetch(`/api/admin/chats/${c.id}/end`, { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setError(d.error || "Could not end the chat.");
    }
    setEnding(null);
    load();
  }

  const now = loadedAt;
  const stat = (label: string, value: number | undefined, onClick: () => void, active: boolean, tone = "") => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/60",
        active && "border-primary ring-1 ring-primary",
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-semibold tabular-nums", tone)}>{value ?? "—"}</div>
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold">
            <MessagesSquare className="h-7 w-7 text-primary" />
            Chats
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">Open a chat to read its full message history. Click a number to filter.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn("me-1 h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh{loadedAt ? ` · ${new Date(loadedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Amman", hour: "2-digit", minute: "2-digit" })}` : ""}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {stat("Open now", summary?.open, () => pick(() => { setStatus("ACTIVE"); setView(""); }), status === "ACTIVE" && !view)}
        {stat("Talked in 24 h", summary?.talkedToday, () => pick(() => { setStatus(""); setView(""); setSort("last_message"); }), false, "text-emerald-700")}
        {stat("Not started", summary?.notStarted, () => pick(() => { setStatus("ACTIVE"); setView("not_started"); }), view === "not_started", "text-amber-700")}
        {stat("One-sided", summary?.oneSided, () => pick(() => { setStatus("ACTIVE"); setView("one_sided"); }), view === "one_sided", "text-amber-700")}
        {stat("Gone quiet", summary?.quiet, () => pick(() => { setStatus("ACTIVE"); setView("quiet"); }), view === "quiet")}
        {stat("Ending ≤ 3 days", summary?.expiring, () => pick(() => { setStatus("ACTIVE"); setView("expiring"); setSort("expiring"); }), view === "expiring")}
        {stat("Reported", summary?.reported, () => pick(() => { setStatus(""); setView("reported"); }), view === "reported", "text-destructive")}
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <SearchBox value={query} onChange={setQuery} onSubmit={() => pick(() => setSearch(query.trim()))} />
          <div className="flex flex-wrap items-center gap-2">
            {STATUSES.map(([v, l]) => (
              <button
                key={`s-${l}`}
                type="button"
                onClick={() => pick(() => setStatus(v))}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  status === v ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
                )}
              >
                {l}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Sort
              <select value={sort} onChange={(e) => pick(() => setSort(e.target.value))} className="rounded-md border bg-background px-2 py-1 text-sm text-foreground">
                {SORTS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {VIEWS.map(([v, l, hint]) => (
              <button
                key={`v-${l}`}
                type="button"
                title={hint}
                onClick={() => pick(() => setView(v))}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  view === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {loading ? "Loading…" : `${total} chat${total === 1 ? "" : "s"}`}
            {search && <> · search «{search}» <button type="button" className="text-primary hover:underline" onClick={() => pick(() => { setSearch(""); setQuery(""); })}>clear</button></>}
          </p>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          {loading && rows.length === 0 ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No chats match.</p>
          ) : (
            <div className={cn("overflow-x-auto", loading && "opacity-60")}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pe-4 font-medium">Between</th>
                    <th className="py-2 pe-4 font-medium">Status</th>
                    <th className="py-2 pe-4 font-medium">Last message</th>
                    <th className="py-2 pe-4 text-right font-medium">Messages</th>
                    <th className="hidden py-2 pe-4 font-medium md:table-cell">Started</th>
                    <th className="hidden py-2 pe-4 font-medium md:table-cell">Ends / ended</th>
                    <th className="hidden py-2 pe-4 font-medium lg:table-cell">Not started · SMS</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const left = daysLeft(c, now);
                    return (
                      <tr key={c.id} className={cn("border-b last:border-0", c.reported && "bg-destructive/5")}>
                        <td className="py-3 pe-4">
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                            {c.people.map((p, i) => (
                              <span key={p.id} className="whitespace-nowrap">
                                {i > 0 && <span className="me-1.5 text-muted-foreground">&amp;</span>}
                                <bdi><PersonLink p={p} hash={`#chat-${c.id}`} /></bdi>
                                <span className="ms-1 text-xs tabular-nums text-muted-foreground" title="Messages sent">({p.messages})</span>
                              </span>
                            ))}
                            {c.reported && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                                <Flag className="h-3 w-3" /> Reported
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 pe-4">
                          <StateBadge value={c.status} group="chatStatus" />
                          {c.endedBy === "paused" && <div className="mt-1 text-xs text-amber-700">Paused for review</div>}
                        </td>
                        <td className="py-3 pe-4 whitespace-nowrap">
                          {c.lastAt ? (
                            <>
                              <div className="tabular-nums">{ago(c.lastAt, now)}</div>
                              <div className="text-xs text-muted-foreground">by {c.lastBy ?? "—"}</div>
                            </>
                          ) : (
                            <span className="text-xs text-amber-700">No message yet</span>
                          )}
                        </td>
                        <td className="py-3 pe-4 text-right tabular-nums">
                          {c.messages}
                          {c.unread > 0 && <div className="text-xs text-muted-foreground">{c.unread} unread</div>}
                        </td>
                        <td className="hidden py-3 pe-4 text-muted-foreground md:table-cell">{fmtDate(c.createdAt)}</td>
                        <td className="hidden py-3 pe-4 md:table-cell">
                          {c.endedAt ? (
                            <span className="text-muted-foreground">
                              {fmtDate(c.endedAt)} · {c.endedBy === "admin" ? "by admin" : c.endedBy === "paused" ? "paused" : c.endedBy === "system" ? "system" : `by ${c.endedBy}`}
                            </span>
                          ) : left !== null ? (
                            <span className={cn(left <= 3 ? "font-medium text-amber-700" : "text-muted-foreground")}>
                              {left === 0 ? "today" : `in ${left} d`}
                              {c.extended && <span className="ms-1 text-xs">(extended)</span>}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{fmtDate(c.expiresAt)}</span>
                          )}
                        </td>
                        <td className="hidden py-3 pe-4 lg:table-cell">
                          <SmsCell chat={c} sending={smsing === c.id} onSend={() => sendSms(c)} />
                        </td>
                        <td className="space-x-2 whitespace-nowrap py-3 text-right">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/admin/chats/${c.id}`}><Eye className="me-1 h-3 w-3" />View</Link>
                          </Button>
                          {c.status === "ACTIVE" && (
                            <Button size="sm" variant="outline" disabled={ending === c.id} onClick={() => endChat(c)}>
                              {ending === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "End chat"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} pages={pages} onPage={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}

const SMS_LABEL: Record<string, string> = {
  sent: "SMS sent",
  sent_admin: "SMS sent (admin)",
  has_push: "Has push — no SMS",
  already_today: "Already got an SMS today — sent on a later day",
  quiet: "Night (23:00–09:00) — sent after 9am",
  opted_out: "Turned chat notices off",
  unknown_push: "Push status unknown — retrying",
  failed: "SMS failed — retrying",
  skipped: "Not eligible (test / suspended)",
  disabled: "SMS notices are switched off",
};

function SmsCell({ chat, sending, onSend }: { chat: ChatRow; sending: boolean; onSend: () => void }) {
  if (!chat.sms) return <span className="text-muted-foreground">—</span>;
  if (chat.sms.talking) return <span className="text-xs text-muted-foreground">Both talking · SMS only for messages unread 2 h+ (no push, max 1 a day)</span>;
  const pending = chat.sms.members.filter((m) => m.status !== "sent" && m.status !== "sent_admin");
  return (
    <div className="flex flex-col gap-1 text-xs">
      {chat.sms.members.map((m) => {
        const sent = m.status === "sent" || m.status === "sent_admin";
        return (
          <span key={m.name} className={sent ? "text-emerald-700" : "text-muted-foreground"}>
            <span className="font-medium text-foreground">{m.name}</span> hasn&apos;t written ·{" "}
            {m.status ? SMS_LABEL[m.status] ?? m.status : "No SMS yet (sent after 2 h if no push)"}
            {m.at ? ` · ${new Date(m.at).toLocaleString("en-GB", { timeZone: "Asia/Amman", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
          </span>
        );
      })}
      {pending.length > 0 && chat.status === "ACTIVE" && (
        <Button size="sm" variant="secondary" className="h-7 w-fit px-2 text-xs" disabled={sending} onClick={onSend}>
          {sending ? "Sending…" : "Send SMS now"}
        </Button>
      )}
    </div>
  );
}
