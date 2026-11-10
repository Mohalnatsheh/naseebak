"use client";

import { useState, useEffect, useEffectEvent, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Users, ShieldCheck, ChevronLeft, ChevronRight, Ban, Loader2, CreditCard, Flag, CheckSquare, Square, Images, ExternalLink, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtAgo, fmtDate, fmtDateTime, plural } from "@/components/admin/admin-list-bits";
import { AdminEmptyState, AdminLoadError } from "@/components/admin/admin-states";
import { useConfirm } from "@/components/admin/confirm-dialog";
import { countryConfig, toCountry } from "@/lib/countries";
import { CountryFlag } from "@/components/shared/country-flag";

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  gender: string;
  /** "JO" | "SA" */
  country: string;
  role: string;
  status: string;
  isDeactivated: boolean;
  isFlagged: boolean;
  matchCredits: number;
  lastActiveAt: string | null;
  createdAt: string;
  profile: { isComplete: boolean; city: string | null } | null;
  photos: { id: string; url: string; isPrimary: boolean }[];
  _count: { matchesAsFemale: number; matchesAsMale: number; photos: number };
  /** app: signed in to the app (platform); web: website devices seen since 4 Nov 2026 */
  uses?: { app: "android" | "ios" | "unknown" | null; web: ("android" | "iphone" | "desktop")[] };
}

const WEB_LABEL = { android: "Android", iphone: "iPhone", desktop: "Computer" } as const;

/** «App · Android», «Web · iPhone»…; no record of either = the website before 4 Nov (device not known) */
function UsesBadges({ uses }: { uses?: UserRow["uses"] }) {
  if (!uses) return <span className="text-xs text-muted-foreground">—</span>;
  const app = uses.app && (uses.app === "ios" ? "iPhone" : uses.app === "android" ? "Android" : "device unknown");
  return (
    <div className="flex flex-wrap gap-1">
      {app && (
        <Badge className="text-xs whitespace-nowrap bg-accent/20 text-accent-foreground hover:bg-accent/20" title="Signed in to the app">
          App · {app}
        </Badge>
      )}
      {uses.web.map((w) => (
        <Badge key={w} variant="outline" className="text-xs whitespace-nowrap" title="Website, seen since 4 Nov 2026">
          Web · {WEB_LABEL[w]}
        </Badge>
      ))}
      {!app && uses.web.length === 0 && (
        <Badge variant="outline" className="text-xs whitespace-nowrap text-muted-foreground" title="Website; device not recorded before 4 Nov 2026">
          Web
        </Badge>
      )}
    </div>
  );
}

/** Only what needs attention: a normal account shows no status at all */
function AccountBadges({ u }: { u: UserRow }) {
  return (
    <>
      {u.role === "ADMIN" && <Badge variant="destructive" className="text-xs">Admin</Badge>}
      {u.status === "SUSPENDED" && (
        <Badge variant="outline" className="text-xs text-destructive border-destructive/30">
          <Ban className="h-3 w-3 me-1" />Suspended
        </Badge>
      )}
      {u.isDeactivated && <Badge variant="outline" className="text-xs text-destructive">Deactivated</Badge>}
      {u.isFlagged && (
        <Badge variant="outline" className="text-xs text-destructive border-destructive/30">
          <Flag className="h-3 w-3 me-1" />Flagged
        </Badge>
      )}
    </>
  );
}

function Avatar({ u }: { u: UserRow }) {
  if (u.photos.length > 0) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={(u.photos.find((p) => p.isPrimary) ?? u.photos[0]).url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover border" />;
  }
  return (
    <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
      {u.firstName.charAt(0)}
    </div>
  );
}

const FILTER_CLASS = "rounded-lg border border-input bg-background px-3 py-2 text-sm";

