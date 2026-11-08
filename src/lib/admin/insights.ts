/**
 * Admin → Insights (owner request 2026-11-05): read-only reports built from data the site already keeps. Member counts
 * leave out admins and test phones; money tables say so where that differs from the Payments page.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { startOfAmmanDay } from "@/lib/amman-day";
import { UNPAID_TITLE } from "@/lib/cron/payment-reminders";
import { findAnyPackage } from "@/lib/payments/packages";
import { isTestPhone } from "@/lib/test-accounts";
import { isUnavailable } from "@/lib/matches/state";
import { getCycleFlags } from "@/lib/settings";
import { byUserCountry, matchCountryWhere, paymentCountryWhere, userCountryWhere, type AdminCountry } from "@/lib/admin/country-filter";
import { memberSuggestStatus, type NoSuggestionsReason } from "@/lib/admin/members-suggest-reason";
import { activeMembers, ammanDate, DAY_MS, FIRST_TRACKED_DAY, pulseFor, trackedDays } from "@/lib/admin/pulse";

type Money = { currency: string; amount: number }[];

function addMoney(rows: Money, currency: string, amount: number) {
  const row = rows.find((r) => r.currency === currency);
  if (row) row.amount += amount;
  else rows.push({ currency, amount });
}

const TOPUP_LINE = "صفر: اشح"; // «رصيدك صفر: اشحن …» / «رصيدكِ صفر: اشحني …» (lib/payments/topup-prompt)

/** Of these notices, how many members paid within 24 hours. Notices under 24 h old can still convert: counted apart */
async function noticeResult(where: Prisma.NotificationWhereInput, now: Date) {
  const sent = await db.notification.findMany({ where, select: { userId: true, createdAt: true } });
  const payments = await db.payment.findMany({
    where: { status: "COMPLETED", userId: { in: [...new Set(sent.map((n) => n.userId))] } },
    // updatedAt = when it was paid; a checkout opened before the notice and finished after it counts
    select: { userId: true, updatedAt: true },
  });
  let paid = 0;
  let settled = 0;
  for (const n of sent) {
    const end = n.createdAt.getTime() + DAY_MS;
    const converted = payments.some((p) => p.userId === n.userId && p.updatedAt > n.createdAt && p.updatedAt.getTime() <= end);
    if (converted) paid++;
    if (end <= now.getTime()) settled++;
    else if (converted) settled++; // Already paid: its result is known
  }
  return { sent: sent.length, paid, settled, stillOpen: sent.length - settled };
}

/** Saturday (Amman) of a date, like the Growth card's sign-up weeks */
function signupWeek(d: Date): string {
  const local = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 1) % 7));
  return local.toISOString().slice(0, 10);
}

