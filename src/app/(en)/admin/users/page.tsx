"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Users, Shield, ShieldCheck, ChevronLeft, ChevronRight, Search, Ban, Loader2, CreditCard, Flag, CheckSquare, Square, Images, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { enumLabel } from "@/lib/admin/enum-labels";

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  gender: string;
  role: string;
  status: string;
  isVerified: boolean;
  isDeactivated: boolean;
  isFlagged: boolean;
  matchCredits: number;
  createdAt: string;
  identityDoc: { status: string } | null;
  profile: { isComplete: boolean; city: string | null } | null;
  photos: { id: string; url: string; isPrimary: boolean }[];
  _count: { matchesAsFemale: number; matchesAsMale: number; photos: number };
}

const statusStyles: Record<string, string> = {
  PENDING: "text-amber-600 border-amber-300",
  VERIFIED: "text-green-600 border-green-300",
  REJECTED: "text-destructive border-destructive/30",
  SUSPENDED: "text-destructive border-destructive/30",
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [photoUser, setPhotoUser] = useState<UserRow | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState("");
  const [status, setStatus] = useState("");
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSuspending, setBulkSuspending] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    // A selection only applies to the rows on screen
    setSelectedIds(new Set());
    fetchUsers();
  }, [page]);

  async function fetchUsers(resetPage = false) {
    setLoading(true);
    const p = resetPage ? 1 : page;
    if (resetPage) {
      setPage(1);
      setSelectedIds(new Set());
    }
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (search) params.set("search", search);
      if (gender) params.set("gender", gender);
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ kind: "error", text: data.error || "Could not load users" });
        setUsers([]);
        return;
      }
      setUsers(data.users || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error(err);
      setNotice({ kind: "error", text: "Could not load users. Check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchUsers(true);
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
    if (!confirm(`Are you sure you want to ${action} ${count} user(s)?`)) return;
    setBulkSuspending(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/users/bulk-suspend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, userIds: [...selectedIds] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ kind: "error", text: data.error || `Could not ${action} the selected users` });
        return;
      }
      const verb = action === "suspend" ? "Suspended" : "Unsuspended";
      const parts = [`${verb} ${data.changed} user(s)`];
      if (data.unchanged) parts.push(`${data.unchanged} already ${action === "suspend" ? "suspended" : "active"}`);
      if (data.failed?.length) parts.push(`${data.failed.length} failed (${data.failed[0].error})`);
      setNotice({ kind: data.failed?.length ? "error" : "success", text: parts.join(" · ") });
      setSelectedIds(new Set());
      await fetchUsers();
    } catch (err) {
      console.error(err);
      setNotice({ kind: "error", text: "Network error — please try again" });
    } finally {
      setBulkSuspending(false);
    }
  }

  async function handleSuspend(e: React.MouseEvent, userId: string) {
    e.stopPropagation();
    setSuspendingId(userId);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/suspend`, { method: "PUT" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNotice({ kind: "error", text: data.error || "Could not change the suspension" });
        return;
      }
      await fetchUsers();
    } catch (err) {
      console.error(err);
      setNotice({ kind: "error", text: "Network error — please try again" });
    } finally {
      setSuspendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Users className="h-7 w-7 text-primary" />
          User Management
        </h1>
        <p className="text-muted-foreground mt-1">View and manage all registered users</p>
      </div>

      {/* Search + Filters */}
      <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All Genders</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All Status</option>
          {(["PENDING", "VERIFIED", "SUSPENDED", "REJECTED", "FLAGGED"] as const).map((s) => (
            <option key={s} value={s}>{enumLabel("userStatus", s)}</option>
          ))}
        </select>
        <Button type="submit">
          <Search className="h-4 w-4 me-2" /> Search
        </Button>
      </form>

      {notice && (
        <div
          className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
            notice.kind === "success"
              ? "border-green-300 bg-green-50 text-green-800"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="text-xs underline shrink-0">Dismiss</button>
        </div>
      )}

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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 w-10">
                    <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-foreground">
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
                  <th className="hidden md:table-cell text-left p-3 text-sm font-medium">Gender</th>
                  <th className="hidden md:table-cell text-left p-3 text-sm font-medium">City</th>
                  <th className="text-left p-3 text-sm font-medium">Status</th>
                  <th className="hidden md:table-cell text-left p-3 text-sm font-medium">Credits</th>
                  <th className="hidden md:table-cell text-left p-3 text-sm font-medium">Matches</th>
                  <th className="hidden md:table-cell text-left p-3 text-sm font-medium">Joined</th>
                  <th className="text-left p-3 text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      <td colSpan={11} className="p-3">
                        <div className="h-6 bg-muted animate-pulse rounded" />
                      </td>
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center p-8 text-muted-foreground">
                      No users found
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
                          <button onClick={() => toggleSelect(u.id)} className="p-2 -m-2 text-muted-foreground hover:text-foreground">
                            {selectedIds.has(u.id) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                          </button>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {u.photos.length > 0 ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={(u.photos.find((p) => p.isPrimary) ?? u.photos[0]).url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover border" />
                          ) : (
                            <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                              {u.firstName.charAt(0)}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-sm whitespace-nowrap">{u.firstName} {u.lastName}</p>
                            {u.role === "ADMIN" && <Badge variant="destructive" className="text-xs">Admin</Badge>}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">{u.phone || "—"}</td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        {u._count.photos > 0 ? (
                          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setPhotoUser(u)}>
                            <Images className="h-3.5 w-3.5" />
                            {u._count.photos}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground whitespace-nowrap">No photos</span>
                        )}
                      </td>
                      <td className="hidden md:table-cell p-3">
                        <Badge variant={u.gender === "MALE" ? "default" : "secondary"} className="text-xs">
                          {u.gender === "MALE" ? "Male" : "Female"}
                        </Badge>
                      </td>
                      <td className="hidden md:table-cell p-3 text-sm">{u.profile?.city || "—"}</td>
                      <td className="p-3">
                        <Badge variant="outline" className={`text-xs ${statusStyles[u.status] || ""}`}>
                          {u.status === "VERIFIED" && <ShieldCheck className="h-3 w-3 me-1" />}
                          {enumLabel("userStatus", u.status)}
                        </Badge>
                        {u.isDeactivated && (
                          <Badge variant="outline" className="text-xs text-destructive ms-1">Deactivated</Badge>
                        )}
                        {u.isFlagged && (
                          <Badge variant="outline" className="text-xs text-destructive border-destructive/30 ms-1">
                            <Flag className="h-3 w-3 me-1" />Flagged
                          </Badge>
                        )}
                      </td>
                      <td className="hidden md:table-cell p-3 text-sm">
                        <div className="flex items-center gap-1">
                          <CreditCard className="h-3 w-3 text-muted-foreground" />
                          {u.matchCredits}
                        </div>
                      </td>
                      <td className="hidden md:table-cell p-3 text-sm">{u._count.matchesAsFemale + u._count.matchesAsMale}</td>
                      <td className="hidden md:table-cell p-3 text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        {u.role !== "ADMIN" && (
                          <Button
                            variant={u.status === "SUSPENDED" ? "outline" : "destructive"}
                            size="sm"
                            onClick={(e) => handleSuspend(e, u.id)}
                            disabled={suspendingId === u.id}
                            className="text-xs"
                          >
                            {suspendingId === u.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <><Ban className="h-3 w-3 me-1" />{u.status === "SUSPENDED" ? "Unsuspend" : "Suspend"}</>
                            )}
                          </Button>
                        )}
                      </td>
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
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
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
              {photoUser?.firstName} {photoUser?.lastName} · {photoUser?.photos.length} photo{photoUser?.photos.length === 1 ? "" : "s"}
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
