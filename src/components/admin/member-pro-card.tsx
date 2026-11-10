"use client";

import { useCallback, useEffect, useState } from "react";
import { Crown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { proPlanLabel } from "@/lib/admin/pro-labels";
import { fmtDateTime } from "@/components/admin/admin-list-bits";

interface Subscription {
  id: string;
  plan: string;
  status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "ENDED";
  country: string;
  price: string | number;
  currency: string;
  creditsPerGrant: number;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  endedAt: string | null;
  createdAt: string;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
}

const LIVE = ["ACTIVE", "PAST_DUE"];

/** Admin member page: Pro memberships (newest first), when they renew or end, and «Cancel now» */
export function MemberProCard({ userId }: { userId: string }) {
  const [data, setData] = useState<{ isPro: boolean; subscriptions: Subscription[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState<Subscription | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/pro`);
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function cancelNow() {
    if (!confirming) return;
    setCancelling(true);
    const res = await fetch(`/api/admin/users/${userId}/pro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel_now", subscriptionId: confirming.id }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setCancelling(false);
    setConfirming(null);
    if (res?.ok) toast.success("Pro membership cancelled");
    else toast.error(body?.error || "Could not cancel");
    await load();
  }

  const subs = data?.subscriptions ?? [];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Crown className="h-5 w-5 text-primary" /> Pro membership
          {data && <Badge variant={data.isPro ? "default" : "secondary"}>{data.isPro ? "Pro now" : "Not Pro"}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {failed ? (
          <p className="text-destructive">Couldn&apos;t load Pro memberships.</p>
        ) : !data ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : subs.length === 0 ? (
          <p className="text-muted-foreground">Never subscribed.</p>
        ) : (
          subs.map((s) => {
            const live = LIVE.includes(s.status);
            return (
              <div key={s.id} className="space-y-1 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{proPlanLabel(s.plan)}</span>
                  <Badge variant={live ? "default" : "secondary"}>{s.status}</Badge>
                  {live && s.cancelAtPeriodEnd && <Badge variant="outline">Won&apos;t renew</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {Number(s.price)} {s.currency} · {s.creditsPerGrant} credits{s.plan === "YEARLY" ? " a month" : " per grant"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {s.endedAt
                    ? `Ended ${fmtDateTime(s.endedAt)}`
                    : live
                      ? s.cancelAtPeriodEnd
                        ? `Ends ${fmtDateTime(s.currentPeriodEnd)}`
                        : `Renews ${fmtDateTime(s.currentPeriodEnd)}`
                      : `Paid until ${fmtDateTime(s.currentPeriodEnd)}`}
                  {" · started "}
                  {fmtDateTime(s.createdAt)}
                </p>
                {s.stripeSubscriptionId && (
                  <p className="break-all font-mono text-xs text-muted-foreground" dir="ltr">
                    {s.stripeSubscriptionId}
                  </p>
                )}
                {live && (
                  <Button size="sm" variant="destructive" className="mt-1" onClick={() => setConfirming(s)}>
                    Cancel now
                  </Button>
                )}
              </div>
            );
          })
        )}
      </CardContent>

      <Dialog open={!!confirming} onOpenChange={(o) => !o && !cancelling && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Pro now?</DialogTitle>
            <DialogDescription>
              Ends Pro immediately; no refund. The member is notified; Pro paid until{" "}
              {confirming ? fmtDateTime(confirming.currentPeriodEnd) : "the period end"} is lost. Use Payments → Refund to refund.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)} disabled={cancelling}>Keep Pro</Button>
            <Button variant="destructive" onClick={cancelNow} disabled={cancelling}>
              {cancelling && <Loader2 className="me-2 h-4 w-4 animate-spin" />}Cancel now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