export default function AdminUsersPage() {
  const router = useRouter();
  const [photoUser, setPhotoUser] = useState<UserRow | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  /** The search actually applied: follows `search` after a short pause in typing */
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState("");
  const [status, setStatus] = useState("");
  const [uses, setUses] = useState("");
  const [credits, setCredits] = useState("");
  const [sort, setSort] = useState("joined");
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSuspending, setBulkSuspending] = useState(false);
  // Only the newest request may fill the list: a slow older one must not overwrite it
  const lastRequest = useRef(0);
  const [loadError, setLoadError] = useState("");
  const confirm = useConfirm();

  // Reloads when the page, a filter or the applied search changes
  const onListChange = useEffectEvent(() => {
    // A selection only applies to the rows on screen
    setSelectedIds(new Set());
    fetchUsers();
  });

  useEffect(() => {
    onListChange();
  }, [page, query, gender, status, uses, credits, sort]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  /** A filter or sort changed: back to the first page */
  function applied<T>(set: (value: T) => void) {
    return (value: T) => {
      set(value);
      setPage(1);
    };
  }

  async function fetchUsers() {
    const request = ++lastRequest.current;
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({ page: String(page), sort });
      if (query) params.set("search", query);
      if (gender) params.set("gender", gender);
      if (uses) params.set("uses", uses);
      if (status) params.set("status", status);
      if (credits) params.set("credits", credits);
      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json().catch(() => ({}));
      if (request !== lastRequest.current) return;
      if (!res.ok) {
        setLoadError(`Couldn't load the users (${res.status}).`);
        setUsers([]);
        return;
      }
      setUsers(data.users || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total ?? null);
    } catch (err) {
      console.error(err);
      if (request === lastRequest.current) setLoadError("Couldn't load the users. Check your connection.");
    } finally {
      if (request === lastRequest.current) setLoading(false);
    }
  }

  function toggleSelect(userId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleSelectAll() {
    const selectableUsers = users.filter((u) => u.role !== "ADMIN");
    if (selectedIds.size === selectableUsers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableUsers.map((u) => u.id)));
    }
  }

  async function handleBulkSuspend(action: "suspend" | "unsuspend") {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const ok = await confirm(
      action === "suspend"
        ? {
            title: `Suspend ${plural(count, "member")}?`,
            description: "They can't use the site or the app until unsuspended.",
            // ADM-23: say what else happens
            warning: "Their active chats end now (both sides are told) and they are signed out of the app.",
            confirmLabel: `Suspend ${plural(count, "member")}`,
            destructive: true,
          }
        : { title: `Unsuspend ${plural(count, "member")}?`, description: "They can sign in and use the site again.", confirmLabel: "Unsuspend" },
    );
    if (!ok) return;
    setBulkSuspending(true);
    try {
      const res = await fetch("/api/admin/users/bulk-suspend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, userIds: [...selectedIds] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || `Could not ${action} the selected users`);
        return;
      }
      const verb = action === "suspend" ? "Suspended" : "Unsuspended";
      const parts = [`${verb} ${plural(data.changed ?? 0, "member")}`];
      if (data.unchanged) parts.push(`${data.unchanged} already ${action === "suspend" ? "suspended" : "active"}`);
      if (data.failed?.length) parts.push(`${data.failed.length} failed (${data.failed[0].error})`);
      if (data.failed?.length) toast.error(parts.join(" · "));
      else toast.success(parts.join(" · "));
      setSelectedIds(new Set());
      await fetchUsers();
    } catch (err) {
      console.error(err);
      toast.error("Network error, please try again");
    } finally {
      setBulkSuspending(false);
    }
  }

  async function handleSuspend(e: React.MouseEvent, user: UserRow) {
    e.stopPropagation();
    const suspend = user.status !== "SUSPENDED";
    if (
      suspend &&
      !(await confirm({
        title: "Suspend this member?",
        description: <><bdi>{`${user.firstName} ${user.lastName}`}</bdi> can&apos;t use the site or the app until unsuspended.</>,
        warning: "Their active chats end now (both sides are told) and they are signed out of the app.",
        confirmLabel: "Suspend",
        destructive: true,
      }))
    )
      return;
    setSuspendingId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/suspend`, { method: "PUT" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Could not change the suspension");
        return;
      }
      await fetchUsers();
    } catch (err) {
      console.error(err);
      toast.error("Network error, please try again");
    } finally {
      setSuspendingId(null);
    }
  }

  /** Same button in the table and on the phone cards: quiet, it's on every row */
  function suspendButton(u: UserRow) {
    if (u.role === "ADMIN") return null;
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => handleSuspend(e, u)}
        disabled={suspendingId === u.id}
        className="text-xs text-muted-foreground hover:text-destructive"
      >
        {suspendingId === u.id ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <><Ban className="h-3 w-3 me-1" />{u.status === "SUSPENDED" ? "Unsuspend" : "Suspend"}</>
        )}
      </Button>
    );
  }

  function photosButton(u: UserRow) {
    if (u._count.photos === 0) return <span className="text-xs text-muted-foreground whitespace-nowrap">No photos</span>;
    return (
      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" aria-label={`Photos of ${u.firstName}: ${u._count.photos}`} onClick={(e) => { e.stopPropagation(); setPhotoUser(u); }}>
        <Images className="h-3.5 w-3.5" />
        {u._count.photos}
      </Button>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-display flex items-center gap-3">
            <Users className="h-7 w-7 text-primary" />
            User Management
          </h1>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/admin/users/export?${new URLSearchParams({ sort, ...(query && { search: query }), ...(gender && { gender }), ...(uses && { uses }), ...(status && { status }), ...(credits && { credits }) })}`}>
              <Download className="me-2 h-4 w-4" /> Download CSV
            </a>
          </Button>
        </div>
        <p className="text-muted-foreground mt-1">
          {total === null ? "View and manage all registered users" : `${total.toLocaleString("en-US")} member${total === 1 ? "" : "s"}`}
        </p>
      </div>

      {/* Search + Filters: apply as soon as they change */}
      <form onSubmit={(e) => e.preventDefault()} className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <Input
            aria-label="Search users"
            placeholder="Name, phone (07…), email or user id"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={gender} onChange={(e) => applied(setGender)(e.target.value)} aria-label="Gender" className={FILTER_CLASS}>
          <option value="">All Genders</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
        </select>
        <select value={status} onChange={(e) => applied(setStatus)(e.target.value)} aria-label="Account" className={FILTER_CLASS}>
          <option value="">All accounts</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="FLAGGED">Flagged</option>
        </select>
        <select value={credits} onChange={(e) => applied(setCredits)(e.target.value)} aria-label="Credits" className={FILTER_CLASS}>
          <option value="">Any credits</option>
          <option value="zero">0 credits</option>
        </select>
        <select value={uses} onChange={(e) => applied(setUses)(e.target.value)} aria-label="Website or app" className={FILTER_CLASS}>
          <option value="">Website + app</option>
          <option value="app">App users</option>
          <option value="web">Website only</option>
        </select>
        <select value={sort} onChange={(e) => applied(setSort)(e.target.value)} aria-label="Sort by" className={FILTER_CLASS}>
          <option value="joined">Newest members</option>
          <option value="lastActive">Last active</option>
          <option value="credits">Most credits</option>
        </select>
      </form>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-primary/5 border rounded-lg">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleBulkSuspend("suspend")}
            disabled={bulkSuspending}
          >
            {bulkSuspending ? <Loader2 className="h-3 w-3 animate-spin me-1" /> : <Ban className="h-3 w-3 me-1" />}
            Suspend
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkSuspend("unsuspend")}
            disabled={bulkSuspending}
          >
            <ShieldCheck className="h-3 w-3 me-1" />
            Unsuspend
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {/* Phones: stacked cards instead of a table that scrolls sideways */}
          <div className="divide-y md:hidden">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-3">
                  <div className="h-16 bg-muted animate-pulse rounded" />
                </div>
              ))
            ) : loadError ? (
              <AdminLoadError message={loadError} onRetry={fetchUsers} className="m-3" />
            ) : users.length === 0 ? (
              <AdminEmptyState icon={Users} title="No users found" hint="Try another search or filter." className="m-3" />
            ) : (
              users.map((u) => (
                <div key={u.id} className="space-y-2 p-3" onClick={() => router.push(`/admin/users/${u.id}`)}>
                  <div className="flex items-start gap-2">
                    {u.role !== "ADMIN" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSelect(u.id); }}
                        aria-label={`Select ${u.firstName} ${u.lastName}`}
                        aria-pressed={selectedIds.has(u.id)}
                        className="p-2 -m-2 text-muted-foreground"
                      >
                        {selectedIds.has(u.id) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                      </button>
                    )}
                    <Avatar u={u} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/users/${u.id}`} onClick={(e) => e.stopPropagation()} className="break-words text-sm font-medium text-primary hover:underline">
                        <bdi>{`${u.firstName} ${u.lastName}`}</bdi>
                      </Link>
                      <p className="text-sm text-muted-foreground">{u.phone || "—"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1"><AccountBadges u={u} /></div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><CreditCard className="h-3 w-3" />{plural(u.matchCredits, "credit")}</span>
                    <span title={fmtDateTime(u.lastActiveAt)}>{u.lastActiveAt ? `Active ${fmtAgo(u.lastActiveAt)}` : "No activity yet"}</span>
                  </div>
                  <UsesBadges uses={u.uses} />
                  <div className="flex items-center justify-between gap-2">
                    {photosButton(u)}
                    {suspendButton(u)}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 w-10">
                    <button
                      onClick={toggleSelectAll}
                      aria-label="Select all on this page"
                      aria-pressed={selectedIds.size > 0 && selectedIds.size === users.filter((u) => u.role !== "ADMIN").length}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {selectedIds.size > 0 && selectedIds.size === users.filter((u) => u.role !== "ADMIN").length ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="text-left p-3 text-sm font-medium">Name</th>
                  <th className="text-left p-3 text-sm font-medium">Phone</th>
                  <th className="text-left p-3 text-sm font-medium">Photos</th>
                  <th className="text-left p-3 text-sm font-medium">Country</th>
                  <th className="text-left p-3 text-sm font-medium">Gender</th>
                  <th className="text-left p-3 text-sm font-medium">City</th>
                  <th className="text-left p-3 text-sm font-medium">Uses</th>
                  <th className="text-left p-3 text-sm font-medium">Last active</th>
                  <th className="text-left p-3 text-sm font-medium">Credits</th>
                  <th className="text-left p-3 text-sm font-medium">Matches</th>
                  <th className="text-left p-3 text-sm font-medium">Joined</th>
                  <th className="text-left p-3 text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      <td colSpan={13} className="p-3">
                        <div className="h-6 bg-muted animate-pulse rounded" />
                      </td>
                    </tr>
                  ))
                ) : loadError ? (
                  <tr>
                    <td colSpan={13} className="p-3">
                      <AdminLoadError message={loadError} onRetry={fetchUsers} />
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="p-3">
                      <AdminEmptyState icon={Users} title="No users found" hint="Try another search or filter." />
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => router.push(`/admin/users/${u.id}`)}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        {u.role !== "ADMIN" && (
                          <button
                            onClick={() => toggleSelect(u.id)}
                            aria-label={`Select ${u.firstName} ${u.lastName}`}
                            aria-pressed={selectedIds.has(u.id)}
                            className="p-2 -m-2 text-muted-foreground hover:text-foreground"
                          >
                            {selectedIds.has(u.id) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                          </button>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Avatar u={u} />
                          <div>
                            {/* A real link: rows open by keyboard and in a new tab (ADM-11) */}
                            <Link
                              href={`/admin/users/${u.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-sm whitespace-nowrap text-primary hover:underline"
                            >
                              <bdi>{`${u.firstName} ${u.lastName}`}</bdi>
                            </Link>
                            <div className="flex flex-wrap gap-1 empty:hidden"><AccountBadges u={u} /></div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">{u.phone || "—"}</td>
                      <td className="p-3">{photosButton(u)}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs whitespace-nowrap" title={countryConfig(u.country).nameEn}>
                          <CountryFlag country={toCountry(u.country)} className="me-1 inline h-3 w-4 align-[-1px]" />
                          {u.country}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge variant={u.gender === "MALE" ? "default" : "secondary"} className="text-xs">
                          {u.gender === "MALE" ? "Male" : "Female"}
                        </Badge>
                      </td>
                      <td className="p-3 text-sm">{u.profile?.city || "—"}</td>
                      <td className="p-3">
                        <UsesBadges uses={u.uses} />
                      </td>
                      <td className="p-3 text-sm text-muted-foreground whitespace-nowrap" title={fmtDateTime(u.lastActiveAt)}>
                        {fmtAgo(u.lastActiveAt)}
                      </td>
                      <td className="p-3 text-sm">
                        <div className="flex items-center gap-1">
                          <CreditCard className="h-3 w-3 text-muted-foreground" />
                          {u.matchCredits}
                        </div>
                      </td>
                      <td className="p-3 text-sm">{u._count.matchesAsFemale + u._count.matchesAsMale}</td>
                      <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                      <td className="p-3">{suspendButton(u)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t">
              <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" aria-label="Next page" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick photo viewer */}
      <Dialog open={!!photoUser} onOpenChange={(open) => !open && setPhotoUser(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              <bdi>{`${photoUser?.firstName ?? ""} ${photoUser?.lastName ?? ""}`}</bdi> · {plural(photoUser?.photos.length ?? 0, "photo")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photoUser?.photos.map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="relative block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="aspect-square w-full rounded-lg object-cover border" />
                {p.isPrimary && <Badge className="absolute top-2 left-2 text-[10px]">Primary</Badge>}
              </a>
            ))}
          </div>
          {photoUser && (
            <Button className="w-full sm:w-auto" onClick={() => router.push(`/admin/users/${photoUser.id}#photos`)}>
              <ExternalLink className="h-4 w-4 me-2" />
              Open profile
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
