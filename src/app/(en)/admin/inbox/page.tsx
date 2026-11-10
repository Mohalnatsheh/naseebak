"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Flag, Inbox, LifeBuoy, Loader2, ClipboardEdit, Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PersonLink, fmtAgo, fmtDateTime, type PersonRef } from "@/components/admin/admin-list-bits";
import { LoadError } from "@/components/admin/inbox-focus";
import { cn } from "@/lib/utils";

type ItemType = "report" | "support" | "profile" | "contact";

interface Item {
  type: ItemType;
  id: string;
  since: string;
  member: PersonRef | null;
  summary: string;
  href: string;
}

const TYPES: { type: ItemType; label: string; icon: typeof Flag; style: string }[] = [
  { type: "report", label: "Reports", icon: Flag, style: "bg-destructive/10 text-destructive" },
  { type: "support", label: "Support", icon: LifeBuoy, style: "bg-amber-100 text-amber-800" },
  { type: "profile", label: "Profile requests", icon: ClipboardEdit, style: "bg-primary/10 text-primary" },
  { type: "contact", label: "Contact messages", icon: Mail, style: "bg-muted text-muted-foreground" },
];

const BADGE: Record<ItemType, string> = { report: "Report", support: "Support", profile: "Profile", contact: "Contact" };

/** Admin → Inbox: everything waiting for an admin, oldest first. Read-only: «Open» goes to the item's own page. */
export default function AdminInboxPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [counts, setCounts] = useState<Record<ItemType, number> | null>(null);
  const [perType, setPerType] = useState(100);
  const [show, setShow] = useState<ItemType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/inbox");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setItems(data.items ?? []);
      setCounts(data.counts ?? null);
      setPerType(data.perType ?? 100);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the inbox");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = show ? items.filter((i) => i.type === show) : items;
  const cut = counts ? TYPES.filter((t) => counts[t.type] > perType) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-display">
          <Inbox className="h-7 w-7 text-primary" /> Inbox
        </h1>
        <p className="mt-1 text-muted-foreground">Everything waiting for an admin, oldest first</p>
      </div>

      {counts && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => setShow(show === t.type ? null : t.type)}
              aria-pressed={show === t.type}
              className={cn("rounded-xl border bg-card p-3 text-start transition-colors hover:bg-muted/40", show === t.type && "border-primary")}
            >
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </span>
              <span className="mt-1 block text-2xl font-bold">{counts[t.type]}</span>
            </button>
          ))}
        </div>
      )}

      {error && <LoadError message={error} onRetry={load} />}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? null : visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-500" />
            <h3 className="text-lg font-medium">All clear</h3>
            <p className="text-sm text-muted-foreground">Nothing is waiting.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {visible.map((item) => {
              const type = TYPES.find((t) => t.type === item.type)!;
              return (
                <div key={`${item.type}-${item.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 md:flex-nowrap">
                  <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium", type.style)}>{BADGE[item.type]}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    {item.member && (
                      <>
                        <PersonLink p={item.member} />
                        <span className="text-muted-foreground"> · </span>
                      </>
                    )}
                    <span className="break-words text-muted-foreground" dir="auto">{item.summary}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground" title={fmtDateTime(item.since)}>{fmtAgo(item.since)}</span>
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link href={item.href}>Open</Link>
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {cut.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing the oldest {perType} of each type. {cut.map((t) => t.label).join(", ")} have more on their own page.
        </p>
      )}
    </div>
  );
}
