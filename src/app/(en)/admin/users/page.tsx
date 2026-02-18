"use client";

import { useState, useEffect } from "react";
import { Users, Shield, ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  gender: string;
  role: string;
  isVerified: boolean;
  createdAt: string;
  identityDoc: { status: string } | null;
  profile: { isComplete: boolean; city: string | null } | null;
  _count: { matchesAsFemale: number; matchesAsMale: number };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, [page]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?page=${page}`);
      const data = await res.json();
      setUsers(data.users || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 text-sm font-medium">Name</th>
                  <th className="text-left p-3 text-sm font-medium">Email</th>
                  <th className="text-left p-3 text-sm font-medium">Gender</th>
                  <th className="text-left p-3 text-sm font-medium">City</th>
                  <th className="text-left p-3 text-sm font-medium">Status</th>
                  <th className="text-left p-3 text-sm font-medium">Matches</th>
                  <th className="text-left p-3 text-sm font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      <td colSpan={7} className="p-3">
                        <div className="h-6 bg-muted animate-pulse rounded" />
                      </td>
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center p-8 text-muted-foreground">
                      No users found
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="border-b hover:bg-muted/30 transition-colors">
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
                      <td className="p-3 text-sm text-muted-foreground">{u.email}</td>
                      <td className="p-3">
                        <Badge variant={u.gender === "MALE" ? "default" : "secondary"} className="text-xs">
                          {u.gender === "MALE" ? "Male" : "Female"}
                        </Badge>
                      </td>
                      <td className="p-3 text-sm">{u.profile?.city || "—"}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          {u.isVerified ? (
                            <Badge variant="outline" className="text-green-600 border-green-300 text-xs gap-1">
                              <ShieldCheck className="h-3 w-3" />Verified
                            </Badge>
                          ) : u.identityDoc?.status === "PENDING" ? (
                            <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs gap-1">
                              <Shield className="h-3 w-3" />Pending
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground text-xs">Unverified</Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-sm">{u._count.matchesAsFemale + u._count.matchesAsMale}</td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString()}
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
