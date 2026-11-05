"use client";

import { useState, useEffect } from "react";
import { Bell, Loader2, Send, Users as UsersIcon, User } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime, PersonLink } from "@/components/admin/admin-list-bits";

/** One send: a broadcast or a single notification (src/lib/admin/reach-audience.ts) */
interface SendItem {
  title: string;
  body: string;
  sentAt: string;
  recipients: number;
  read: number;
  user: { id: string; firstName: string; lastName: string } | null;
}

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

export default function AdminNotificationsPage() {
  const [sends, setSends] = useState<SendItem[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendAll, setSendAll] = useState(true);
  const [selectedUser, setSelectedUser] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/dashboard");
  const [channel, setChannel] = useState<"all" | "web" | "app">("all");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [searchingUsers, setSearchingUsers] = useState(false);

  useEffect(() => {
    fetch("/api/admin/notifications")
      .then((r) => r.json())
      .then((notifData) => setSends(notifData.sends || []))
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

  /** Names how many members in which country get it (the count can't be read: says so, still asks) */
  async function confirmBroadcast() {
    const via = channel === "app" ? " who have the app" : "";
    const audience = await fetch(`/api/admin/notifications/audience?channel=${channel}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (!audience) return confirm(`Could not count the recipients. Send this notification to ALL active users${via} of the selected country anyway?`);
    const where = audience.country ? `in ${audience.country}` : "in all countries";
    return confirm(`Send this notification to ${audience.count.toLocaleString("en-GB")} active users${via} ${where}?`);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !body) return;
    if (!sendAll && !selectedUser) return;
    if (sendAll && !(await confirmBroadcast())) return;

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
          channel,
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
      setSends(notifData.sends || []);
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
              <Label>Send to</Label>
              <div className="flex flex-wrap gap-2">
                {([
                  ["all", "Website + App"],
                  ["web", "Website only"],
                  ["app", "App only"],
                ] as const).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    variant={channel === value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setChannel(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {channel === "app"
                  ? "Push on the mobile app only; a broadcast reaches only members who have the app."
                  : channel === "web"
                    ? "Browser push (OneSignal) only; the notice still appears in every member's list."
                    : "Browser push and app push; the notice appears in the member's list."}
              </p>
            </div>

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
                <option value="/dashboard/referral">Invite friends (دعوة الأصدقاء)</option>
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
          <CardDescription>Last 90 days. Same title and text sent together count as one send.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : sends.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No system notifications sent yet</p>
          ) : (
            <div className="space-y-3">
              {sends.map((n) => (
                <div key={`${n.sentAt}-${n.title}`} className="border rounded-lg p-3 text-sm space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{n.title}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {n.recipients === 1 ? (
                        <Badge variant={n.read ? "outline" : "default"} className="text-xs">
                          {n.read ? "Read" : "Unread"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          {n.recipients.toLocaleString("en-GB")} recipients
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{fmtDateTime(n.sentAt)}</span>
                    </div>
                  </div>
                  <p className="text-muted-foreground break-words">{n.body}</p>
                  <p className="text-xs text-muted-foreground">
                    {n.recipients === 1 ? (
                      n.user ? <>To: <PersonLink p={n.user} /></> : "To: one member"
                    ) : (
                      <>Read by {n.read.toLocaleString("en-GB")} ({Math.round((n.read / n.recipients) * 100)}%)</>
                    )}
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
