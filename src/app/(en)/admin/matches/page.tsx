"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Heart, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDate, Pager, PersonLink, SearchBox, StateBadge, type PersonRef } from "@/components/admin/admin-list-bits";
import { enumLabel } from "@/lib/admin/enum-labels";
import { cn } from "@/lib/utils";
import { AdminEmptyState, AdminLoadError } from "@/components/admin/admin-states";

interface RequestState {
  status: string;
  senderId: string;
  /** Opened automatically because both chose this path on «مهتم» */
  auto?: boolean;
}

const OUTCOME_LABEL: Record<string, string> = { CONTINUING: "Continuing", NOT_A_MATCH: "Not a match", ENGAGED: "Engaged" };

interface MatchRow {
  id: string;
  createdAt: string;
  people: PersonRef[];
  family: RequestState | null;
  chatRequest: RequestState | null;
  chat: { id: string; status: string } | null;
  visit: string | null;
  guardianShared: { female: boolean; male: boolean } | null;
  outcome: { female: string | null; male: string | null; followUps: number };
}

const STALLED: [string, string, string][] = [
  ["", "All", ""],
  ["no_request", "No chat or family request yet", "Matched, but neither person has asked for a chat or a family introduction"],
  ["waiting", "Request waiting for an answer", "A family or chat request is open and not answered yet"],
  ["not_started", "Chat never started", "A chat exists but nobody has written"],
];

export default function AdminMatchesPage() {
  return (
    <Suspense>
      <MatchesList />
    </Suspense>
  );
}

/** Mutual matches and where each one stands (family / chat requests, chat, legacy visit). */
function MatchesList() {
  // `?q=` comes from links on other admin pages (a chat links to its match by id)
  const initialSearch = useSearchParams().get("q")?.trim() ?? "";
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [stalled, setStalled] = useState("");
  // The list is loading until the request for the current page + filters has settled
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${page}\n${search}\n${stalled}\n${attempt}`;
  const [settled, setSettled] = useState<{ key: string; error: string } | null>(null);
  const loading = settled?.key !== requestKey;
  const error = settled?.key === requestKey ? settled.error : "";

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("q", search);
    if (stalled) params.set("stalled", stalled);
    fetch(`/api/admin/matches?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        setRows(d.matches ?? []);
        setPages(d.totalPages ?? 1);
        setTotal(d.total ?? 0);
        setSettled({ key: requestKey, error: "" });
      })
      .catch(() => alive && setSettled({ key: requestKey, error: "Could not load matches." }));
    return () => {
      alive = false;
    };
  }, [page, search, stalled, requestKey]);

  // The visit column is legacy: only when a row on this page has one
  const showVisit = rows.some((m) => m.visit);
  const sender = (m: MatchRow, r: RequestState) => m.people.find((p) => p.id === r.senderId)?.firstName ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-display">
          <Heart className="h-7 w-7 text-primary" />
          Matches
        </h1>
        <p className="mt-1 text-muted-foreground">Mutual matches and the latest family / chat request on each.</p>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>All matches ({total})</CardTitle>
          <SearchBox value={query} onChange={setQuery} onSubmit={() => { setSearch(query.trim()); setPage(1); }} />
          <div className="flex flex-wrap gap-2">
            {STALLED.map(([v, l, hint]) => (
              <button
                key={l}
                type="button"
                title={hint}
                onClick={() => { setStalled(v); setPage(1); }}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  stalled === v ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : error ? (
            <AdminLoadError message={error} onRetry={() => setAttempt((n) => n + 1)} />
          ) : rows.length === 0 ? (
            <AdminEmptyState icon={Heart} title="No matches" hint={search || stalled ? "Try another filter or clear the search." : undefined} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pe-4 font-medium">Between</th>
                    <th className="hidden py-2 pe-4 font-medium md:table-cell">Matched</th>
                    <th className="py-2 pe-4 font-medium">Family introduction</th>
                    <th className="py-2 pe-4 font-medium">Chat request</th>
                    <th className="py-2 pe-4 font-medium">Chat</th>
                    {showVisit && <th className="hidden py-2 pe-4 font-medium md:table-cell">Visit (legacy)</th>}
                    <th className="py-2 font-medium">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="py-3 pe-4">
                        <PersonLink p={m.people[0]} /> <span className="text-muted-foreground">&amp;</span> <PersonLink p={m.people[1]} />
                      </td>
                      <td className="hidden py-3 pe-4 text-muted-foreground md:table-cell">{fmtDate(m.createdAt)}</td>
                      <td className="py-3 pe-4">
                        {m.family ? (
                          <span className="inline-flex flex-col gap-0.5">
                            <StateBadge value={m.family.status} />
                            <span className="text-xs text-muted-foreground">{m.family.auto ? "automatic (both chose)" : `from ${sender(m, m.family)}`}</span>
                            {m.guardianShared && (
                              <span className="text-xs text-muted-foreground">
                                Guardian shared: <bdi>{m.people[0].firstName}</bdi> {m.guardianShared.female ? "✓" : "✗"} · <bdi>{m.people[1].firstName}</bdi> {m.guardianShared.male ? "✓" : "✗"}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 pe-4">
                        {m.chatRequest ? (
                          <span className="inline-flex flex-col gap-0.5">
                            <StateBadge value={m.chatRequest.status} />
                            <span className="text-xs text-muted-foreground">{m.chatRequest.auto ? "automatic (both chose)" : `from ${sender(m, m.chatRequest)}`}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 pe-4">
                        {m.chat ? (
                          <Link href={`/admin/chats/${m.chat.id}`} className="hover:opacity-80" title="Open this chat">
                            <StateBadge value={m.chat.status} group="chatStatus" />
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      {showVisit && (
                        <td className="hidden py-3 pe-4 text-muted-foreground md:table-cell">
                          {m.visit ? enumLabel("visitStatus", m.visit) : "—"}
                        </td>
                      )}
                      <td className="py-3 text-xs">
                        {m.outcome.female || m.outcome.male ? (
                          <span className="inline-flex flex-col gap-0.5">
                            <span>{m.people[0].firstName}: {m.outcome.female ? OUTCOME_LABEL[m.outcome.female] : "—"}</span>
                            <span>{m.people[1].firstName}: {m.outcome.male ? OUTCOME_LABEL[m.outcome.male] : "—"}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{m.outcome.followUps > 0 ? `Asked ${m.outcome.followUps}×` : "—"}</span>
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
