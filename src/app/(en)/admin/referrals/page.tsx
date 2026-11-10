"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Gift, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/components/admin/admin-list-bits";
import { AdminLoadError } from "@/components/admin/admin-states";

interface Person { id: string; firstName: string; lastName: string; phone: string | null }

interface ReferralRow {
  id: string;
  createdAt: string;
  creditsAwarded: boolean;
  awardedAt: string | null;
  referrer: Person;
  referee: Person & { setupDone: boolean };
}

interface Data {
  referrals: ReferralRow[];
  stats: { total: number; rewarded: number; waiting: number; inviters: number };
  topInviters: (Person & { count: number })[];
  totalPages: number;
}

function PersonCell({ p }: { p: Person }) {
  return (
    <Link href={`/admin/users/${p.id}`} className="block hover:underline">
      <p className="font-medium text-sm"><bdi>{`${p.firstName} ${p.lastName}`}</bdi></p>
      <p className="text-xs text-muted-foreground">{p.phone || "—"}</p>
    </Link>
  );
}

/** Sign-ups from invitation links (`/api/admin/referrals`); `?referrer=<id>` shows one inviter's */
export default function AdminReferralsPage() {
  // useSearchParams needs a Suspense boundary for the build
  return (
    <Suspense>
      <ReferralsView />
    </Suspense>
  );
}

function ReferralsView() {
  const router = useRouter();
  const referrer = useSearchParams().get("referrer");
  const [data, setData] = useState<Data | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const q = new URLSearchParams({ page: String(page), ...(referrer && { referrer }) });
      const res = await fetch(`/api/admin/referrals?${q}`);
      if (res.ok) setData(await res.json());
      else setLoadError(`Couldn't load the referrals (${res.status}).`);
    } catch (err) {
      console.error(err);
      setLoadError("Couldn't load the referrals. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [page, referrer]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = data?.stats;
  const inviter = referrer ? data?.referrals[0]?.referrer : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display flex items-center gap-3">
          <Gift className="h-7 w-7 text-primary" />
          Referrals
        </h1>
        <p className="text-muted-foreground mt-1">
          Members who signed up with a friend&apos;s invitation link. The reward (+2 credits to the inviter, +1 to the
          new member) is paid once the new member finishes setup.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ["Invited sign-ups", stats?.total],
          ["Rewarded", stats?.rewarded],
          ["Waiting for setup", stats?.waiting],
          ["Inviters", stats?.inviters],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold">{value ?? (loadError ? "—" : "…")}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!referrer && !!data?.topInviters.length && (
        <Card>
          <CardHeader><CardTitle className="text-base">Top inviters</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {data.topInviters.map((p) => (
              <Link key={p.id} href={`/admin/referrals?referrer=${p.id}`}>
                <Badge variant="secondary" className="text-sm py-1 px-3 cursor-pointer">
                  <bdi>{`${p.firstName} ${p.lastName}`}</bdi> · {p.count}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {referrer && (
        <div className="flex items-center gap-2 text-sm">
          <span>Invited by {inviter ? <bdi>{`${inviter.firstName} ${inviter.lastName}`}</bdi> : "this member"}</span>
          <Button variant="ghost" size="sm" onClick={() => { setPage(1); router.push("/admin/referrals"); }}>
            <X className="h-3 w-3 me-1" />Show all
          </Button>
        </div>
      )}

      {loadError ? (
        <AdminLoadError message={loadError} onRetry={load} />
      ) : (
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 text-sm font-medium">Date</th>
                  <th className="text-left p-3 text-sm font-medium">Invited by</th>
                  <th className="text-left p-3 text-sm font-medium">New member</th>
                  <th className="text-left p-3 text-sm font-medium">Reward</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      <td colSpan={4} className="p-3"><div className="h-6 bg-muted animate-pulse rounded" /></td>
                    </tr>
                  ))
                ) : !data?.referrals.length ? (
                  <tr>
                    <td colSpan={4} className="text-center p-8 text-muted-foreground">No referrals yet</td>
                  </tr>
                ) : (
                  data.referrals.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                      <td className="p-3"><PersonCell p={r.referrer} /></td>
                      <td className="p-3"><PersonCell p={r.referee} /></td>
                      <td className="p-3 text-sm whitespace-nowrap">
                        {r.creditsAwarded ? (
                          <Badge className="bg-green-100 text-green-800">
                            Paid{r.awardedAt ? ` ${fmtDate(r.awardedAt)}` : ""}
                          </Badge>
                        ) : (
                          <Badge variant="outline">{r.referee.setupDone ? "Not paid" : "Waiting for setup"}</Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {(data?.totalPages ?? 1) > 1 && (
            <div className="flex items-center justify-between p-3 border-t">
              <p className="text-sm text-muted-foreground">Page {page} of {data?.totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" aria-label="Next page" disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
