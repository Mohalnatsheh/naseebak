"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Users, Shield, ShieldCheck, ChevronLeft, ChevronRight, Search, Ban, Loader2, CreditCard, Flag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  _count: { matchesAsFemale: number; matchesAsMale: number };
}

const statusStyles: Record<string, string> = {
  PENDING: "text-amber-600 border-amber-300",
  VERIFIED: "text-green-600 border-green-300",
  REJECTED: "text-red-600 border-red-300",
  SUSPENDED: "text-red-600 border-red-300",
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState("");
  const [status, setStatus] = useState("");
  const [suspendingId, setSuspendingId] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, [page]);

  async function fetchUsers(resetPage = false) {
    setLoading(true);
    const p = resetPage ? 1 : page;
    if (resetPage) setPage(1);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (search) params.set("search", search);
      if (gender) params.set("gender", gender);
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      setUsers(data.users || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchUsers(true);
  }

  async function handleSuspend(e: React.MouseEvent, userId: string) {
    e.stopPropagation();
    setSuspendingId(userId);
    try {
      await fetch(`/api/admin/users/${userId}/suspend`, { method: "PUT" });
      await fetchUsers();
    } catch (err) {
      console.error(err);
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
          <option value="PENDING">Pending</option>
          <option value="VERIFIED">Verified</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="REJECTED">Rejected</option>
          <option value="FLAGGED">Flagged</option>
        </select>
        <Button type="submit">
          <Search className="h-4 w-4 me-2" /> Search
        </Button>
      </form>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 text-sm font-medium">Name</th>
                  <th className="text-left p-3 text-sm font-medium">Phone</th>
                  <th className="text-left p-3 text-sm font-medium">Gender</th>
                  <th className="text-left p-3 text-sm font-medium">City</th>
                  <th className="text-left p-3 text-sm font-medium">Status</th>
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
                      <td colSpan={9} className="p-3">
                        <div className="h-6 bg-muted animate-pulse rounded" />
                      </td>
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center p-8 text-muted-foreground">
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
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {u.firstName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{u.firstName} {u.lastName}</p>
                            {u.role === "ADMIN" && <Badge variant="destructive" className="text-xs">Admin</Badge>}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">{u.phone || "—"}</td>
                      <td className="p-3">
                        <Badge variant={u.gender === "MALE" ? "default" : "secondary"} className="text-xs">
                          {u.gender === "MALE" ? "Male" : "Female"}
                        </Badge>
                      </td>
                      <td className="p-3 text-sm">{u.profile?.city || "—"}</td>
                      <td className="p-3">
                        <Badge variant="outline" className={`text-xs ${statusStyles[u.status] || ""}`}>
                          {u.status === "VERIFIED" && <ShieldCheck className="h-3 w-3 me-1" />}
                          {u.status}
                        </Badge>
                        {u.isDeactivated && (
                          <Badge variant="outline" className="text-xs text-red-600 ms-1">Deactivated</Badge>
                        )}
                        {u.isFlagged && (
                          <Badge variant="outline" className="text-xs text-destructive border-destructive/30 ms-1">
                            <Flag className="h-3 w-3 me-1" />Flagged
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-sm">
                        <div className="flex items-center gap-1">
                          <CreditCard className="h-3 w-3 text-muted-foreground" />
                          {u.matchCredits}
                        </div>
                      </td>
                      <td className="p-3 text-sm">{u._count.matchesAsFemale + u._count.matchesAsMale}</td>
                      <td className="p-3 text-sm text-muted-foreground">
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
    </div>
  );
}
