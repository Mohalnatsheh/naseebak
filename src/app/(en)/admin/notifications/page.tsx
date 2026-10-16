"use client";

import { useState, useEffect } from "react";
import { Bell, Loader2, Send, Users as UsersIcon, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface NotifItem {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string };
}

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendAll, setSendAll] = useState(true);
  const [selectedUser, setSelectedUser] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/dashboard");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [searchingUsers, setSearchingUsers] = useState(false);

  useEffect(() => {
    fetch("/api/admin/notifications")
      .then((r) => r.json())
      .then((notifData) => setNotifications(notifData.notifications || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Server-side user search (debounced) so every user can be reached, not only the first page
  useEffect(() => {
    if (sendAll) return;
    const q = userSearch.trim();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchingUsers(true);
      const params = new URLSearchParams({ page: "1" });
      if (q) params.set("search", q);
      fetch(`/api/admin/users?${params}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { users: [] }))
        .then((data) => setUsers(data.users || []))
        .catch((err) => {
          if (err?.name !== "AbortError") console.error(err);
        })
        .finally(() => setSearchingUsers(false));
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [userSearch, sendAll]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !body) return;
    if (!sendAll && !selectedUser) return;
    if (sendAll && !confirm("Send this notification to ALL active users?")) return;

    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: sendAll ? undefined : selectedUser,
          title,
          body,
          url,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ ok: false, text: data.error || `Failed to send notification (${res.status})` });
        return;
      }
      setResult({ ok: true, text: data.message || "Sent!" });
      setTitle("");
      setBody("");
      setUrl("/dashboard");

      // Refresh list
      const notifRes = await fetch("/api/admin/notifications");
      const notifData = await notifRes.json();
      setNotifications(notifData.notifications || []);
    } catch {
      setResult({ ok: false, text: "Failed to send notification" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Bell className="h-7 w-7 text-primary" />
          Notifications
        </h1>
        <p className="text-muted-foreground mt-1">Send system notifications to users</p>
      </div>

      {/* Send Form */}
      <Card>
        <CardHeader>
          <CardTitle>Send Notification</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSend} className="space-y-4">
            {result && (
              <div className={`rounded-lg p-3 text-sm ${
                result.ok ? "bg-green-50 text-green-800 border border-green-200" : "bg-destructive/10 text-destructive"
              }`}>
                {result.text}
              </div>
            )}

            {/* Toggle */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={sendAll ? "default" : "outline"}
                size="sm"
                onClick={() => setSendAll(true)}
              >
                <UsersIcon className="h-4 w-4 me-2" /> All Users
              </Button>
              <Button
                type="button"
                variant={!sendAll ? "default" : "outline"}
                size="sm"
                onClick={() => setSendAll(false)}
              >
                <User className="h-4 w-4 me-2" /> Specific User
              </Button>
            </div>

            {!sendAll && (
              <div className="space-y-2">
                <Label>Select User</Label>
                <div className="relative">
                  <Input
                    value={userSearch}
                    onChange={(e) => { setUserSearch(e.target.value); setSelectedUser(""); }}
                    placeholder="Search by name or phone..."
                  />
                  {searchingUsers && (
                    <Loader2 className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">{users.length ? "Select user..." : "No users found"}</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} ({u.phone || u.id.slice(0, 8)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Notification title..."
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Body</Label>
              <textarea
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Notification body..."
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Route (where user goes when tapping the notification)</Label>
              <select
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="/dashboard">Dashboard (الرئيسية)</option>
                <option value="/dashboard/suggestions">Suggestions (الاقتراحات)</option>
                <option value="/dashboard/matches">Matches (التوافقات)</option>
                <option value="/dashboard/notifications">Notifications (الإشعارات)</option>
                <option value="/dashboard/profile">Profile (الملف الشخصي)</option>
                <option value="/dashboard/photos">Photos (صوري)</option>
                <option value="/dashboard/personality-quiz">Personality Quiz (اختبار الشخصية)</option>
                <option value="/dashboard/payments">Payments (رصيد الاقتراحات)</option>
                <option value="/dashboard/support">Support (الدعم والملاحظات)</option>
              </select>
            </div>

            <Button type="submit" disabled={sending}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <><Send className="h-4 w-4 me-2" />Send Notification</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Recent Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Recent System Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : notifications.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No system notifications sent yet</p>
          ) : (
            <div className="space-y-3">
              {notifications.map((n) => (
                <div key={n.id} className="border rounded-lg p-3 text-sm space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{n.title}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={n.isRead ? "outline" : "default"} className="text-xs">
                        {n.isRead ? "Read" : "Unread"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(n.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <p className="text-muted-foreground break-words">{n.body}</p>
                  <p className="text-xs text-muted-foreground">
                    To: {n.user.firstName} {n.user.lastName}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
