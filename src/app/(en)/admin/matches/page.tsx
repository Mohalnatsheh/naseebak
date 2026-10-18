"use client";

import { useEffect, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDate, Pager, PersonLink, SearchBox, StateBadge, type PersonRef } from "@/components/admin/admin-list-bits";
import { enumLabel } from "@/lib/admin/enum-labels";

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

/** Mutual matches and where each one stands (family / chat requests, chat, legacy visit). */
export default function AdminMatchesPage() {
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  // The list is loading until the request for the current page + search has settled
  const requestKey = `${page}\n${search}`;
  const [settled, setSettled] = useState<{ key: string; error: string } | null>(null);
  const loading = settled?.key !== requestKey;
  const error = settled?.key === requestKey ? settled.error : "";

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("q", search);
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
  }, [page, search, requestKey]);

  const sender = (m: MatchRow, r: RequestState) => m.people.find((p) => p.id === r.senderId)?.firstName ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold">
          <Heart className="h-7 w-7 text-primary" />
          Matches
        </h1>
        <p className="mt-1 text-muted-foreground">Mutual matches and the latest family / chat request on each.</p>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>All matches ({total})</CardTitle>
          <SearchBox value={query} onChange={setQuery} onSubmit={() => { setSearch(query.trim()); setPage(1); }} />
        </CardHeader>
        <CardContent>
          {error && <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No matches.</p>
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
                    <th className="hidden py-2 pe-4 font-medium md:table-cell">Visit (legacy)</th>
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
                                Guardian shared: {m.people[0].firstName} {m.guardianShared.female ? "✓" : "✗"} · {m.people[1].firstName} {m.guardianShared.male ? "✓" : "✗"}
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
                        {m.chat ? <StateBadge value={m.chat.status} group="chatStatus" /> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="hidden py-3 pe-4 text-muted-foreground md:table-cell">
                        {m.visit ? enumLabel("visitStatus", m.visit) : "—"}
                      </td>
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
