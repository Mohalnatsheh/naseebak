"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtAgo, fmtDate, PersonLink } from "@/components/admin/admin-list-bits";
import { REASON_LABEL } from "@/components/admin/members-suggest-status";
import { cn } from "@/lib/utils";
import type { NoSuggestionsReason } from "@/lib/admin/members-suggest-reason";

type Money = { currency: string; amount: number }[];
type NoticeResult = { sent: number; paid: number; settled: number; stillOpen: number };
type Person = { id: string; firstName: string; lastName: string; gender: string | null; credits: number; lastActiveAt: string | null };
type Payments = {
  unpaid: NoticeResult;
  topUp: NoticeResult;
  packages: { name: string; count: number; money: Money }[];
  buyers: { total: number; repeat: number; payments: number; revenue: Money };
  men: { members: number; buyers: number };
  women: { members: number; buyers: number };
  weeks: { week: string; joined: number; buyers: number; money: Money }[];
};
type Stuck = {
  /** Switch free_interest_reply: the reply is free, so these members are only stuck on older app versions */
  freeReplyOn?: boolean;
  limit: number;
  goneDays: number;
  zeroCredit: { total: number; women: number; men: number; held: number; rows: (Person & { waiting: number; soonest: string })[] };
  unfinished: { total: number; rows: (Person & { joined: string })[] };
  paidGone: { total: number; rows: (Person & { money: Money; lastPaid: string })[] };
};
type GenderRow = { men: number; women: number };
type Supply = { total: number; men: number; women: number; cities: (GenderRow & { city: string })[]; ages: (GenderRow & { age: string })[] };
type Reasons = { total: number; checked: number; withCards: number; reasons: { reason: NoSuggestionsReason; count: number }[] };
type Week = {
  from: string;
  to: string;
  signups: number;
  women: number;
  interest: number;
  matches: number;
  chats: number;
  paid: number;
  unpaid: number;
  revenue: Money;
  activeAvg: number | null;
};

const TABS = [
  { key: "payments", label: "Payments results" },
  { key: "stuck", label: "Stuck members" },
  { key: "supply", label: "Supply gaps" },
  { key: "weekly", label: "Weekly" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");
const money = (m: Money) => (m.length ? m.map((x) => `${x.amount.toFixed(x.amount % 1 ? 2 : 0)} ${x.currency}`).join(" · ") : "0");

function useReport<T>(tab: string) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(`/api/admin/insights?tab=${tab}`);
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
    } catch {
      setFailed(true);
    }
  }, [tab]);
  return { data, failed, load };
}

