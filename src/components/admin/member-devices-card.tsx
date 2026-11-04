"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Globe, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Devices {
  lastActiveAt: string | null;
  lastDevice: { source: string; day: string } | null;
  recent: { day: string; source: string }[];
  app: { signedIn: number; lastUsedAt: string | null; push: { platform: string; since: string }[] };
  webPush: { on: boolean | null; devices: string[] };
  notificationsOff: string[];
}

const SOURCE_LABEL: Record<string, string> = {
  WEB_ANDROID: "Website · Android",
  WEB_IPHONE: "Website · iPhone",
  WEB_DESKTOP: "Website · Computer",
  APP_ANDROID: "App · Android",
  APP_IOS: "App · iPhone",
  APP_OTHER: "App · device unknown",
};
const PREF_LABEL: Record<string, string> = {
  suggestions: "Suggestions", interests: "Interests", matches: "Matches", visitUpdates: "Visits", payments: "Payments",
  identity: "Identity", support: "Support", introRequests: "Introduction requests", chatMessages: "Chat messages",
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** Admin member page: last device used, app sign-ins and push, website push, notification types turned off */
export function MemberDevicesCard({ userId }: { userId: string }) {
  const [data, setData] = useState<Devices | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/users/${userId}/devices`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Devices) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [userId]);

  const pushOn = !!data && (data.app.push.length > 0 || data.webPush.on === true);
  // One row per day: the sources used that day
  const byDay = new Map<string, string[]>();
  for (const r of data?.recent ?? []) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r.source]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" /> Devices & notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {failed && <p className="text-destructive">Could not load the devices.</p>}
        {!data && !failed && <div className="h-24 animate-pulse rounded-lg bg-muted" />}
        {data && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">Last device</p>
                <p className="font-semibold">{data.lastDevice ? SOURCE_LABEL[data.lastDevice.source] ?? data.lastDevice.source : "Not recorded yet"}</p>
                <p className="text-xs text-muted-foreground">
                  {data.lastDevice ? dayName(data.lastDevice.day) : "Counting since 4 Nov 2026"} · last seen {when(data.lastActiveAt)}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">Push</p>
                <p className={`flex items-center gap-1.5 font-semibold ${pushOn ? "text-emerald-700" : "text-amber-700"}`}>
                  {pushOn ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                  {pushOn ? "On" : data.webPush.on === null && data.app.push.length === 0 ? "Unknown" : "Off"}
                </p>
                <p className="text-xs text-muted-foreground">
                  App: {data.app.push.length ? data.app.push.map((p) => (p.platform === "ios" ? "iPhone" : "Android")).join(", ") : "none"} · Website:{" "}
                  {data.webPush.on === null ? "can't check" : data.webPush.on ? data.webPush.devices.join(", ") || "on" : "off"}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">App sign-ins</p>
                <p className="font-semibold">{data.app.signedIn ? `${data.app.signedIn} active` : "Not signed in to the app"}</p>
                <p className="text-xs text-muted-foreground">last used {when(data.app.lastUsedAt)}</p>
              </div>
            </div>

            {data.notificationsOff.length > 0 && (
              <p className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground">Turned off:</span>
                {data.notificationsOff.map((k) => (
                  <Badge key={k} variant="outline">{PREF_LABEL[k] ?? k}</Badge>
                ))}
              </p>
            )}

            {byDay.size > 0 && (
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">Used on (latest first)</p>
                <ul className="space-y-1">
                  {[...byDay].slice(0, 10).map(([day, sources]) => (
                    <li key={day} className="flex flex-wrap items-center gap-2">
                      <span className="w-28 text-xs text-muted-foreground">{dayName(day)}</span>
                      {sources.map((s) => (
                        <span key={s} className="inline-flex items-center gap-1 text-xs">
                          {s.startsWith("APP") ? <Smartphone className="h-3 w-3 text-accent" /> : <Globe className="h-3 w-3 text-primary" />}
                          {SOURCE_LABEL[s] ?? s}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
