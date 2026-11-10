"use client";

import { useEffect, useId, useState } from "react";
import { Copy, ImagePlus, Loader2, Megaphone, Send, Square, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NameText, StateBadge, fmtDateTime } from "@/components/admin/admin-list-bits";
import { AdminEmptyState, AdminLoadError } from "@/components/admin/admin-states";
import { useConfirm } from "@/components/admin/confirm-dialog";
import { countryConfig } from "@/lib/countries";

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

/** «Jordan» / «all countries» (`null` = every country) */
function countryName(code: string | null) {
  return code ? countryConfig(code).nameEn : "all countries";
}

function audienceLabel(a: AlertItem) {
  if (a.audience === "USER") return a.user ? `${a.user.firstName} ${a.user.lastName}` : "One member";
  return AUDIENCES.find(([v]) => v === a.audience)?.[1] ?? a.audience;
}

/** A past alert's image as a data URL, the form's format (the old file can be deleted with its alert) */
async function imageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  const blob = await res.blob();
  return readImage(new File([blob], "image", { type: blob.type }));
}

/** `tone` picks the shared admin status colours (StateBadge) */
function statusOf(a: AlertItem): { label: string; tone: "ACTIVE" | "PENDING" | "ENDED" } {
  const now = Date.now();
  if (a.stoppedAt) return { label: "Stopped", tone: "ENDED" };
  if (a.endsAt && new Date(a.endsAt).getTime() <= now) return { label: "Ended", tone: "ENDED" };
  if (new Date(a.startsAt).getTime() > now) return { label: "Scheduled", tone: "PENDING" };
  return { label: "Live", tone: "ACTIVE" };
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
  const [loadError, setLoadError] = useState("");
  const confirm = useConfirm();
  const fid = useId();
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
  // Where a new alert goes (the admin's selected country, null = every country)
  const [targetCountry, setTargetCountry] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/admin/alerts");
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json().catch(() => ({}));
    setAlerts(data.alerts || []);
    setTargetCountry(data.country ?? null);
    setLoadError("");
  }

  function loadList() {
    return reload()
      .catch((err) => {
        console.error(err);
        setLoadError("Couldn't load the alerts.");
      })
      .finally(() => setLoading(false));
  }

  function retry() {
    setLoading(true);
    void loadList();
  }

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first load only
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
    if (
      audience !== "USER" &&
      !(await confirm({
        title: "Show this popup?",
        description: `To: ${who} in ${countryName(targetCountry)} (${where}).`,
        confirmLabel: "Create alert",
      }))
    )
      return;

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
    const ok = await confirm({
      title: "Stop this alert?",
      description: <>«<bdi>{a.title}</bdi>» stops showing to <bdi>{audienceLabel(a)}</bdi> in {countryName(a.country)}.</>,
      confirmLabel: "Stop alert",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/alerts/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    }).catch(() => null);
    if (!res?.ok) {
      toast.error((await res?.json().catch(() => null))?.error ?? "Could not stop the alert");
      return;
    }
    toast.success("Alert stopped");
    await reload();
  }

  async function remove(a: AlertItem) {
    const ok = await confirm({
      title: "Delete this alert?",
      description: <>«<bdi>{a.title}</bdi>» (<bdi>{audienceLabel(a)}</bdi>, {countryName(a.country)}). Members who haven&apos;t closed it won&apos;t see it.</>,
      confirmLabel: "Delete alert",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/alerts/${a.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      toast.error((await res?.json().catch(() => null))?.error ?? "Could not delete the alert");
      return;
    }
    toast.success("Alert deleted");
    await reload();
  }

  /** Prefills the form from a past alert: saving creates a new one, the old alert is left as it is */
  async function duplicate(a: AlertItem) {
    setAudience(a.audience);
    setChannel(a.channel);
    setSelectedUser(a.audience === "USER" ? a.user?.id ?? "" : "");
    setUsers(a.audience === "USER" && a.user ? [a.user] : []);
    setUserSearch(a.audience === "USER" ? a.user?.phone ?? a.user?.firstName ?? "" : "");
    setTitle(a.title);
    setBody(a.body);
    const preset = !a.buttonUrl || LINKS.some(([v]) => v === a.buttonUrl);
    setLink(preset ? a.buttonUrl ?? "" : "custom");
    setCustomLink(preset ? "" : a.buttonUrl ?? "");
    setButtonLabel(a.buttonLabel ?? "");
    setStartsAt("");
    setEndsAt("");
    setImage(null);
    setResult({ ok: true, text: "Copied into the form. Check it, set the dates, then Create Alert. The old alert isn't changed." });
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (a.imageUrl) {
      try {
        setImage(await imageAsDataUrl(a.imageUrl));
      } catch {
        toast.error("The image couldn't be copied: choose it again");
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display flex items-center gap-3">
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
                  role={result.ok ? "status" : "alert"}
                  className={`rounded-lg p-3 text-sm ${
                    result.ok ? "bg-green-50 text-green-800 border border-green-200" : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {result.text}
                </div>
              )}

              <div className="space-y-2">
                <Label id={`${fid}-who`}>Who</Label>
                <div role="group" aria-labelledby={`${fid}-who`} className="flex flex-wrap gap-2">
                  {AUDIENCES.map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={audience === value ? "default" : "outline"}
                      aria-pressed={audience === value}
                      onClick={() => setAudience(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {audience === "USER" && (
                <div className="space-y-2">
                  <Label htmlFor={`${fid}-member-search`}>Find the member</Label>
                  <div className="relative">
                    <Input
                      id={`${fid}-member-search`}
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
                  <Label htmlFor={`${fid}-member`} className="sr-only">Member</Label>
                  <select
                    id={`${fid}-member`}
                    aria-invalid={!selectedUser && result?.text === "Choose the member"}
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
                <Label id={`${fid}-where`}>Where</Label>
                <div role="group" aria-labelledby={`${fid}-where`} className="flex flex-wrap gap-2">
                  {CHANNELS.map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={channel === value ? "default" : "outline"}
                      aria-pressed={channel === value}
                      onClick={() => setChannel(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${fid}-title`}>Title</Label>
                <Input id={`${fid}-title`} dir="rtl" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${fid}-text`}>Text</Label>
                <textarea
                  id={`${fid}-text`}
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
                  <Label htmlFor={`${fid}-link`}>Button</Label>
                  <select
                    id={`${fid}-link`}
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
                      aria-label="Button link"
                      value={customLink}
                      onChange={(e) => setCustomLink(e.target.value)}
                      placeholder="https://naseebak.com/blog/..."
                    />
                  )}
                </div>
                {link && (
                  <div className="space-y-2">
                    <Label htmlFor={`${fid}-btn`}>Button text</Label>
                    <Input
                      id={`${fid}-btn`}
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
                  <Label htmlFor={`${fid}-starts`}>Starts (empty = now)</Label>
                  <Input id={`${fid}-starts`} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${fid}-ends`}>Ends (empty = until stopped)</Label>
                  <Input id={`${fid}-ends`} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
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
          ) : loadError ? (
            <AdminLoadError message={loadError} onRetry={retry} />
          ) : alerts.length === 0 ? (
            <AdminEmptyState icon={Megaphone} title="No alerts yet" hint="A new alert shows here once it's created." />
          ) : (
            <div className="space-y-3">
              {alerts.map((a) => {
                const status = statusOf(a);
                const who =
                  a.audience === "USER" && a.user ? (
                    <>
                      <NameText>{`${a.user.firstName} ${a.user.lastName}`}</NameText> ({a.user.phone ?? ""})
                    </>
                  ) : (
                    AUDIENCES.find(([v]) => v === a.audience)?.[1]
                  );
                return (
                  <div key={a.id} className="border rounded-lg p-3 text-sm space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium" dir="rtl">{a.title}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <StateBadge value={status.tone} label={status.label} />
                        {status.label === "Live" || status.label === "Scheduled" ? (
                          <Button size="sm" variant="outline" onClick={() => stop(a)}>
                            <Square className="h-3 w-3 me-1" /> Stop
                          </Button>
                        ) : null}
                        <Button size="sm" variant="outline" onClick={() => duplicate(a)}>
                          <Copy className="h-3 w-3 me-1" /> Duplicate
                        </Button>
                        {/* Numbers are kept once anyone saw it: Stop it instead */}
                        {a._count.views === 0 && a._count.dismissals === 0 && (
                          <Button size="sm" variant="ghost" onClick={() => remove(a)} aria-label="Delete alert">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-muted-foreground break-words line-clamp-2" dir="rtl">{a.body}</p>
                    <p className="text-xs text-muted-foreground">
                      {who} · {CHANNELS.find(([v]) => v === a.channel)?.[1]} · {a.country ? countryName(a.country) : "All countries"} ·{" "}
                      {fmtDateTime(a.startsAt)}
                      {a.endsAt ? ` → ${fmtDateTime(a.endsAt)}` : ""}
                    </p>
                    <p className="text-xs">
                      <span className="font-semibold">Seen {a._count.views}</span>
                      {a.buttonUrl && (
                        <>
                          {" "}· <span className="font-semibold text-emerald-700">Tapped {a.stats?.tapped ?? 0}</span>
                          {/* Older alerts have taps from before views were counted: no % then */}
                          {a._count.views >= (a.stats?.tapped ?? 0) && a._count.views > 0 && (
                            <span className="text-muted-foreground"> ({Math.round(((a.stats?.tapped ?? 0) / a._count.views) * 100)}% of seen)</span>
                          )}
                        </>
                      )}
                      {" "}· Closed {a.stats?.closed ?? 0}
                      {(a.stats?.appClosedOrTapped ?? 0) > 0 && <> · App or earlier (closed or tapped) {a.stats?.appClosedOrTapped}</>}
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