export async function paymentInsights(country: AdminCountry, now = new Date()) {
  const inCountry = byUserCountry(country, "user");
  const [unpaid, topUp, sales, members, completed] = await Promise.all([
    noticeResult({ title: UNPAID_TITLE, ...inCountry }, now),
    noticeResult({ type: "SUGGESTION", body: { contains: TOPUP_LINE }, ...inCountry }, now),
    db.payment.findMany({
      where: { ...paymentCountryWhere(country), status: "COMPLETED", createdAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
      select: { planName: true, amount: true, currency: true },
    }),
    db.user.findMany({ where: { role: "USER", ...userCountryWhere(country) }, select: { id: true, gender: true, phone: true, createdAt: true } }),
    db.payment.findMany({
      where: { status: "COMPLETED", userId: { not: null }, user: { role: "USER", ...userCountryWhere(country) } },
      select: { userId: true, amount: true, currency: true },
    }),
  ]);

  const packages = new Map<string, { name: string; count: number; money: Money }>();
  for (const s of sales) {
    const key = s.planName ?? "unknown";
    const row = packages.get(key) ?? { name: findAnyPackage(key)?.name ?? key, count: 0, money: [] };
    row.count++;
    addMoney(row.money, s.currency, Number(s.amount));
    packages.set(key, row);
  }

  // Buyers: real members only (no admins, no test phones)
  const real = members.filter((m) => !isTestPhone(m.phone));
  const realIds = new Set(real.map((m) => m.id));
  const byBuyer = new Map<string, { payments: number; money: Money }>();
  for (const p of completed) {
    if (!realIds.has(p.userId!)) continue;
    const row = byBuyer.get(p.userId!) ?? { payments: 0, money: [] };
    row.payments++;
    addMoney(row.money, p.currency, Number(p.amount));
    byBuyer.set(p.userId!, row);
  }
  const revenue: Money = [];
  for (const b of byBuyer.values()) for (const m of b.money) addMoney(revenue, m.currency, m.amount);

  const gender = (g: "MALE" | "FEMALE") => {
    const all = real.filter((m) => m.gender === g);
    return { members: all.length, buyers: all.filter((m) => byBuyer.has(m.id)).length };
  };

  const weeks = new Map<string, { week: string; joined: number; buyers: number; money: Money }>();
  for (const m of real) {
    const week = signupWeek(m.createdAt);
    const row = weeks.get(week) ?? { week, joined: 0, buyers: 0, money: [] };
    row.joined++;
    const b = byBuyer.get(m.id);
    if (b) {
      row.buyers++;
      for (const x of b.money) addMoney(row.money, x.currency, x.amount);
    }
    weeks.set(week, row);
  }

  return {
    unpaid,
    topUp,
    packages: [...packages.values()].sort((a, b) => b.count - a.count),
    buyers: {
      total: byBuyer.size,
      repeat: [...byBuyer.values()].filter((b) => b.payments >= 2).length,
      payments: [...byBuyer.values()].reduce((n, b) => n + b.payments, 0),
      revenue,
    },
    men: gender("MALE"),
    women: gender("FEMALE"),
    weeks: [...weeks.values()].sort((a, b) => b.week.localeCompare(a.week)).slice(0, 8),
  };
}

const LIST_LIMIT = 50;
const GONE_DAYS = 14;
const person = { id: true, firstName: true, lastName: true, phone: true, gender: true, role: true, status: true, isDeactivated: true, matchCredits: true, lastActiveAt: true } as const;

function card<T extends { id: string; firstName: string; lastName: string; gender: string | null; matchCredits: number; lastActiveAt: Date | null }>(u: T) {
  return { id: u.id, firstName: u.firstName, lastName: u.lastName, gender: u.gender, credits: u.matchCredits, lastActiveAt: u.lastActiveAt };
}

const available = (u: { role: string; phone: string | null; isDeactivated: boolean; status: string }) =>
  u.role === "USER" && !isTestPhone(u.phone) && !isUnavailable(u);

export async function stuckMembers(country: AdminCountry, now = new Date()) {
  const open = await db.suggestion.findMany({
    where: {
      ...byUserCountry(country, "recipient"),
      flow: "MUTUAL",
      status: "PENDING",
      expiresAt: { gt: now },
      OR: [
        { recipientDecision: null, candidateDecision: "INTERESTED" },
        { candidateDecision: null, recipientDecision: "INTERESTED", hiddenFromCandidate: false },
      ],
    },
    select: { recipientDecision: true, expiresAt: true, recipient: { select: person }, candidate: { select: person } },
  });
  const waiting = new Map<string, ReturnType<typeof card> & { waiting: number; soonest: Date }>();
  for (const s of open) {
    const [me, other] = s.recipientDecision === null ? [s.recipient, s.candidate] : [s.candidate, s.recipient];
    if (me.matchCredits > 0 || !available(me) || isUnavailable(other)) continue;
    const expires = s.expiresAt!; // Filtered above: only cards still running
    const row = waiting.get(me.id) ?? { ...card(me), waiting: 0, soonest: expires };
    row.waiting++;
    if (expires < row.soonest) row.soonest = expires;
    waiting.set(me.id, row);
  }
  const zeroCredit = [...waiting.values()].sort((a, b) => b.waiting - a.waiting);

  const base = { role: "USER" as const, isDeactivated: false, status: { not: "SUSPENDED" as const }, ...userCountryWhere(country) };
  const unfinishedRaw = await db.user.findMany({
    where: { ...base, NOT: { profile: { isComplete: true } } },
    select: { ...person, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const unfinished = unfinishedRaw.filter(available).map((u) => ({ ...card(u), joined: u.createdAt }));

  const goneBefore = new Date(now.getTime() - GONE_DAYS * DAY_MS);
  const goneRaw = await db.user.findMany({
    where: { ...base, payments: { some: { status: "COMPLETED" } }, OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: goneBefore } }] },
    select: { ...person, payments: { where: { status: "COMPLETED" }, select: { amount: true, currency: true, createdAt: true } } },
  });
  const paidGone = goneRaw
    .filter(available)
    .map((u) => {
      const money: Money = [];
      for (const p of u.payments) addMoney(money, p.currency, Number(p.amount));
      return { ...card(u), money, lastPaid: u.payments.map((p) => p.createdAt).sort((a, b) => +b - +a)[0] };
    })
    .sort((a, b) => b.money[0].amount - a.money[0].amount);

  // free_interest_reply on: these members can answer for free (only older app versions still lock «مهتم» at 0)
  const freeReplyOn = !!(await getCycleFlags()).freeInterestReply;
  return {
    freeReplyOn,
    limit: LIST_LIMIT,
    goneDays: GONE_DAYS,
    zeroCredit: {
      total: zeroCredit.length,
      women: zeroCredit.filter((m) => m.gender === "FEMALE").length,
      men: zeroCredit.filter((m) => m.gender === "MALE").length,
      held: zeroCredit.reduce((n, m) => n + m.waiting, 0),
      rows: zeroCredit.slice(0, LIST_LIMIT),
    },
    unfinished: { total: unfinished.length, rows: unfinished.slice(0, LIST_LIMIT) },
    paidGone: { total: paidGone.length, rows: paidGone.slice(0, LIST_LIMIT) },
  };
}

const AGE_BANDS = [
  { label: "18–24", from: 18, to: 24 },
  { label: "25–29", from: 25, to: 29 },
  { label: "30–34", from: 30, to: 34 },
  { label: "35–39", from: 35, to: 39 },
  { label: "40+", from: 40, to: 200 },
];

function ageOn(birth: Date, now: Date): number {
  const had = now.getUTCMonth() > birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate());
  return now.getUTCFullYear() - birth.getUTCFullYear() - (had ? 0 : 1);
}

