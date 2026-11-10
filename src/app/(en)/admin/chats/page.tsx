"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Flag, Loader2, MessagesSquare, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { fmtDate, fmtDateTime, Pager, PersonLink, SearchBox, StateBadge, type PersonRef } from "@/components/admin/admin-list-bits";
import { enumLabel } from "@/lib/admin/enum-labels";
import { AdminEmptyState, AdminLoadError } from "@/components/admin/admin-states";
import { useConfirm } from "@/components/admin/confirm-dialog";

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
  const confirm = useConfirm();

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
    const names = c.sms?.members ?? [];
    const ok = await confirm({
      title: "Send an SMS now?",
      description: (
        <>
          To{" "}
          {names.length
            ? names.map((m, i) => (
                <span key={m.name}>
                  {i > 0 && " & "}
                  <bdi>{m.name}</bdi>
                </span>
              ))
            : "the member"}{" "}
          (chat not started). Still at most one SMS a day per member.
        </>
      ),
      confirmLabel: "Send SMS",
    });
    if (!ok) return;
    setSmsing(c.id);
    const res = await fetch(`/api/admin/chats/${c.id}/sms`, { method: "POST" }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setSmsing(null);
    if (!res?.ok) {
      toast.error(
        data?.error === "both_talking"
          ? "Both members are already talking — no SMS."
          : data?.error === "sms_off"
            ? "Notice SMS are switched off (sms_notices_enabled): nothing was sent."
            : "SMS could not be sent.",
      );
    } else {
      // Green only when every SMS actually went (ADM-20)
      const results: string[] = data?.results ?? [];
      const text = `Result: ${results.map((r) => SMS_LABEL[r] ?? r).join(", ")}`;
      if (results.length && results.every((r) => r === "sent_admin" || r === "sent")) toast.success(text);
      else toast.warning(text);
    }
    load();
  }

  async function endChat(c: ChatRow) {
    const ok = await confirm({
      title: "End this chat?",
      description: (
        <>
          The chat between{" "}
          {c.people.map((p, i) => (
            <span key={p.id}>
              {i > 0 && " & "}
              <bdi>{p.firstName}</bdi>
            </span>
          ))}{" "}
          ends now. Both are told. This can&apos;t be undone.
        </>
      ),
      confirmLabel: "End chat",
      destructive: true,
    });
    if (!ok) return;
    setEnding(c.id);
    const res = await fetch(`/api/admin/chats/${c.id}/end`, { method: "POST" }).catch(() => null);
    if (res?.ok) toast.success("Chat ended");
    else {
      const d = res ? await res.json().catch(() => ({})) : {};
      toast.error(d.error || "Could not end the chat.");
    }
    setEnding(null);
    load();
  }

  const now = loadedAt;
  const showSms = rows.some(needsSmsHelp);
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
          <h1 className="flex items-center gap-3 text-2xl font-display">
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
            {loading ? "Loading…" : error ? "—" : `${total} chat${total === 1 ? "" : "s"}`}
            {search && <> · search «{search}» <button type="button" className="text-primary hover:underline" onClick={() => pick(() => { setSearch(""); setQuery(""); })}>clear</button></>}
          </p>
        </CardHeader>
        <CardContent>
          {error ? (
            <AdminLoadError message={error} onRetry={load} />
          ) : loading && rows.length === 0 ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <AdminEmptyState icon={MessagesSquare} title="No chats match" hint="Try another filter or clear the search." />
          ) : (
            <>
              {/* Phone: stacked cards */}
              <div className={cn("space-y-3 md:hidden", loading && "opacity-60")}>
                {rows.map((c) => (
                  <div key={c.id} className={cn("space-y-2 rounded-lg border p-3 text-sm", c.reported && "bg-destructive/5")}>
                    <Between chat={c} />
                    <div className="flex flex-wrap items-center gap-2">
                      <StateBadge value={c.status} group="chatStatus" />
                      {c.endedBy === "paused" && <span className="text-xs text-amber-700">Paused for review</span>}
                      <span className="ms-auto text-xs tabular-nums text-muted-foreground">
                        {c.messages} message{c.messages === 1 ? "" : "s"}
                        {c.unread > 0 && ` · ${c.unread} unread`}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">
                        Last: <LastMessage chat={c} now={now} inline />
                      </span>
                      <EndsCell chat={c} now={now} />
                    </div>
                    {needsSmsHelp(c) && <SmsCell chat={c} sending={smsing === c.id} onSend={() => sendSms(c)} />}
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" asChild>
                        <Link href={`/admin/chats/${c.id}`}><Eye className="me-1 h-3 w-3" />View</Link>
                      </Button>
                      {c.status === "ACTIVE" && (
                        <Button size="sm" variant="outline" className="flex-1" disabled={ending === c.id} onClick={() => endChat(c)}>
                          {ending === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "End chat"}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Tablet and up: table */}
              <div className={cn("hidden overflow-x-auto md:block", loading && "opacity-60")}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pe-4 font-medium">Between</th>
                      <th className="py-2 pe-4 font-medium">Status</th>
                      <th className="py-2 pe-4 font-medium">Last message</th>
                      <th className="py-2 pe-4 text-right font-medium">Messages</th>
                      <th className="py-2 pe-4 font-medium">Started</th>
                      <th className="py-2 pe-4 font-medium">Ends / ended</th>
                      {showSms && <th className="hidden py-2 pe-4 font-medium lg:table-cell" title="No automatic chat SMS since 7 Nov 2026; «Send SMS now» still works (max 1 a day)">Not started · SMS</th>}
                      <th className="py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id} className={cn("border-b last:border-0", c.reported && "bg-destructive/5")}>
                        <td className="py-3 pe-4"><Between chat={c} /></td>
                        <td className="py-3 pe-4">
                          <StateBadge value={c.status} group="chatStatus" />
                          {c.endedBy === "paused" && <div className="mt-1 text-xs text-amber-700">Paused for review</div>}
                        </td>
                        <td className="py-3 pe-4 whitespace-nowrap"><LastMessage chat={c} now={now} /></td>
                        <td className="py-3 pe-4 text-right tabular-nums">
                          {c.messages}
                          {c.unread > 0 && <div className="text-xs text-muted-foreground">{c.unread} unread</div>}
                        </td>
                        <td className="py-3 pe-4 text-muted-foreground">{fmtDate(c.createdAt)}</td>
                        <td className="py-3 pe-4"><EndsCell chat={c} now={now} /></td>
                        {showSms && (
                          <td className="hidden py-3 pe-4 lg:table-cell">
                            {needsSmsHelp(c) ? <SmsCell chat={c} sending={smsing === c.id} onSend={() => sendSms(c)} /> : <span className="text-muted-foreground">—</span>}
                          </td>
                        )}
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
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {!error && <Pager page={page} pages={pages} onPage={setPage} />}
        </CardContent>
      </Card>
    </div>
  );
}

/** Names (with messages sent) and the reported tag */
function Between({ chat }: { chat: ChatRow }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {chat.people.map((p, i) => (
        <span key={p.id} className="whitespace-nowrap">
          {i > 0 && <span className="me-1.5 text-muted-foreground">&amp;</span>}
          <PersonLink p={p} hash={`#chat-${chat.id}`} />
          <span className="ms-1 text-xs tabular-nums text-muted-foreground" title="Messages sent">({p.messages})</span>
        </span>
      ))}
      {chat.reported && (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
          <Flag className="h-3 w-3" /> Reported
        </span>
      )}
    </div>
  );
}

function LastMessage({ chat, now, inline }: { chat: ChatRow; now: number; inline?: boolean }) {
  if (!chat.lastAt) return <span className="text-xs text-amber-700">No message yet</span>;
  if (inline) return <>{ago(chat.lastAt, now)} by <bdi>{chat.lastBy ?? "—"}</bdi></>;
  return (
    <>
      <div className="tabular-nums" title={fmtDateTime(chat.lastAt)}>{ago(chat.lastAt, now)}</div>
      <div className="text-xs text-muted-foreground">by <bdi>{chat.lastBy ?? "—"}</bdi></div>
    </>
  );
}

function EndsCell({ chat, now }: { chat: ChatRow; now: number }) {
  const left = daysLeft(chat, now);
  if (chat.endedAt) {
    const by = chat.endedBy === "admin" ? "by admin" : chat.endedBy === "paused" ? "paused" : chat.endedBy === "system" ? "system" : <>by <bdi>{chat.endedBy}</bdi></>;
    return <span className="text-muted-foreground">{fmtDate(chat.endedAt)} · {by}</span>;
  }
  if (left === null) return <span className="text-muted-foreground">{fmtDate(chat.expiresAt)}</span>;
  return (
    <span className={cn(left <= 3 ? "font-medium text-amber-700" : "text-muted-foreground")}>
      {left === 0 ? "ends today" : `ends in ${left} d`}
      {chat.extended && <span className="ms-1 text-xs">(extended)</span>}
    </span>
  );
}

/** The SMS explanation only helps chats where someone hasn't written yet */
function needsSmsHelp(c: ChatRow): boolean {
  return !!c.sms && !c.sms.talking && c.sms.members.length > 0;
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
  if (!chat.sms) return null;
  const pending = chat.sms.members.filter((m) => m.status !== "sent" && m.status !== "sent_admin");
  return (
    <div className="flex flex-col gap-1 text-xs">
      {chat.sms.members.map((m) => {
        const sent = m.status === "sent" || m.status === "sent_admin";
        return (
          <span key={m.name} className={sent ? "text-emerald-700" : "text-muted-foreground"}>
            <bdi className="font-medium text-foreground">{m.name}</bdi> hasn&apos;t written ·{" "}
            {m.status ? SMS_LABEL[m.status] ?? m.status : "No automatic chat SMS (off since 7 Nov) · use «Send SMS now»"}
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