function Loading({ failed, retry }: { failed: boolean; retry: () => void }) {
  if (failed) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Could not load this report.
        <Button size="sm" variant="outline" onClick={retry}>Try again</Button>
      </div>
    );
  }
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
            {head.map((h, i) => (
              <th key={h} className={cn("whitespace-nowrap p-3 font-medium", i === 0 ? "text-left" : "text-right")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Cell({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return <td className={cn("whitespace-nowrap border-b p-3 tabular-nums", first ? "text-left" : "text-right")}>{children}</td>;
}

function NoticeCard({ title, about, r }: { title: string; about: string; r: NoticeResult }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{about}</p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Sent" value={r.sent} />
        <Stat label="Paid within 24 h" value={r.paid} />
        <Stat label="Rate" value={pct(r.paid, r.settled)} hint={r.stillOpen ? `${r.stillOpen} still inside the 24 h` : undefined} />
      </CardContent>
    </Card>
  );
}

function PaymentsTab() {
  const { data, failed, load } = useReport<Payments>("payments");
  useEffect(() => {
    load();
  }, [load]);
  if (!data) return <Loading failed={failed} retry={load} />;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <NoticeCard title="«باقي خطوة» reminder" about="Sent about an hour after an unfinished payment (since 5 Nov)." r={data.unpaid} />
        <NoticeCard title="0-credit top-up line" about="Added to «شخص أبدى اهتمامه بك» and «شخص ينتظر ردّك» at 0 credits (since 5 Nov)." r={data.topUp} />
      </div>
      <p className="text-xs text-muted-foreground">Rate counts only notices whose result is known. A payment after a notice may have happened anyway: this shows the link, not proof of cause.</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Paying members" value={data.buyers.total} hint="Members only: no admin, test or deleted accounts" />
        <Stat label="Paid more than once" value={data.buyers.repeat} hint={`${pct(data.buyers.repeat, data.buyers.total)} of paying members`} />
        <Stat label="Men who paid" value={pct(data.men.buyers, data.men.members)} hint={`${data.men.buyers} of ${data.men.members}`} />
        <Stat label="Women who paid" value={pct(data.women.buyers, data.women.members)} hint={`${data.women.buyers} of ${data.women.members}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Packages sold, last 30 days</CardTitle></CardHeader>
          <CardContent className="p-0">
            {data.packages.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No sales in the last 30 days.</p>
            ) : (
              <Table head={["Package", "Sold", "Revenue"]}>
                {data.packages.map((p) => (
                  <tr key={p.name}><Cell first>{p.name}</Cell><Cell>{p.count}</Cell><Cell>{money(p.money)}</Cell></tr>
                ))}
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue by sign-up week</CardTitle>
            <p className="text-xs text-muted-foreground">Everything each week&apos;s members have paid so far. Weeks start on Saturday.</p>
          </CardHeader>
          <CardContent className="p-0">
            <Table head={["Joined week", "Joined", "Paid", "Revenue", "Per member"]}>
              {data.weeks.map((w) => (
                <tr key={w.week}>
                  <Cell first>{fmtDate(w.week)}</Cell>
                  <Cell>{w.joined}</Cell>
                  <Cell>{w.buyers} ({pct(w.buyers, w.joined)})</Cell>
                  <Cell>{money(w.money)}</Cell>
                  <Cell>{w.money.length === 1 ? `${(w.money[0].amount / w.joined).toFixed(2)} ${w.money[0].currency}` : "—"}</Cell>
                </tr>
              ))}
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MemberList({ title, about, total, limit, head, rows }: { title: string; about: string; total: number; limit: number; head: string[]; rows: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title} · {total.toLocaleString()}</CardTitle>
        <p className="text-xs text-muted-foreground">{about}{total > limit ? ` Showing the first ${limit}.` : ""}</p>
      </CardHeader>
      <CardContent className="p-0">
        {total === 0 ? <p className="p-4 text-sm text-muted-foreground">Nobody right now.</p> : <Table head={head}>{rows}</Table>}
      </CardContent>
    </Card>
  );
}

function StuckTab() {
  const { data, failed, load } = useReport<Stuck>("stuck");
  useEffect(() => {
    load();
  }, [load]);
  if (!data) return <Loading failed={failed} retry={load} />;
  const z = data.zeroCredit;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="0 credits, someone waiting" value={z.total} hint={`Women ${z.women} · Men ${z.men}`} />
        <Stat label="«مهتم» they can't answer" value={z.held} />
        <Stat label="Setup not finished" value={data.unfinished.total} />
        <Stat label={`Paid, gone ${data.goneDays}+ days`} value={data.paidGone.total} />
      </div>
      <MemberList
        title="0 credits with a «مهتم» waiting"
        about={data.freeReplyOn
          ? "Free «مهتم» reply is on: these members can answer for free on the website and the new app; only older app versions still lock «مهتم» at 0 credits. Most waiting first."
          : "Available members who can't reply to someone's «مهتم». Most waiting first."}
        total={z.total}
        limit={data.limit}
        head={["Member", "Waiting", "First card ends", "Last active"]}
        rows={z.rows.map((m) => (
          <tr key={m.id}><Cell first><PersonLink p={m} /></Cell><Cell>{m.waiting}</Cell><Cell>{fmtDate(m.soonest)}</Cell><Cell>{fmtAgo(m.lastActiveAt)}</Cell></tr>
        ))}
      />
      <MemberList
        title="Setup not finished"
        about="They signed up but can't get suggestions yet. Newest first."
        total={data.unfinished.total}
        limit={data.limit}
        head={["Member", "Joined", "Last active"]}
        rows={data.unfinished.rows.map((m) => (
          <tr key={m.id}><Cell first><PersonLink p={m} /></Cell><Cell>{fmtDate(m.joined)}</Cell><Cell>{fmtAgo(m.lastActiveAt)}</Cell></tr>
        ))}
      />
      <MemberList
        title={`Paid, then gone ${data.goneDays}+ days`}
        about="Members who spent money and stopped coming. Biggest spend first."
        total={data.paidGone.total}
        limit={data.limit}
        head={["Member", "Paid in total", "Last payment", "Credits left", "Last active"]}
        rows={data.paidGone.rows.map((m) => (
          <tr key={m.id}><Cell first><PersonLink p={m} /></Cell><Cell>{money(m.money)}</Cell><Cell>{fmtDate(m.lastPaid)}</Cell><Cell>{m.credits}</Cell><Cell>{fmtAgo(m.lastActiveAt)}</Cell></tr>
        ))}
      />
    </div>
  );
}

function BalanceRow({ name, men, women }: { name: string; men: number; women: number }) {
  const total = men + women;
  return (
    <tr>
      <Cell first>{name}</Cell>
      <Cell>{men}</Cell>
      <Cell>{women}</Cell>
      <Cell>{men === 0 ? "No men" : women === 0 ? "No women" : `${(men / women).toFixed(1)} men per woman`}</Cell>
      <td className="w-32 min-w-32 border-b p-3">
        <div className="flex h-2 overflow-hidden rounded-full bg-muted" title={`${pct(women, total)} women`}>
          <div className="bg-primary" style={{ width: pct(men, total) }} />
          <div className="bg-accent" style={{ width: pct(women, total) }} />
        </div>
      </td>
    </tr>
  );
}

function SupplyTab() {
  const { data, failed, load } = useReport<Supply>("supply");
  const reasons = useReport<Reasons>("reasons");
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    load();
  }, [load]);
  if (!data) return <Loading failed={failed} retry={load} />;
  const r = reasons.data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Matchable members" value={data.total} hint="Setup done, seen in 30 days" />
        <Stat label="Men" value={data.men} />
        <Stat label="Women" value={data.women} hint={`${pct(data.women, data.total)} of matchable members`} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">By city</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table head={["City", "Men", "Women", "Balance", ""]}>
              {data.cities.map((c) => <BalanceRow key={c.city} name={c.city} men={c.men} women={c.women} />)}
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">By age</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table head={["Age", "Men", "Women", "Balance", ""]}>
              {data.ages.map((a) => <BalanceRow key={a.age} name={a.age} men={a.men} women={a.women} />)}
            </Table>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Why active members have no suggestions</CardTitle>
          <p className="text-xs text-muted-foreground">Checks the 150 most recently active members one by one, so it runs only when you ask. It creates nothing and sends nothing.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {!r && !reasons.failed && (
            <Button
              size="sm"
              disabled={checking}
              onClick={async () => {
                setChecking(true);
                await reasons.load();
                setChecking(false);
              }}
            >
              {checking && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {checking ? "Checking…" : "Check now"}
            </Button>
          )}
          {reasons.failed && <Loading failed retry={reasons.load} />}
          {r && (
            <>
              <p className="text-sm">
                Checked {r.checked} of {r.total} members active this week: <strong>{r.withCards}</strong> have cards, <strong>{r.checked - r.withCards}</strong> have none.
              </p>
              {r.reasons.length > 0 && (
                <Table head={["Reason", "Members"]}>
                  {r.reasons.map((x) => (
                    <tr key={x.reason}>
                      <td className="border-b p-3 text-left">{REASON_LABEL[x.reason]}</td>
                      <Cell>{x.count}</Cell>
                    </tr>
                  ))}
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const WEEK_ROWS: { label: string; get: (w: Week) => number | null; down?: boolean }[] = [
  { label: "Members active a day (average)", get: (w) => w.activeAvg },
  { label: "Sign-ups", get: (w) => w.signups },
  { label: "Women who signed up", get: (w) => w.women },
  { label: "«مهتم» given", get: (w) => w.interest },
  { label: "New matches", get: (w) => w.matches },
  { label: "Chats started", get: (w) => w.chats },
  { label: "Payments completed", get: (w) => w.paid },
  { label: "Unfinished payments", get: (w) => w.unpaid, down: true },
];

function Change({ now, before, down }: { now: number | null; before: number | null; down?: boolean }) {
  if (now === null || before === null || before === 0) return <span className="text-muted-foreground">—</span>;
  const change = Math.round(((now - before) / before) * 100);
  const good = down ? change < 0 : change > 0;
  return <span className={cn("font-semibold", change === 0 ? "text-muted-foreground" : good ? "text-emerald-700" : "text-destructive")}>{change > 0 ? "+" : ""}{change}%</span>;
}

function WeeklyTab() {
  const { data, failed, load } = useReport<{ weeks: Week[] }>("weekly");
  useEffect(() => {
    load();
  }, [load]);
  if (!data) return <Loading failed={failed} retry={load} />;
  const [now, before] = data.weeks;
  // `to` is the Amman midnight after the last day: an hour earlier is still that day
  const label = (w: Week) => `${fmtDate(w.from)} – ${fmtDate(new Date(new Date(w.to).getTime() - 3600000))}`;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Last 7 days vs the 7 before</CardTitle>
          <p className="text-xs text-muted-foreground">Complete Amman days: {label(now)} against {label(before)}. Today isn&apos;t counted.</p>
        </CardHeader>
        <CardContent className="p-0">
          <Table head={["", "Last 7 days", "7 days before", "Change"]}>
            {WEEK_ROWS.map((r) => (
              <tr key={r.label}>
                <Cell first>{r.label}</Cell>
                <Cell>{r.get(now)?.toLocaleString() ?? "—"}</Cell>
                <Cell>{r.get(before)?.toLocaleString() ?? "—"}</Cell>
                <Cell><Change now={r.get(now)} before={r.get(before)} down={r.down} /></Cell>
              </tr>
            ))}
            <tr>
              <Cell first>Revenue</Cell>
              <Cell>{money(now.revenue)}</Cell>
              <Cell>{money(before.revenue)}</Cell>
              <Cell>
                {now.revenue.length <= 1 && before.revenue.length === 1 ? (
                  <Change now={now.revenue[0]?.amount ?? 0} before={before.revenue[0].amount} />
                ) : (
                  "—"
                )}
              </Cell>
            </tr>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Last 8 weeks</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table head={["7 days ending", "Sign-ups", "«مهتم»", "Matches", "Chats", "Paid", "Revenue"]}>
            {data.weeks.map((w) => (
              <tr key={w.to}>
                <Cell first>{fmtDate(new Date(new Date(w.to).getTime() - 3600000))}</Cell>
                <Cell>{w.signups}</Cell>
                <Cell>{w.interest}</Cell>
                <Cell>{w.matches}</Cell>
                <Cell>{w.chats}</Cell>
                <Cell>{w.paid}</Cell>
                <Cell>{money(w.revenue)}</Cell>
              </tr>
            ))}
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/** Reports built from what the site already records (lib/admin/insights.ts). Each tab loads when opened */
export default function InsightsPage() {
  const [tab, setTab] = useState<Tab>("payments");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold">
          <BarChart3 className="h-7 w-7 text-primary" />
          Insights
        </h1>
        <p className="mt-1 text-muted-foreground">What&apos;s working, who is stuck, and where you&apos;re short of people</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button key={t.key} size="sm" variant={tab === t.key ? "default" : "outline"} onClick={() => setTab(t.key)}>
            {t.label}
          </Button>
        ))}
      </div>
      {tab === "payments" && <PaymentsTab />}
      {tab === "stuck" && <StuckTab />}
      {tab === "supply" && <SupplyTab />}
      {tab === "weekly" && <WeeklyTab />}
    </div>
  );
}