const CITY_ROWS = 12;

/** Who can be matched: finished setup, available, seen in the last 30 days, by city and age */
export async function supplyGaps(country: AdminCountry, now = new Date()) {
  const rows = await db.user.findMany({
    where: {
      role: "USER",
      isDeactivated: false,
      status: { not: "SUSPENDED" },
      isFlagged: false,
      lastActiveAt: { gte: new Date(now.getTime() - 30 * DAY_MS) },
      profile: { isComplete: true },
      ...userCountryWhere(country),
    },
    select: { gender: true, phone: true, profile: { select: { city: true, dateOfBirth: true } } },
  });
  const real = rows.filter((r) => !isTestPhone(r.phone));
  const bump = (m: Map<string, { men: number; women: number }>, key: string, gender: string | null) => {
    const row = m.get(key) ?? { men: 0, women: 0 };
    if (gender === "MALE") row.men++;
    else if (gender === "FEMALE") row.women++;
    m.set(key, row);
  };
  const cities = new Map<string, { men: number; women: number }>();
  const ages = new Map<string, { men: number; women: number }>();
  for (const r of real) {
    bump(cities, r.profile?.city?.trim() || "Not given", r.gender);
    if (r.profile?.dateOfBirth) {
      const age = ageOn(r.profile.dateOfBirth, now);
      const band = AGE_BANDS.find((b) => age >= b.from && age <= b.to);
      bump(ages, band?.label ?? "Under 18 / unknown", r.gender);
    } else bump(ages, "Under 18 / unknown", r.gender);
  }
  const sorted = [...cities].map(([city, c]) => ({ city, ...c })).sort((a, b) => b.men + b.women - (a.men + a.women));
  const rest = sorted.slice(CITY_ROWS);
  return {
    total: real.length,
    men: real.filter((r) => r.gender === "MALE").length,
    women: real.filter((r) => r.gender === "FEMALE").length,
    cities: [
      ...sorted.slice(0, CITY_ROWS),
      ...(rest.length ? [{ city: `Other (${rest.length} cities)`, men: rest.reduce((n, r) => n + r.men, 0), women: rest.reduce((n, r) => n + r.women, 0) }] : []),
    ],
    ages: [...AGE_BANDS.map((b) => b.label), "Under 18 / unknown"].filter((l) => ages.has(l)).map((age) => ({ age, ...ages.get(age)! })),
  };
}

