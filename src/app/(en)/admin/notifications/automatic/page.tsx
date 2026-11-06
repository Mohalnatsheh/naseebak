"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, Loader2, MessageSquare, Search, Smartphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AutomaticChannel, AutomaticNotification } from "@/lib/notifications/automatic";

interface CountryList {
  code: string;
  name: string;
  messages: AutomaticNotification[];
}

const CHANNELS: Record<AutomaticChannel, { label: string; icon: typeof Bell }> = {
  bell: { label: "Bell", icon: Bell },
  push: { label: "Push", icon: Smartphone },
  sms: { label: "SMS", icon: MessageSquare },
  whatsapp: { label: "WhatsApp", icon: MessageSquare },
};

/** Read-only: every message members get on their own, by country (the country bar picks one, All shows a switch) */
export default function AutomaticNotificationsPage() {
  const [countries, setCountries] = useState<CountryList[]>([]);
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [smsNotices, setSmsNotices] = useState(false);
  const [code, setCode] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/notifications/automatic")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Failed to load (${res.status})`);
        setCountries(data.countries ?? []);
        setGroups(data.groups ?? {});
        setSmsNotices(!!data.smsNotices);
        setCode(data.countries?.[0]?.code ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the list"))
      .finally(() => setLoading(false));
  }, []);

  const list = countries.find((c) => c.code === code);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const messages = (list?.messages ?? []).filter(
      (m) => !q || `${m.when} ${m.who} ${m.texts.map((t) => `${t.title} ${t.body}`).join(" ")}`.toLowerCase().includes(q),
    );
    return Object.keys(groups).flatMap((group) => {
      const inGroup = messages.filter((m) => m.group === group);
      return inGroup.length > 0 ? [{ group, label: groups[group], messages: inGroup }] : [];
    });
  }, [list, groups, search]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/notifications" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Notifications
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Automatic messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything members get on their own, what triggers it and its exact text. To change a text, ask for a code change: this page only shows them.
        </p>
      </div>

      {!smsNotices && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          SMS notices are switched off, so messages marked SMS go out by bell and push only. Sign-in codes are always sent.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {countries.length > 1 && (
          <div className="flex gap-1 rounded-lg border p-1">
            {countries.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => setCode(c.code)}
                className={cn("rounded-md px-3 py-1.5 text-sm font-medium", c.code === code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        {countries.length === 1 && <Badge variant="outline">{list?.name}</Badge>}
        <div className="relative min-w-52 flex-1">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Search messages" className="ps-9" placeholder="Search text or trigger" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {loading && <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />}
      {!loading && !error && shown.length === 0 && <p className="text-sm text-muted-foreground">No message matches.</p>}

      {shown.map(({ group, label, messages }) => (
        <section key={group} className="space-y-3">
          <h2 className="font-semibold">
            {label} <span className="text-sm font-normal text-muted-foreground">({messages.length})</span>
          </h2>
          {messages.map((m) => (
            <Card key={m.key}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{m.when}</p>
                    <p className="text-xs text-muted-foreground">To: {m.who}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {m.channels.map((c) => {
                      const { label: name, icon: Icon } = CHANNELS[c];
                      return (
                        <Badge key={c} variant="secondary" className="gap-1 text-xs">
                          <Icon className="h-3 w-3" /> {name}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  {m.texts.map((t) => (
                    <div key={t.variant} className="rounded-md bg-muted/50 p-3">
                      {m.texts.length > 1 && <p className="mb-1 text-xs text-muted-foreground">{t.variant}</p>}
                      <div dir="rtl" className="text-right">
                        {t.title && <p className="text-sm font-semibold">{t.title}</p>}
                        <p className="text-sm leading-relaxed">{t.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      ))}
    </div>
  );
}
