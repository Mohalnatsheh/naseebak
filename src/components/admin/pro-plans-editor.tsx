"use client";

import { useState } from "react";
import { Crown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PRO_PLAN_IDS, type ProPlanId, type ProPlans } from "@/lib/pro/plans";

const NAMES: Record<ProPlanId, string> = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

interface Draft {
  enabled: boolean;
  price: string;
  credits: string;
}

const toDrafts = (value: ProPlans | null): Record<ProPlanId, Draft> =>
  Object.fromEntries(
    PRO_PLAN_IDS.map((id) => {
      const c = value?.[id];
      return [id, { enabled: c?.enabled ?? false, price: c ? String(c.price) : "", credits: c ? String(c.credits) : "" }];
    }),
  ) as Record<ProPlanId, Draft>;

/**
 * Admin → Countries: a country's Pro plans (weekly, monthly, yearly): on/off, price in the country's currency and credits.
 * A plan that is off with no price is simply not stored. Values go to the server as typed: it refuses a bad price.
 */
export function ProPlansEditor({
  country,
  currency,
  value,
  onChange,
}: {
  country: string;
  currency: string;
  value: ProPlans | null;
  onChange: (plans: ProPlans | null) => void;
}) {
  const [drafts, setDrafts] = useState(() => toDrafts(value));

  function update(id: ProPlanId, patch: Partial<Draft>) {
    const next = { ...drafts, [id]: { ...drafts[id], ...patch } };
    setDrafts(next);
    const out: ProPlans = {};
    for (const pid of PRO_PLAN_IDS) {
      const d = next[pid];
      // A blank, switched-off plan is not stored. Anything else goes along, so the server can name a bad value
      if (!d.enabled && d.price.trim() === "") continue;
      out[pid] = { enabled: d.enabled, price: Number(d.price), credits: Number(d.credits === "" ? 0 : d.credits) };
    }
    onChange(Object.keys(out).length > 0 ? out : null);
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium">
          <Crown className="h-4 w-4 text-primary" /> Pro plans · {country}
        </p>
        <p className="text-xs text-muted-foreground">
          Price changes apply to new subscribers only. Sales also need Pro on in Settings and «Prices approved» for this country.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {PRO_PLAN_IDS.map((id) => (
          <div key={id} className="space-y-2 rounded-md border p-3">
            <label className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{NAMES[id]}</span>
              <Switch checked={drafts[id].enabled} onCheckedChange={(v) => update(id, { enabled: v })} aria-label={`${NAMES[id]} plan on`} />
            </label>
            <div className="space-y-1.5">
              <Label htmlFor={`pro-${country}-${id}-price`}>Price ({currency})</Label>
              <Input
                id={`pro-${country}-${id}-price`}
                dir="ltr"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={drafts[id].price}
                onChange={(e) => update(id, { price: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`pro-${country}-${id}-credits`}>{id === "yearly" ? "Credits per month" : "Credits per grant"}</Label>
              <Input
                id={`pro-${country}-${id}-credits`}
                dir="ltr"
                type="number"
                min={0}
                max={100}
                step={1}
                inputMode="numeric"
                value={drafts[id].credits}
                onChange={(e) => update(id, { credits: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