const REASON_SAMPLE = 150;

/** Why active members have no cards: the most recently active members with finished setup (each one takes several queries) */
export async function noSuggestionReasons(country: AdminCountry, now = new Date()) {
  const where: Prisma.UserWhereInput = {
    role: "USER",
    isDeactivated: false,
    status: { not: "SUSPENDED" },
    lastActiveAt: { gte: new Date(now.getTime() - 7 * DAY_MS) },
    profile: { isComplete: true },
    ...userCountryWhere(country),
  };
  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({ where, select: { id: true, phone: true }, orderBy: { lastActiveAt: "desc" }, take: REASON_SAMPLE }),
  ]);
  const ids = rows.filter((r) => !isTestPhone(r.phone)).map((r) => r.id);
  const reasons = new Map<NoSuggestionsReason, number>();
  let withCards = 0;
  // A few at a time: this is an admin report, never worth slowing members down
  for (let i = 0; i < ids.length; i += 5) {
    const batch = await Promise.all(ids.slice(i, i + 5).map((id) => memberSuggestStatus(id, now)));
    for (const s of batch) {
      if (!s) continue;
      if (s.openSuggestions > 0) withCards++;
      else if (s.reason) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);
    }
  }
  return {
    total,
    checked: ids.length,
    withCards,
    reasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}

/** Eight rolling weeks of complete Amman days, newest first: [0] = the last 7 days, [1] = the 7 before */
export async function weeklySummary(country: AdminCountry, now = new Date()) {
  const today = startOfAmmanDay(now);
  return Promise.all(
    Array.from({ length: 8 }, async (_, i) => {
      const to = new Date(today.getTime() - i * 7 * DAY_MS);
      const from = new Date(to.getTime() - 7 * DAY_MS);
      const fromDate = ammanDate(from);
      const toDate = ammanDate(to);
      const activeDays = trackedDays(fromDate, toDate);
      const [pulse, women, chats, activeSum] = await Promise.all([
        pulseFor(country, { from, to }),
        db.user.count({ where: { role: "USER", gender: "FEMALE", createdAt: { gte: from, lt: to }, ...userCountryWhere(country) } }),
        db.conversation.count({ where: { createdAt: { gte: from, lt: to }, ...(country === "ALL" ? {} : { match: matchCountryWhere(country) }) } }),
        activeDays > 0 ? activeMembers(country, new Date(Math.max(fromDate.getTime(), FIRST_TRACKED_DAY.getTime())), toDate) : 0,
      ]);
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        ...pulse,
        women,
        chats,
        /** Average members a day; null with no full day of tracking in the week (FIRST_TRACKED_DAY) */
        activeAvg: activeDays > 0 ? Math.round(activeSum / activeDays) : null,
      };
    }),
  );
}
