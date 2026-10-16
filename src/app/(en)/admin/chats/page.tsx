"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock, MessagesSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtDate, Pager, PersonLink, SearchBox, StateBadge, type PersonRef } from "@/components/admin/admin-list-bits";
import { enumLabel } from "@/lib/admin/enum-labels";

interface ChatRow {
  id: string;
  people: PersonRef[];
  status: "ACTIVE" | "ENDED" | "EXPIRED";
  createdAt: string;
  expiresAt: string;
  extended: boolean;
  endedAt: string | null;
  endedBy: string | null;
  messages: number;
}

const FILTERS: [string, string][] = [["", "All"], ...(["ACTIVE", "ENDED", "EXPIRED"] as const).map((s): [string, string] => [s, enumLabel("chatStatus", s)])];

/** Every in-app chat — dates, status and message counts only. Admins never see message content. */
export default function AdminChatsPage() {
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [ending, setEnding] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set("status", status);
    if (search) params.set("q", search);
    try {
      const res = await fetch(`/api/admin/chats?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      setRows(d.chats ?? []);
      setPages(d.totalPages ?? 1);
    } catch {
      setError("Could not load chats.");
    } finally {
      setLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => {
    load();
  }, [load]);

  async function endChat(c: ChatRow) {
    const names = c.people.map((p) => p.firstName).join(" & ");
    if (!confirm(`End the chat between ${names}? Both are told; messages are not read.`)) return;
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold">
          <MessagesSquare className="h-7 w-7 text-primary" />
          Chats
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> Dates, status and message counts only — message content is private.
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>All chats</CardTitle>
          <SearchBox value={query} onChange={setQuery} onSubmit={() => { setSearch(query.trim()); setPage(1); }} />
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(([v, l]) => (
              <button
                key={l}
                type="button"
                onClick={() => { setStatus(v); setPage(1); }}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  status === v ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No chats.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pe-4 font-medium">Between</th>
                    <th className="py-2 pe-4 font-medium">Status</th>
                    <th className="hidden py-2 pe-4 font-medium md:table-cell">Started</th>
                    <th className="hidden py-2 pe-4 font-medium md:table-cell">Expires</th>
                    <th className="hidden py-2 pe-4 font-medium md:table-cell">Ended</th>
                    <th className="py-2 pe-4 text-right font-medium">Messages</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-3 pe-4">
                        <PersonLink p={c.people[0]} hash={`#chat-${c.id}`} /> <span className="text-muted-foreground">&amp;</span>{" "}
                        <PersonLink p={c.people[1]} hash={`#chat-${c.id}`} />
                      </td>
                      <td className="py-3 pe-4"><StateBadge value={c.status} group="chatStatus" /></td>
                      <td className="hidden py-3 pe-4 text-muted-foreground md:table-cell">{fmtDate(c.createdAt)}</td>
                      <td className="hidden py-3 pe-4 text-muted-foreground md:table-cell">
                        {fmtDate(c.expiresAt)}
                        {c.extended && <span className="ms-1 text-xs">(extended)</span>}
                      </td>
                      <td className="hidden py-3 pe-4 text-muted-foreground md:table-cell">
                        {c.endedAt ? `${fmtDate(c.endedAt)} · ${c.endedBy === "admin" ? "by admin" : `by ${c.endedBy}`}` : "—"}
                      </td>
                      <td className="py-3 pe-4 text-right tabular-nums">{c.messages}</td>
                      <td className="py-3 text-right">
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
          )}
          <Pager page={page} pages={pages} onPage={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}
