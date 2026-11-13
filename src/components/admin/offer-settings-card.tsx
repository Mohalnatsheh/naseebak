"use client";

import { useEffect, useState } from "react";
import { Gift, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DEFAULT_OFFER_TITLE } from "@/lib/payments/offer";

type Status = "off" | "scheduled" | "active" | "ended";
interface OfferState {
  percent: number;
  startsAt: string | null;
  endsAt: string | null;
  title: string;
  status: Status;
}

/** Jordan has kept UTC+3 all year since 2022: the admin types Amman time, the server stores UTC */
const AMMAN_OFFSET_MS = 3 * 60 * 60 * 1000;
const toAmmanInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + AMMAN_OFFSET_MS).toISOString().slice(0, 16) : "");
const fromAmmanInput = (value: string) => (value ? new Date(`${value}:00+03:00`).toISOString() : null);

const STATUS: Record<Status, { label: string; className: string }> = {
  off: { label: "Off", className: "bg-muted text-muted-foreground" },
  scheduled: { label: "Scheduled", className: "bg-amber-100 text-amber-800" },
  active: { label: "Active now", className: "bg-emerald-100 text-emerald-800" },
  ended: { label: "Ended", className: "bg-muted text-muted-foreground" },
};

/**
 * Admin → Settings: the sale offer (e.g. «عروض الجمعة البيضاء»). +percent% credits on credit purchases and on the
 * first Pro payment, between start and end (Amman time), in countries where buying is open. Percent 0 = off.
 */
export function OfferSettingsCard() {
  const [state, setState] = useState<OfferState | null>(null);
  const [percent, setPercent] = useState("0");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load(d: OfferState) {
    if (!d || !(d.status in STATUS)) {
      setError("Couldn't load the offer settings");
      return;
    }
    setState(d);
    setPercent(String(d.percent));
    setStartsAt(toAmmanInput(d.startsAt));
    setEndsAt(toAmmanInput(d.endsAt));
    setTitle(d.title);
  }

  useEffect(() => {
    fetch("/api/admin/settings/offer")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then(load)
      .catch(() => setError("Couldn't load the offer settings"));
  }, []);

  async function save(next?: { percent: number }) {
    setSaving(true);
    setError("");
    const body = {
      percent: next?.percent ?? Number(percent),
      startsAt: fromAmmanInput(startsAt),
      endsAt: fromAmmanInput(endsAt),
      title: title.trim(),
    };
    try {
      const res = await fetch("/api/admin/settings/offer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't save");
        return;
      }
      load(data);
      toast.success("Offer saved (live within 30 seconds)");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-primary" />
          Sale offer
          {state && <Badge className={STATUS[state.status].className}>{STATUS[state.status].label}</Badge>}
        </CardTitle>
        <CardDescription>
          Extra credits on every credit purchase and on the first Pro payment (renewals never), between the start and the end,
          in countries where buying is open. The bonus is fixed when the checkout opens and a refund takes it back. Percent 0
          turns it off.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!state && !error && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {state && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="offer-percent">Extra credits (%)</Label>
                <Input id="offer-percent" inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="offer-title">Title shown to members</Label>
                <Input id="offer-title" dir="rtl" maxLength={60} placeholder={DEFAULT_OFFER_TITLE} value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="offer-start">Starts (Amman time)</Label>
                <Input id="offer-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="offer-end">Ends (Amman time)</Label>
                <Input id="offer-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => save()} disabled={saving}>
                {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                Save offer
              </Button>
              {state.percent > 0 && (
                <Button variant="outline" onClick={() => save({ percent: 0 })} disabled={saving}>
                  Turn off now
                </Button>
              )}
            </div>
          </>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
