"use client";

import { useState } from "react";
import { Crown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PRO_PLAN_IDS, type ProPlanId, type ProPlans } from "@/lib/pro/plans";
import { toDecimalText, toLatinDigits } from "@/lib/digits";

const NAMES: Record<ProPlanId, string> = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

export interface Draft {
  enabled: boolean;
  price: string;
  credits: string;
}

export const toDrafts = (value: ProPlans | null): Record<ProPlanId, Draft> =>
  Object.fromEntries(
    PRO_PLAN_IDS.map((id) => {
      const c = value?.[id];
      return [id, { enabled: c?.enabled ?? false, price: c ? String(c.price) : "", credits: c ? String(c.credits) : "" }];
    }),
  ) as Record<ProPlanId, Draft>;

/**
 * What the drafts send to the server. A blank, switched-off plan is not stored. Anything else goes along as typed, so
 * the server can name a bad value (a blank credits field is 0).
 */
export function proPlansFromDrafts(drafts: Record<ProPlanId, Draft>): ProPlans | null {
  const out: ProPlans = {};
  for (const pid of PRO_PLAN_IDS) {
    const d = drafts[pid];
    if (!d.enabled && d.price.trim() === "") continue;
    out[pid] = { enabled: d.enabled, price: Number(d.price), credits: Number(d.credits === "" ? 0 : d.credits) };
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Admin → Countries: a country's Pro plans (weekly, monthly, yearly): on/off, price in the country's currency and credits.
 * A plan that is off with no price is simply not stored. Values go to the server as typed: it refuses a bad price.
 */
export function ProPlansEditor({
  code,
  country,
  currency,
  value,
  onChange,
  error,
}: {
  /** Country code, for the field ids («pro-SA-weekly-price», never a name with a space) */
  code: string;
  country: string;
  currency: string;
  /** Every problem with the plans («a · b»), listed here before any confirmation (QA WEB-PAY-10, WP2-13) */
  error?: string | null;
  value: ProPlans | null;
  onChange: (plans: ProPlans | null) => void;
}) {
  const [drafts, setDrafts] = useState(() => toDrafts(value));
  // A value changed from outside (a reload or a reset of the form, not our own typing): the drafts follow it
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (JSON.stringify(value) !== JSON.stringify(proPlansFromDrafts(drafts))) setDrafts(toDrafts(value));
  }

  function update(id: ProPlanId, patch: Partial<Draft>) {
    const next = { ...drafts, [id]: { ...drafts[id], ...patch } };
    setDrafts(next);
    onChange(proPlansFromDrafts(next));
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium">
          <Crown className="h-4 w-4 text-primary" /> Pro plans · {country}
        </p>
        <p className="text-xs text-muted-foreground">
          Price changes apply to new subscribers only. Sales also need Pro on in Settings and «Prices approved» for this country.
          A plan switched off keeps its settings only while its price is filled in; with no price it is removed.
        </p>
      </div>
      {error && (
        <ul role="alert" className="list-inside list-disc space-y-0.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error.split(" · ").map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {PRO_PLAN_IDS.map((id) => (
          <div key={id} className="space-y-2 rounded-md border p-3">
            <label className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{NAMES[id]}</span>
              <Switch checked={drafts[id].enabled} onCheckedChange={(v) => update(id, { enabled: v })} aria-label={`${NAMES[id]} plan on`} />
            </label>
            <div className="space-y-1.5">
              <Label htmlFor={`pro-${code}-${id}-price`}>Price ({currency})</Label>
              <Input
                id={`pro-${code}-${id}-price`}
                dir="ltr"
                type="text"
                inputMode="decimal"
                value={drafts[id].price}
                onChange={(e) => update(id, { price: toDecimalText(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`pro-${code}-${id}-credits`}>{id === "yearly" ? "Credits per month" : "Credits per grant"}</Label>
              <Input
                id={`pro-${code}-${id}-credits`}
                dir="ltr"
                type="text"
                inputMode="numeric"
                value={drafts[id].credits}
                onChange={(e) => update(id, { credits: toLatinDigits(e.target.value).replace(/\D/g, "") })}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
