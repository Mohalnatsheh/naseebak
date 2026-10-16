"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HeartHandshake, Loader2, ChevronLeft, ChevronRight, Users, MessageCircle, Lock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { enumLabel } from "@/lib/admin/enum-labels";

interface Person {
  id: string;
  firstName: string;
  lastName: string;
}

interface IntroRow {
  id: string;
  type: "FAMILY" | "CHAT";
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED";
  createdAt: string;
  respondedAt: string | null;
  expiresAt: string;
  sender: Person;
  receiver: Person;
}

interface Stats {
  pending: number;
  accepted: number;
  declined: number;
  expired: number;
  activeChats: number;
}

const STATUS_STYLE: Record<IntroRow["status"], string> = {
  PENDING: "bg-amber-100 text-amber-800",
  ACCEPTED: "bg-emerald-100 text-emerald-800",
  DECLINED: "bg-muted text-muted-foreground",
  EXPIRED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-muted text-muted-foreground",
};

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function PersonLink({ p }: { p: Person }) {
  return (
    <Link href={`/admin/users/${p.id}`} className="font-medium text-primary hover:underline">
      {p.firstName} {p.lastName}
    </Link>
  );
}

export default function AdminIntroductionsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<IntroRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (type) params.set("type", type);
    if (status) params.set("status", status);
    if (search) params.set("q", search);
    setLoadError(false);
    fetch(`/api/admin/introductions?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        setStats(d.stats ?? null);
        setRows(d.requests ?? []);
        setPages(d.totalPages ?? 1);
      })
      .catch(() => alive && setLoadError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [page, type, status, search]);

  const tiles = stats
    ? [
        { label: "Waiting for answer", value: stats.pending, tone: "text-amber-700" },
        { label: "Accepted", value: stats.accepted, tone: "text-emerald-700" },
        { label: "Declined", value: stats.declined, tone: "text-muted-foreground" },
        { label: "Expired", value: stats.expired, tone: "text-muted-foreground" },
        { label: "Active chats", value: stats.activeChats, tone: "text-primary" },
      ]
    : [];

  const filterButton = (label: string, active: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold">
          <HeartHandshake className="h-7 w-7 text-primary" />
          Introductions
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
          Family introduction and chat requests between matched users. Users handle these themselves.
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> Message content is private and isn&apos;t shown here.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link href="/admin/matches" className="rounded-md border px-3 py-1.5 hover:bg-muted">Matches</Link>
          <Link href="/admin/chats" className="rounded-md border px-3 py-1.5 hover:bg-muted">Chats</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">{t.label}</p>
              <p className={cn("mt-1 text-2xl font-bold", t.tone)}>{t.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>Requests</CardTitle>
          <form
            className="flex max-w-md gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(query.trim());
              setPage(1);
            }}
          >
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name or phone" />
            <Button type="submit" variant="outline" size="icon" aria-label="Search">
              <Search className="h-4 w-4" />
            </Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {[["", "All types"], ...(["FAMILY", "CHAT"] as const).map((v) => [v, enumLabel("introType", v)])].map(([v, l]) =>
              filterButton(l, type === v, () => {
                setType(v);
                setPage(1);
              })
            )}
            <span className="mx-1 w-px bg-border" />
            {[["", "Any status"], ...(["PENDING", "ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"] as const).map((v) => [v, enumLabel("requestStatus", v)])].map(
              ([v, l]) =>
                filterButton(l, status === v, () => {
                  setStatus(v);
                  setPage(1);
                })
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : loadError ? (
            <p className="py-10 text-center text-sm text-destructive">Could not load requests.</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{search ? "No requests for this person." : "No requests yet."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pe-4 font-medium">From → To</th>
                    <th className="py-2 pe-4 font-medium">Type</th>
                    <th className="py-2 pe-4 font-medium">Status</th>
                    <th className="hidden py-2 pe-4 font-medium md:table-cell">Sent</th>
                    <th className="hidden py-2 font-medium md:table-cell">Answered</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-3 pe-4">
                        <PersonLink p={r.sender} /> <span className="text-muted-foreground">→</span> <PersonLink p={r.receiver} />
                      </td>
                      <td className="py-3 pe-4">
                        <span className="inline-flex items-center gap-1.5">
                          {r.type === "FAMILY" ? <Users className="h-4 w-4 text-primary" /> : <MessageCircle className="h-4 w-4 text-primary" />}
                          {enumLabel("introType", r.type)}
                        </span>
                      </td>
                      <td className="py-3 pe-4">
                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_STYLE[r.status])}>
                          {enumLabel("requestStatus", r.status)}
                        </span>
                      </td>
                      <td className="hidden py-3 pe-4 text-muted-foreground md:table-cell">{fmt(r.createdAt)}</td>
                      <td className="hidden py-3 text-muted-foreground md:table-cell">{fmt(r.respondedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
