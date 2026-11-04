"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Loader2, Megaphone, Send, Square, Trash2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type Audience = "ALL" | "MEN" | "WOMEN" | "USER";
type Channel = "ALL" | "APP" | "WEB" | "WEB_ANDROID" | "WEB_IPHONE" | "WEB_DESKTOP";

interface AlertItem {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  buttonLabel: string | null;
  buttonUrl: string | null;
  audience: Audience;
  channel: Channel;
  country: string | null;
  startsAt: string;
  endsAt: string | null;
  stoppedAt: string | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; phone: string | null } | null;
  _count: { dismissals: number; views: number };
  /** tapped / closed on the website; appClosedOrTapped = the app (it doesn't say which) or before 4 Nov 2026 */
  stats?: { tapped: number; closed: number; appClosedOrTapped: number };
}

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

const AUDIENCES: [Audience, string][] = [
  ["ALL", "Everyone"],
  ["MEN", "Men only"],
  ["WOMEN", "Women only"],
  ["USER", "One member"],
];
const CHANNELS: [Channel, string][] = [
  ["ALL", "Website + App"],
  ["APP", "App only"],
  ["WEB", "Website only"],
  ["WEB_ANDROID", "Website on Android"],
  ["WEB_IPHONE", "Website on iPhone"],
  ["WEB_DESKTOP", "Website on computer"],
];
const LINKS: [string, string][] = [
  ["", "No button"],
  ["/dashboard", "Dashboard (الرئيسية)"],
  ["/dashboard/suggestions", "Suggestions (الاقتراحات)"],
  ["/dashboard/matches", "Matches (التوافقات)"],
  ["/dashboard/chats", "Chats (المحادثات)"],
  ["/dashboard/profile/edit", "Edit profile (تعديل الملف)"],
  ["/dashboard/photos", "Photos (صوري)"],
  ["/dashboard/personality-quiz", "Personality quiz (اختبار الشخصية)"],
  ["/dashboard/payments", "Payments (الرصيد)"],
  ["/dashboard/referral", "Invite friends (دعوة الأصدقاء)"],
  ["/dashboard/support", "Support (الدعم)"],
  ["custom", "Other link (https://…)"],
];

function statusOf(a: AlertItem): { label: string; variant: "default" | "secondary" | "outline" | "destructive" } {
  const now = Date.now();
  if (a.stoppedAt) return { label: "Stopped", variant: "outline" };
  if (a.endsAt && new Date(a.endsAt).getTime() <= now) return { label: "Ended", variant: "outline" };
  if (new Date(a.startsAt).getTime() > now) return { label: "Scheduled", variant: "secondary" };
  return { label: "Live", variant: "default" };
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function AdminAlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [audience, setAudience] = useState<Audience>("ALL");
  const [channel, setChannel] = useState<Channel>("ALL");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [customLink, setCustomLink] = useState("");
  const [buttonLabel, setButtonLabel] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function reload() {
    const res = await fetch("/api/admin/alerts");
    const data = await res.json().catch(() => ({}));
    setAlerts(data.alerts || []);
  }

  useEffect(() => {
    reload().catch(console.error).finally(() => setLoading(false));
  }, []);

  // Server-side member search (debounced), as on the Notifications page
  useEffect(() => {
    if (audience !== "USER") return;
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
  }, [userSearch, audience]);

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setResult({ ok: false, text: "The image must be JPEG, PNG or WebP" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setResult({ ok: false, text: "The image must be 2 MB or smaller" });
      return;
    }
    setImage(await readImage(file));
  }

  const buttonUrl = link === "custom" ? customLink.trim() : link;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (audience === "USER" && !selectedUser) {
      setResult({ ok: false, text: "Choose the member" });
      return;
    }
    const who = AUDIENCES.find(([v]) => v === audience)?.[1] ?? audience;
    const where = CHANNELS.find(([v]) => v === channel)?.[1] ?? channel;
    if (audience !== "USER" && !confirm(`Show this popup to: ${who} (${where})?`)) return;

    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          audience,
          userId: audience === "USER" ? selectedUser : undefined,
          channel,
          buttonLabel: buttonUrl ? buttonLabel : undefined,
          buttonUrl: buttonUrl || undefined,
          // datetime-local is the admin's local time; send it as an instant
          startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
          endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
          image: image ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ ok: false, text: data.error || `Failed (${res.status})` });
        return;
      }
      setResult({ ok: true, text: "Alert created. Members see it the next time they open the app or the website." });
      setTitle("");
      setBody("");
      setImage(null);
      setLink("");
      setCustomLink("");
      setButtonLabel("");
      setStartsAt("");
      setEndsAt("");
      await reload();
    } catch {
      setResult({ ok: false, text: "Failed to create the alert" });
    } finally {
      setSending(false);
    }
  }

  async function stop(a: AlertItem) {
    if (!confirm(`Stop showing "${a.title}"?`)) return;
    await fetch(`/api/admin/alerts/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
    await reload();
  }

  async function remove(a: AlertItem) {
    if (!confirm(`Delete "${a.title}"? Members who haven't closed it won't see it.`)) return;
    await fetch(`/api/admin/alerts/${a.id}`, { method: "DELETE" });
    await reload();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Megaphone className="h-7 w-7 text-primary" />
          Popup Alerts
        </h1>
        <p className="text-muted-foreground mt-1">
          A popup in the app and/or on the website. Each member sees it once, until they close it.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>New Alert</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              {result && (
                <div
                  className={`rounded-lg p-3 text-sm ${
                    result.ok ? "bg-green-50 text-green-800 border border-green-200" : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {result.text}
                </div>
              )}

              <div className="space-y-2">
                <Label>Who</Label>
                <div className="flex flex-wrap gap-2">
                  {AUDIENCES.map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={audience === value ? "default" : "outline"}
                      onClick={() => setAudience(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {audience === "USER" && (
                <div className="space-y-2">
                  <Label>Member</Label>
                  <div className="relative">
                    <Input
                      value={userSearch}
                      onChange={(e) => {
                        setUserSearch(e.target.value);
                        setSelectedUser("");
                      }}
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
                    <option value="">{users.length ? "Select member..." : "No members found"}</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName} ({u.phone || u.id.slice(0, 8)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Where</Label>
                <div className="flex flex-wrap gap-2">
                  {CHANNELS.map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={channel === value ? "default" : "outline"}
                      onClick={() => setChannel(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Title</Label>
                <Input dir="rtl" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
              </div>

              <div className="space-y-2">
                <Label>Text</Label>
                <textarea
                  dir="rtl"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[100px]"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={2000}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Image (optional, up to 2 MB)</Label>
                {image ? (
                  <div className="relative w-fit">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image} alt="" className="max-h-40 rounded-lg border" />
                    <button
                      type="button"
                      onClick={() => setImage(null)}
                      className="absolute -top-2 -end-2 rounded-full bg-background border p-1"
                      aria-label="Remove image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground hover:bg-muted/50">
                    <ImagePlus className="h-4 w-4" /> Choose image
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickImage} />
                  </label>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Button</Label>
                  <select
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  >
                    {LINKS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {link === "custom" && (
                    <Input
                      dir="ltr"
                      value={customLink}
                      onChange={(e) => setCustomLink(e.target.value)}
                      placeholder="https://naseebak.com/blog/..."
                    />
                  )}
                </div>
                {link && (
                  <div className="space-y-2">
                    <Label>Button text</Label>
                    <Input
                      dir="rtl"
                      value={buttonLabel}
                      onChange={(e) => setButtonLabel(e.target.value)}
                      placeholder="مثال: تحديث الملف"
                      maxLength={40}
                      required
                    />
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Starts (empty = now)</Label>
                  <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Ends (empty = until stopped)</Label>
                  <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                </div>
              </div>

              <Button type="submit" disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 me-2" />Create Alert</>}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Live preview, the way members see it */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Preview</p>
          <div dir="rtl" className="rounded-2xl border bg-background p-5 text-center shadow-sm space-y-3">
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="mx-auto max-h-40 rounded-xl object-cover" />
            )}
            <p className="text-lg font-bold">{title || "عنوان التنبيه"}</p>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{body || "نص التنبيه يظهر هنا."}</p>
            {buttonUrl && <Button className="w-full">{buttonLabel || "…"}</Button>}
            <Button variant="ghost" className="w-full">{buttonUrl ? "لاحقاً" : "حسناً"}</Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : alerts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No alerts yet</p>
          ) : (
            <div className="space-y-3">
              {alerts.map((a) => {
                const status = statusOf(a);
                const who =
                  a.audience === "USER" && a.user
                    ? `${a.user.firstName} ${a.user.lastName} (${a.user.phone ?? ""})`
                    : AUDIENCES.find(([v]) => v === a.audience)?.[1];
                return (
                  <div key={a.id} className="border rounded-lg p-3 text-sm space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium" dir="rtl">{a.title}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={status.variant}>{status.label}</Badge>
                        {status.label === "Live" || status.label === "Scheduled" ? (
                          <Button size="sm" variant="outline" onClick={() => stop(a)}>
                            <Square className="h-3 w-3 me-1" /> Stop
                          </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" onClick={() => remove(a)} aria-label="Delete">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-muted-foreground break-words line-clamp-2" dir="rtl">{a.body}</p>
                    <p className="text-xs text-muted-foreground">
                      {who} · {CHANNELS.find(([v]) => v === a.channel)?.[1]} · {a.country ?? "All countries"} ·{" "}
                      {new Date(a.startsAt).toLocaleString()}
                      {a.endsAt ? ` → ${new Date(a.endsAt).toLocaleString()}` : ""}
                    </p>
                    <p className="text-xs">
                      <span className="font-semibold">Seen {a._count.views}</span>
                      {a.buttonUrl && <> · <span className="font-semibold text-emerald-700">Tapped {a.stats?.tapped ?? 0}</span></>}
                      {" "}· Closed {a.stats?.closed ?? 0}
                      {(a.stats?.appClosedOrTapped ?? 0) > 0 && <> · App or earlier (closed or tapped) {a.stats?.appClosedOrTapped}</>}
                      {a._count.views > 0 && a.buttonUrl && (
                        <span className="text-muted-foreground"> · {Math.round(((a.stats?.tapped ?? 0) / a._count.views) * 100)}% tapped</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
